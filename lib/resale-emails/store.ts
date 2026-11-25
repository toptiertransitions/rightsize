// Resale update emails: the ResaleEmailLog table and the resale fields on
// each project (Tenants). Kept out of lib/airtable.ts since nothing else
// reads them. Server only.
import { AIRTABLE_TABLES } from "@/lib/config";
import type { ResaleEmailType } from "./render";

export type LogStatus = "claimed" | "sent" | "failed" | "dry-run" | "skipped-before-launch" | "skipped" | "duplicate";
/** Statuses that count as "this email is done" for a project. */
export const DONE_STATUSES: LogStatus[] = ["claimed", "sent", "skipped-before-launch"];

export interface ResaleLogRow {
  id: string;
  key: string;
  tenantId: string;
  projectName: string;
  emailType: ResaleEmailType;
  status: LogStatus;
  trigger: string;
  manualResend: boolean;
  anchorDate?: string;
  sentAt?: string;
  recipients: string;
  reason: string;
  flags: string;
  triggeredBy: string;
  invoiceId: string;
  createdTime: string;
}

export interface ResaleProjectState {
  tenantId: string;
  anchorDate?: string;
  anchorSource?: string;
  anchorLockedAt?: string;
  anchorLog: string;
  paused: boolean;
}

type Rec = { id: string; createdTime: string; fields: Record<string, unknown> };
const str = (v: unknown) => (typeof v === "string" ? v : "");

function api(table: string, path = "", init?: RequestInit) {
  return fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

async function listAll(table: string, query: string): Promise<Rec[]> {
  const out: Rec[] = [];
  let offset: string | undefined;
  do {
    const res = await api(table, `?${query}${offset ? `&offset=${offset}` : ""}`);
    if (!res.ok) throw new Error(`Airtable ${table}: ${res.status} ${await res.text()}`);
    const data = await res.json() as { records: Rec[]; offset?: string };
    out.push(...data.records);
    offset = data.offset;
  } while (offset);
  return out;
}

function mapLog(r: Rec): ResaleLogRow {
  const f = r.fields;
  return {
    id: r.id,
    key: str(f.Key),
    tenantId: str(f.TenantId),
    projectName: str(f.ProjectName),
    emailType: str(f.EmailType) as ResaleEmailType,
    status: str(f.Status) as LogStatus,
    trigger: str(f.Trigger),
    manualResend: f.ManualResend === true,
    anchorDate: str(f.AnchorDate) || undefined,
    sentAt: str(f.SentAt) || undefined,
    recipients: str(f.Recipients),
    reason: str(f.Reason),
    flags: str(f.Flags),
    triggeredBy: str(f.TriggeredBy),
    invoiceId: str(f.InvoiceId),
    createdTime: r.createdTime,
  };
}

export async function getResaleLog(tenantId?: string): Promise<ResaleLogRow[]> {
  const q = tenantId ? `filterByFormula=${encodeURIComponent(`{TenantId} = "${tenantId}"`)}` : "pageSize=100";
  const rows = (await listAll(AIRTABLE_TABLES.RESALE_EMAIL_LOG, q)).map(mapLog);
  return rows.sort((a, b) => a.createdTime.localeCompare(b.createdTime));
}

export interface NewLogRow {
  key: string;
  tenantId: string;
  projectName: string;
  emailType: ResaleEmailType;
  status: LogStatus;
  trigger: string;
  manualResend?: boolean;
  anchorDate?: string;
  sentAt?: string;
  recipients?: string[];
  reason?: string;
  flags?: string[];
  triggeredBy?: string;
  invoiceId?: string;
}

export async function createLogRow(row: NewLogRow): Promise<ResaleLogRow> {
  const res = await api(AIRTABLE_TABLES.RESALE_EMAIL_LOG, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Key: row.key,
        TenantId: row.tenantId,
        ProjectName: row.projectName,
        EmailType: row.emailType,
        Status: row.status,
        Trigger: row.trigger,
        ManualResend: row.manualResend ?? false,
        ...(row.anchorDate ? { AnchorDate: row.anchorDate } : {}),
        ...(row.sentAt ? { SentAt: row.sentAt } : {}),
        Recipients: (row.recipients ?? []).join("\n"),
        Reason: row.reason ?? "",
        Flags: (row.flags ?? []).join("\n"),
        TriggeredBy: row.triggeredBy ?? "",
        InvoiceId: row.invoiceId ?? "",
      },
    }),
  });
  if (!res.ok) throw new Error(`ResaleEmailLog create: ${res.status} ${await res.text()}`);
  return mapLog(await res.json() as Rec);
}

