// Search, filters, sorting and duplicate detection for the Communities
// list. Pure and client-safe, so the list filters in the browser from one
// fetch and the same rules are unit tested.
import { completeness, isComplete } from "./completeness";
import { RULE_KEYS, primaryMoveInContact, type Community, type CommunityWithContacts } from "./types";

/** Lowercase, accents stripped, punctuation to spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9@.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchHaystack(c: CommunityWithContacts): string {
  return normalizeText([
    c.name, c.operator, c.city, c.street, c.zip, c.type,
    ...c.contacts.filter((p) => !p.archived).flatMap((p) => [p.name, p.email, p.title]),
    ...RULE_KEYS.map((k) => c.rules[k]),
  ].join(" \n "));
}

/** Every word of the query must appear somewhere (partial words count). */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalizeText(query).split(" ").filter(Boolean);
  return words.every((w) => haystack.includes(w));
}

export interface CommunityFilters {
  q: string;
  type: string[];
  city: string[];
  status: string[];
  coi: string[];
  completeness: "" | "complete" | "needs";
  archived: boolean;
}

export const EMPTY_FILTERS: CommunityFilters = { q: "", type: [], city: [], status: [], coi: [], completeness: "", archived: false };

export type SortKey = "name" | "type" | "city" | "contact" | "coi" | "completeness" | "verified";
export interface SortState { key: SortKey; dir: "asc" | "desc" }
export const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

export function filterCommunities(list: CommunityWithContacts[], f: CommunityFilters, haystacks?: Map<string, string>): CommunityWithContacts[] {
  return list.filter((c) => {
    if (c.archived !== f.archived) return false;
    if (f.type.length && !f.type.includes(c.type)) return false;
    if (f.city.length && !f.city.includes(c.city)) return false;
    if (f.status.length && !f.status.includes(c.status)) return false;
    if (f.coi.length && !f.coi.includes(c.rules.coi_required || "Unknown")) return false;
    if (f.completeness === "complete" && !isComplete(c)) return false;
    if (f.completeness === "needs" && isComplete(c)) return false;
    if (f.q.trim() && !matchesQuery(haystacks?.get(c.id) ?? searchHaystack(c), f.q)) return false;
    return true;
  });
}

const cmpText = (a: string, b: string) => {
  if (!a && b) return 1; // blanks last
  if (a && !b) return -1;
  return a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
};

export function sortCommunities(list: CommunityWithContacts[], sort: SortState): CommunityWithContacts[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const value = (c: CommunityWithContacts): string | number => {
    switch (sort.key) {
      case "type": return c.type;
      case "city": return c.city;
      case "contact": return primaryMoveInContact(c.contacts)?.name ?? "";
      case "coi": return c.rules.coi_required || "Unknown";
      case "completeness": return completeness(c).percent;
      case "verified": return c.lastVerified;
      default: return c.name;
    }
  };
  return [...list].sort((a, b) => {
    const va = value(a), vb = value(b);
    const r = typeof va === "number" && typeof vb === "number" ? va - vb : cmpText(String(va), String(vb));
    if (r !== 0) return va === "" || vb === "" ? r : r * dir; // blanks stay last either way
    return cmpText(a.name, b.name);
  });
}

/** Street words to one spelling: "Drive" and "Dr" both become "dr". */
function abbreviate(s: string): string {
  return s
    .replace(/\b(street|st)\b/g, "st").replace(/\b(road|rd)\b/g, "rd").replace(/\b(avenue|ave)\b/g, "ave")
    .replace(/\b(drive|dr)\b/g, "dr").replace(/\b(north|n)\b/g, "n").replace(/\b(south|s)\b/g, "s")
    .replace(/\b(east|e)\b/g, "e").replace(/\b(west|w)\b/g, "w").replace(/\./g, "").replace(/\s+/g, " ").trim();
}

/** Name without leading "The", the operator in parentheses, and common
 * suffixes, for spotting near-duplicates. */
export function nameKey(name: string): string {
  return abbreviate(
    normalizeText(name.replace(/\([^)]*\)/g, " "))
      .replace(/^the /, "")
      .replace(/\b(condominium|condo|association|assoc|senior living|retirement community|community)\b/g, " ")
  );
}

export const addressKey = (street: string) => abbreviate(normalizeText(street));

/** Existing communities that look like the same place. */
export function findLikelyDuplicates(
  draft: Pick<Community, "name" | "street">,
  existing: Pick<Community, "id" | "name" | "street" | "archived">[],
  excludeId?: string
): Pick<Community, "id" | "name" | "street" | "archived">[] {
  const nk = nameKey(draft.name);
  const ak = draft.street ? addressKey(draft.street) : "";
  if (!nk && !ak) return [];
  return existing.filter((c) => {
    if (c.id === excludeId) return false;
    const other = nameKey(c.name);
    const sameName = nk.length >= 3 && other.length >= 3 && (other === nk || other.startsWith(nk + " ") || nk.startsWith(other + " "));
    const sameAddress = !!ak && !!c.street && addressKey(c.street) === ak;
    return sameName || sameAddress;
  });
}

/** Days since the last verification, or null if never verified. */
export function daysSince(day: string, today = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(day)) return null;
  return Math.floor((today.getTime() - new Date(`${day.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000);
}
export const STALE_DAYS = 180;
