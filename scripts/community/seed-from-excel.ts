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
import { readXlsx, type Sheet } from "./xlsx";
import {
  COMMUNITY_TABLES as T, COMMUNITY_FIELD, activityToFields, communityToFields, contactToFields,
  createRecords, listRecords, mapCommunity, mapContact, updateRecords, type AirtableRecord,
} from "../../lib/communities/airtable";
import { completeness } from "../../lib/communities/completeness";
import { parsePhones } from "../../lib/communities/phones";
import { nameKey, normalizeText } from "../../lib/communities/search";
import {
  firstNamedPerson, isUnknownCell, matchCommunityName, normalizeCoi, normalizeType, parseFloorPlans, roleFromTitle, splitOperator, splitOtherRules,
} from "../../lib/communities/seedNormalize";
import { emptyRules, type Community, type CommunityContact, type RuleKey, type RuleStatus } from "../../lib/communities/types";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const FILE = join(__dirname, "../seed/TTT_Community_Contacts__Rules.xlsx");
const REPORT = join(__dirname, "crm-cleanup-report.md");
const BY = "Seed import (Excel)";
const warnings: string[] = [];
const warn = (w: string) => warnings.push(w);

// ─── Read the sheets ──────────────────────────────────────────────────────────

const sheets = readXlsx(FILE);
const sheet = (name: string): Sheet => {
  const s = sheets.get(name);
  if (!s) throw new Error(`Sheet "${name}" not found in ${FILE}`);
  return s;
};

/** Rows under a header row, as objects keyed by normalized header text. */
function table(s: Sheet, headerRow: number, firstRow: number, lastRow = Infinity): Record<string, string>[] {
  const header = (s.get(headerRow) ?? []).map((h) => normalizeText(h));
  const out: Record<string, string>[] = [];
  for (const [r, cells] of [...s.entries()].sort((a, b) => a[0] - b[0])) {
    if (r < firstRow || r > lastRow || cells.every((c) => !c?.trim())) continue;
    out.push(Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()])));
  }
  return out;
}

const col = (row: Record<string, string>, ...names: string[]) => {
  for (const n of names) { const v = row[normalizeText(n)]; if (v !== undefined) return v; }
  throw new Error(`Column not found: ${names.join(" / ")}`);
};

// ─── Build the seed communities ───────────────────────────────────────────────

type SeedCommunity = Omit<Community, "id" | "archived" | "createdAt" | "updatedAt" | "updatedBy"> & { moveInText: string; openItemList: string[] };

const RULE_COLUMNS: [RuleKey, string][] = [
  ["checkin", "Check-in on arrival"],
  ["parking", "Truck parking / entrance"],
  ["elevator", "Elevator rules"],
  ["move_hours", "Move hours & timing limits"],
  ["advance_notice", "Advance notice / reservation"],
  ["apartment_access", "Apartment access"],
  ["trash", "Trash & packing materials"],
];

const seeds: SeedCommunity[] = table(sheet("Community Rules"), 3, 4, 21).map((row) => {
  const { name, operator } = splitOperator(col(row, "Community"));
  const rules = emptyRules();
  const ruleStatus: Partial<Record<RuleKey, RuleStatus>> = {};
  for (const [key, header] of RULE_COLUMNS) {
    const v = col(row, header);
    if (isUnknownCell(v)) ruleStatus[key] = "unknown";
    else rules[key] = v;
  }
  const coi = normalizeCoi(col(row, "COI required?"));
  rules.coi_required = coi.coi;
  if (coi.coi === "Unknown") ruleStatus.coi_required = "unknown";
  rules.coi_details = coi.details;
  if (!coi.details) ruleStatus.coi_details = coi.coi === "No" ? "not_applicable" : "unknown";
  const other = splitOtherRules(col(row, "Other rules & tips"));
  rules.other = other.rules;
  if (!other.rules) ruleStatus.other = "unknown";
  const plans = parseFloorPlans(col(row, "Floor plans on file"));
  return {
    name, operator,
    type: normalizeType(col(row, "Type")),
    street: col(row, "Street Address"),
    city: col(row, "City"),
    state: "IL",
    zip: "",
    website: "",
    linkedCompanyId: "",
    status: "Active",
    rules, ruleStatus,
    floorPlansOnFile: plans.onFile,
    floorPlansNotes: plans.notes,
    openItems: "",
    openItemList: [],
    sourceNotes: col(row, "Source (date)"),
    lastVerified: "",
    lastVerifiedBy: "",
    internalNotes: other.internal,
    moveInText: col(row, "Move-in contact"),
  };
});

