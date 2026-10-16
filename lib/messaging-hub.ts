/**
 * Inbox (Communication Hub) data, Slack-style: one conversation list made
 * of Announcements (company broadcasts), DMs (always 1:1), and one channel
 * per project. Channels are never user-created — every project the viewer
 * can access IS a channel (see lib/thread-access.ts for who that is).
 *
 * The per-project private lines ("hq:<id>", "lead:<id>") are retired: new
 * posts go to DMs instead. Their history stays readable from the project
 * channel (legacyPrivateCount), but never counts toward unread anymore.
 *
 * Team Lead discovery: every person carries the active projects they lead
 * (limited to projects the viewer can see), so the DM picker and DM rows
 * can answer "who's the Team Lead on Kay Lincicome?" without anyone
 * needing to know it in advance.
 */
import { clerkClient } from "@clerk/nextjs/server";
import type { SystemRole, Tenant, StaffMember } from "./types";
import { getStaffMembers, getTenants, getSignedTenantIds, getPlanEntriesForTenant } from "./airtable";
import {
  getProjectMessagesForTenants,
  getDmMessagesForUser,
  getThreadReadState,
  readStateKey,
  otherDmParticipant,
  BROADCAST_TENANT_ID,
  TEAM_CHANNEL,
  type ProjectMessage,
} from "./airtable-messages";
import { getAccessibleTenantIds, isCommsHubRole, isManagerEquivalent } from "./thread-access";
import { getSuspendedOrDeletedClerkUserIds } from "./staff-visibility";
import { getProjectStatus, type ProjectStatus } from "./project-status";
import { plainMentions, mentionedIds } from "./mentions";
import { getNotifyPrefs, defaultProjectLevel, type NotifyLevel } from "./notify-prefs";

export const ANNOUNCEMENTS_KEY = "announcements";
export const dmKey = (otherUserId: string) => `dm:${otherUserId}`;
export const projectKey = (tenantId: string) => `p:${tenantId}`;

export interface HubProjectRef { tenantId: string; name: string }

export interface HubPerson {
  id: string;
  name: string;
  photoUrl?: string;
  role: SystemRole;
  /** Active projects this person is Team Lead on (only ones the viewer can see). */
  leads: HubProjectRef[];
}

interface LastMessage {
  lastAt: string | null;
  lastPreview: string | null;
  lastAuthorName: string | null;
  lastIsMine: boolean;
}

export interface HubDm extends LastMessage {
  key: string;
  tenantId: string;
  otherUserId: string;
  unread: number;
}

export interface HubProject extends LastMessage {
  key: string;
  tenantId: string;
  name: string;
  status: ProjectStatus;
  teamLeadId: string | null;
  teamLeadName: string | null;
  unread: number;
  /** Unread messages that @mention the viewer. */
  mentionsUnread: number;
  /** Push setting for this project (explicit choice or the default). */
  notifyLevel: NotifyLevel;
  /** Messages on retired private lines this viewer can still read. */
  legacyPrivateCount: number;
}

export interface HubAnnouncements extends LastMessage {
  key: string;
  unread: number;
}

export interface HubData {
  me: { id: string; isManager: boolean; canBroadcast: boolean };
  announcements: HubAnnouncements;
  dms: HubDm[];
  projects: HubProject[];
  /** Everyone the viewer can DM, plus anyone they already have a DM with. */
  people: HubPerson[];
}

function preview(m: ProjectMessage | undefined, nameOf: (id: string) => string): string | null {
  if (!m) return null;
  return plainMentions(m.body?.trim() ?? "", nameOf) || (m.attachment ? `Attachment: ${m.attachment.fileName}` : "");
}

async function clerkProfiles(ids: string[]): Promise<Map<string, { name: string; photoUrl?: string }>> {
  const map = new Map<string, { name: string; photoUrl?: string }>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  try {
    const clerk = await clerkClient();
    for (let i = 0; i < unique.length; i += 100) {
      const { data } = await clerk.users.getUserList({ userId: unique.slice(i, i + 100), limit: 100 });
      for (const u of data) {
        map.set(u.id, {
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses[0]?.emailAddress || "Unknown",
          photoUrl: u.imageUrl || undefined,
        });
      }
    }
  } catch { /* non-fatal — names fall back to the staff roster, photos to initials */ }
  return map;
}

function lastOf(messages: ProjectMessage[], viewerId: string, nameOf: (id: string) => string): LastMessage {
  const last = messages[0]; // callers pass desc-sorted lists
  return {
    lastAt: last?.timestamp ?? null,
    lastPreview: preview(last, nameOf),
    lastAuthorName: last ? nameOf(last.authorClerkId) : null,
    lastIsMine: !!last && last.authorClerkId === viewerId,
  };
}

