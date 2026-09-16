import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getTenants, getStaffMembers } from "@/lib/airtable";
import { getOpenIssues, BROADCAST_TENANT_ID } from "@/lib/airtable-messages";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin" && sysRole !== "TTTSales") {
    return NextResponse.json({ error: "Forbidden — Manager, Admin, or Sales only" }, { status: 403 });
  }

  const [issues, tenants, staff] = await Promise.all([
    getOpenIssues(),
    getTenants().catch(() => []),
    getStaffMembers().catch(() => []),
  ]);

  const tenantNameById = new Map(tenants.map(t => [t.id, t.name]));
  const staffNameByClerkId = new Map(staff.map(s => [s.clerkUserId, s.displayName]));

  // Fallback for accounts with no StaffRoles record (e.g. the hardcoded/
  // env-based TTTAdmin — see lib/config.ts isTTTAdmin) — Clerk always
  // knows their name even when the Airtable roster doesn't.
  const authorIds = Array.from(new Set(issues.map(m => m.authorClerkId).filter(Boolean)));
  let clerkNameByClerkId = new Map<string, string>();
  if (authorIds.length > 0) {
    try {
      const clerk = await clerkClient();
      const { data: clerkUsers } = await clerk.users.getUserList({ userId: authorIds, limit: 100 });
      clerkNameByClerkId = new Map(clerkUsers.map(u => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses[0]?.emailAddress || "Unknown",
      ]));
    } catch { /* non-fatal */ }
  }

  const enriched = issues.map(m => ({
    ...m,
    projectName: m.tenantId === BROADCAST_TENANT_ID ? "Company-wide" : (tenantNameById.get(m.tenantId) ?? "Unknown project"),
    authorName: staffNameByClerkId.get(m.authorClerkId) ?? clerkNameByClerkId.get(m.authorClerkId) ?? "Unknown",
  }));

  return NextResponse.json({ issues: enriched });
}