export async function updateLogRow(id: string, fields: { status?: LogStatus; sentAt?: string; reason?: string; recipients?: string[] }): Promise<void> {
  const res = await api(AIRTABLE_TABLES.RESALE_EMAIL_LOG, `/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        ...(fields.status ? { Status: fields.status } : {}),
        ...(fields.sentAt ? { SentAt: fields.sentAt } : {}),
        ...(fields.reason !== undefined ? { Reason: fields.reason } : {}),
        ...(fields.recipients ? { Recipients: fields.recipients.join("\n") } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`ResaleEmailLog update: ${res.status} ${await res.text()}`);
}

const STATE_FIELDS = ["ResaleAnchorDate", "ResaleAnchorSource", "ResaleAnchorLockedAt", "ResaleAnchorLog", "ResaleEmailsPaused"];

function mapState(r: Rec): ResaleProjectState {
  const f = r.fields;
  return {
    tenantId: r.id,
    anchorDate: str(f.ResaleAnchorDate) || undefined,
    anchorSource: str(f.ResaleAnchorSource) || undefined,
    anchorLockedAt: str(f.ResaleAnchorLockedAt) || undefined,
    anchorLog: str(f.ResaleAnchorLog),
    paused: f.ResaleEmailsPaused === true,
  };
}

/** Resale fields for every project that has an anchor or is paused. */
export async function getResaleStates(): Promise<Map<string, ResaleProjectState>> {
  const fields = STATE_FIELDS.map((f) => `fields[]=${f}`).join("&");
  const formula = encodeURIComponent(`OR({ResaleAnchorDate}, {ResaleEmailsPaused})`);
  const recs = await listAll(AIRTABLE_TABLES.TENANTS, `${fields}&filterByFormula=${formula}`);
  return new Map(recs.map((r) => [r.id, mapState(r)]));
}

export async function getResaleState(tenantId: string): Promise<ResaleProjectState> {
  // (single-record reads don't take fields[]; mapState only reads the resale ones)
  const res = await api(AIRTABLE_TABLES.TENANTS, `/${tenantId}`);
  if (!res.ok) throw new Error(`Tenant ${tenantId}: ${res.status}`);
  return mapState(await res.json() as Rec);
}

async function patchTenant(tenantId: string, fields: Record<string, unknown>) {
  const res = await api(AIRTABLE_TABLES.TENANTS, `/${tenantId}`, { method: "PATCH", body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`Tenant ${tenantId} update: ${res.status} ${await res.text()}`);
}

/** Stores the anchor date and appends a line to the project's anchor log. */
export async function setAnchor(state: ResaleProjectState, day: string, source: "computed" | "manual", note: string): Promise<ResaleProjectState> {
  const now = new Date().toISOString();
  const line = `${now} ${source} ${day}${state.anchorDate ? ` (was ${state.anchorDate})` : ""}: ${note}`;
  const anchorLog = state.anchorLog ? `${state.anchorLog}\n${line}` : line;
  await patchTenant(state.tenantId, {
    ResaleAnchorDate: day,
    ResaleAnchorSource: source,
    ResaleAnchorLockedAt: now,
    ResaleAnchorLog: anchorLog,
  });
  console.log(`[resale-emails] anchor tenant=${state.tenantId} ${line}`);
  return { ...state, anchorDate: day, anchorSource: source, anchorLockedAt: now, anchorLog };
}

export async function setPaused(tenantId: string, paused: boolean): Promise<void> {
  await patchTenant(tenantId, { ResaleEmailsPaused: paused });
}
