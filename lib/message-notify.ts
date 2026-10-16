/**
 * Inbox push notifications (Phase 2), Slack-style.
 *
 * Who gets a push for a new message:
 *   DM            — the other person, always.
 *   Announcement  — every active staff member.
 *   Project       — per person, by their setting for that project:
 *                     "all"      every message
 *                     "mentions" only when @mentioned (default; Team Leads
 *                                default to "all" on projects they lead)
 *                     "none"     nothing except Urgent
 *                   Urgent messages always reach the Team Lead and HQ.
 *   Thread reply  — whoever posted the message or replied to it, plus
 *                   anyone @mentioned in the reply.
 *
 * Never pushed: your own messages; people looking at that conversation
 * right now (presence heartbeat); anyone in their quiet hours, except
 * Urgent. Settings and presence live in Upstash Redis — when it isn't
 * configured (local dev), defaults apply and nothing is suppressed.
 */
import "server-only";
import type { StaffMember, Tenant } from "./types";
import { getStaffMembers } from "./airtable";
import { BROADCAST_TENANT_ID, isDmTenant, otherDmParticipant, dmParticipants } from "./airtable-messages";
import { isCommsHubRole } from "./thread-access";
import { getSuspendedOrDeletedClerkUserIds } from "./staff-visibility";
import { sendPushToClerkUsers } from "./push-send";
import { getProjectMembers } from "./messaging-hub";
import { mentionedIds, plainMentions } from "./mentions";
import { getNotifyPrefsMany, viewingMany, inQuietHours, defaultProjectLevel, type NotifyPrefs } from "./notify-prefs";

// ─── Fan-out ─────────────────────────────────────────────────────────────────

function conversationUrl(tenantId: string, recipientId: string, authorId: string): string {
  if (tenantId === BROADCAST_TENANT_ID) return "/inbox?c=announcements";
  if (isDmTenant(tenantId)) return `/inbox?c=dm:${otherDmParticipant(tenantId, recipientId) ?? authorId}`;
  return `/inbox?c=p:${tenantId}`;
}

function clip(s: string, n = 180): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

interface Delivery { userId: string; title: string; body: string; urgent: boolean; mention: boolean }

async function deliver(deliveries: Delivery[], ctx: { tenantId: string; authorId: string; threadKey: string; type: "DM" | "Message" | "Mention" | "ThreadReply" | "Urgent" | "Announcement" }) {
  const ids = Array.from(new Set(deliveries.map((d) => d.userId))).filter((id) => id !== ctx.authorId);
  if (ids.length === 0) return;
  const [excluded, prefs, viewing] = await Promise.all([
    getSuspendedOrDeletedClerkUserIds(ids),
    getNotifyPrefsMany(ids),
    viewingMany(ids),
  ]);
  const sent = new Set<string>();
  for (const d of deliveries) {
    if (d.userId === ctx.authorId || sent.has(d.userId) || excluded.has(d.userId)) continue;
    if (viewing.get(d.userId) === ctx.tenantId) continue; // they're looking at it
    if (!d.urgent && inQuietHours(prefs.get(d.userId)!.quiet)) continue;
    sent.add(d.userId);
    await sendPushToClerkUsers(
      [d.userId],
      { title: d.title, body: clip(d.body), url: conversationUrl(ctx.tenantId, d.userId, ctx.authorId), threadId: ctx.threadKey },
      { type: d.urgent ? "Urgent" : d.mention ? "Mention" : ctx.type }
    ).catch((e) => console.error("[message-notify] push failed:", e));
  }
}

function threadKeyFor(tenantId: string): string {
  if (tenantId === BROADCAST_TENANT_ID) return "announcements";
  if (isDmTenant(tenantId)) return `dm:${(dmParticipants(tenantId) ?? []).join(":")}`;
  return `p:${tenantId}`;
}

