// Airtable access for Communities, Community Contacts and Community
// Activity (new tables; see docs/community-schema.md). Raw fetch like the
// rest of lib/airtable.ts, plus pagination, 10-record batches and retries on
// rate limits. No Next.js imports, so the seed script can use it directly.
// Server only.
import {
  RULE_DEFINITIONS, RULE_KEYS, emptyRules,
  type ActivityAction, type Community, type CommunityActivity, type CommunityContact, type Phone, type RuleKey, type RuleStatus,
} from "./types";
import { isPhoneLabel, phonesDisplay } from "./phones";

export const COMMUNITY_TABLES = {
  COMMUNITIES: process.env.AIRTABLE_COMMUNITIES_TABLE || "Communities",
  CONTACTS: process.env.AIRTABLE_COMMUNITY_CONTACTS_TABLE || "Community Contacts",
  ACTIVITY: process.env.AIRTABLE_COMMUNITY_ACTIVITY_TABLE || "Community Activity",
};

/** Thrown when a table is missing, so routes can say what to do. */
export class CommunitySetupError extends Error {
  constructor(table: string) {
    super(`The Airtable table "${table}" doesn't exist yet. Run scripts/community/create-airtable-tables.ts (see docs/community-schema.md).`);
    this.name = "CommunitySetupError";
  }
}

export type AirtableRecord = { id: string; createdTime: string; fields: Record<string, unknown> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function at(table: string, path: string, init?: RequestInit): Promise<unknown> {
  const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (res.status === 429 && attempt < 4) { await sleep(1000 * 2 ** attempt); continue; }
    if (res.ok) return res.json();
    const body = await res.text();
    if (res.status === 404 || /TABLE_NOT_FOUND|INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND/.test(body)) throw new CommunitySetupError(table);
    console.error(`[communities] Airtable ${table}${path.split("?")[0]} ${res.status}: ${body.slice(0, 500)}`);
    throw new Error(`Airtable request failed (${res.status})`);
  }
}

export async function listRecords(table: string, query = ""): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const sep = query ? "&" : "";
    const data = await at(table, `?${query}${offset ? `${sep}offset=${offset}` : ""}`) as { records: AirtableRecord[]; offset?: string };
    out.push(...data.records);
    offset = data.offset;
  } while (offset);
  return out;
}

export async function getRecord(table: string, id: string): Promise<AirtableRecord | null> {
  try {
    return await at(table, `/${id}`) as AirtableRecord;
  } catch (e) {
    if (e instanceof CommunitySetupError) {
      // A bad record ID also comes back as 404; tell them apart by listing one row
      await at(table, "?maxRecords=1");
      return null;
    }
    throw e;
  }
}

/** Creates in batches of 10 (Airtable's limit), pausing between batches. */
export async function createRecords(table: string, rows: Record<string, unknown>[]): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  for (let i = 0; i < rows.length; i += 10) {
    if (i) await sleep(220);
    const data = await at(table, "", { method: "POST", body: JSON.stringify({ records: rows.slice(i, i + 10).map((fields) => ({ fields })), typecast: true }) }) as { records: AirtableRecord[] };
    out.push(...data.records);
  }
  return out;
}

export async function updateRecords(table: string, rows: { id: string; fields: Record<string, unknown> }[]): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  for (let i = 0; i < rows.length; i += 10) {
    if (i) await sleep(220);
    const data = await at(table, "", { method: "PATCH", body: JSON.stringify({ records: rows.slice(i, i + 10), typecast: true }) }) as { records: AirtableRecord[] };
    out.push(...data.records);
  }
  return out;
}

// ─── Field maps ───────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const firstLink = (v: unknown) => (Array.isArray(v) && typeof v[0] === "string" ? v[0] : "");

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export const COMMUNITY_FIELD = {
  name: "Name",
  type: "Type",
  operator: "Operator / Management Company",
  street: "Street Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  website: "Website",
  linkedCompanyId: "Linked Company Record ID",
  status: "Status",
  ruleStatus: "Rule Status JSON",
  floorPlansOnFile: "Floor Plans On File",
  floorPlansNotes: "Floor Plans Notes",
  openItems: "Open Items",
  sourceNotes: "Source Notes",
  lastVerified: "Last Verified",
  lastVerifiedBy: "Last Verified By",
  internalNotes: "Internal Notes",
  archived: "Archived",
  createdAt: "Created At",
  updatedAt: "Updated At",
  updatedBy: "Updated By",
  seedSnapshot: "Seed Snapshot JSON",
} as const;

