// Creates the Communities, Community Contacts and Community Activity tables
// (and any of their fields that are missing). Idempotent: anything that
// already exists is left alone. Touches no other table.
// Run: set -a; source .env.local; set +a; npx tsx scripts/community/create-airtable-tables.ts
import { RULE_DEFINITIONS, COMMUNITY_TYPES, COMMUNITY_STATUSES, COI_OPTIONS, CONTACT_ROLES, ACTIVITY_ACTIONS } from "../../lib/communities/types";
import { COMMUNITY_TABLES } from "../../lib/communities/airtable";

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_API_TOKEN;
if (!BASE_ID || !TOKEN) throw new Error("Set AIRTABLE_BASE_ID and AIRTABLE_API_TOKEN (source .env.local)");
const API = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

type Field = { name: string; type: string; options?: Record<string, unknown> };
const text = (name: string): Field => ({ name, type: "singleLineText" });
const long = (name: string): Field => ({ name, type: "multilineText" });
const check = (name: string): Field => ({ name, type: "checkbox", options: { icon: "check", color: "greenBright" } });
const select = (name: string, choices: readonly string[]): Field => ({ name, type: "singleSelect", options: { choices: choices.map((c) => ({ name: c })) } });
const date = (name: string): Field => ({ name, type: "date", options: { dateFormat: { name: "iso" } } });
const dateTime = (name: string): Field => ({ name, type: "dateTime", options: { dateFormat: { name: "iso" }, timeFormat: { name: "24hour" }, timeZone: "America/Chicago" } });
const link = (name: string, tableId: string): Field => ({ name, type: "multipleRecordLinks", options: { linkedTableId: tableId } });
const housekeeping = (): Field[] => [check("Archived"), dateTime("Created At"), dateTime("Updated At"), text("Updated By")];

const communityFields: Field[] = [
  text("Name"),
  select("Type", COMMUNITY_TYPES),
  text("Operator / Management Company"),
  text("Street Address"),
  text("City"),
  text("State"),
  text("ZIP"),
  { name: "Website", type: "url" },
  text("Linked Company Record ID"),
  select("Status", COMMUNITY_STATUSES),
  ...RULE_DEFINITIONS.map((r) => (r.fieldType === "coi" ? select(r.airtableField, COI_OPTIONS) : long(r.airtableField))),
  long("Rule Status JSON"),
  check("Floor Plans On File"),
  long("Floor Plans Notes"),
  long("Open Items"),
  long("Source Notes"),
  date("Last Verified"),
  text("Last Verified By"),
  long("Internal Notes"),
  ...housekeeping(),
  long("Seed Snapshot JSON"),
];

const contactFields = (communitiesId: string): Field[] => [
  text("Name"),
  link("Community", communitiesId),
  text("Community Record ID"),
  text("Title"),
  select("Role", CONTACT_ROLES),
  { name: "Email", type: "email" },
  long("Phones JSON"),
  text("Phones Display"),
  check("Is Primary Move-In Contact"),
  long("Notes"),
  text("Linked Contact Record ID"),
  { name: "Sort Order", type: "number", options: { precision: 0 } },
  ...housekeeping(),
  long("Seed Snapshot JSON"),
];

const activityFields = (communitiesId: string): Field[] => [
  text("Summary"),
  link("Community", communitiesId),
  text("Community Record ID"),
  select("Action", ACTIVITY_ACTIONS),
  text("By"),
  dateTime("At"),
];

type Table = { id: string; name: string; fields: { name: string }[] };

async function tables(): Promise<Table[]> {
  const res = await fetch(API, { headers });
  if (!res.ok) throw new Error(`Metadata API: ${res.status} ${await res.text()}`);
  return (await res.json()).tables;
}

async function ensureTable(name: string, fields: Field[], description: string): Promise<string> {
  const existing = (await tables()).find((t) => t.name === name);
  if (!existing) {
    const res = await fetch(API, { method: "POST", headers, body: JSON.stringify({ name, description, fields }) });
    if (!res.ok) throw new Error(`Create ${name}: ${await res.text()}`);
    const t = await res.json();
    console.log(`+ table ${name} (${fields.length} fields)`);
    return t.id;
  }
  for (const field of fields) {
    if (existing.fields.some((f) => f.name === field.name)) continue;
    const res = await fetch(`${API}/${existing.id}/fields`, { method: "POST", headers, body: JSON.stringify(field) });
    if (!res.ok) throw new Error(`${name}.${field.name}: ${await res.text()}`);
    console.log(`+ ${name}.${field.name}`);
  }
  console.log(`= table ${name} is up to date`);
  return existing.id;
}

(async () => {
  const communitiesId = await ensureTable(COMMUNITY_TABLES.COMMUNITIES, communityFields,
    "Senior living communities and condo buildings: Move-Day Rules and details. Managed from Rightsize Ops > Community.");
  await ensureTable(COMMUNITY_TABLES.CONTACTS, contactFields(communitiesId), "Contacts at each community. Managed from Rightsize Ops > Community.");
  await ensureTable(COMMUNITY_TABLES.ACTIVITY, activityFields(communitiesId), "Change history for communities, written by Rightsize.");
})().catch((e) => { console.error(e); process.exit(1); });
