import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStaffMembers, getPendingShiftInvitesForEmail, getTenantById } from "@/lib/airtable";
import { formatShiftDateTime, isShiftInPast } from "@/lib/shift-time";

export const runtime = "nodejs";

const ELIGIBLE_ROLES = ["TTTStaff", "TTTTeamLead"];

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allStaff = await getStaffMembers();
  const caller = allStaff.find((s) => s.clerkUserId === userId);
  if (!caller || !caller.isActive || !ELIGIBLE_ROLES.includes(caller.role)) {
    return NextResponse.json({ invites: [] });
  }

  const entries = (await getPendingShiftInvitesForEmail(caller.email)).filter((e) => !isShiftInPast(e));

  const tenantCache = new Map<string, string>();
  const invites = await Promise.all(
    entries.map(async (e) => {
      if (!tenantCache.has(e.tenantId)) {
        const tenant = await getTenantById(e.tenantId).catch(() => null);
        tenantCache.set(e.tenantId, tenant?.name ?? "");
      }
      return {
        shiftId: e.id,
        projectName: tenantCache.get(e.tenantId) ?? "",
        activity: e.activity,
        dateTimeLabel: formatShiftDateTime(e),
      };
    })
  );

  return NextResponse.json({ invites, count: invites.length });
}
