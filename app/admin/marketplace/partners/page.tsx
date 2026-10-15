import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../MarketplaceNav";
import { auth } from "@clerk/nextjs/server";
import { getAllPartnerReviews, getSystemRole } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { getAllCategories, getAllPartners, getAllListingsAdmin } from "@/lib/marketplace/data";
import { partnerIdResolver, summarizeReviewsByPartner } from "@/lib/partners/reviews";
import { computeListingCompleteness } from "@/lib/marketplace/completeness";
import { PartnersListClient } from "./PartnersListClient";
import { InviteMarketplacePartnerButton } from "./InviteMarketplacePartnerButton";

export const dynamic = "force-dynamic";

export default async function MarketplacePartnersPage() {
  const { userId } = await auth();
  const [categories, partners, listings, reviews, role] = await Promise.all([
    getAllCategories(),
    getAllPartners(),
    getAllListingsAdmin(),
    getAllPartnerReviews().catch(() => []),
    userId ? getSystemRole(userId).catch(() => null) : null,
  ]);
  const canToggleScore = role === "TTTAdmin" || (!!userId && isTTTAdmin(userId));
  const reviewSummaries = summarizeReviewsByPartner(reviews, partnerIdResolver(partners));

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const rows = partners.map((partner) => {
    const partnerListings = listings.filter((l) => l.partnerId === partner.id);
    const primaryListing = partnerListings.find((l) => l.isPrimary) ?? partnerListings[0];
    const primaryCategory = primaryListing ? categoryById.get(primaryListing.categoryId) : undefined;
    const completeness = primaryListing && primaryCategory
      ? computeListingCompleteness(primaryListing.attributes, primaryCategory)
      : 0;
    return {
      partner,
      categoryLabels: partnerListings.map((l) => categoryById.get(l.categoryId)?.label ?? "—"),
      listingStatus: primaryListing?.status ?? "Draft",
      completeness,
      hasReferralFee: partnerListings.some((l) => l.feeType !== "none"),
      reviews: reviewSummaries.get(partner.id) ?? { avg: 0, count: 0, hiddenCount: 0 },
    };
  });

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-6 pb-12">
        <div className="mb-6 flex justify-end">
          <InviteMarketplacePartnerButton
            categories={[...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)).map((c) => ({ id: c.id, label: c.label }))}
          />
        </div>
        <PartnersListClient rows={rows} canToggleScore={canToggleScore} categories={categories.map((c) => ({ id: c.id, label: c.label }))} />
      </main>
    </div>
  );
}
