/**
 * Communication Hub — Phase A (structured messaging, no push), extended
 * with per-project channels: a "team" channel (everyone with project
 * access) plus private DM-style lines — "hq:<clerkUserId>" (that person's
 * private line to HQ collectively) and "lead:<clerkUserId>" (a crew
 * member's private 1:1 with the project's Team Lead). See
 * PRD-ADDENDUM-2026-09-15.md for the original Phase A design context.
 *
 * Two tables:
 *   ProjectMessages  — project-anchored messages + company broadcasts
 *                       (TenantId = "__broadcast__" for the latter),
 *                       each tagged with a Channel (empty = "team", for
 *                       rows written before channels existed)
 *   ThreadReadState   — per-user last-read marker per (project, channel),
 *                        powers unread badges (not in the original Phase A
 *                        schema spec — added because unread counts need a
 *                        server-tracked read marker; flagged when built)
 */
import Airtable from "airtable";

export const BROADCAST_TENANT_ID = "__broadcast__";
export const TEAM_CHANNEL = "team";

function getBase() {
  if (!process.env.AIRTABLE_API_TOKEN) throw new Error("AIRTABLE_API_TOKEN is not set");
  if (!process.env.AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID is not set");
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_TOKEN });
  return Airtable.base(process.env.AIRTABLE_BASE_ID);
}

const MESSAGES_TABLE = process.env.AIRTABLE_PROJECT_MESSAGES_TABLE || "ProjectMessages";
const READ_STATE_TABLE = process.env.AIRTABLE_THREAD_READ_STATE_TABLE || "ThreadReadState";

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export type MessageUrgency = "Normal" | "Urgent" | "FYI";

export interface ProjectMessage {
  id: string;
  tenantId: string; // real Tenant record ID, or BROADCAST_TENANT_ID
  channel: string; // TEAM_CHANNEL | "hq:<clerkUserId>" | "lead:<clerkUserId>"
  authorClerkId: string;
  body: string;
  timestamp: string;
  urgency: MessageUrgency;
  acknowledgedBy: string[];
  acknowledgedAt?: string;
  parentMessageId?: string;
}

export function hqChannel(clerkUserId: string): string { return `hq:${clerkUserId}`; }
export function leadChannel(clerkUserId: string): string { return `lead:${clerkUserId}`; }
/** clerkUserId embedded in a "hq:<id>" or "lead:<id>" channel key, or null for "team". */
export function channelParticipant(channel: string): string | null {
  const m = channel.match(/^(hq|lead):(.+)$/);
  return m ? m[2] : null;
}

function mapMessage(record: Airtable.Record<Airtable.FieldSet>): ProjectMessage {
  const f = record.fields;
  let acknowledgedBy: string[] = [];
  try {
    const raw = toStr(f["AcknowledgedBy"]);
    if (raw) acknowledgedBy = JSON.parse(raw);
  } catch { /* leave empty on malformed JSON */ }
  const urgency = f["Urgency"];
  return {
    id: record.id,
    tenantId: toStr(f["TenantId"]),
    channel: toStr(f["Channel"]) || TEAM_CHANNEL,
    authorClerkId: toStr(f["AuthorClerkId"]),
    body: toStr(f["Body"]),
    timestamp: toStr(f["Timestamp"]),
    urgency: urgency === "Urgent" || urgency === "FYI" ? urgency : "Normal",
    acknowledgedBy,
    acknowledgedAt: toStr(f["AcknowledgedAt"]) || undefined,
    parentMessageId: toStr(f["ParentMessageId"]) || undefined,
  };
}

/** All messages for a project (every channel) — used to derive which DM channels have activity. */
export async function getProjectMessages(tenantId: string): Promise<ProjectMessage[]> {
  const base = getBase();
  const records = await base(MESSAGES_TABLE)
    .select({
      filterByFormula: `{TenantId} = "${tenantId}"`,
      sort: [{ field: "Timestamp", direction: "desc" }],
    })
    .all();
  return records.map(mapMessage);
}

