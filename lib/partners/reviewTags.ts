// Adjective pills shown after the star score on a partner review, Uber-style:
// the set swaps with the score so a 5-star review offers praise and a 2-star
// review offers what went wrong. Stored as plain text on the review (comma-
// separated Tags field), so editing these lists never needs an Airtable
// schema change — an old tag that's no longer listed still shows in admin.

export const POSITIVE_REVIEW_TAGS = [
  "Responsive",
  "Professional",
  "On time",
  "Great communication",
  "Good value",
  "Kind & patient",
  "Careful with belongings",
  "Above & beyond",
] as const;

export const NEGATIVE_REVIEW_TAGS = [
  "Slow to respond",
  "Late or missed appointments",
  "Poor communication",
  "Pricier than expected",
  "Unprofessional",
  "Items damaged",
  "Didn't follow through",
] as const;

export function reviewTagsForScore(score: number): readonly string[] {
  return score >= 4 ? POSITIVE_REVIEW_TAGS : NEGATIVE_REVIEW_TAGS;
}

export const REVIEW_SCORE_PROMPTS: Record<number, string> = {
  1: "What went wrong?",
  2: "What went wrong?",
  3: "What could have been better?",
  4: "What went well?",
  5: "What stood out?",
};

export const REVIEW_SCORE_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

export const MAX_REVIEW_COMMENT_LENGTH = 1000;
