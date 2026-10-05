import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../MarketplaceNav";
import { getAllCategories, getAllPartners, getAllListingsAdmin } from "@/lib/marketplace/data";
import { computeListingCompleteness } from "@/lib/marketplace/completeness";
import { PartnersListClient } from "./PartnersListClient";

export const dynamic = "force-dynamic";

export default async function MarketplacePartnersPage() {
  const [categories, partners, listings] = await Promise.all([
    getAllCategories(),
    getAllPartners(),
    getAllListingsAdmin(),
  ]);

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
    };
  });

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-6 pb-12">
        <PartnersListClient rows={rows} categories={categories.map((c) => ({ id: c.id, label: c.label }))} />
      </main>
    </div>
  );
}