// Gaps & Next Steps → Open Items (and Ciel of Long Grove, which is only there)
for (const row of table(sheet("Gaps & Next Steps"), 1, 2)) {
  const who = col(row, "Community");
  const what = col(row, "What to collect");
  const why = col(row, "Why it's here");
  if (/^all senior communities$/i.test(who)) {
    const targets = seeds.filter((s) => s.type !== "Condo / Association" && s.rules.coi_required === "Unknown");
    targets.forEach((s) => s.openItemList.push(what));
    warn(`Gaps "${who}": added "${what}" to the ${targets.length} senior communities whose COI is unknown`);
    continue;
  }
  const matched = matchCommunityName(who, seeds);
  const targets = matched ? [matched] : who.split(/,\s*/).map((part) => matchCommunityName(part, seeds));
  if (!matched && /ciel of long grove/i.test(who)) {
    const s: SeedCommunity = {
      name: "Ciel of Long Grove", operator: "", type: "Senior Living", street: "", city: "Long Grove", state: "IL", zip: "",
      website: "", linkedCompanyId: "", status: "Prospect",
      rules: { ...emptyRules(), coi_required: "Unknown" },
      ruleStatus: Object.fromEntries(RULE_COLUMNS.map(([k]) => [k, "unknown"]).concat([["coi_required", "unknown"], ["coi_details", "unknown"], ["other", "unknown"]])) as Partial<Record<RuleKey, RuleStatus>>,
      floorPlansOnFile: false, floorPlansNotes: "", openItems: "",
      openItemList: ["Confirm community still exists, then add contact and Data Sheet"],
      sourceNotes: why, lastVerified: "", lastVerifiedBy: "", internalNotes: "", moveInText: "",
    };
    seeds.push(s);
    continue;
  }
  if (targets.some((t) => !t)) { warn(`Gaps row not matched to a community: "${who}"`); continue; }
  for (const t of targets as SeedCommunity[]) t.openItemList.push(what);
}
for (const s of seeds) s.openItems = s.openItemList.map((i) => `- ${i}`).join("\n");

// ─── Contacts ─────────────────────────────────────────────────────────────────

type SeedContact = Omit<CommunityContact, "id" | "communityId" | "archived" | "createdAt" | "updatedAt" | "updatedBy"> & { community: SeedCommunity };
const seedContacts: SeedContact[] = [];
const crmRows: string[] = [];

for (const row of table(sheet("Contacts"), 1, 2)) {
  const who = col(row, "Community");
  const name = col(row, "Name");
  const community = matchCommunityName(who, seeds);
  const inRightsize = col(row, "In Rightsize?");
  const fix = col(row, "Fix needed in Rightsize");
  if (fix && !/^none$/i.test(fix) || !/^yes$/i.test(inRightsize)) crmRows.push(`| ${who} | ${name} | ${inRightsize || ""} | ${fix || ""} |`);
  if (!community) { warn(`Contact not matched to a community: "${name}" at "${who}"`); continue; }
  let title = col(row, "Title (as they sign)");
  const notes: string[] = [];
  if (/^unknown\b/i.test(title)) { notes.push(`Role unconfirmed: ${title.replace(/^unknown\s*/i, "").replace(/^\(|\)$/g, "")}`); title = ""; }
  const rawPhone = col(row, "Phone");
  const parsed = parsePhones(rawPhone);
  if (rawPhone && !parsed.clean) { notes.push(`Phone as written: ${rawPhone}`); warn(`Phone not fully parsed for ${name}: "${rawPhone}"`); }
  const sortOrder = seedContacts.filter((c) => c.community === community).length;
  seedContacts.push({
    community, name, title, role: roleFromTitle(title), email: col(row, "Email"), phones: parsed.phones,
    isPrimaryMoveIn: false, notes: notes.join("\n"), linkedContactId: "", sortOrder,
  });
}

// Primary Move-In Contact: the person the Community Rules sheet names first
for (const s of seeds) {
  const first = firstNamedPerson(s.moveInText);
  const mine = seedContacts.filter((c) => c.community === s);
  if (!first) { if (!mine.length) warn(`${s.name}: no contacts in either sheet`); continue; }
  const hit = mine.find((c) => normalizeText(first).includes(normalizeText(c.name)) || normalizeText(c.name).includes(normalizeText(first)));
  if (hit) hit.isPrimaryMoveIn = true;
  else if (!mine.length) warn(`${s.name}: the rules sheet names "${s.moveInText.slice(0, 80)}" but the Contacts sheet has no rows for it (not imported)`);
  else warn(`${s.name}: first-named contact "${first}" isn't in the Contacts sheet; no Primary Move-In Contact set`);
}

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
