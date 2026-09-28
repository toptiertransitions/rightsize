import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getStaffMembers, getSystemRole } from "@/lib/airtable";
import { getSuspendedOrDeletedClerkUserIds } from "@/lib/staff-visibility";

// Read-only, self-contained data source for the CRM "Availability" planning
// tool — deliberately its own route (rather than extending the existing
// /api/plan/ttt-users or /api/admin/staff) so this feature can't affect
// anything else that already depends on those. Same CRM-page access as
// every other CRM sub-tab (TTTManager/TTTAdmin/TTTSales); the staff pool
// being searched is TeamLeads + Staff, per the feature's own scope.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!sysRole || !["TTTManager", "TTTAdmin", "TTTSales"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allStaff = await getStaffMembers().catch(() => []);
  const activePool = allStaff.filter((s) => s.isActive && (s.role === "TTTTeamLead" || s.role === "TTTStaff"));

  // Suspension lives only in Clerk (publicMetadata.suspended) — Airtable's
  // IsActive is a separate flag, so a suspended/deleted account can still
  // pass the isActive check above. Must never be offered up as available.
  const excludedIds = await getSuspendedOrDeletedClerkUserIds(activePool.map((s) => s.clerkUserId));
  const pool = activePool.filter((s) => !excludedIds.has(s.clerkUserId));

  const clerkIds = pool.map((s) => s.clerkUserId).filter(Boolean);
  let photoMap = new Map<string, string>();
  if (clerkIds.length > 0) {
    try {
      const clerk = await clerkClient();
      const { data } = await clerk.users.getUserList({ userId: clerkIds, limit: 100 });
      photoMap = new Map(data.map((u) => [u.id, u.imageUrl]));
    } catch {
      // Photos are a nice-to-have — the tool still works without them.
    }
  }

  const staff = pool.map((s) => ({
    clerkUserId: s.clerkUserId,
    name: s.displayName,
    email: s.email ?? "",
    role: s.role,
    address: s.address ?? null,
    profileImageUrl: photoMap.get(s.clerkUserId) ?? null,
    weeklySchedule: s.weeklySchedule ?? null,
    timeOff: s.timeOff ?? [],
  }));

  return NextResponse.json({ staff });
}
