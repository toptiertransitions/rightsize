/**
 * Creates all 5 Rightsize tables in your Airtable base.
 *
 * Requirements: Your PAT must have the scope: schema.bases:write
 * Add it at: https://airtable.com/create/tokens  (edit your existing token)
 *
 * Run: node scripts/setup-airtable.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (Node doesn't load it automatically)
const envPath = resolve(__dirname, "../.env.local");
const envLines = readFileSync(envPath, "utf8").split("\n");
for (const line of envLines) {
  const match = line.match(/^([^#=\s]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const TOKEN = process.env.AIRTABLE_API_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!TOKEN || TOKEN.startsWith("pat_REPLACE") || !BASE_ID || BASE_ID.startsWith("app_REPLACE")) {
  console.error("❌ Fill in AIRTABLE_API_TOKEN and AIRTABLE_BASE_ID in .env.local first.");
  process.exit(1);
}

const API = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function createTable(name, fields) {
  const res = await fetch(API, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ name, fields }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error?.type === "DUPLICATE_TABLE_NAME") {
      console.log(`  ⚠️  ${name} already exists — skipping`);
      return null;
    }
    throw new Error(`Failed to create ${name}: ${JSON.stringify(data)}`);
  }
  console.log(`  ✅ ${name} created (${data.id})`);
  return data;
}

const singleLine = (name) => ({ name, type: "singleLineText" });
const longText   = (name) => ({ name, type: "multilineText" });
const number     = (name) => ({ name, type: "number", options: { precision: 0 } });
const currency   = (name) => ({ name, type: "currency", options: { precision: 2, symbol: "$" } });
const url        = (name) => ({ name, type: "url" });
const email      = (name) => ({ name, type: "email" });

function singleSelect(name, choices) {
  return {
    name,
    type: "singleSelect",
    options: { choices: choices.map((c) => ({ name: c })) },
  };
}

const TABLES = [
  {
    name: "Tenants",
    fields: [
      singleLine("Name"),
      singleLine("Slug"),
      singleSelect("Plan", ["free", "pro", "enterprise"]),
      singleLine("OwnerUserId"),
      singleLine("CreatedAt"),
    ],
  },
  {
    name: "Users",
    fields: [
      singleLine("ClerkUserId"),
      email("Email"),
      singleLine("Name"),
      singleLine("CreatedAt"),
    ],
  },
  {
    name: "Memberships",
    fields: [
      singleLine("TenantId"),
      singleLine("ClerkUserId"),
      singleSelect("Role", ["Owner", "Collaborator", "Viewer", "TTTStaff", "TTTAdmin"]),
      singleLine("CreatedAt"),
    ],
  },
  {
    name: "Rooms",
    fields: [
      singleLine("TenantId"),
      singleLine("Name"),
      singleSelect("RoomType", [
        "Living Room","Bedroom","Master Bedroom","Kitchen","Dining Room",
        "Office/Study","Garage","Basement","Attic","Bathroom",
        "Closet","Storage Room","Sunroom","Other",
      ]),
      number("SquareFeet"),
      singleSelect("Density", ["Low", "Medium", "High"]),
      singleLine("CreatedAt"),
    ],
  },
  {
    name: "Items",
    fields: [
      singleLine("TenantId"),
      singleLine("RoomId"),
      url("PhotoUrl"),
      singleLine("PhotoPublicId"),
      singleLine("ItemName"),
      singleLine("Category"),
      singleSelect("Condition", ["Excellent", "Good", "Fair", "Poor", "For Parts"]),
      longText("ConditionNotes"),
      singleSelect("SizeClass", ["Small & Shippable", "Fits in Car-SUV", "Needs Movers"]),
      singleSelect("Fragility", ["Not Fragile", "Somewhat Fragile", "Very Fragile"]),
      singleSelect("ItemType", ["Daily Use", "Collector Item"]),
      currency("ValueLow"),
      currency("ValueMid"),
      currency("ValueHigh"),
      singleSelect("PrimaryRoute", ["Online Marketplace", "Local Consignment", "Donate", "Discard"]),
      longText("RouteReasoning"),
      singleLine("ConsignmentCategory"),
      singleLine("ListingTitleEbay"),
      longText("ListingDescriptionEbay"),
      longText("ListingFb"),
      longText("ListingOfferup"),
      longText("StaffTips"),
      singleSelect("Status", [
        "Pending Review", "Reviewed", "Listed", "Sold", "Donated", "Discarded",
      ]),
      singleLine("CreatedAt"),
      singleLine("UpdatedAt"),
    ],
  },
];

console.log(`\nCreating tables in base ${BASE_ID}...\n`);

for (const table of TABLES) {
  await createTable(table.name, table.fields);
}

console.log("\n✅ Done! You can now start the dev server with: npm run dev\n");
console.log("📝 Optionally, open each table in Airtable, copy the table ID from the URL,");
console.log("   and replace the table name values in .env.local with tblXXX IDs for reliability.\n");
