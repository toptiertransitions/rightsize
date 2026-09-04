import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getStaffMembers, getUserRoleForTenant, updateItem, logItemRouteChange } from "@/lib/airtable";
import type { PrimaryRoute } from "@/lib/types";

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { items, tenantId, primaryRoute } = await req.json() as {
    items: Array<{ id: string; itemName: string; tenantId: string; currentRoute: string }>;
    tenantId: string;
    primaryRoute: PrimaryRoute;
  };

  if (!items?.length || !tenantId || !primaryRoute) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const [sysRole, tenantRole] = await Promise.all([
    getSystemRole(userId).catch(() => null),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
  ]);
  const isSystemStaff = sysRole && ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"].includes(sysRole);
  if (!isSystemStaff && (!tenantRole || !EDIT_ROLES.includes(tenantRole))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolveChangerName = async (): Promise<string> => {
    const staffList = await getStaffMembers().catch(() => []);
    const staff = staffList.find(s => s.clerkUserId === userId);
    if (staff?.displayName) return staff.displayName;
    try {
      const client = await clerkClient();
      const u = await client.users.getUser(userId);
      return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses[0]?.emailAddress || userId;
    } catch { return userId; }
  };

  const results = await Promise.allSettled(
    items.map(item => updateItem(item.id, { primaryRoute }))
  );

  const changedBy = await resolveChangerName();
  for (const item of items) {
    if (item.currentRoute !== primaryRoute) {
      logItemRouteChange({
        itemId: item.id,
        itemName: item.itemName,
        tenantId: item.tenantId,
        oldRoute: item.currentRoute,
        newRoute: primaryRoute,
        changedBy,
        source: "Bulk Route",
      }).catch(() => {});
    }
  }

  const succeeded = results.filter(r => r.status === "fulfilled").length;
  const failed = results.filter(r => r.status === "rejected").length;
  return NextResponse.json({ succeeded, failed });
}