export async function getHubData(userId: string, sysRole: SystemRole | null): Promise<HubData> {
  const isManager = isManagerEquivalent(sysRole);
  const canBroadcast = isManager;
  const accessible = await getAccessibleTenantIds(userId, sysRole);
  const projectIds = accessible.filter((id) => id !== BROADCAST_TENANT_ID);

  const [projectMessages, dmMessages, readState, tenants, staff, signedIds, prefs] = await Promise.all([
    getProjectMessagesForTenants([BROADCAST_TENANT_ID, ...projectIds]),
    getDmMessagesForUser(userId),
    getThreadReadState(userId),
    getTenants().catch(() => [] as Tenant[]),
    getStaffMembers().catch(() => [] as StaffMember[]),
    getSignedTenantIds().catch(() => new Set<string>()),
    getNotifyPrefs(userId),
  ]);

  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const statusOf = (t: Tenant) => getProjectStatus({ ...t, isContractSigned: signedIds.has(t.id) });

  // People: active comms-hub staff (minus suspended/deleted), plus anyone
  // the viewer already has a DM with, even if no longer on the roster.
  const dmOtherIds = Array.from(new Set(dmMessages.map((m) => otherDmParticipant(m.tenantId, userId)).filter((id): id is string => !!id)));
  const candidates = staff.filter((s) => s.isActive && s.clerkUserId && s.clerkUserId !== userId && isCommsHubRole(s.role));
  const excluded = await getSuspendedOrDeletedClerkUserIds(candidates.map((s) => s.clerkUserId));
  const roster = candidates.filter((s) => !excluded.has(s.clerkUserId));
  const authorIds = [...projectMessages, ...dmMessages].map((m) => m.authorClerkId);
  const profiles = await clerkProfiles([...roster.map((s) => s.clerkUserId), ...dmOtherIds, ...authorIds]);
  const staffById = new Map(staff.map((s) => [s.clerkUserId, s]));
  const nameOf = (id: string) => staffById.get(id)?.displayName || profiles.get(id)?.name || "Unknown";

  // Team Lead discovery, scoped to projects the viewer can see
  const visibleActive = projectIds
    .map((id) => tenantById.get(id))
    .filter((t): t is Tenant => !!t && statusOf(t) === "active");
  const leadsById = new Map<string, HubProjectRef[]>();
  for (const t of visibleActive) {
    if (!t.teamLeadClerkId) continue;
    if (!leadsById.has(t.teamLeadClerkId)) leadsById.set(t.teamLeadClerkId, []);
    leadsById.get(t.teamLeadClerkId)!.push({ tenantId: t.id, name: t.name });
  }
  for (const list of leadsById.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const personIds = Array.from(new Set([...roster.map((s) => s.clerkUserId), ...dmOtherIds]));
  const people: HubPerson[] = personIds.map((id) => ({
    id,
    name: nameOf(id),
    photoUrl: profiles.get(id)?.photoUrl || staffById.get(id)?.profileImageUrl || undefined,
    role: staffById.get(id)?.role ?? "TTTStaff",
    leads: leadsById.get(id) ?? [],
  })).sort((a, b) => a.name.localeCompare(b.name));

  const unreadOf = (tenantId: string, messages: ProjectMessage[]) => {
    const lastReadAt = readState.get(readStateKey(tenantId, TEAM_CHANNEL));
    return messages.filter((m) => m.authorClerkId !== userId && (!lastReadAt || m.timestamp > lastReadAt));
  };
  const unreadIn = (tenantId: string, messages: ProjectMessage[]) => unreadOf(tenantId, messages).length;

  // DMs, one per other person
  const dmByOther = new Map<string, ProjectMessage[]>();
  for (const m of dmMessages) {
    const other = otherDmParticipant(m.tenantId, userId);
    if (!other) continue;
    if (!dmByOther.has(other)) dmByOther.set(other, []);
    dmByOther.get(other)!.push(m);
  }
  const dms: HubDm[] = Array.from(dmByOther, ([otherUserId, msgs]) => ({
    key: dmKey(otherUserId),
    tenantId: msgs[0].tenantId,
    otherUserId,
    unread: unreadIn(msgs[0].tenantId, msgs),
    ...lastOf(msgs, userId, nameOf),
  })).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));

  // Project channels + announcements
  const byTenant = new Map<string, ProjectMessage[]>();
  for (const m of projectMessages) {
    if (!byTenant.has(m.tenantId)) byTenant.set(m.tenantId, []);
    byTenant.get(m.tenantId)!.push(m);
  }
  const teamOnly = (tenantId: string) => (byTenant.get(tenantId) ?? []).filter((m) => m.channel === TEAM_CHANNEL);

  const broadcasts = teamOnly(BROADCAST_TENANT_ID);
  const announcements: HubAnnouncements = {
    key: ANNOUNCEMENTS_KEY,
    unread: unreadIn(BROADCAST_TENANT_ID, broadcasts),
    ...lastOf(broadcasts, userId, nameOf),
  };

  const projects: HubProject[] = projectIds
    .map((tenantId) => {
      const t = tenantById.get(tenantId);
      if (!t) return null;
      const team = teamOnly(tenantId);
      const legacyPrivateCount = (byTenant.get(tenantId) ?? []).filter((m) => {
        if (m.channel === TEAM_CHANNEL) return false;
        const [kind, participant] = m.channel.split(":");
        if (kind === "hq") return isManager || participant === userId;
        if (kind === "lead") return participant === userId || t.teamLeadClerkId === userId;
        return false;
      }).length;
      return {
        key: projectKey(tenantId),
        tenantId,
        name: t.name,
        status: statusOf(t),
        teamLeadId: t.teamLeadClerkId || null,
        teamLeadName: t.teamLeadClerkId ? nameOf(t.teamLeadClerkId) : null,
        unread: unreadIn(tenantId, team),
        mentionsUnread: unreadOf(tenantId, team).filter((m) => mentionedIds(m.body).includes(userId)).length,
        notifyLevel: prefs.projects[tenantId] ?? defaultProjectLevel(userId, t),
        legacyPrivateCount,
        ...lastOf(team, userId, nameOf),
      };
    })
    .filter((p): p is HubProject => p !== null)
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "") || a.name.localeCompare(b.name));

  return { me: { id: userId, isManager, canBroadcast }, announcements, dms, projects, people };
}

