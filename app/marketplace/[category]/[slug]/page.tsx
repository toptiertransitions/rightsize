import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllCategories, getAllPartners, getAllListingsAdmin } from "@/lib/marketplace/data";
import { getPartnerDirectoryFromNewModel } from "@/lib/marketplace/legacyAdapter";
import { ProfileClient } from "./ProfileClient";

export const revalidate = 300;

async function loadData(categorySlug: string, partnerSlug: string) {
  const [categories, partners, listings, directory] = await Promise.all([
    getAllCategories(),
    getAllPartners(),
    getAllListingsAdmin(),
    getPartnerDirectoryFromNewModel(),
  ]);
  const category = categories.find((c) => c.slug === categorySlug);
  const partner = partners.find((p) => p.slug === partnerSlug);
  if (!category || !partner) return null;
  const listing = listings.find((l) => l.partnerId === partner.id && l.categoryId === category.id && l.status === "Live");
  if (!listing) return null;
  const rating = directory.find((d) => d.id === partner.id && d.category === category.label);
  return { category, partner, listing, rating };
}

export async function generateMetadata({ params }: { params: Promise<{ category: string; slug: string }> }): Promise<Metadata> {
  const { category, slug } = await params;
  const data = await loadData(category, slug);
  if (!data) return {};
  return {
    title: `${data.partner.companyName} — ${data.category.label} | Top Tier Transitions Marketplace`,
    description: data.partner.shortBio || data.partner.aboutUs || `${data.partner.companyName}, a vetted ${data.category.label} partner.`,
    alternates: { canonical: `/marketplace/${category}/${slug}` },
  };
}

export default async function PartnerProfilePage({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  const data = await loadData(category, slug);
  if (!data) notFound();

  const { category: cat, partner, listing, rating } = data;
  const hasReferralDisclosure = listing.feeType !== "none" || cat.referralPolicy.requiresDisclosure;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: partner.companyName,
    description: partner.aboutUs || partner.shortBio || undefined,
    address: partner.city || partner.state ? { "@type": "PostalAddress", addressLocality: partner.city, addressRegion: partner.state } : undefined,
    url: partner.website || undefined,
    image: partner.logo || undefined,
    aggregateRating: rating && rating.reviewCount > 0
      ? { "@type": "AggregateRating", ratingValue: rating.avgRating, reviewCount: rating.reviewCount }
      : undefined,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProfileClient
      categoryLabel={cat.label}
      categorySlug={cat.slug}
      disclosureText={cat.referralPolicy.disclosureText}
      hasReferralDisclosure={hasReferralDisclosure}
      profileFields={cat.fieldSchema.filter((f) => f.showOnProfile)}
      attributes={listing.attributes}
      partner={{
        slug: partner.slug,
        companyName: partner.companyName,
        logo: partner.logo,
        aboutUs: partner.aboutUs,
        shortBio: partner.shortBio,
        city: partner.city,
        state: partner.state,
        website: partner.website,
        deliveryMode: partner.deliveryMode,
        serviceArea: partner.serviceArea,
        languages: partner.languages,
        seniorSpecialty: partner.seniorSpecialty,
        priceTier: partner.priceTier,
      }}
      avgRating={rating?.avgRating ?? 0}
      reviewCount={rating?.reviewCount ?? 0}
      projectsCompleted={rating?.projectsCompleted ?? 0}
      recentProjectMonths={rating?.recentProjectMonths ?? []}
      />
    </>
  );
}
