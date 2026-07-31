/**
 * One-shot script: reset all payout data for a single tenant so a fresh payout can be run.
 * Run: node scripts/reset-payout.mjs <tenantId>
 *
 * Clears:
 *   - Items.PayoutPaidAmount + Items.PayoutPaidAt
 *   - ItemSaleEvents.PayoutPaid + ItemSaleEvents.PayoutPaidAt
 *   - ProjectFiles records tagged "Payment Proof"
 */

import Airtable from "airtable";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env.local") });

const TENANT_ID = process.argv[2];
if (!TENANT_ID) { console.error("Usage: node scripts/reset-payout.mjs <tenantId>"); process.exit(1); }

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

const ITEMS_TABLE       = process.env.AIRTABLE_ITEMS_TABLE       || "Items";
const FILES_TABLE       = process.env.AIRTABLE_FILES_TABLE        || "ProjectFiles";
const EVENTS_TABLE      = process.env.AIRTABLE_ITEM_SALE_EVENTS_TABLE || "ItemSaleEvents";

async function getAllRecords(table, filter) {
  const records = [];
  await base(table).select({ filterByFormula: filter }).eachPage((page, next) => { records.push(...page); next(); });
  return records;
}

async function run() {
  console.log(`Resetting payout for tenant: ${TENANT_ID}`);

  // 1. Items — clear PayoutPaidAmount and PayoutPaidAt
  const items = await getAllRecords(ITEMS_TABLE, `{TenantID} = "${TENANT_ID}"`);
  const paidItems = items.filter(r => r.fields["PayoutPaidAmount"] > 0);
  console.log(`Found ${paidItems.length} item(s) with PayoutPaidAmount > 0`);
  for (const item of paidItems) {
    await base(ITEMS_TABLE).update(item.id, { PayoutPaidAmount: null, PayoutPaidAt: null });
    console.log(`  Cleared payout on item: ${item.fields["ItemName"] || item.id}`);
  }

  // 2. ItemSaleEvents — reset PayoutPaid flag
  const events = await getAllRecords(EVENTS_TABLE, `{TenantID} = "${TENANT_ID}"`);
  const paidEvents = events.filter(r => r.fields["PayoutPaid"] === true);
  console.log(`Found ${paidEvents.length} sale event(s) with PayoutPaid = true`);
  for (const ev of paidEvents) {
    await base(EVENTS_TABLE).update(ev.id, { PayoutPaid: false, PayoutPaidAt: null });
    console.log(`  Reset sale event: ${ev.id}`);
  }

  // 3. ProjectFiles — delete Payment Proof files
  const files = await getAllRecords(FILES_TABLE, `{TenantID} = "${TENANT_ID}"`);
  const proofFiles = files.filter(r => (r.fields["FileTag"] || "").includes("Payment Proof"));
  console.log(`Found ${proofFiles.length} Payment Proof file(s)`);
  for (const f of proofFiles) {
    await base(FILES_TABLE).destroy(f.id);
    console.log(`  Deleted file: ${f.fields["FileName"] || f.id}`);
  }

  console.log("Done. Payout reset complete — you can now run a fresh payout.");
}

run().catch(e => { console.error("Error:", e); process.exit(1); });