export const CONTACT_FIELD = {
  name: "Name",
  community: "Community",
  /** Plain-text copy of the link, so formulas can filter by record ID. */
  communityId: "Community Record ID",
  title: "Title",
  role: "Role",
  email: "Email",
  phones: "Phones JSON",
  phonesDisplay: "Phones Display",
  isPrimaryMoveIn: "Is Primary Move-In Contact",
  notes: "Notes",
  linkedContactId: "Linked Contact Record ID",
  sortOrder: "Sort Order",
  archived: "Archived",
  createdAt: "Created At",
  updatedAt: "Updated At",
  updatedBy: "Updated By",
  seedSnapshot: "Seed Snapshot JSON",
} as const;

export const ACTIVITY_FIELD = { summary: "Summary", community: "Community", communityId: "Community Record ID", action: "Action", by: "By", at: "At" } as const;

export function mapCommunity(r: AirtableRecord): Community {
  const f = r.fields;
  const rules = emptyRules();
  for (const d of RULE_DEFINITIONS) rules[d.key] = str(f[d.airtableField]);
  const rawStatus = parseJson<Record<string, string>>(f[COMMUNITY_FIELD.ruleStatus], {});
  const ruleStatus: Partial<Record<RuleKey, RuleStatus>> = {};
  for (const k of RULE_KEYS) {
    const v = rawStatus[k];
    if (v === "known" || v === "unknown" || v === "not_applicable") ruleStatus[k] = v;
  }
  return {
    id: r.id,
    name: str(f[COMMUNITY_FIELD.name]),
    type: (str(f[COMMUNITY_FIELD.type]) || "Other") as Community["type"],
    operator: str(f[COMMUNITY_FIELD.operator]),
    street: str(f[COMMUNITY_FIELD.street]),
    city: str(f[COMMUNITY_FIELD.city]),
    state: str(f[COMMUNITY_FIELD.state]),
    zip: str(f[COMMUNITY_FIELD.zip]),
    website: str(f[COMMUNITY_FIELD.website]),
    linkedCompanyId: str(f[COMMUNITY_FIELD.linkedCompanyId]),
    status: (str(f[COMMUNITY_FIELD.status]) || "Active") as Community["status"],
    rules,
    ruleStatus,
    floorPlansOnFile: f[COMMUNITY_FIELD.floorPlansOnFile] === true,
    floorPlansNotes: str(f[COMMUNITY_FIELD.floorPlansNotes]),
    openItems: str(f[COMMUNITY_FIELD.openItems]),
    sourceNotes: str(f[COMMUNITY_FIELD.sourceNotes]),
    lastVerified: str(f[COMMUNITY_FIELD.lastVerified]).slice(0, 10),
    lastVerifiedBy: str(f[COMMUNITY_FIELD.lastVerifiedBy]),
    internalNotes: str(f[COMMUNITY_FIELD.internalNotes]),
    archived: f[COMMUNITY_FIELD.archived] === true,
    createdAt: str(f[COMMUNITY_FIELD.createdAt]) || r.createdTime,
    updatedAt: str(f[COMMUNITY_FIELD.updatedAt]) || r.createdTime,
    updatedBy: str(f[COMMUNITY_FIELD.updatedBy]),
  };
}

/** Airtable fields for the parts of a community that are set. */
export function communityToFields(c: Partial<Community>): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  const set = (key: keyof typeof COMMUNITY_FIELD, v: unknown) => { if (v !== undefined) f[COMMUNITY_FIELD[key]] = v; };
  set("name", c.name);
  set("type", c.type);
  set("operator", c.operator);
  set("street", c.street);
  set("city", c.city);
  set("state", c.state);
  set("zip", c.zip);
  set("website", c.website);
  set("linkedCompanyId", c.linkedCompanyId);
  set("status", c.status);
  if (c.rules) {
    for (const d of RULE_DEFINITIONS) {
      if (c.rules[d.key] === undefined) continue;
      // An empty select is cleared with null
      f[d.airtableField] = d.fieldType === "coi" ? c.rules[d.key] || null : c.rules[d.key];
    }
  }
  if (c.ruleStatus) f[COMMUNITY_FIELD.ruleStatus] = JSON.stringify(c.ruleStatus);
  set("floorPlansOnFile", c.floorPlansOnFile);
  set("floorPlansNotes", c.floorPlansNotes);
  set("openItems", c.openItems);
  set("sourceNotes", c.sourceNotes);
  if (c.lastVerified !== undefined) f[COMMUNITY_FIELD.lastVerified] = c.lastVerified || null;
  set("lastVerifiedBy", c.lastVerifiedBy);
  set("internalNotes", c.internalNotes);
  set("archived", c.archived);
  set("createdAt", c.createdAt);
  set("updatedAt", c.updatedAt);
  set("updatedBy", c.updatedBy);
  return f;
}

