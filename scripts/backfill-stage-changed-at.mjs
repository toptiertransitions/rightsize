/**
 * Backfills StageChangedAt on CRMReferralContacts that don't have it set.
 * Uses dateIntroduced → createdAt as the baseline (best available proxy).
 *
 * Run from rightsize/ directory:
 *   node scripts/backfill-stage-changed-at.mjs
 *   node scripts/backfill-stage-changed-at.mjs --dry-run
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const TOKEN = process.env.AIRTABLE_API_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_CRM_CONTACTS_TABLE || "CRMReferralContacts";

if (!TOKEN || !BASE_ID) {
  console.error("Missing AIRTABLE_API_TOKEN or AIRTABLE_BASE_ID in .env.local");
  process.exit(1);
}

function atFetch(path, options = {}) {
  return fetch(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log("Fetching all CRMReferralContacts...");

  const all = [];
  let offset;
  do {
    const qs = offset ? `?offset=${offset}` : "";
    const res = await atFetch(qs);
    if (!res.ok) { console.error("Fetch failed:", await res.text()); process.exit(1); }
    const data = await res.json();
    all.push(...data.records);
    offset = data.offset;
    console.log(`  Fetched ${all.length} so far...`);
  } while (offset);

  console.log(`Total contacts: ${all.length}`);

  const toUpdate = [];
  let alreadySet = 0;
  let noDate = 0;

  for (const r of all) {
    if (r.fields["StageChangedAt"]) { alreadySet++; continue; }
    const baseline = r.fields["DateIntroduced"] || r.fields["CreatedAt"];
    if (!baseline) { noDate++; continue; }
    toUpdate.push({ id: r.id, baseline, name: r.fields["Name"] ?? r.id });
  }

  console.log(`Already set: ${alreadySet}`);
  console.log(`No usable date: ${noDate}`);
  console.log(`To backfill: ${toUpdate.length}`);

  if (toUpdate.length === 0) { console.log("Nothing to do."); return; }

  if (DRY_RUN) {
    console.log("\nSample (first 10):");
    for (const r of toUpdate.slice(0, 10)) {
      console.log(`  ${r.name} → StageChangedAt = ${r.baseline}`);
    }
    console.log(`\n(${toUpdate.length} total would be updated)`);
    return;
  }

  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += 10) {
    const batch = toUpdate.slice(i, i + 10);
    const records = batch.map((r) => ({ id: r.id, fields: { StageChangedAt: r.baseline } }));
    const res = await atFetch("", { method: "PATCH", body: JSON.stringify({ records }) });
    if (!res.ok) {
      console.error(`Batch at ${i} failed:`, await res.text());
    } else {
      updated += batch.length;
      process.stdout.write(`\r  Updated ${updated}/${toUpdate.length}...`);
    }
    // Stay within Airtable's 5 req/sec rate limit
    await new Promise((r) => setTimeout(r, 220));
  }

  console.log(`\nDone. ${updated} contacts backfilled.`);
}

main().catch(console.error);
