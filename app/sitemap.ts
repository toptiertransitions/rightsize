import type { MetadataRoute } from "next";
import { getAllCategories, getAllListingsAdmin, getAllPartners } from "@/lib/marketplace/data";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.toptiertransitions.com";

// Only the public /marketplace routes — everything else in this app sits
// behind Clerk auth and has no business in a sitemap.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, listings, partners] = await Promise.all([
    getAllCategories(),
    getAllListingsAdmin(),
    getAllPartners(),
  ]);

  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const visibleCategories = categories.filter(
    (c) => listings.filter((l) => l.categoryId === c.id && l.status === "Live").length >= c.minLiveListings
  );

  const entries: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/marketplace`, changeFrequency: "weekly", priority: 0.8 },
  ];

  for (const category of visibleCategories) {
    entries.push({ url: `${BASE_URL}/marketplace/${category.slug}`, changeFrequency: "weekly", priority: 0.6 });
    const liveListings = listings.filter((l) => l.categoryId === category.id && l.status === "Live");
    for (const listing of liveListings) {
      const partner = partnerById.get(listing.partnerId);
      if (!partner) continue;
      entries.push({
        url: `${BASE_URL}/marketplace/${category.slug}/${partner.slug}`,
        lastModified: partner.updatedAt || undefined,
        changeFrequency: "monthly",
        priority: 0.4,
      });
    }
  }

  return entries;
}