// ─── Project members ─────────────────────────────────────────────────────────

export interface ProjectMember {
  id: string;
  name: string;
  photoUrl?: string;
  phone?: string;
  role: SystemRole;
  /** Crew only: next scheduled shift (YYYY-MM-DD), or the most recent one. */
  nextShift?: string;
  lastShift?: string;
}

export interface ProjectMembers {
  teamLead: ProjectMember | null;
  crew: ProjectMember[];
  /** Managers/Admins/Sales — can see every project. */
  hq: ProjectMember[];
}

/**
 * Who's in a project channel: its Team Lead, the crew (anyone scheduled as
 * a helper on its shifts, by email, who hasn't declined), and HQ.
 */
export async function getProjectMembers(tenantId: string): Promise<ProjectMembers> {
  const [tenants, staff, entries] = await Promise.all([
    getTenants().catch(() => [] as Tenant[]),
    getStaffMembers().catch(() => [] as StaffMember[]),
    getPlanEntriesForTenant(tenantId).catch(() => []),
  ]);
  const tenant = tenants.find((t) => t.id === tenantId);
  const active = staff.filter((s) => s.isActive && s.clerkUserId);
  const excluded = await getSuspendedOrDeletedClerkUserIds(active.map((s) => s.clerkUserId));
  const live = active.filter((s) => !excluded.has(s.clerkUserId));
  const byEmail = new Map(live.filter((s) => s.email).map((s) => [s.email.toLowerCase(), s]));

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const shifts = new Map<string, string[]>(); // clerkUserId -> dates
  for (const e of entries) {
    for (const h of e.helpers ?? []) {
      if (h.status === "declined") continue;
      const s = byEmail.get(h.email.toLowerCase());
      if (!s) continue;
      if (!shifts.has(s.clerkUserId)) shifts.set(s.clerkUserId, []);
      shifts.get(s.clerkUserId)!.push(e.date);
    }
  }

  const teamLeadId = tenant?.teamLeadClerkId || null;
  const hqStaff = live.filter((s) => isManagerEquivalent(s.role));
  const ids = [teamLeadId, ...shifts.keys(), ...hqStaff.map((s) => s.clerkUserId)].filter((id): id is string => !!id);
  const profiles = await clerkProfiles(ids);
  const staffById = new Map(staff.map((s) => [s.clerkUserId, s]));

  const toMember = (id: string): ProjectMember => {
    const s = staffById.get(id);
    return {
      id,
      name: s?.displayName || profiles.get(id)?.name || "Unknown",
      photoUrl: profiles.get(id)?.photoUrl || s?.profileImageUrl || undefined,
      phone: s?.phone || undefined,
      role: s?.role ?? "TTTStaff",
    };
  };

  const crew = Array.from(shifts, ([id, dates]) => {
    const sorted = [...new Set(dates)].sort();
    return {
      ...toMember(id),
      nextShift: sorted.find((d) => d >= today),
      lastShift: [...sorted].reverse().find((d) => d < today),
    };
  })
    .filter((m) => m.id !== teamLeadId)
    .sort((a, b) => (a.nextShift ?? "9999").localeCompare(b.nextShift ?? "9999") || a.name.localeCompare(b.name));

  return {
    teamLead: teamLeadId ? toMember(teamLeadId) : null,
    crew,
    hq: hqStaff.filter((s) => s.clerkUserId !== teamLeadId).map((s) => toMember(s.clerkUserId)).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
