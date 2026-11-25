// Parses scripts/seed/TTT_Community_Contacts__Rules.xlsx into seed
// communities and contacts (no Airtable access). Used by seed-from-excel.ts
// and by the PDF preview check.
import { join } from "node:path";
import { readXlsx, type Sheet } from "./xlsx";
import { parsePhones } from "../../lib/communities/phones";
import { normalizeText } from "../../lib/communities/search";
import {
  cleanDashes, firstNamedPerson, isUnknownCell, matchCommunityName, normalizeCoi, normalizeType, parseFloorPlans, roleFromTitle, splitOperator, splitOtherRules,
} from "../../lib/communities/seedNormalize";
import { emptyRules, type Community, type CommunityContact, type RuleKey, type RuleStatus } from "../../lib/communities/types";

export const SEED_FILE = join(__dirname, "../seed/TTT_Community_Contacts__Rules.xlsx");

export type SeedCommunity = Omit<Community, "id" | "archived" | "createdAt" | "updatedAt" | "updatedBy"> & { moveInText: string; openItemList: string[] };
export type SeedContact = Omit<CommunityContact, "id" | "communityId" | "archived" | "createdAt" | "updatedAt" | "updatedBy"> & { community: SeedCommunity };

export function buildSeed(file = SEED_FILE): { seeds: SeedCommunity[]; seedContacts: SeedContact[]; warnings: string[]; crmRows: string[] } {
const warnings: string[] = [];
const warn = (w: string) => warnings.push(w);
// ─── Read the sheets ──────────────────────────────────────────────────────────

const sheets = readXlsx(file);
const sheet = (name: string): Sheet => {
  const s = sheets.get(name);
  if (!s) throw new Error(`Sheet "${name}" not found in ${file}`);
  return s;
};

/** Rows under a header row, as objects keyed by normalized header text. */
function table(s: Sheet, headerRow: number, firstRow: number, lastRow = Infinity): Record<string, string>[] {
  const header = (s.get(headerRow) ?? []).map((h) => normalizeText(h));
  const out: Record<string, string>[] = [];
  for (const [r, cells] of [...s.entries()].sort((a, b) => a[0] - b[0])) {
    if (r < firstRow || r > lastRow || cells.every((c) => !c?.trim())) continue;
    out.push(Object.fromEntries(header.map((h, i) => [h, cleanDashes((cells[i] ?? "").trim())])));
  }
  return out;
}

const col = (row: Record<string, string>, ...names: string[]) => {
  for (const n of names) { const v = row[normalizeText(n)]; if (v !== undefined) return v; }
  throw new Error(`Column not found: ${names.join(" / ")}`);
};

// ─── Build the seed communities ───────────────────────────────────────────────


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

return { seeds, seedContacts, warnings, crmRows };
}
