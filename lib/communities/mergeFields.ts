// Community merge fields: a typed token registry, a pure data builder and a
// template renderer, for future mover, client and team emails and
// checklists. See docs/community-merge-fields.md.
//
// Unknown rules resolve to "" (never the word "unknown"), so a template can
// either drop them quietly (onMissing: "blank") or warn the sender
// (onMissing: "flag" returns the tokens that had no value).
import { bestPhone } from "./phones";
import { RULE_DEFINITIONS, formatAddress, primaryMoveInContact, ruleStatus, type Community, type CommunityContact, type RuleKey } from "./types";

export interface MergeToken {
  token: string;
  label: string;
  description: string;
}

/** Merge token suffix per rule ({{community.rules.<suffix>}}). */
export const RULE_TOKEN: Record<RuleKey, string> = {
  checkin: "checkin",
  parking: "parking",
  elevator: "elevator",
  move_hours: "move_hours",
  advance_notice: "advance_notice",
  coi_required: "coi_required",
  coi_details: "coi_details",
  apartment_access: "apartment_access",
  trash: "trash",
  other: "other",
};

const CONTACT_FIELDS = [
  ["name", "Name"],
  ["first_name", "First name"],
  ["title", "Title"],
  ["email", "Email"],
  ["phone", "Best phone (Direct, then Mobile, then Office)"],
] as const;

export const COMMUNITY_MERGE_TOKENS: MergeToken[] = [
  { token: "community.name", label: "Community name", description: "e.g. The Roosevelt at Salt Creek" },
  { token: "community.type", label: "Type", description: "Senior Living, CCRC, Condo / Association, Other" },
  { token: "community.operator", label: "Operator / management company", description: "e.g. Senior Lifestyle" },
  { token: "community.address", label: "Full address", description: "Street, City, State ZIP" },
  { token: "community.street", label: "Street address", description: "" },
  { token: "community.city", label: "City", description: "" },
  { token: "community.state", label: "State", description: "" },
  { token: "community.zip", label: "ZIP", description: "" },
  { token: "community.website", label: "Website", description: "" },
  ...RULE_DEFINITIONS.map((r) => ({
    token: `community.rules.${RULE_TOKEN[r.key]}`,
    label: r.label,
    description: `${r.help} Blank when not known yet or not applicable.`,
  })),
  ...(["move_in", "primary"] as const).flatMap((who) =>
    CONTACT_FIELDS.map(([field, label]) => ({
      token: `community.contacts.${who}.${field}`,
      label: `${who === "move_in" ? "Move-In Contact" : "Primary contact"}: ${label}`,
      description: who === "move_in"
        ? "The contact marked Primary Move-In Contact."
        : "The Primary Move-In Contact, or the first contact listed when none is marked.",
    }))
  ),
  { token: "community.move_day_instructions", label: "Move-day instructions (block)", description: "Every known rule as a labeled line, in rule order. Unknown rules are left out." },
];

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Every token's value for one community. Unknown rules are "". */
export function buildCommunityMergeData(community: Community, contacts: CommunityContact[]): Record<string, string> {
  const active = contacts.filter((c) => !c.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const moveIn = primaryMoveInContact(active);
  const primary = moveIn ?? active[0];
  const data: Record<string, string> = {
    "community.name": community.name,
    "community.type": community.type,
    "community.operator": community.operator,
    "community.address": formatAddress(community),
    "community.street": community.street,
    "community.city": community.city,
    "community.state": community.state,
    "community.zip": community.zip,
    "community.website": community.website,
  };
  const lines: string[] = [];
  for (const r of RULE_DEFINITIONS) {
    const known = ruleStatus(community, r.key) === "known";
    const value = known ? community.rules[r.key].trim() : "";
    data[`community.rules.${RULE_TOKEN[r.key]}`] = value;
    if (value) lines.push(`${r.label}: ${value}`);
  }
  data["community.move_day_instructions"] = lines.join("\n");
  for (const [who, c] of [["move_in", moveIn], ["primary", primary]] as const) {
    data[`community.contacts.${who}.name`] = c?.name ?? "";
    data[`community.contacts.${who}.first_name`] = c ? firstName(c.name) : "";
    data[`community.contacts.${who}.title`] = c?.title ?? "";
    data[`community.contacts.${who}.email`] = c?.email ?? "";
    data[`community.contacts.${who}.phone`] = c ? bestPhone(c.phones)?.number ?? "" : "";
  }
  return data;
}

export interface RenderResult {
  text: string;
  /** Tokens in the template that had no value (or aren't known tokens). */
  missing: string[];
}

/** Replaces {{token}} with its value. onMissing "blank" leaves ""; "flag"
 * also leaves "" but the caller gets `missing` to warn the sender. Unknown
 * tokens are always reported in `missing`. */
export function renderTemplate(
  template: string,
  data: Record<string, string>,
  opts: { onMissing: "blank" | "flag" } = { onMissing: "blank" }
): RenderResult {
  const missing = new Set<string>();
  const text = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, token: string) => {
    const value = data[token];
    if (value === undefined || value === "") {
      if (opts.onMissing === "flag" || value === undefined) missing.add(token);
      return "";
    }
    return value;
  });
  return { text, missing: [...missing] };
}

/** Loads a community and its contacts and returns every token's value. Server only. */
export async function resolveCommunityMergeData(communityId: string): Promise<Record<string, string>> {
  const { getCommunity } = await import("./service");
  const found = await getCommunity(communityId);
  if (!found) throw new Error(`Community ${communityId} not found`);
  return buildCommunityMergeData(found.community, found.contacts);
}
