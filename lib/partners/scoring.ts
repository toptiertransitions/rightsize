import type { PartnerProfile, PartnerCategory, ClientLocation } from "./types";
import type { PartnerRequest } from "@/lib/types";
import { parseZipList } from "./match";
import { getPartnerQuestions } from "./questions";
import { readMatchCriteria, NEUTRAL_OPTION_VALUES } from "./criteria";

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
// The six original factors keep their relative proportions (35/20/15/10/
// 10/5), scaled to share 75% so attributeOverlap can carry 25% and the
// total stays 1.0. Scaling them uniformly means partners with no criteria
// set rank among themselves exactly as before.
const BASE_SCALE = 0.75 / 0.95;
export const SCORING_WEIGHTS = {
  fit: 0.35 * BASE_SCALE,
  seniorSpecialty: 0.2 * BASE_SCALE,
  responsiveness: 0.15 * BASE_SCALE,
  reviews: 0.1 * BASE_SCALE,
  pastOutcomes: 0.1 * BASE_SCALE,
  adminOrder: 0.05 * BASE_SCALE,
  // How well the client's category-specific answers fit what this listing
  // says it serves (see attributeOverlapScore below). Raised from 0.05 once
  // partners could set exact matching criteria (lib/partners/criteria.ts):
  // it's now a real fit signal. A listing with nothing filled in scores 0
  // here, as before, so rankings only shift as criteria get set.
  attributeOverlap: 0.25,
} as const;

export const MAX_INTRO_REQUESTS_PER_CATEGORY = 2;

// A vendor with 10+ completed projects gets full credit for the "past
// outcomes" factor — an arbitrary but reasonable cap given there's no true
// outcome-quality field to score against yet.
const PAST_OUTCOMES_CAP = 10;

export interface ScoredMatch {
  partner: PartnerProfile;
  score: number; // 0-1
  matchedLocation: "area" | "nearby" | "virtual";
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

  let totalScore = 0;
  let scoredQuestions = 0;
  const criteria = readMatchCriteria(attributes);

  // Exact criteria first: the partner picked from the very same options
  // the client answered, so compare option values directly.
  const exactIds = new Set<string>();
  for (const q of getPartnerQuestions(category)) {
    const partnerValues = criteria[q.id];
    if (!partnerValues || partnerValues.length === 0) continue;
    const raw = answers[q.id];
    const clientValues = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((v) => !NEUTRAL_OPTION_VALUES.has(v));
    if (clientValues.length === 0) continue;
    exactIds.add(q.id);
    scoredQuestions++;
    if (clientValues.some((v) => partnerValues.includes(v))) totalScore += 1;
  }

  // Legacy: loose label match against admin-entered category fields, for
  // questions the partner hasn't set exact criteria on yet.
  for (const q of questions) {
    if (exactIds.has(q.id)) continue;
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

function buildWhyThisMatch(partner: PartnerProfile, zipMatch: boolean, fitsAnswers = false): string {
  const reasons: string[] = [];
  if (fitsAnswers) reasons.push("offers what you're looking for");
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
 * Hard-filters a category's directory to partners who can actually reach
 * this client — locally (zip/state) or virtually (no preference question
 * to gate on; see questions.ts's comment on why delivery mode isn't asked
 * of the client) — then scores and ranks the rest. Composes the final
 * result as up to 2 local options plus one virtual-capable bonus option
 * when one exists, rather than pure score order, so the client always
 * sees a real local choice alongside a virtual one where available —
 * never all-virtual, never missing a virtual option that does exist.
 * Returns `best: null` if nothing passed the hard filter at all (a real,
 * expected outcome, not an error).
 */
export function scoreAndRankPartners(
  directory: PartnerProfile[],
  category: PartnerCategory,
  location: ClientLocation,
  answers: Record<string, string | string[]> = {}
): ScoringResult {
  const inCategory = directory.filter((p) => p.category === category);

  const scored: ScoredMatch[] = [];
  for (const partner of inCategory) {
    const zips = parseZipList(partner.zipCodesServed);
    const zipMatch = !!location.zip && zips.includes(location.zip);
    const stateMatch = !!location.state && partner.state.trim().toLowerCase() === location.state.trim().toLowerCase();
    const canServeVirtually = partner.deliveryMode === "Virtual" || partner.deliveryMode === "Both";
    const virtualCoverageMatch =
      canServeVirtually && (partner.servesNationwide || (partner.servesStatewide && stateMatch));
    const isLocalMatch = zipMatch || stateMatch;

    // Hard filter: not serving this client's zip or state at all, and no
    // virtual coverage that would reach them either.
    if (!isLocalMatch && !virtualCoverageMatch) continue;

    const fitScore = zipMatch ? 1 : isLocalMatch ? 0.75 : 0.6;
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
      matchedLocation: zipMatch ? "area" : isLocalMatch ? "nearby" : "virtual",
      whyThisMatch: buildWhyThisMatch(partner, zipMatch, attributeScore === 1),
    });
  }

  const byScore = (a: ScoredMatch, b: ScoredMatch) =>
    b.score - a.score ||
    (a.partner.featuredRank ?? 999) - (b.partner.featuredRank ?? 999) ||
    a.partner.vendorName.localeCompare(b.partner.vendorName);

  const local = scored.filter((s) => s.matchedLocation !== "virtual").sort(byScore);
  const virtual = scored.filter((s) => s.matchedLocation === "virtual").sort(byScore);

  const picked: ScoredMatch[] = local.slice(0, 2);
  if (virtual.length > 0) picked.push(virtual[0]);
  if (picked.length < 3) {
    for (const s of local.slice(picked.filter((p) => p.matchedLocation !== "virtual").length)) {
      if (picked.length >= 3) break;
      picked.push(s);
    }
  }

  return { best: picked[0] ?? null, alternates: picked.slice(1, 3) };
}

export function introRequestCountRemaining(request: PartnerRequest | undefined): number {
  const used = request?.introRequests.length ?? 0;
  return Math.max(0, MAX_INTRO_REQUESTS_PER_CATEGORY - used);
}
