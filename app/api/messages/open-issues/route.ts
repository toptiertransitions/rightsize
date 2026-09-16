import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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

  const enriched = issues.map(m => ({
    ...m,
    projectName: m.tenantId === BROADCAST_TENANT_ID ? "Company-wide" : (tenantNameById.get(m.tenantId) ?? "Unknown project"),
    authorName: staffNameByClerkId.get(m.authorClerkId) ?? "Unknown",
  }));

  return NextResponse.json({ issues: enriched });
}
