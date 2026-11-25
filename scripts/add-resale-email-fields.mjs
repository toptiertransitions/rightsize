// Adds the resale update email schema: four project fields on Tenants and the
// ResaleEmailLog table (one row per email sent, skipped or previewed).
// Idempotent: skips anything that already exists.
// Run: node --env-file=.env.local scripts/add-resale-email-fields.mjs
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const API = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
const headers = { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, "Content-Type": "application/json" };
const TENANTS = process.env.AIRTABLE_TENANTS_TABLE || "Tenants";
const LOG = process.env.AIRTABLE_RESALE_EMAIL_LOG_TABLE || "ResaleEmailLog";

const date = (name) => ({ name, type: "date", options: { dateFormat: { name: "iso" } } });
const dateTime = (name) => ({ name, type: "dateTime", options: { dateFormat: { name: "iso" }, timeFormat: { name: "24hour" }, timeZone: "America/Chicago" } });
const text = (name) => ({ name, type: "singleLineText" });
const longText = (name) => ({ name, type: "multilineText" });
const checkbox = (name) => ({ name, type: "checkbox", options: { icon: "check", color: "greenBright" } });

const TENANT_FIELDS = [
  date("ResaleAnchorDate"),
  text("ResaleAnchorSource"),
  dateTime("ResaleAnchorLockedAt"),
  longText("ResaleAnchorLog"),
  checkbox("ResaleEmailsPaused"),
];
const LOG_FIELDS = [
  text("Key"), // primary: "<tenantId>:<emailType>", resends get a suffix
  text("TenantId"),
  text("ProjectName"),
  text("EmailType"),
  text("Status"),
  text("Trigger"),
  checkbox("ManualResend"),
  date("AnchorDate"),
  dateTime("SentAt"),
  longText("Recipients"),
  longText("Reason"),
  longText("Flags"),
  text("TriggeredBy"),
  text("InvoiceId"),
];

const { tables } = await (await fetch(API, { headers })).json();

const tenants = tables.find((t) => t.name === TENANTS || t.id === TENANTS);
if (!tenants) throw new Error(`Table not found: ${TENANTS}`);
for (const field of TENANT_FIELDS) {
  if (tenants.fields.some((f) => f.name === field.name)) { console.log(`= ${TENANTS}.${field.name} exists`); continue; }
  const res = await fetch(`${API}/${tenants.id}/fields`, { method: "POST", headers, body: JSON.stringify(field) });
  if (!res.ok) throw new Error(`${field.name}: ${await res.text()}`);
  console.log(`+ ${TENANTS}.${field.name}`);
}

const log = tables.find((t) => t.name === LOG || t.id === LOG);
if (!log) {
  const res = await fetch(API, { method: "POST", headers, body: JSON.stringify({ name: LOG, fields: LOG_FIELDS }) });
  if (!res.ok) throw new Error(`${LOG}: ${await res.text()}`);
  console.log(`+ table ${LOG}`);
} else {
  for (const field of LOG_FIELDS) {
    if (log.fields.some((f) => f.name === field.name)) continue;
    const res = await fetch(`${API}/${log.id}/fields`, { method: "POST", headers, body: JSON.stringify(field) });
    if (!res.ok) throw new Error(`${field.name}: ${await res.text()}`);
    console.log(`+ ${LOG}.${field.name}`);
  }
  console.log(`= table ${LOG} exists`);
}
