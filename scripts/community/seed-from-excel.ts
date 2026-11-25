// Seeds Communities and Community Contacts from
// scripts/seed/TTT_Community_Contacts__Rules.xlsx.
//
//   Dry run (default): prints what would be created or updated, and every warning
//   --apply            writes to Airtable
//   --force            also overwrites fields a person has edited since seeding
//
// Idempotent: communities match on normalized name, contacts on community +
// name. Each record keeps a "Seed Snapshot JSON" of what the seed wrote, so a
// re-run only updates fields nobody has touched since. Also writes
// scripts/community/crm-cleanup-report.md from the sheet's CRM columns.
//
// Run: set -a; source .env.local; set +a; npx tsx scripts/community/seed-from-excel.ts [--apply] [--force]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSeed, type SeedCommunity } from "./seed-data";
import {
  COMMUNITY_TABLES as T, COMMUNITY_FIELD, activityToFields, communityToFields, contactToFields,
  createRecords, listRecords, mapCommunity, mapContact, updateRecords, type AirtableRecord,
} from "../../lib/communities/airtable";
import { completeness } from "../../lib/communities/completeness";
import { nameKey, normalizeText } from "../../lib/communities/search";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const REPORT = join(__dirname, "crm-cleanup-report.md");
const BY = "Seed import (Excel)";
const { seeds, seedContacts, warnings, crmRows } = buildSeed();
const warn = (w: string) => warnings.push(w);

// ─── Compare with Airtable and plan writes ────────────────────────────────────

const comparable = (v: unknown) => (v === undefined || v === null || v === false ? "" : typeof v === "string" ? v : JSON.stringify(v));

/** Fields to write: new seed values for every field nobody edited since the last seed. */
function plan(seedFields: Record<string, unknown>, existing: AirtableRecord | undefined, label: string) {
  if (!existing) return { action: "create" as const, fields: { ...seedFields, "Seed Snapshot JSON": JSON.stringify(seedFields) }, skipped: [] as string[] };
  let snapshot: Record<string, unknown> = {};
  try { snapshot = JSON.parse(String(existing.fields["Seed Snapshot JSON"] ?? "{}")); } catch { /* treat as empty */ }
  const fields: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const [k, v] of Object.entries(seedFields)) {
    const current = comparable(existing.fields[k]);
    if (current === comparable(v)) continue;
    const untouched = current === comparable(snapshot[k]);
    if (untouched || FORCE) fields[k] = v;
    else skipped.push(k);
  }
  if (skipped.length) warn(`${label}: kept ${skipped.length} field(s) a person edited since seeding (${skipped.join(", ")}); use --force to overwrite`);
  if (Object.keys(fields).length) fields["Seed Snapshot JSON"] = JSON.stringify({ ...snapshot, ...seedFields });
  return { action: Object.keys(fields).length ? ("update" as const) : ("unchanged" as const), fields, skipped };
}

