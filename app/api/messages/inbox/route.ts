import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getTenants, getStaffMembers } from "@/lib/airtable";
import {
  getProjectMessagesForTenants,
  getThreadReadState,
  readStateKey,
  BROADCAST_TENANT_ID,
} from "@/lib/airtable-messages";
import { getAccessibleTenantIds, computeAvailableChannels } from "@/lib/thread-access";

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
  const isManager = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const tenantIds = await getAccessibleTenantIds(userId, sysRole);
  if (tenantIds.length === 0) return NextResponse.json({ threads: [] as InboxThreadSummary[] });

  const [allMessages, readState, tenants, staff] = await Promise.all([
    getProjectMessagesForTenants(tenantIds),
    getThreadReadState(userId),
    getTenants().catch(() => []),
    getStaffMembers().catch(() => []),
  ]);

  const tenantNameById = new Map(tenants.map(t => [t.id, t.name]));
  const tenantById = new Map(tenants.map(t => [t.id, t]));
  const staffNameByClerkId = new Map(staff.map(s => [s.clerkUserId, s.displayName]));

  const messagesByTenant = new Map<string, typeof allMessages>();
  for (const id of tenantIds) messagesByTenant.set(id, []);
  for (const m of allMessages) {
    if (!messagesByTenant.has(m.tenantId)) messagesByTenant.set(m.tenantId, []);
    messagesByTenant.get(m.tenantId)!.push(m);
  }

  const threads: InboxThreadSummary[] = tenantIds.map(tenantId => {
    const tenantMessages = messagesByTenant.get(tenantId) ?? []; // sorted desc

    let accessibleChannels: string[];
    if (tenantId === BROADCAST_TENANT_ID) {
      accessibleChannels = ["team"];
    } else {
      const tenant = tenantById.get(tenantId);
      const teamLeadId = tenant?.teamLeadClerkId || null;
      const isThisProjectsTeamLead = !!teamLeadId && teamLeadId === userId;
      const channels = computeAvailableChannels({
        clerkUserId: userId,
        isManager,
        hasTeamAccess: true, // tenantId is already filtered to accessible ones by getAccessibleTenantIds
        teamLeadId,
        isThisProjectsTeamLead,
        tenantMessages,
        nameByClerkId: staffNameByClerkId,
      });
      accessibleChannels = channels.map(c => c.key);
    }
    const accessibleChannelSet = new Set(accessibleChannels);
    const visibleMessages = tenantMessages.filter(m => accessibleChannelSet.has(m.channel));

    const unreadCount = visibleMessages.reduce((count, m) => {
      const lastReadAt = readState.get(readStateKey(tenantId, m.channel));
      return count + (!lastReadAt || m.timestamp > lastReadAt ? 1 : 0);
    }, 0);

    const last = visibleMessages[0]; // already sorted desc within tenant
    return {
      tenantId,
      projectName: tenantId === BROADCAST_TENANT_ID ? "Company-wide" : (tenantNameById.get(tenantId) ?? "Unknown project"),
      unreadCount,
      lastMessageAt: last?.timestamp ?? null,
      lastMessagePreview: last?.body ?? null,
      lastMessageAuthorName: last ? (staffNameByClerkId.get(last.authorClerkId) ?? "Unknown") : null,
    };
  }).sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

  return NextResponse.json({ threads });
}