/** Messages across several threads in one call (used by the unified inbox), every channel. */
export async function getProjectMessagesForTenants(tenantIds: string[]): Promise<ProjectMessage[]> {
  if (tenantIds.length === 0) return [];
  const base = getBase();
  const formula = `OR(${tenantIds.map(id => `{TenantId} = "${id}"`).join(",")})`;
  const records = await base(MESSAGES_TABLE)
    .select({
      filterByFormula: formula,
      sort: [{ field: "Timestamp", direction: "desc" }],
    })
    .all();
  return records.map(mapMessage);
}

/**
 * Every currently-unacknowledged Urgent message, company-wide, EXCLUDING
 * "lead:*" DMs — those are private between a crew member and their Team
 * Lead and must never surface on the Ops-visible Open Issues dashboard.
 */
export async function getOpenIssues(): Promise<ProjectMessage[]> {
  const base = getBase();
  const records = await base(MESSAGES_TABLE)
    .select({
      filterByFormula: `AND({Urgency} = "Urgent", {AcknowledgedAt} = "", NOT(REGEX_MATCH({Channel}, "^lead:")))`,
      sort: [{ field: "Timestamp", direction: "asc" }], // oldest-open first
    })
    .all();
  return records.map(mapMessage);
}

export async function createProjectMessage(data: {
  tenantId: string;
  channel?: string;
  authorClerkId: string;
  body: string;
  urgency: MessageUrgency;
  parentMessageId?: string;
}): Promise<ProjectMessage> {
  const base = getBase();
  const timestamp = new Date().toISOString();
  const record = await base(MESSAGES_TABLE).create({
    TenantId: data.tenantId,
    Channel: data.channel ?? TEAM_CHANNEL,
    AuthorClerkId: data.authorClerkId,
    Body: data.body,
    Timestamp: timestamp,
    Urgency: data.urgency,
    ParentMessageId: data.parentMessageId ?? "",
  });
  return mapMessage(record);
}

/** Any single active Manager/Admin can acknowledge — adds them to AcknowledgedBy and stamps AcknowledgedAt if not already set. */
export async function acknowledgeProjectMessage(id: string, clerkUserId: string): Promise<ProjectMessage> {
  const base = getBase();
  const record = await base(MESSAGES_TABLE).find(id);
  const existing = mapMessage(record);
  const acknowledgedBy = existing.acknowledgedBy.includes(clerkUserId)
    ? existing.acknowledgedBy
    : [...existing.acknowledgedBy, clerkUserId];
  const updated = await base(MESSAGES_TABLE).update(id, {
    AcknowledgedBy: JSON.stringify(acknowledgedBy),
    AcknowledgedAt: existing.acknowledgedAt ?? new Date().toISOString(),
  });
  return mapMessage(updated);
}

// ─── Thread read state (unread badges) ────────────────────────────────────────

/** Composite key used for the read-state map: `${tenantId}::${channel}`. */
export function readStateKey(tenantId: string, channel: string): string {
  return `${tenantId}::${channel}`;
}

/** Map of `${tenantId}::${channel}` -> lastReadAt ISO string, for every thread this user has opened. */
export async function getThreadReadState(clerkUserId: string): Promise<Map<string, string>> {
  const base = getBase();
  const records = await base(READ_STATE_TABLE)
    .select({ filterByFormula: `{ClerkUserId} = "${clerkUserId}"` })
    .all();
  const map = new Map<string, string>();
  for (const r of records) {
    const tenantId = toStr(r.fields["TenantId"]);
    const channel = toStr(r.fields["Channel"]) || TEAM_CHANNEL;
    map.set(readStateKey(tenantId, channel), toStr(r.fields["LastReadAt"]));
  }
  return map;
}

/** Upsert this user's last-read marker for one (project, channel) thread. */
export async function markThreadRead(clerkUserId: string, tenantId: string, channel: string): Promise<void> {
  const base = getBase();
  const existing = await base(READ_STATE_TABLE)
    .select({
      filterByFormula: `AND({ClerkUserId} = "${clerkUserId}", {TenantId} = "${tenantId}", {Channel} = "${channel}")`,
      maxRecords: 1,
    })
    .all();
  const now = new Date().toISOString();
  if (existing.length > 0) {
    await base(READ_STATE_TABLE).update(existing[0].id, { LastReadAt: now });
  } else {
    await base(READ_STATE_TABLE).create({ ClerkUserId: clerkUserId, TenantId: tenantId, Channel: channel, LastReadAt: now });
  }
}
