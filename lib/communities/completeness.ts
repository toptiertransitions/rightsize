// How much of a community's essential Move-Day Rules we know. Pure.
import { RULE_DEFINITIONS, ruleStatus, type Community, type RuleKey } from "./types";

export interface Completeness {
  known: number;
  total: number;
  percent: number;
  missingKeys: RuleKey[];
}

/** Known or confirmed not applicable both count as complete. */
export function completeness(c: Pick<Community, "rules" | "ruleStatus">): Completeness {
  const essential = RULE_DEFINITIONS.filter((r) => r.essential);
  const missingKeys = essential.filter((r) => ruleStatus(c, r.key) === "unknown").map((r) => r.key);
  const known = essential.length - missingKeys.length;
  return { known, total: essential.length, percent: Math.round((known / essential.length) * 100), missingKeys };
}

export const isComplete = (c: Pick<Community, "rules" | "ruleStatus">) => completeness(c).missingKeys.length === 0;
