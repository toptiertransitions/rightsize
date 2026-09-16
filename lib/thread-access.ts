/**
 * Communication Hub access control — project team channel, plus private
 * DM-style lines (Staff↔HQ, Staff↔Team Lead). See
 * PRD-ADDENDUM-2026-09-15.md and lib/airtable-messages.ts for design
 * context.
 *
 * "Assigned crew" (team-channel access) reuses the exact same signal the
 * Plan page already uses to gate shift visibility for TTTStaff: appearing
 * as a helper (by email) on a plan entry for that project.
 *
 * TTTSales has the same full access as Manager/Admin — every project's
 * team channel regardless of status, every "hq:X" line, broadcast rights,
 * Open Issues/acknowledgment. Confirmed explicitly, not the original PRD
 * default (which only named crew/Team Lead/Ops).
 */
import type { SystemRole } from "./types";
import { getStaffMember, getStaffMembers, getTenants, getPlanEntriesForTenant, getPlanEntriesForDateRange } from "./airtable";
import {
  BROADCAST_TENANT_ID,
  TEAM_CHANNEL,
  hqChannel,
  leadChannel,
  channelParticipant,
  getProjectMessages,
  isDmTenant,
  dmParticipants,
} from "./airtable-messages";

const INTERNAL_ROLES: SystemRole[] = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin", "TTTSales"];
const MANAGER_EQUIVALENT_ROLES: SystemRole[] = ["TTTManager", "TTTAdmin", "TTTSales"];

export function isCommsHubRole(sysRole: SystemRole | null): boolean {
  return !!sysRole && INTERNAL_ROLES.includes(sysRole);
}

/** Manager/Admin/Sales all get identical full access — every project, every HQ line, broadcast + acknowledge rights. */
export function isManagerEquivalent(sysRole: SystemRole | null): boolean {
  return !!sysRole && MANAGER_EQUIVALENT_ROLES.includes(sysRole);
}

async function isHelperOnTenant(clerkUserId: string, tenantId: string): Promise<boolean> {
  const member = await getStaffMember(clerkUserId).catch(() => null);
  if (!member?.email) return false;
  const emailLower = member.email.toLowerCase();
  const entries = await getPlanEntriesForTenant(tenantId).catch(() => []);
  return entries.some(e => e.helpers?.some(h => h.email.toLowerCase() === emailLower));
}

/** Whether this user can view (and post in) a project's "Full Project Team" channel. */
export async function canAccessProjectThread(
  clerkUserId: string,
  sysRole: SystemRole | null,
  tenantId: string
): Promise<boolean> {
  if (!isCommsHubRole(sysRole)) return false;
  if (isManagerEquivalent(sysRole)) return true;

  const tenants = await getTenants().catch(() => []);
  const tenant = tenants.find(t => t.id === tenantId);
  if (!tenant) return false;
  if (tenant.teamLeadClerkId === clerkUserId) return true;

  return isHelperOnTenant(clerkUserId, tenantId);
}

/**
 * Whether this user can view/post in a specific channel of a project:
 *   team    — same rule as canAccessProjectThread
 *   hq:X    — X themselves (if they have team access), or any Manager/Admin
 *   lead:X  — X themselves (if X is crew with team access, not the Team
 *             Lead), or the project's current Team Lead. Never HQ — these
 *             are private per the confirmed design.
 */
export async function canAccessChannel(
  clerkUserId: string,
  sysRole: SystemRole | null,
  tenantId: string,
  channel: string
): Promise<boolean> {
  if (!isCommsHubRole(sysRole)) return false;
  if (channel === TEAM_CHANNEL) return canAccessProjectThread(clerkUserId, sysRole, tenantId);

  const isManager = isManagerEquivalent(sysRole);
  const participant = channelParticipant(channel);
  if (!participant) return false;

  if (channel.startsWith("hq:")) {
    if (isManager) return true;
    if (participant !== clerkUserId) return false;
    return canAccessProjectThread(clerkUserId, sysRole, tenantId);
  }

  if (channel.startsWith("lead:")) {
    const tenants = await getTenants().catch(() => []);
    const tenant = tenants.find(t => t.id === tenantId);
    if (!tenant) return false;
    const isThisProjectsTeamLead = tenant.teamLeadClerkId === clerkUserId;
    if (isThisProjectsTeamLead) return true;
    if (participant === clerkUserId) return canAccessProjectThread(clerkUserId, sysRole, tenantId);
    return false;
  }

  return false;
}

