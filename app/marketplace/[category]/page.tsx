import type { Metadata } from "next";
import { getAllCategories, getAllPartners, getAllListingsAdmin } from "@/lib/marketplace/data";
import { getPartnerDirectoryFromNewModel } from "@/lib/marketplace/legacyAdapter";
import { CategoryListClient, type PublicListingRow } from "./CategoryListClient";

export const revalidate = 300;

async function loadCategory(slug: string) {
  const categories = await getAllCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await loadCategory(slug);
  if (!category) return {};
  return {
    title: `${category.label} | Top Tier Transitions Marketplace`,
    description: category.description || `Vetted ${category.label} partners, matched to your move.`,
    alternates: { canonical: `/marketplace/${slug}` },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: slug } = await params;
  const category = await loadCategory(slug);

  if (!category) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-gray-500">That category doesn't exist.</p>
      </div>
    );
  }

  const [allPartners, allListings, directory] = await Promise.all([
    getAllPartners(),
    getAllListingsAdmin(),
    getPartnerDirectoryFromNewModel(),
  ]);
  const liveListings = allListings.filter((l) => l.categoryId === category.id && l.status === "Live");

  if (liveListings.length < category.minLiveListings) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{category.label} — Coming Soon</h1>
          <p className="text-gray-500 max-w-md">We're still building out our vetted network in this category. Check back soon.</p>
        </div>
      </div>
    );
  }

  const partnerById = new Map(allPartners.map((p) => [p.id, p]));
  const ratingByPartnerId = new Map(directory.filter((d) => d.category === category.label).map((d) => [d.id, d]));

  const rows: PublicListingRow[] = liveListings
    .map((listing) => {
      const partner = partnerById.get(listing.partnerId);
      const rating = ratingByPartnerId.get(listing.partnerId);
      if (!partner) return null;
      return {
        slug: partner.slug,
        companyName: partner.companyName,
        logo: partner.logo,
        shortBio: partner.shortBio,
        aboutUs: partner.aboutUs,
        city: partner.city,
        state: partner.state,
        deliveryMode: partner.deliveryMode,
        priceTier: partner.priceTier,
        languages: partner.languages,
        seniorSpecialty: partner.seniorSpecialty,
        serviceArea: partner.serviceArea,
        featuredRank: partner.featuredRank,
        responsivenessScore: partner.responsivenessScore,
        avgRating: rating?.avgRating ?? 0,
        reviewCount: rating?.reviewCount ?? 0,
        projectsCompleted: rating?.projectsCompleted ?? 0,
        attributes: listing.attributes,
        hasReferralDisclosure: listing.feeType !== "none" || category.referralPolicy.requiresDisclosure,
      };
    })
    .filter((r): r is PublicListingRow => r !== null);

  return (
    <CategoryListClient
      category={{
        label: category.label,
        slug: category.slug,
        description: category.description,
        allowsVirtual: category.allowsVirtual,
        filterableFields: category.fieldSchema.filter((f) => f.filterable),
        cardFields: category.fieldSchema.filter((f) => f.showOnCard),
        disclosureText: category.referralPolicy.disclosureText,
      }}
      rows={rows}
    />
  );
}
