import type { PartnerProfile, PartnerCategory, ClientLocation } from "./types";
import type { PartnerRequest } from "@/lib/types";
import { parseZipList } from "./match";

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

// Which question in each category's flow holds the zip most relevant to
// service-area matching (see lib/partners/questions.ts). Falls back to the
// tenant's own currentZip if that question wasn't answered yet.
const ZIP_QUESTION_BY_CATEGORY: Partial<Record<PartnerCategory, string>> = {
  Realtor: "propertyZip",
  Community: "areaZip",
  Mover: "fromZip",
  Hauler: "pickupZip",
  Donation: "zip",
};

export function getRequestLocation(
  category: PartnerCategory,
  answers: Record<string, string | string[]>,
  fallback: ClientLocation
): ClientLocation {
  const qid = ZIP_QUESTION_BY_CATEGORY[category];
  const value = qid ? answers[qid] : undefined;
  const zip = typeof value === "string" && value ? value : fallback.zip;
  return { zip, state: fallback.state };
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
  location: ClientLocation
): ScoringResult {
  const inCategory = directory.filter((p) => p.category === category);

  const scored: ScoredMatch[] = [];
  for (const partner of inCategory) {
    const zips = parseZipList(partner.zipCodesServed);
    const zipMatch = !!location.zip && zips.includes(location.zip);
    const stateMatch = !!location.state && partner.state.trim().toLowerCase() === location.state.trim().toLowerCase();

    // Hard filter: not serving this client's zip or state at all.
    if (!zipMatch && !stateMatch) continue;

    const fitScore = zipMatch ? 1 : 0.5;
    const seniorScore = partner.seniorSpecialty ? 1 : 0;
    const responsivenessScore = (partner.responsivenessScore ?? 3) / 5;
    const reviewsScore = partner.reviewCount > 0 ? partner.avgRating / 5 : 0.5; // no reviews yet — neutral, not penalized
    const pastOutcomesScore = Math.min(partner.projectsCompleted / PAST_OUTCOMES_CAP, 1);
    const adminOrderScore = partner.featuredRank != null ? Math.max(0, 1 - (partner.featuredRank - 1) * 0.1) : 0.5;

    const score =
      SCORING_WEIGHTS.fit * fitScore +
      SCORING_WEIGHTS.seniorSpecialty * seniorScore +
      SCORING_WEIGHTS.responsiveness * responsivenessScore +
      SCORING_WEIGHTS.reviews * reviewsScore +
      SCORING_WEIGHTS.pastOutcomes * pastOutcomesScore +
      SCORING_WEIGHTS.adminOrder * adminOrderScore;

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
