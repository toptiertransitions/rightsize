/**
 * Communication Hub — Phase A (structured messaging, no push).
 * See PRD-ADDENDUM-2026-09-15.md for full design context.
 *
 * Two tables:
 *   ProjectMessages  — project-anchored messages + company broadcasts
 *                       (TenantId = "__broadcast__" for the latter)
 *   ThreadReadState   — per-user last-read marker per thread, powers
 *                        unread badges in the unified inbox (not in the
 *                        original schema spec — added because "unread
 *                        badge/count per project thread" requires some
 *                        server-tracked read marker; flagged in the PR)
 */
import Airtable from "airtable";

export const BROADCAST_TENANT_ID = "__broadcast__";

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
  authorClerkId: string;
  body: string;
  timestamp: string;
  urgency: MessageUrgency;
  acknowledgedBy: string[];
  acknowledgedAt?: string;
  parentMessageId?: string;
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
    authorClerkId: toStr(f["AuthorClerkId"]),
    body: toStr(f["Body"]),
    timestamp: toStr(f["Timestamp"]),
    urgency: urgency === "Urgent" || urgency === "FYI" ? urgency : "Normal",
    acknowledgedBy,
    acknowledgedAt: toStr(f["AcknowledgedAt"]) || undefined,
    parentMessageId: toStr(f["ParentMessageId"]) || undefined,
  };
}

/** Messages for one project thread (or the broadcast feed), newest first. */
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

/** Messages across several threads in one call (used by the unified inbox). */
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

/** Every currently-unacknowledged Urgent message, company-wide — powers the Ops Open Issues view. */
export async function getOpenIssues(): Promise<ProjectMessage[]> {
  const base = getBase();
  const records = await base(MESSAGES_TABLE)
    .select({
      filterByFormula: `AND({Urgency} = "Urgent", {AcknowledgedAt} = "")`,
      sort: [{ field: "Timestamp", direction: "asc" }], // oldest-open first
    })
    .all();
  return records.map(mapMessage);
}

export async function createProjectMessage(data: {
  tenantId: string;
  authorClerkId: string;
  body: string;
  urgency: MessageUrgency;
  parentMessageId?: string;
}): Promise<ProjectMessage> {
  const base = getBase();
  const timestamp = new Date().toISOString();
  const record = await base(MESSAGES_TABLE).create({
    TenantId: data.tenantId,
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

/** Map of tenantId -> lastReadAt ISO string, for every thread this user has ever opened. */
export async function getThreadReadState(clerkUserId: string): Promise<Map<string, string>> {
  const base = getBase();
  const records = await base(READ_STATE_TABLE)
    .select({ filterByFormula: `{ClerkUserId} = "${clerkUserId}"` })
    .all();
  const map = new Map<string, string>();
  for (const r of records) {
    map.set(toStr(r.fields["TenantId"]), toStr(r.fields["LastReadAt"]));
  }
  return map;
}

/** Upsert this user's last-read marker for a thread. */
export async function markThreadRead(clerkUserId: string, tenantId: string): Promise<void> {
  const base = getBase();
  const existing = await base(READ_STATE_TABLE)
    .select({
      filterByFormula: `AND({ClerkUserId} = "${clerkUserId}", {TenantId} = "${tenantId}")`,
      maxRecords: 1,
    })
    .all();
  const now = new Date().toISOString();
  if (existing.length > 0) {
    await base(READ_STATE_TABLE).update(existing[0].id, { LastReadAt: now });
  } else {
    await base(READ_STATE_TABLE).create({ ClerkUserId: clerkUserId, TenantId: tenantId, LastReadAt: now });
  }
}
