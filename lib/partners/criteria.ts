// Partner matching criteria, generated from the client matching questions
// (lib/partners/questions.ts) so there is exactly one place to change them.
// Every client select question becomes a partner question with the same
// options ("Which of these do you serve?"), and the partner's picks are
// stored on their listing as attributes.matchCriteria = { [questionId]:
// optionValue[] }. Values, not labels, so rewording an option never breaks
// a match, and a new option shows up for partners automatically.
//
// Client-safe: no server imports, used by admin, the partner portal, and
// scoring alike.
import type { PartnerCategory } from "@/lib/types";
import { getPartnerQuestions, type PartnerQuestion, type PartnerQuestionOption } from "./questions";

export const MATCH_CRITERIA_ATTR = "matchCriteria";

// Not criteria: who the help is for, and when they need it, describe the
// client rather than what a partner offers.
const NON_CRITERIA_QUESTION_IDS = new Set(["whoFor", "timeline"]);

// "I'm not sure" / "none" answers say nothing about fit
export const NEUTRAL_OPTION_VALUES = new Set(["not_sure", "none"]);

export interface PartnerCriterion {
  questionId: string;
  /** What partners are asked */
  prompt: string;
  /** What clients are asked, shown as context */
  clientPrompt: string;
  options: PartnerQuestionOption[];
}

export type MatchCriteria = Record<string, string[]>;

function isCriterionQuestion(q: PartnerQuestion): boolean {
  return (
    (q.type === "single-select" || q.type === "chips-multi") &&
    !NON_CRITERIA_QUESTION_IDS.has(q.id) &&
    q.partnerCriteria !== false &&
    (q.options ?? []).some((o) => !NEUTRAL_OPTION_VALUES.has(o.value))
  );
}

export function getPartnerCriteria(category: PartnerCategory): PartnerCriterion[] {
  return getPartnerQuestions(category)
    .filter(isCriterionQuestion)
    .map((q) => ({
      questionId: q.id,
      prompt: q.partnerPrompt ?? `Clients are asked "${q.prompt}" Which answers can you serve?`,
      clientPrompt: q.prompt,
      options: (q.options ?? []).filter((o) => !NEUTRAL_OPTION_VALUES.has(o.value)),
    }));
}

/** The listing's saved criteria, tolerating a missing or malformed blob. */
export function readMatchCriteria(attributes: Record<string, unknown> | undefined): MatchCriteria {
  const raw = attributes?.[MATCH_CRITERIA_ATTR];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: MatchCriteria = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
  }
  return out;
}

/** Saved picks limited to options that still exist, so a removed option
 * never lingers in matching or the editor. */
export function currentCriteriaValues(criterion: PartnerCriterion, criteria: MatchCriteria): string[] {
  const valid = new Set(criterion.options.map((o) => o.value));
  return (criteria[criterion.questionId] ?? []).filter((v) => valid.has(v));
}

/** How many of a category's criteria questions this listing has answered. */
export function criteriaProgress(category: PartnerCategory, attributes: Record<string, unknown> | undefined): { answered: number; total: number } {
  const criteria = readMatchCriteria(attributes);
  const all = getPartnerCriteria(category);
  return {
    answered: all.filter((c) => currentCriteriaValues(c, criteria).length > 0).length,
    total: all.length,
  };
}
