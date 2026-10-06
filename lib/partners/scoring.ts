import type { PartnerProfile, PartnerCategory, ClientLocation } from "./types";
import type { PartnerRequest } from "@/lib/types";
import { parseZipList } from "./match";
import { getPartnerQuestions } from "./questions";

// Deterministic, no-LLM scoring for Phase 3 guided matching. Weights are
// exactly as specified (fit 35 / seniorSpecialty 20 / responsiveness 15 /
// reviews 10 / pastOutcomes 10 / adminOrder 5) — these sum to 0.95, not 1.0,
// kept verbatim rather than silently rescaled since relative ranking between
// partners is unaffected either way. Two of the six factors (reviews, adminOrder) are backed by real
// existing data (PartnerReview aggregates, LocalVendors.FeaturedRank);
// seniorSpecialty and responsiveness are backed by two new admin-set
// LocalVendors fields (SeniorSpecialty checkbox, ResponsivenessScore 1-5);
// fit and pastOutcomes are necessarily proxies given what data exists today
// (service-area match strength, and completed-project volume respectively)
// — documented here rather than hidden, since neither is a true semantic
// "fit to this client's answers" or "outcome quality" measure yet.
export const SCORING_WEIGHTS = {
  fit: 0.35,
  seniorSpecialty: 0.2,
  responsiveness: 0.15,
  reviews: 0.1,
  pastOutcomes: 0.1,
  adminOrder: 0.05,
  // Phase 5 addition: how well the client's category-specific answers
  // overlap with this listing's filled-in attributes (see
  // attributeOverlapScore below). Small weight on purpose — most listings
  // don't have attributes filled in yet, so this mostly contributes 0
  // today and will matter more as admins complete profiles, not before.
  attributeOverlap: 0.05,
} as const;

export const MAX_INTRO_REQUESTS_PER_CATEGORY = 2;

// A vendor with 10+ completed projects gets full credit for the "past
// outcomes" factor — an arbitrary but reasonable cap given there's no true
// outcome-quality field to score against yet.
const PAST_OUTCOMES_CAP = 10;

export interface ScoredMatch {
  partner: PartnerProfile;
  score: number; // 0-1
  matchedLocation: "area" | "nearby";
  whyThisMatch: string;
}

export interface ScoringResult {
  best: ScoredMatch | null;
  alternates: ScoredMatch[]; // up to 2
}

// Every category's question set now uses "zip" as the location question id
// (see the matchQuestionKey/zip-normalization migration in questions.ts) —
// except Mover, which genuinely has two (fromZip/toZip, origin vs.
// destination), not a naming inconsistency to unify. Falls back to the
// tenant's own currentZip if the question wasn't answered yet.
function getRequestZipAnswer(category: PartnerCategory, answers: Record<string, string | string[]>): string | undefined {
  const qid = category === "Mover" ? "fromZip" : "zip";
  const value = answers[qid];
  return typeof value === "string" && value ? value : undefined;
}

export function getRequestLocation(
  category: PartnerCategory,
  answers: Record<string, string | string[]>,
  fallback: ClientLocation
): ClientLocation {
  const zip = getRequestZipAnswer(category, answers) ?? fallback.zip;
  return { zip, state: fallback.state };
}

export type DeliveryPreference = "in_person" | "virtual" | "either";

function getDeliveryPreference(answers: Record<string, string | string[]>): DeliveryPreference {
  const value = answers["deliveryPreference"];
  return value === "in_person" || value === "virtual" ? value : "either";
}

