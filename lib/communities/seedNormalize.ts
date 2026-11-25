// Cleaning rules for the Community Contacts & Rules spreadsheet import
// (scripts/community/seed-from-excel.ts). Pure, so each rule is tested.
import { nameKey, normalizeText } from "./search";
import type { CoiRequired, CommunityType, ContactRole } from "./types";

/** Empty cells and the sheet's yellow "UNKNOWN – ask" cells. */
export const isUnknownCell = (v: string) => !v.trim() || /^unknown\b/i.test(v.trim());

/** "The Breakers at Edgewater Beach (Senior Lifestyle)" → name + operator. */
export function splitOperator(raw: string): { name: string; operator: string } {
  const m = raw.trim().match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { name: m[1].trim(), operator: m[2].trim() } : { name: raw.trim(), operator: "" };
}

export function normalizeType(raw: string): CommunityType {
  const t = raw.toLowerCase();
  if (/ccrc/.test(t)) return "CCRC";
  if (/condo|association/.test(t)) return "Condo / Association";
  if (/senior|assisted|independent|memory/.test(t)) return "Senior Living";
  return "Other";
}

/** COI cell → select value plus details. */
export function normalizeCoi(raw: string): { coi: CoiRequired; details: string } {
  const v = raw.trim();
  if (isUnknownCell(v)) return { coi: "Unknown", details: "" };
  if (/confirm/i.test(v)) return { coi: "Confirm Per Move", details: v };
  if (/^yes\b/i.test(v)) return { coi: "Yes", details: v.replace(/^yes\b\s*[–:,-]?\s*/i, "").trim() };
  if (/^no\b/i.test(v)) {
    const rest = v.replace(/^no\b\s*(coi( needed)?)?\s*[–:,-]?\s*/i, "").trim();
    return { coi: "No", details: rest };
  }
  return { coi: "Unknown", details: v };
}

/** "Yes – Drive: Dartmouth, Bristol" → on file + notes. "Floor plan from
 * Lisa on request" → not on file, but the note is kept. */
export function parseFloorPlans(raw: string): { onFile: boolean; notes: string } {
  const v = raw.trim();
  if (!v) return { onFile: false, notes: "" };
  if (/^yes\b/i.test(v)) return { onFile: true, notes: v.replace(/^yes\b\s*[–:,-]?\s*/i, "").trim() };
  return { onFile: false, notes: v };
}

// Sentences in "Other rules & tips" that are TTT history, not rules.
const INTERNAL_SENTENCE = /^(\d+\s+TTT moves?|TTT (did|move|moves|move-out)\b|We asked\b|No (move-day )?rules found|Not yet in Rightsize|Dosenbachs?\b|Mark did\b|Bins were delivered)/i;

/** Splits "Other rules & tips" into rule text and internal notes. */
export function splitOtherRules(raw: string): { rules: string; internal: string } {
  const sentences = raw.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
  const rules: string[] = [];
  const internal: string[] = [];
  for (const s of sentences) (INTERNAL_SENTENCE.test(s) ? internal : rules).push(s);
  return { rules: rules.join(" "), internal: internal.join(" ") };
}

export function roleFromTitle(title: string): ContactRole | "" {
  const t = title.toLowerCase();
  if (!t.trim()) return "";
  if (/move[\s-]*in coordinator/.test(t)) return "Move-In Coordinator";
  if (/schedul/.test(t)) return "Move Scheduling";
  if (/maintenance/.test(t)) return "Maintenance";
  if (/executive director/.test(t)) return "Executive Director";
  if (/association manager|assoc\. manager|community assoc/.test(t)) return "Association Manager";
  if (/general manager|property manager/.test(t)) return "Property Manager";
  if (/front desk|concierge/.test(t)) return "Front Desk";
  if (/marketing coordinator/.test(t)) return "Marketing";
  if (/sales|residency|relationship|community specialist|counselor/.test(t)) return "Sales / Residency";
  if (/marketing/.test(t)) return "Marketing";
  return "Other";
}

/** The first person named in the messy "Move-in contact" column. */
export function firstNamedPerson(raw: string): string {
  if (isUnknownCell(raw)) return "";
  return raw.split(/[,;–]/)[0].trim();
}

const ABBREVIATIONS: [RegExp, string][] = [[/\bop\b/g, "oak park"]];

/** Finds the community a shortened or annotated name refers to, e.g.
 * "1550 N Lake Shore Dr Condo", "The Woodlands at Canterfield (West Dundee)",
 * "Bethlehem Woods", "Brookdale OP". Returns null when nothing or more than
 * one community matches. */
export function matchCommunityName<T extends { name: string }>(raw: string, communities: T[]): T | null {
  let key = nameKey(raw);
  for (const [re, to] of ABBREVIATIONS) key = key.replace(re, to);
  if (!key) return null;
  const keys = communities.map((c) => ({ c, k: nameKey(c.name) }));
  const exact = keys.filter(({ k }) => k === key);
  if (exact.length === 1) return exact[0].c;
  const words = key.split(" ");
  const contains = keys.filter(({ k }) => words.every((w) => k.split(" ").includes(w)));
  if (contains.length === 1) return contains[0].c;
  const prefix = keys.filter(({ k }) => k.startsWith(key) || key.startsWith(k));
  return prefix.length === 1 ? prefix[0].c : null;
}

export const normalizedName = (s: string) => normalizeText(splitOperator(s).name);
