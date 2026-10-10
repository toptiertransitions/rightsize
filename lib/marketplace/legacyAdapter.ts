// Phase 4 adapter: produces the OLD lib/partners/types.ts PartnerProfile[]
// shape, sourced from the NEW Partners/MarketplaceListings tables instead
// of LocalVendors — so lib/partners/queries.ts's getPartnerDirectory can
// swap its data source without any downstream consumer (match.ts,
// scoring.ts, questions.ts, every /partners component) needing to change.
// Strangler pattern, not a rewrite: this file's only job is to reproduce
// today's exact behavior against the new tables, not to introduce any new
// behavior (the Phase 1/3 "minimum Live listings to show publicly"
// threshold is deliberately NOT applied here — that's a /marketplace-only
// concept; applying it to /partners would silently hide real, currently-
// visible partners in thin categories and change live behavior, which is
// outside this adapter's job).
import { getAllPartnerReviews, getAllVendorsWithLocalVendorLink, getTenants, getAllLocalVendors } from "@/lib/airtable";
import { realtorDisplayName } from "./partnerScreens";
import { computeBayesianRating } from "@/lib/partners/match";
import type { PartnerProfile, PartnerCategory } from "@/lib/partners/types";
import { getAllPartners, getAllListingsAdmin, getAllCategories } from "./data";
import { computeSeniorCredit } from "./seniorCredit";

const BAYESIAN_CONFIDENCE = 5;
const DEFAULT_PRIOR_MEAN = 4.5;

export async function getPartnerDirectoryFromNewModel(): Promise<PartnerProfile[]> {
  const [partners, listings, categories, reviews, linkedVendors, tenants, legacyVendors] = await Promise.all([
    getAllPartners(),
    getAllListingsAdmin(),
    getAllCategories(),
    getAllPartnerReviews(),
    getAllVendorsWithLocalVendorLink(),
    getTenants(),
    getAllLocalVendors(),
  ]);

  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const legacyVendorById = new Map(legacyVendors.map((v) => [v.id, v]));

  // One PartnerProfile row per Live listing — mirrors the old model, where
  // a LocalVendor record had exactly one `category`. A partner with
  // multiple Live listings now (not possible yet from the Phase 2 backfill,
  // but possible going forward) correctly produces one row per category,
  // same as if it had been two separate old-model vendor records.
  const liveRows = listings
    .filter((l) => l.status === "Live")
    .map((l) => ({ listing: l, partner: partnerById.get(l.partnerId), category: categoryById.get(l.categoryId) }))
    .filter((r): r is { listing: typeof r.listing; partner: NonNullable<typeof r.partner>; category: NonNullable<typeof r.category> } =>
      Boolean(r.partner && r.category)
    );

  // Reviews and completed-project links are keyed by the OLD LocalVendor
  // record id — never rewritten during Phase 2 by design (see Phase 0/2
  // notes) — so they're resolved here via each new Partner's optional
  // localVendorId, not its own id. A partner with no localVendorId (a
  // fresh marketplace signup, not backfilled from the old model) simply
  // has no legacy reviews/projects, which is correct.
  const reviewsByLegacyId = new Map<string, number[]>();
  for (const r of reviews) {
    if (!r.score) continue;
    if (!reviewsByLegacyId.has(r.partnerId)) reviewsByLegacyId.set(r.partnerId, []);
    reviewsByLegacyId.get(r.partnerId)!.push(r.score);
  }
  const allScores = reviews.filter((r) => r.score).map((r) => r.score);
  const priorMean = allScores.length > 0
    ? Math.round((allScores.reduce((s, n) => s + n, 0) / allScores.length) * 10) / 10
    : DEFAULT_PRIOR_MEAN;

  const archivedAtByTenantId = new Map(tenants.map((t) => [t.id, t.archivedAt]));
  const completedTenantIds = new Set(tenants.filter((t) => t.isArchived && !t.isLostDeal).map((t) => t.id));
  const completedTenantsByLegacyId = new Map<string, Set<string>>();
  for (const v of linkedVendors) {
    if (!v.localVendorId || !completedTenantIds.has(v.tenantId)) continue;
    if (!completedTenantsByLegacyId.has(v.localVendorId)) completedTenantsByLegacyId.set(v.localVendorId, new Set());
    completedTenantsByLegacyId.get(v.localVendorId)!.add(v.tenantId);
  }

  return liveRows.map(({ listing, partner, category }): PartnerProfile => {
    const legacyId = partner.localVendorId;
    const scores = legacyId ? reviewsByLegacyId.get(legacyId) ?? [] : [];
    const rawAvgRating = scores.length > 0 ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10 : 0;
    const avgRating = computeBayesianRating(rawAvgRating, scores.length, priorMean, BAYESIAN_CONFIDENCE);

    const completedTenants = legacyId ? completedTenantsByLegacyId.get(legacyId) ?? new Set<string>() : new Set<string>();
    const dynamicCount = completedTenants.size;
    const projectsCompleted = Math.max(0, dynamicCount + (partner.projectsCompletedAdjustment ?? 0));

    const archivedDates = [...completedTenants]
      .map((tenantId) => archivedAtByTenantId.get(tenantId))
      .filter((d): d is string => !!d)
      .sort((a, b) => b.localeCompare(a));
    const recentProjectMonths = archivedDates.length > 0
      ? archivedDates.map((d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }))
      : undefined;

    return {
      id: partner.id,
      // Realtors list as "Brokerage | Town | Name or team"
      vendorName: category.label === "Realtor" ? realtorDisplayName(partner) : partner.companyName,
      category: category.label as PartnerCategory,
      logo: partner.logo || undefined,
      website: partner.website || undefined,
      zipCodesServed: partner.serviceArea.zips.join(","),
      city: partner.city,
      state: partner.state,
      featuredRank: partner.featuredRank,
      avgRating,
      rawAvgRating,
      reviewCount: scores.length,
      projectsCompleted,
      aboutUs: partner.aboutUs || undefined,
      recentProjectMonths,
      // The new, structured seniorSpecialty taxonomy is the source of truth
      // once filled in; until then, fall back to the old boolean flag so a
      // backfilled partner's existing signal (and scoring boost) isn't
      // silently lost just because the new field hasn't been populated yet.
      seniorSpecialty: partner.seniorSpecialty.length > 0
        ? true
        : Boolean(legacyId && legacyVendorById.get(legacyId)?.seniorSpecialty),
      responsivenessScore: partner.responsivenessScore,
      email: partner.email || undefined,
      phone: partner.phone || undefined,
      deliveryMode: partner.deliveryMode,
      servesStatewide: partner.serviceArea.statewide,
      servesNationwide: partner.serviceArea.nationwide,
      attributes: listing.attributes,
      hasReferralDisclosure: listing.feeType !== "none" || category.referralPolicy.requiresDisclosure,
      disclosureText: category.referralPolicy.disclosureText,
      seniorCreditAmount: category.referralPolicy.creditToSeniorAllowed
        ? computeSeniorCredit(listing.feeType, listing.feeValue, listing.creditToSeniorPercent)
        : 0,
    };
  });
}