/** Same as canAccessChannel, but also handles the broadcast sentinel tenant (which has no real "team" gate — any comms-hub role can view/post there, subject to the broadcast-specific Manager/Admin/Sales POST restriction enforced separately). */
export async function canAccessTenantChannel(
  clerkUserId: string,
  sysRole: SystemRole | null,
  tenantId: string,
  channel: string
): Promise<boolean> {
  if (tenantId === BROADCAST_TENANT_ID) return isCommsHubRole(sysRole);
  if (isDmTenant(tenantId)) return isCommsHubRole(sysRole) && canAccessDm(clerkUserId, tenantId);
  return canAccessChannel(clerkUserId, sysRole, tenantId, channel);
}

/** Only the two people a DM is between can ever see or post in it — no Manager/Admin/Sales override, unlike every other channel type. */
export function canAccessDm(clerkUserId: string, tenantId: string): boolean {
  const participants = dmParticipants(tenantId);
  return !!participants && participants.includes(clerkUserId);
}

export interface ChannelInfo {
  key: string;
  label: string;
}

/**
 * Pure (no I/O) computation of every channel a user can see for a project,
 * given already-fetched data. Shared by getAvailableChannels (one project,
 * fetches fresh) and the inbox route (many projects, reuses one bulk fetch
 * across all of them instead of re-fetching per project — avoids N
 * redundant Airtable calls for a Manager/Admin with many active projects).
 */
export function computeAvailableChannels(params: {
  clerkUserId: string;
  isManager: boolean;
  hasTeamAccess: boolean;
  teamLeadId: string | null;
  isThisProjectsTeamLead: boolean;
  tenantMessages: { channel: string }[]; // all messages for this one tenant, any channel
  nameByClerkId: Map<string, string>;
}): ChannelInfo[] {
  const { clerkUserId, isManager, hasTeamAccess, teamLeadId, isThisProjectsTeamLead, tenantMessages, nameByClerkId } = params;
  if (!hasTeamAccess) return [];

  const channels: ChannelInfo[] = [{ key: TEAM_CHANNEL, label: "Full Project Team" }];

  if (isManager) {
    // HQ sees every "hq:X" line that has activity on this project.
    const hqParticipantIds = new Set(
      tenantMessages
        .filter(m => m.channel.startsWith("hq:"))
        .map(m => channelParticipant(m.channel))
        .filter((id): id is string => !!id)
    );
    for (const id of hqParticipantIds) {
      channels.push({ key: hqChannel(id), label: `${nameByClerkId.get(id) ?? "Unknown"} ↔ HQ` });
    }
    return channels;
  }

  // Any team-access participant (crew or this project's Team Lead) always
  // has their own private line to HQ.
  channels.push({ key: hqChannel(clerkUserId), label: "Me ↔ HQ" });

  if (isThisProjectsTeamLead) {
    // The Team Lead sees a DM tab for every crew member who has actually
    // started a private conversation with them.
    const leadParticipantIds = new Set(
      tenantMessages
        .filter(m => m.channel.startsWith("lead:"))
        .map(m => channelParticipant(m.channel))
        .filter((id): id is string => !!id)
    );
    for (const id of leadParticipantIds) {
      channels.push({ key: leadChannel(id), label: `${nameByClerkId.get(id) ?? "Unknown"} ↔ Me` });
    }
  } else if (teamLeadId) {
    // Crew always has a private line to the project's Team Lead.
    channels.push({ key: leadChannel(clerkUserId), label: `Me ↔ ${nameByClerkId.get(teamLeadId) ?? "Team Lead"}` });
  }

  return channels;
}

