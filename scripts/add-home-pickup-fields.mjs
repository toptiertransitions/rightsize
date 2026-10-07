// Adds the Estates fields used by Home Pickup sales. Idempotent: skips any
// field that already exists. The "Home Pickup" SaleType and "Draft" Status
// options are created automatically on first save (writes use typecast).
// Run: node --env-file=.env.local scripts/add-home-pickup-fields.mjs
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const API = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
const headers = { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, "Content-Type": "application/json" };
const TABLE = process.env.AIRTABLE_ESTATES_TABLE || "Estates";
const FIELDS = ["PickupCity", "PickupState", "PickupZip"].map((name) => ({ name, type: "singleLineText" }));

const { tables } = await (await fetch(API, { headers })).json();
const table = tables.find((t) => t.name === TABLE || t.id === TABLE);
if (!table) throw new Error(`Table not found: ${TABLE}`);
for (const field of FIELDS) {
  if (table.fields.some((f) => f.name === field.name)) { console.log(`= ${field.name} exists`); continue; }
  const res = await fetch(`${API}/${table.id}/fields`, { method: "POST", headers, body: JSON.stringify(field) });
  if (!res.ok) throw new Error(`${field.name}: ${await res.text()}`);
  console.log(`+ Estates.${field.name}`);
}
