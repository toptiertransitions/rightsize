import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPlanEntryById, getStaffMembers, getTenantById, getRoomsForTenant } from "@/lib/airtable";
import { formatShiftDateLong, formatShiftTimeRange, isShiftInPast } from "@/lib/shift-time";

export const runtime = "nodejs";

const ELIGIBLE_ROLES = ["TTTStaff", "TTTTeamLead"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ shiftId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { shiftId } = await params;

  const allStaff = await getStaffMembers();
  const caller = allStaff.find((s) => s.clerkUserId === userId);
  if (!caller || !caller.isActive || !ELIGIBLE_ROLES.includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entry = await getPlanEntryById(shiftId);
  if (!entry) {
    return NextResponse.json({ error: "This shift has been cancelled or no longer exists." }, { status: 404 });
  }

  const myHelper = (entry.helpers ?? []).find((h) => h.email.toLowerCase() === caller.email.toLowerCase());
  if (!myHelper) {
    return NextResponse.json({ error: "You're not invited to this shift." }, { status: 403 });
  }

  const [tenant, rooms] = await Promise.all([
    getTenantById(entry.tenantId).catch(() => null),
    entry.roomId ? getRoomsForTenant(entry.tenantId).catch(() => []) : Promise.resolve([]),
  ]);
  const roomName = entry.roomLabel || rooms.find((r) => r.id === entry.roomId)?.name || undefined;
  const invitedBy = entry.createdByUserId
    ? allStaff.find((s) => s.clerkUserId === entry.createdByUserId)?.displayName
    : undefined;
  const address = entry.address || [tenant?.address, tenant?.city, tenant?.state, tenant?.zip].filter(Boolean).join(", ");

  return NextResponse.json({
    shiftId: entry.id,
    projectName: tenant?.name ?? "",
    address,
    dateLabel: formatShiftDateLong(entry),
    timeLabel: formatShiftTimeRange(entry),
    activity: entry.activity,
    roomName,
    notes: entry.notes,
    invitedBy,
    status: myHelper.status,
    isPast: isShiftInPast(entry),
  });
}