/**
 * Every channel this user can see for a project — fetches what it needs
 * itself. Used by the single-project channel switcher; see
 * computeAvailableChannels for the shared, I/O-free logic and the inbox
 * route for the bulk-fetching equivalent.
 */
export async function getAvailableChannels(
  clerkUserId: string,
  sysRole: SystemRole | null,
  tenantId: string
): Promise<ChannelInfo[]> {
  if (!isCommsHubRole(sysRole)) return [];

  if (isDmTenant(tenantId)) {
    return canAccessDm(clerkUserId, tenantId) ? [{ key: TEAM_CHANNEL, label: "Direct Message" }] : [];
  }

  const isManager = isManagerEquivalent(sysRole);

  const tenants = await getTenants().catch(() => []);
  const tenant = tenants.find(t => t.id === tenantId);
  if (!tenant) return [];

  const teamLeadId = tenant.teamLeadClerkId || null;
  const isThisProjectsTeamLead = !!teamLeadId && teamLeadId === clerkUserId;
  const hasTeamAccess = isManager || isThisProjectsTeamLead || await isHelperOnTenant(clerkUserId, tenantId);
  if (!hasTeamAccess) return [];

  const [tenantMessages, staff] = await Promise.all([
    getProjectMessages(tenantId).catch(() => []),
    getStaffMembers().catch(() => []),
  ]);
  const nameByClerkId = new Map(staff.map(s => [s.clerkUserId, s.displayName]));

  return computeAvailableChannels({
    clerkUserId, isManager, hasTeamAccess, teamLeadId, isThisProjectsTeamLead, tenantMessages, nameByClerkId,
  });
}

/**
 * Every tenantId (plus the broadcast sentinel) this user's inbox should
 * aggregate. Crew/helper detection scans a bounded recent+upcoming window
 * rather than all-time — matches the existing pragmatic precedent in this
 * codebase (getPlanEntriesForTodayByEmail) of bounded, in-memory filtering
 * over an unbounded system-wide scan.
 */
export async function getAccessibleTenantIds(
  clerkUserId: string,
  sysRole: SystemRole | null
): Promise<string[]> {
  if (!isCommsHubRole(sysRole)) return [];

  // Every status (Active/Consignment/Not-Signed/Archived) is eligible —
  // the Inbox defaults its display to Active and offers the rest as an
  // explicit filter. Only Lost Deals stay excluded, matching the existing
  // "Lost deals never appear in pickers" convention used elsewhere.
  const allTenants = await getTenants().catch(() => []);
  const eligibleTenants = allTenants.filter(t => !t.isLostDeal);

  if (isManagerEquivalent(sysRole)) {
    return [BROADCAST_TENANT_ID, ...eligibleTenants.map(t => t.id)];
  }

  const teamLedIds = eligibleTenants
    .filter(t => t.teamLeadClerkId === clerkUserId)
    .map(t => t.id);

  const member = await getStaffMember(clerkUserId).catch(() => null);
  let helperIds: string[] = [];
  if (member?.email) {
    const emailLower = member.email.toLowerCase();
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 120);
    const to = new Date(today); to.setDate(to.getDate() + 60);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const entries = await getPlanEntriesForDateRange(fmt(from), fmt(to)).catch(() => []);
    const eligibleIds = new Set(eligibleTenants.map(t => t.id));
    helperIds = Array.from(new Set(
      entries
        .filter(e => eligibleIds.has(e.tenantId) && e.helpers?.some(h => h.email.toLowerCase() === emailLower))
        .map(e => e.tenantId)
    ));
  }

  return Array.from(new Set([BROADCAST_TENANT_ID, ...teamLedIds, ...helperIds]));
}