(async () => {
  const [existingCommunities, existingContacts] = await Promise.all([listRecords(T.COMMUNITIES), listRecords(T.CONTACTS)]);
  const now = new Date().toISOString();

  const communityPlans = seeds.map((s) => {
    const existing = existingCommunities.find((r) => nameKey(String(r.fields[COMMUNITY_FIELD.name] ?? "")) === nameKey(s.name));
    const { moveInText: _m, openItemList: _o, ...data } = s;
    void _m; void _o;
    const fields = communityToFields(data);
    return { seed: s, existing, ...plan(fields, existing, s.name) };
  });

  console.log(`\nCommunities (${seeds.length})`);
  console.log("Action     Name                                        Type                 City             Rules known  Contacts");
  for (const p of communityPlans) {
    const score = completeness(p.seed);
    const known = `${score.known}/${score.total}`;
    console.log(`${p.action.padEnd(10)} ${p.seed.name.slice(0, 43).padEnd(43)} ${p.seed.type.padEnd(20)} ${p.seed.city.padEnd(16)} ${known.padStart(5)}        ${seedContacts.filter((c) => c.community === p.seed).length}`);
  }

  // Write communities first so contacts can link to them
  const idBySeed = new Map<SeedCommunity, string>();
  for (const p of communityPlans) if (p.existing) idBySeed.set(p.seed, p.existing.id);
  if (APPLY) {
    const toCreate = communityPlans.filter((p) => p.action === "create");
    const created = await createRecords(T.COMMUNITIES, toCreate.map((p) => ({ ...p.fields, "Archived": false, "Created At": now, "Updated At": now, "Updated By": BY })));
    created.forEach((r, i) => idBySeed.set(toCreate[i].seed, r.id));
    await updateRecords(T.COMMUNITIES, communityPlans.filter((p) => p.action === "update").map((p) => ({ id: p.existing!.id, fields: { ...p.fields, "Updated At": now, "Updated By": BY } })));
    await createRecords(T.ACTIVITY, created.map((r) => activityToFields({ communityId: r.id, action: "Created", summary: `Imported ${mapCommunity(r).name} from the Community Contacts & Rules sheet`, by: BY, at: now })));
  }

  const contactPlans = seedContacts.map((c) => {
    const communityId = idBySeed.get(c.community);
    const existing = communityId
      ? existingContacts.find((r) => mapContact(r).communityId === communityId && normalizeText(mapContact(r).name) === normalizeText(c.name))
      : undefined;
    const { community: _c, ...data } = c;
    void _c;
    return { seed: c, communityId, existing, ...plan(contactToFields(data), existing, `${c.name} (${c.community.name})`) };
  });

  console.log(`\nContacts (${seedContacts.length})`);
  console.log("Action     Community                         Name                    Role                  Primary  Phones");
  for (const p of contactPlans) {
    console.log(`${p.action.padEnd(10)} ${p.seed.community.name.slice(0, 32).padEnd(33)} ${p.seed.name.slice(0, 23).padEnd(23)} ${(p.seed.role || "-").padEnd(21)} ${p.seed.isPrimaryMoveIn ? "yes    " : "       "}  ${p.seed.phones.map((x) => `${x.label} ${x.number}`).join("; ")}`);
  }

  if (APPLY) {
    const toCreate = contactPlans.filter((p) => p.action === "create" && p.communityId);
    await createRecords(T.CONTACTS, toCreate.map((p) => ({
      ...p.fields, ...contactToFields({ communityId: p.communityId! }), "Archived": false, "Created At": now, "Updated At": now, "Updated By": BY,
    })));
    await updateRecords(T.CONTACTS, contactPlans.filter((p) => p.action === "update").map((p) => ({ id: p.existing!.id, fields: { ...p.fields, "Updated At": now, "Updated By": BY } })));
  }

  // Internal-notes split, for review
  console.log("\nMoved from \"Other rules & tips\" to Internal Notes:");
  for (const s of seeds.filter((x) => x.internalNotes)) console.log(`  ${s.name}: ${s.internalNotes}`);

  writeFileSync(REPORT, `# CRM clean-up from the Community Contacts sheet

Generated by scripts/community/seed-from-excel.ts. These are the sheet's
"In Rightsize?" and "Fix needed in Rightsize" notes for the CRM (referral
contacts). They were not imported into Communities; fix them in the CRM.

| Community | Contact | In Rightsize? | Fix needed |
| --- | --- | --- | --- |
${crmRows.join("\n")}
`);

  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  - ${w}`);
  const count = (list: { action: string }[], a: string) => list.filter((p) => p.action === a).length;
  console.log(`\nSummary: communities ${count(communityPlans, "create")} to create, ${count(communityPlans, "update")} to update, ${count(communityPlans, "unchanged")} unchanged; ` +
    `contacts ${count(contactPlans, "create")} to create, ${count(contactPlans, "update")} to update, ${count(contactPlans, "unchanged")} unchanged.`);
  console.log(APPLY ? "Applied to Airtable." : "Dry run: nothing was written. Re-run with --apply to write.");
  console.log(`CRM clean-up report: ${REPORT}`);
})().catch((e) => { console.error(e); process.exit(1); });