export function mapContact(r: AirtableRecord): CommunityContact {
  const f = r.fields;
  const phones = parseJson<unknown[]>(f[CONTACT_FIELD.phones], [])
    .filter((p): p is Phone => !!p && typeof p === "object" && isPhoneLabel((p as Phone).label) && typeof (p as Phone).number === "string");
  return {
    id: r.id,
    communityId: str(f[CONTACT_FIELD.communityId]) || firstLink(f[CONTACT_FIELD.community]),
    name: str(f[CONTACT_FIELD.name]),
    title: str(f[CONTACT_FIELD.title]),
    role: str(f[CONTACT_FIELD.role]) as CommunityContact["role"],
    email: str(f[CONTACT_FIELD.email]),
    phones,
    isPrimaryMoveIn: f[CONTACT_FIELD.isPrimaryMoveIn] === true,
    notes: str(f[CONTACT_FIELD.notes]),
    linkedContactId: str(f[CONTACT_FIELD.linkedContactId]),
    sortOrder: num(f[CONTACT_FIELD.sortOrder]),
    archived: f[CONTACT_FIELD.archived] === true,
    createdAt: str(f[CONTACT_FIELD.createdAt]) || r.createdTime,
    updatedAt: str(f[CONTACT_FIELD.updatedAt]) || r.createdTime,
    updatedBy: str(f[CONTACT_FIELD.updatedBy]),
  };
}

export function contactToFields(c: Partial<CommunityContact>): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  const set = (key: keyof typeof CONTACT_FIELD, v: unknown) => { if (v !== undefined) f[CONTACT_FIELD[key]] = v; };
  set("name", c.name);
  if (c.communityId !== undefined) {
    f[CONTACT_FIELD.community] = c.communityId ? [c.communityId] : [];
    f[CONTACT_FIELD.communityId] = c.communityId;
  }
  set("title", c.title);
  if (c.role !== undefined) f[CONTACT_FIELD.role] = c.role || null;
  set("email", c.email);
  if (c.phones !== undefined) {
    f[CONTACT_FIELD.phones] = JSON.stringify(c.phones);
    f[CONTACT_FIELD.phonesDisplay] = phonesDisplay(c.phones);
  }
  set("isPrimaryMoveIn", c.isPrimaryMoveIn);
  set("notes", c.notes);
  set("linkedContactId", c.linkedContactId);
  set("sortOrder", c.sortOrder);
  set("archived", c.archived);
  set("createdAt", c.createdAt);
  set("updatedAt", c.updatedAt);
  set("updatedBy", c.updatedBy);
  return f;
}

export function mapActivity(r: AirtableRecord): CommunityActivity {
  const f = r.fields;
  return {
    id: r.id,
    communityId: str(f[ACTIVITY_FIELD.communityId]) || firstLink(f[ACTIVITY_FIELD.community]),
    action: str(f[ACTIVITY_FIELD.action]) as ActivityAction,
    summary: str(f[ACTIVITY_FIELD.summary]),
    by: str(f[ACTIVITY_FIELD.by]),
    at: str(f[ACTIVITY_FIELD.at]) || r.createdTime,
  };
}

export function activityToFields(a: Omit<CommunityActivity, "id">): Record<string, unknown> {
  return {
    [ACTIVITY_FIELD.summary]: a.summary,
    [ACTIVITY_FIELD.community]: [a.communityId],
    [ACTIVITY_FIELD.communityId]: a.communityId,
    [ACTIVITY_FIELD.action]: a.action,
    [ACTIVITY_FIELD.by]: a.by,
    [ACTIVITY_FIELD.at]: a.at,
  };
}

/** Airtable formula for "this record belongs to community X". */
export const belongsTo = (recordId: string) => `{Community Record ID} = "${recordId.replace(/[^A-Za-z0-9]/g, "")}"`;
