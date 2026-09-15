import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getTenants, getStaffMembers } from "@/lib/airtable";
import { getProjectMessagesForTenants, getThreadReadState, BROADCAST_TENANT_ID } from "@/lib/airtable-messages";
import { getAccessibleTenantIds } from "@/lib/thread-access";

export interface InboxThreadSummary {
  tenantId: string;
  projectName: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageAuthorName: string | null;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  const tenantIds = await getAccessibleTenantIds(userId, sysRole);
  if (tenantIds.length === 0) return NextResponse.json({ threads: [] as InboxThreadSummary[] });

  const [messages, readState, tenants, staff] = await Promise.all([
    getProjectMessagesForTenants(tenantIds),
    getThreadReadState(userId),
    getTenants().catch(() => []),
    getStaffMembers().catch(() => []),
  ]);

  const tenantNameById = new Map(tenants.map(t => [t.id, t.name]));
  const staffNameByClerkId = new Map(staff.map(s => [s.clerkUserId, s.displayName]));

  const byTenant = new Map<string, typeof messages>();
  for (const id of tenantIds) byTenant.set(id, []);
  for (const m of messages) {
    if (!byTenant.has(m.tenantId)) byTenant.set(m.tenantId, []);
    byTenant.get(m.tenantId)!.push(m);
  }

  const threads: InboxThreadSummary[] = tenantIds
    .map(tenantId => {
      const threadMessages = byTenant.get(tenantId) ?? []; // already sorted desc by getProjectMessagesForTenants
      const lastReadAt = readState.get(tenantId);
      const unreadCount = lastReadAt
        ? threadMessages.filter(m => m.timestamp > lastReadAt).length
        : threadMessages.length;
      const last = threadMessages[0];
      return {
        tenantId,
        projectName: tenantId === BROADCAST_TENANT_ID ? "Company-wide" : (tenantNameById.get(tenantId) ?? "Unknown project"),
        unreadCount,
        lastMessageAt: last?.timestamp ?? null,
        lastMessagePreview: last?.body ?? null,
        lastMessageAuthorName: last ? (staffNameByClerkId.get(last.authorClerkId) ?? "Unknown") : null,
      };
    })
    // Threads with no messages yet are still valid access (e.g. a newly
    // assigned project) but sort to the bottom.
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

  return NextResponse.json({ threads });
}
