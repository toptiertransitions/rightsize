/**
 * One-time backfill: set LastActivityDate on all referral contacts and companies
 * from the CRM Activities table.
 *
 * Usage: npx tsx scripts/backfill-activity-dates.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  process.env[key] ??= val;
}

const TOKEN   = process.env.AIRTABLE_API_TOKEN!;
const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const ACTIVITIES_TABLE = process.env.AIRTABLE_CRM_ACTIVITIES_TABLE  || "CRMActivities";
const CONTACTS_TABLE   = process.env.AIRTABLE_CRM_CONTACTS_TABLE    || "CRMReferralContacts";
const COMPANIES_TABLE  = process.env.AIRTABLE_CRM_COMPANIES_TABLE   || "CRMReferralCompanies";

if (!TOKEN || !BASE_ID) {
  console.error("Missing AIRTABLE_API_TOKEN or AIRTABLE_BASE_ID in .env.local");
  process.exit(1);
}

// ── Airtable helpers ──────────────────────────────────────────────────────────
function airtable(table: string, path: string, options?: RequestInit) {
  return fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

async function fetchAll(table: string, qs = ""): Promise<{ id: string; fields: Record<string, unknown> }[]> {
  const all: { id: string; fields: Record<string, unknown> }[] = [];
  let offset: string | undefined;
  do {
    const sep = qs ? "&" : "?";
    const url = qs
      ? `?${qs}${offset ? `&offset=${offset}` : ""}`
      : `?${offset ? `offset=${offset}` : ""}`;
    const res = await airtable(table, url);
    if (!res.ok) throw new Error(`fetchAll(${table}): ${await res.text()}`);
    const data = await res.json() as { records: { id: string; fields: Record<string, unknown> }[]; offset?: string };
    all.push(...data.records);
    offset = data.offset;
    void sep;
  } while (offset);
  return all;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ── Batch PATCH (Airtable limit: 10 records per request) ─────────────────────
async function batchPatch(table: string, updates: { id: string; fields: Record<string, unknown> }[]): Promise<void> {
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    const res = await airtable(table, "", {
      method: "PATCH",
      body: JSON.stringify({ records: batch }),
    });
    if (!res.ok) {
      console.error(`batchPatch(${table}) batch ${i / 10 + 1} failed:`, await res.text());
    } else {
      console.log(`  patched ${table} records ${i + 1}–${Math.min(i + 10, updates.length)}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Fetching all activities, contacts, and companies…");
  const [activities, contacts, companies] = await Promise.all([
    fetchAll(ACTIVITIES_TABLE, "sort%5B0%5D%5Bfield%5D=ActivityDate&sort%5B0%5D%5Bdirection%5D=desc"),
    fetchAll(CONTACTS_TABLE,   "sort%5B0%5D%5Bfield%5D=Name&sort%5B0%5D%5Bdirection%5D=asc"),
    fetchAll(COMPANIES_TABLE,  "sort%5B0%5D%5Bfield%5D=Name&sort%5B0%5D%5Bdirection%5D=asc"),
  ]);

  console.log(`  ${activities.length} activities, ${contacts.length} contacts, ${companies.length} companies`);

  // ── 1. contactId → max activityDate ────────────────────────────────────────
  // Normalise all dates to YYYY-MM-DD (Airtable Date fields reject full ISO timestamps)
  const toDateOnly = (v: string) => v ? v.slice(0, 10) : "";

  const contactMaxDate = new Map<string, string>();
  for (const act of activities) {
    const cid = str(act.fields.ClientContactId);
    const date = toDateOnly(str(act.fields.ActivityDate));
    if (!cid || !date) continue;
    const current = contactMaxDate.get(cid);
    if (!current || date > current) contactMaxDate.set(cid, date);
  }

  console.log(`\n${contactMaxDate.size} contacts have at least one activity.`);

  // ── 2. Contacts that need updating ─────────────────────────────────────────
  const contactUpdates: { id: string; fields: Record<string, unknown> }[] = [];
  for (const contact of contacts) {
    const maxDate = contactMaxDate.get(contact.id);
    if (!maxDate) continue;
    const stored = toDateOnly(str(contact.fields.LastActivityDate));
    if (stored === maxDate) continue;
    contactUpdates.push({ id: contact.id, fields: { LastActivityDate: maxDate } });
    console.log(`  Contact "${str(contact.fields.Name)}": ${stored || "(none)"} → ${maxDate}`);
  }

  if (contactUpdates.length === 0) {
    console.log("All contact LastActivityDate fields are already correct.");
  } else {
    console.log(`\nUpdating ${contactUpdates.length} contact(s)…`);
    await batchPatch(CONTACTS_TABLE, contactUpdates);
  }

  // ── 3. companyId → max date across all contacts ────────────────────────────
  const contactCompanyMap = new Map<string, string>();
  for (const contact of contacts) {
    const cid = str(contact.fields.ReferralCompanyId);
    if (cid) contactCompanyMap.set(contact.id, cid);
  }

  const companyMaxDate = new Map<string, string>();
  for (const [contactId, maxDate] of contactMaxDate.entries()) {
    const companyId = contactCompanyMap.get(contactId);
    if (!companyId) continue;
    const current = companyMaxDate.get(companyId);
    if (!current || maxDate > current) companyMaxDate.set(companyId, maxDate);
  }

  // ── 4. Companies that need updating ────────────────────────────────────────
  const companyUpdates: { id: string; fields: Record<string, unknown> }[] = [];
  for (const company of companies) {
    const maxDate = companyMaxDate.get(company.id);
    if (!maxDate) continue;
    const stored = toDateOnly(str(company.fields.LastActivityDate));
    if (stored === maxDate) continue;
    companyUpdates.push({ id: company.id, fields: { LastActivityDate: maxDate } });
    console.log(`  Company "${str(company.fields.Name)}": ${stored || "(none)"} → ${maxDate}`);
  }

  if (companyUpdates.length === 0) {
    console.log("All company LastActivityDate fields are already correct.");
  } else {
    console.log(`\nUpdating ${companyUpdates.length} company/ies…`);
    await batchPatch(COMPANIES_TABLE, companyUpdates);
  }

  console.log("\nBackfill complete.");
}

main().catch(e => { console.error(e); process.exit(1); });
