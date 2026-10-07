// Adds the Airtable fields used by referral-locked partners and the signup
// "How did you hear about us?" step. Idempotent — skips fields that exist.
// Run: node --env-file=.env.local scripts/add-referral-partner-fields.mjs
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_API_TOKEN;
const API = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const text = (name) => ({ name, type: "singleLineText" });
const PLAN = {
  [process.env.AIRTABLE_PARTNER_SELECTIONS_TABLE || "PartnerSelections"]: [
    { name: "ReferralLocked", type: "checkbox", options: { icon: "check", color: "greenBright" } },
    text("ReferralSource"),
    text("ReferralName"),
    text("ReferralContactName"),
    text("ReferralPhone"),
    text("ReferralEmail"),
  ],
  [process.env.AIRTABLE_TENANTS_TABLE || "Tenants"]: [text("HowHeard"), text("HowHeardDetail")],
};

const { tables } = await (await fetch(API, { headers })).json();
for (const [tableName, fields] of Object.entries(PLAN)) {
  const table = tables.find((t) => t.name === tableName || t.id === tableName);
  if (!table) throw new Error(`Table not found: ${tableName}`);
  for (const field of fields) {
    if (table.fields.some((f) => f.name === field.name)) {
      console.log(`= ${tableName}.${field.name} already exists`);
      continue;
    }
    const res = await fetch(`${API}/${table.id}/fields`, { method: "POST", headers, body: JSON.stringify(field) });
    if (!res.ok) throw new Error(`${tableName}.${field.name}: ${await res.text()}`);
    console.log(`+ ${tableName}.${field.name}`);
  }
}