/** Push for a new top-level message. Call from after() — never throws. */
export async function notifyNewMessage(params: {
  tenantId: string;
  tenant: Tenant | null;
  authorId: string;
  authorName: string;
  body: string;
  attachmentName?: string;
  urgent: boolean;
  /** Urgent recipients (Team Lead + HQ), already computed by the route for its email. */
  urgentRecipientIds?: string[];
}): Promise<void> {
  try {
    const { tenantId, tenant, authorId, authorName, urgent } = params;
    const staff = await getStaffMembers().catch(() => [] as StaffMember[]);
    const nameOf = (id: string) => staff.find((s) => s.clerkUserId === id)?.displayName ?? "someone";
    const text = plainMentions(params.body, nameOf).trim() || (params.attachmentName ? `Sent ${params.attachmentName}` : "");
    const ctx = { tenantId, authorId, threadKey: threadKeyFor(tenantId) };

    if (isDmTenant(tenantId)) {
      const other = otherDmParticipant(tenantId, authorId);
      if (other) await deliver([{ userId: other, title: authorName, body: text, urgent: false, mention: false }], { ...ctx, type: "DM" });
      return;
    }

    if (tenantId === BROADCAST_TENANT_ID) {
      const everyone = staff.filter((s) => s.isActive && s.clerkUserId && isCommsHubRole(s.role)).map((s) => s.clerkUserId);
      await deliver(everyone.map((id) => ({ userId: id, title: "Announcement", body: `${authorName}: ${text}`, urgent: false, mention: false })), { ...ctx, type: "Announcement" });
      return;
    }

    const projectName = tenant?.name ?? "Project";
    const members = await getProjectMembers(tenantId);
    const memberIds = [members.teamLead?.id, ...members.crew.map((m) => m.id), ...members.hq.map((m) => m.id)].filter((id): id is string => !!id);
    const mentioned = new Set(mentionedIds(params.body).filter((id) => memberIds.includes(id)));
    const urgentIds = new Set(urgent ? params.urgentRecipientIds ?? [] : []);
    const prefs = await getNotifyPrefsMany(memberIds);

    const deliveries: Delivery[] = [];
    for (const id of memberIds) {
      const level = prefs.get(id)?.projects[tenantId] ?? defaultProjectLevel(id, tenant);
      const isUrgent = urgentIds.has(id);
      const isMention = mentioned.has(id);
      if (!isUrgent && level === "none") continue;
      if (!isUrgent && !isMention && level !== "all") continue;
      deliveries.push({
        userId: id,
        title: isUrgent ? `Urgent — #${projectName}` : isMention ? `${authorName} mentioned you in #${projectName}` : `#${projectName}`,
        body: isMention && !isUrgent ? text : `${authorName}: ${text}`,
        urgent: isUrgent,
        mention: isMention,
      });
    }
    // Urgent recipients who aren't project members (e.g. HQ when the roster changed)
    for (const id of urgentIds) {
      if (!memberIds.includes(id)) deliveries.push({ userId: id, title: `Urgent — #${projectName}`, body: `${authorName}: ${text}`, urgent: true, mention: false });
    }
    await deliver(deliveries, { ...ctx, type: "Message" });
  } catch (e) {
    console.error("[message-notify] notifyNewMessage failed:", e);
  }
}

/** Push for a thread reply. Call from after() — never throws. */
export async function notifyThreadReply(params: {
  tenantId: string;
  tenant: Tenant | null;
  authorId: string;
  authorName: string;
  body: string;
  parentAuthorId: string;
  priorRepliers: string[];
}): Promise<void> {
  try {
    const { tenantId, tenant, authorId, authorName } = params;
    const staff = await getStaffMembers().catch(() => [] as StaffMember[]);
    const nameOf = (id: string) => staff.find((s) => s.clerkUserId === id)?.displayName ?? "someone";
    const text = plainMentions(params.body, nameOf).trim();
    const where = isDmTenant(tenantId) ? "" : tenantId === BROADCAST_TENANT_ID ? " in Announcements" : ` in #${tenant?.name ?? "a project"}`;

    let allowed: Set<string> | null = null; // project: only current members
    let prefs = new Map<string, NotifyPrefs>();
    if (!isDmTenant(tenantId) && tenantId !== BROADCAST_TENANT_ID) {
      const m = await getProjectMembers(tenantId);
      allowed = new Set([m.teamLead?.id, ...m.crew.map((x) => x.id), ...m.hq.map((x) => x.id)].filter((id): id is string => !!id));
      prefs = await getNotifyPrefsMany([...allowed]);
    }

    const participants = new Set([params.parentAuthorId, ...params.priorRepliers]);
    const mentioned = new Set(mentionedIds(params.body));
    const deliveries: Delivery[] = [];
    for (const id of new Set([...participants, ...mentioned])) {
      if (allowed && !allowed.has(id)) continue;
      if (allowed && (prefs.get(id)?.projects[tenantId] ?? defaultProjectLevel(id, tenant)) === "none") continue;
      if (isDmTenant(tenantId) && !((dmParticipants(tenantId) ?? []) as string[]).includes(id)) continue;
      const isMention = mentioned.has(id);
      deliveries.push({
        userId: id,
        title: isMention ? `${authorName} mentioned you${where}` : `${authorName} replied${where}`,
        body: text,
        urgent: false,
        mention: isMention,
      });
    }
    await deliver(deliveries, { tenantId, authorId, threadKey: threadKeyFor(tenantId), type: "ThreadReply" });
  } catch (e) {
    console.error("[message-notify] notifyThreadReply failed:", e);
  }
}
