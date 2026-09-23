import { unstable_cache } from "next/cache";
import {
  getAllLocalVendors,
  getAllPartnerReviews,
  getAllVendorsWithLocalVendorLink,
  getTenants,
  getPartnerSelectionsForTenant,
} from "@/lib/airtable";
import { computeBayesianRating } from "./match";
import type { PartnerProfile, PartnerCategory } from "./types";

// How much weight the prior (the average rating across all reviewed
// partners) gets relative to a partner's own reviews — see match.ts.
const BAYESIAN_CONFIDENCE = 5;
const DEFAULT_PRIOR_MEAN = 4.5; // used only when no partner anywhere has a review yet

/**
 * The full computed Partners marketplace directory — active partners with a
 * category set, merged with their review stats and completed-project counts.
 * Cached for 5 minutes; tagged "partners-directory" so it can be
 * invalidated on demand (see app/api/tenants/route.ts, which revalidates
 * this tag when a project's archived/lost status changes).
 */
export const getPartnerDirectory = unstable_cache(
  async function _getPartnerDirectory(): Promise<PartnerProfile[]> {
    const [localVendors, reviews, linkedVendors, tenants] = await Promise.all([
      getAllLocalVendors(),
      getAllPartnerReviews(),
      getAllVendorsWithLocalVendorLink(),
      getTenants(),
    ]);

    const activePartners = localVendors.filter((v) => v.isActive && v.category);

    // Reviews, grouped by partner
    const reviewsByPartner = new Map<string, number[]>();
    for (const r of reviews) {
      if (!r.score) continue;
      if (!reviewsByPartner.has(r.partnerId)) reviewsByPartner.set(r.partnerId, []);
      reviewsByPartner.get(r.partnerId)!.push(r.score);
    }
    const allScores = reviews.filter((r) => r.score).map((r) => r.score);
    const priorMean = allScores.length > 0
      ? Math.round((allScores.reduce((s, n) => s + n, 0) / allScores.length) * 10) / 10
      : DEFAULT_PRIOR_MEAN;

    // Completed-project counts + dates: distinct completed tenantIds per
    // linked partner. "Completed" = archived and not a lost deal.
    const archivedAtByTenantId = new Map(tenants.map((t) => [t.id, t.archivedAt]));
    const completedTenantIds = new Set(
      tenants.filter((t) => t.isArchived && !t.isLostDeal).map((t) => t.id)
    );
    const completedTenantsByPartner = new Map<string, Set<string>>();
    for (const v of linkedVendors) {
      if (!v.localVendorId || !completedTenantIds.has(v.tenantId)) continue;
      if (!completedTenantsByPartner.has(v.localVendorId)) completedTenantsByPartner.set(v.localVendorId, new Set());
      completedTenantsByPartner.get(v.localVendorId)!.add(v.tenantId);
    }

    return activePartners.map((v): PartnerProfile => {
      const scores = reviewsByPartner.get(v.id) ?? [];
      const rawAvgRating = scores.length > 0
        ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10
        : 0;
      const avgRating = computeBayesianRating(rawAvgRating, scores.length, priorMean, BAYESIAN_CONFIDENCE);
      const completedTenants = completedTenantsByPartner.get(v.id) ?? new Set<string>();
      const dynamicCount = completedTenants.size;
      const projectsCompleted = Math.max(0, dynamicCount + (v.projectsCompletedAdjustment ?? 0));

      // Only tenants archived since ArchivedAt started being stamped carry a
      // date — older archives are silently skipped rather than shown with a
      // guessed date. No client-identifying info goes into this list, just
      // the month.
      const archivedDates = [...completedTenants]
        .map((tenantId) => archivedAtByTenantId.get(tenantId))
        .filter((d): d is string => !!d)
        .sort((a, b) => b.localeCompare(a)); // "YYYY-MM-DD" sorts correctly as a string
      const recentProjectMonths = archivedDates.length > 0
        ? archivedDates.map((d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }))
        : undefined;

      return {
        id: v.id,
        vendorName: v.vendorName,
        category: v.category as PartnerCategory,
        logo: v.logo,
        website: v.website || undefined,
        zipCodesServed: v.zipCodesServed,
        city: v.city,
        state: v.state,
        featuredRank: v.featuredRank,
        avgRating,
        rawAvgRating,
        reviewCount: scores.length,
        projectsCompleted,
        aboutUs: v.aboutUs,
        recentProjectMonths,
      };
    });
  },
  ["partners-directory"],
  { revalidate: 300, tags: ["partners-directory"] }
);

/** Category -> selected partner id, for hydrating the Selected Partners tray on load. */
export async function getSelectionsMapForTenant(
  tenantId: string
): Promise<Partial<Record<PartnerCategory, string>>> {
  const selections = await getPartnerSelectionsForTenant(tenantId);
  const map: Partial<Record<PartnerCategory, string>> = {};
  for (const s of selections) map[s.category] = s.partnerId;
  return map;
}