// Loose, case-insensitive label overlap between a client's chosen option
// labels and a vendor's attribute values for the matched field — the two
// vocabularies aren't guaranteed to align word-for-word (a question's chip
// labels were written for clients, a field's options for admins), so this
// rewards a partial match rather than requiring an exact one. Contributes 0,
// not an error, when the listing's attributes are still empty — which is
// most listings today (see Phase 2 backfill notes).
function attributeOverlapScore(
  category: PartnerCategory,
  answers: Record<string, string | string[]>,
  attributes: Record<string, unknown> | undefined
): number {
  if (!attributes) return 0;
  const questions = getPartnerQuestions(category).filter((q) => q.matchQuestionKey);
  if (questions.length === 0) return 0;

  let totalScore = 0;
  let scoredQuestions = 0;
  for (const q of questions) {
    const attrValue = attributes[q.matchQuestionKey!];
    const attrLabels = Array.isArray(attrValue)
      ? attrValue.map((v) => String(v).toLowerCase())
      : attrValue != null
        ? [String(attrValue).toLowerCase()]
        : [];
    if (attrLabels.length === 0) continue; // attribute not filled in — skip, don't penalize

    const answerValue = answers[q.id];
    const answerLabels = (Array.isArray(answerValue) ? answerValue : answerValue ? [answerValue] : [])
      .map((v) => q.options?.find((o) => o.value === v)?.label.toLowerCase() ?? String(v).toLowerCase());
    if (answerLabels.length === 0) continue;

    scoredQuestions++;
    const anyOverlap = answerLabels.some((a) => attrLabels.some((b) => b.includes(a) || a.includes(b)));
    if (anyOverlap) totalScore += 1;
  }
  return scoredQuestions > 0 ? totalScore / scoredQuestions : 0;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function buildWhyThisMatch(partner: PartnerProfile, zipMatch: boolean): string {
  const reasons: string[] = [];
  if (zipMatch) reasons.push("serves your area");
  if (partner.seniorSpecialty) reasons.push("experienced with senior moves");
  if (partner.reviewCount > 0 && partner.avgRating >= 4.5) {
    reasons.push(`highly rated (${partner.avgRating}★ from ${partner.reviewCount} review${partner.reviewCount === 1 ? "" : "s"})`);
  } else if (partner.reviewCount > 0) {
    reasons.push(`rated ${partner.avgRating}★`);
  }
  if (partner.projectsCompleted >= 5) {
    reasons.push(`completed ${partner.projectsCompleted}+ projects with us`);
  }

  const top = reasons.slice(0, 3);
  if (top.length === 0) return "A good fit based on your answers.";
  if (top.length === 1) return `${capitalize(top[0])}.`;
  return `${capitalize(top.slice(0, -1).join(", "))}, and ${top[top.length - 1]}.`;
}

/**
 * Hard-filters a category's directory to partners in or near the client's
 * service area, then scores and ranks the rest. Returns the single best
 * match plus up to 2 alternates — or `best: null` if nothing passed the
 * hard filter (a real, expected outcome, not an error).
 */
export function scoreAndRankPartners(
  directory: PartnerProfile[],
  category: PartnerCategory,
  location: ClientLocation,
  answers: Record<string, string | string[]> = {}
): ScoringResult {
  const inCategory = directory.filter((p) => p.category === category);
  const deliveryPreference = getDeliveryPreference(answers);

  const scored: ScoredMatch[] = [];
  for (const partner of inCategory) {
    // A partner who can't serve this client in the way they asked for
    // doesn't belong in the results at all, regardless of location —
    // checked before the location filter so an in-person-only partner
    // never shows up for a client who explicitly wants virtual.
    if (deliveryPreference === "virtual" && partner.deliveryMode === "In-person") continue;
    if (deliveryPreference === "in_person" && partner.deliveryMode === "Virtual") continue;

    const zips = parseZipList(partner.zipCodesServed);
    const zipMatch = !!location.zip && zips.includes(location.zip);
    const stateMatch = !!location.state && partner.state.trim().toLowerCase() === location.state.trim().toLowerCase();
    const canServeVirtually = partner.deliveryMode === "Virtual" || partner.deliveryMode === "Both";
    const virtualCoverageMatch =
      deliveryPreference !== "in_person" &&
      canServeVirtually &&
      (partner.servesNationwide || (partner.servesStatewide && stateMatch));

    // Hard filter: not serving this client's zip or state at all, and no
    // virtual coverage that would reach them either.
    if (!zipMatch && !stateMatch && !virtualCoverageMatch) continue;

    const locationMatched = zipMatch || virtualCoverageMatch;
    const fitScore = zipMatch ? 1 : locationMatched ? 0.75 : 0.5;
    const seniorScore = partner.seniorSpecialty ? 1 : 0;
    const responsivenessScore = (partner.responsivenessScore ?? 3) / 5;
    const reviewsScore = partner.reviewCount > 0 ? partner.avgRating / 5 : 0.5; // no reviews yet — neutral, not penalized
    const pastOutcomesScore = Math.min(partner.projectsCompleted / PAST_OUTCOMES_CAP, 1);
    const adminOrderScore = partner.featuredRank != null ? Math.max(0, 1 - (partner.featuredRank - 1) * 0.1) : 0.5;
    const attributeScore = attributeOverlapScore(category, answers, partner.attributes);

    const score =
      SCORING_WEIGHTS.fit * fitScore +
      SCORING_WEIGHTS.seniorSpecialty * seniorScore +
      SCORING_WEIGHTS.responsiveness * responsivenessScore +
      SCORING_WEIGHTS.reviews * reviewsScore +
      SCORING_WEIGHTS.pastOutcomes * pastOutcomesScore +
      SCORING_WEIGHTS.adminOrder * adminOrderScore +
      SCORING_WEIGHTS.attributeOverlap * attributeScore;

    scored.push({
      partner,
      score,
      matchedLocation: zipMatch ? "area" : "nearby",
      whyThisMatch: buildWhyThisMatch(partner, zipMatch),
    });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.partner.featuredRank ?? 999) - (b.partner.featuredRank ?? 999) ||
      a.partner.vendorName.localeCompare(b.partner.vendorName)
  );

  return { best: scored[0] ?? null, alternates: scored.slice(1, 3) };
}

export function introRequestCountRemaining(request: PartnerRequest | undefined): number {
  const used = request?.introRequests.length ?? 0;
  return Math.max(0, MAX_INTRO_REQUESTS_PER_CATEGORY - used);
}
