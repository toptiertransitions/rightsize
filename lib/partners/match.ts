import type { PartnerProfile, MatchResult, ClientLocation, PartnerCategory } from "./types";

/**
 * Bayesian-adjusted average rating. Pulls a partner's raw average toward a
 * prior (the mean across all rated partners) proportional to how few reviews
 * they have, so a single 5.0 doesn't outrank a 4.8 built on 40 reviews.
 *
 * confidence = the "weight" (in review-count terms) given to the prior —
 * roughly, how many reviews it takes before the raw average dominates.
 */
export function computeBayesianRating(
  rawAvg: number,
  reviewCount: number,
  priorMean: number,
  confidence: number
): number {
  if (reviewCount <= 0) return 0;
  const weighted = (confidence * priorMean + reviewCount * rawAvg) / (confidence + reviewCount);
  return Math.round(weighted * 10) / 10;
}

function parseZipList(zipCodesServed: string): string[] {
  return zipCodesServed
    .split(/[,\s]+/)
    .map((z) => z.trim())
    .filter(Boolean);
}

function isInServiceArea(partner: PartnerProfile, location: ClientLocation): boolean {
  if (location.zip) {
    const zips = parseZipList(partner.zipCodesServed);
    if (zips.length > 0) return zips.includes(location.zip);
  }
  if (location.state) return partner.state.trim().toLowerCase() === location.state.trim().toLowerCase();
  // No location info to match against and no zip list to check — treat as unknown/not-in-area.
  return false;
}

// Sorts a group of already-filtered candidates: manual FeaturedRank override
// first (ascending — lower rank shows first), then by Bayesian rating desc,
// then by projects completed desc, then name as a stable final tiebreak.
function rankCandidates(partners: PartnerProfile[]): PartnerProfile[] {
  const featured = partners
    .filter((p) => p.featuredRank !== undefined && p.featuredRank !== null)
    .sort((a, b) => (a.featuredRank! - b.featuredRank!) || a.vendorName.localeCompare(b.vendorName));
  const rest = partners
    .filter((p) => p.featuredRank === undefined || p.featuredRank === null)
    .sort((a, b) =>
      (b.avgRating - a.avgRating) ||
      (b.projectsCompleted - a.projectsCompleted) ||
      a.vendorName.localeCompare(b.vendorName)
    );
  return [...featured, ...rest];
}

/**
 * Returns the top `topN` matches for a category, preferring partners whose
 * service area covers the client's location. If fewer than `topN` serve the
 * area, the remaining slots are filled with the highest-scoring partners
 * outside it (labeled "nearby" via MatchResult.matchedLocation).
 */
export function matchPartnersForCategory(
  allPartners: PartnerProfile[],
  category: PartnerCategory,
  location: ClientLocation,
  topN = 3
): MatchResult[] {
  const inCategory = allPartners.filter((p) => p.category === category);
  const inArea: PartnerProfile[] = [];
  const outArea: PartnerProfile[] = [];
  for (const p of inCategory) {
    (isInServiceArea(p, location) ? inArea : outArea).push(p);
  }

  const rankedInArea = rankCandidates(inArea);
  const rankedOutArea = rankCandidates(outArea);

  const results: MatchResult[] = rankedInArea.slice(0, topN).map((partner, i) => ({
    partner,
    rank: i + 1,
    matchedLocation: "area" as const,
  }));

  if (results.length < topN) {
    const need = topN - results.length;
    const fill = rankedOutArea.slice(0, need).map((partner, i) => ({
      partner,
      rank: results.length + i + 1,
      matchedLocation: "nearby" as const,
    }));
    results.push(...fill);
  }

  return results;
}
