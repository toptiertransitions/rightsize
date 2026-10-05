// Pure, unit-tested completeness calculation — drives the Draft->Live gate
// (pipeline.ts) and the dashboard's fill-rate stats. A field counts as
// filled when it has a non-empty value; empty string, null/undefined, and
// an empty array all count as not filled.
import type { MarketplaceCategory, MarketplaceFieldDef, MarketplaceListing } from "./types";

function isFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  return false;
}

export function requiredFieldKeys(category: Pick<MarketplaceCategory, "fieldSchema">): string[] {
  return category.fieldSchema.filter((f) => f.required).map((f) => f.key);
}

export function computeListingCompleteness(
  attributes: Record<string, unknown>,
  category: Pick<MarketplaceCategory, "fieldSchema">
): number {
  const required = requiredFieldKeys(category);
  if (required.length === 0) return 100;
  const filledCount = required.filter((key) => isFilled(attributes[key])).length;
  return Math.round((filledCount / required.length) * 100);
}

export function missingRequiredFields(
  attributes: Record<string, unknown>,
  category: Pick<MarketplaceCategory, "fieldSchema">
): MarketplaceFieldDef[] {
  return category.fieldSchema.filter((f) => f.required && !isFilled(attributes[f.key]));
}

export function isListingReadyForLive(
  attributes: Record<string, unknown>,
  category: Pick<MarketplaceCategory, "fieldSchema">
): boolean {
  return missingRequiredFields(attributes, category).length === 0;
}

export function computeProfileFillRate(partners: { logo: string; aboutUs: string }[]): {
  logoPercent: number;
  aboutUsPercent: number;
} {
  if (partners.length === 0) return { logoPercent: 0, aboutUsPercent: 0 };
  const withLogo = partners.filter((p) => p.logo.trim().length > 0).length;
  const withAboutUs = partners.filter((p) => p.aboutUs.trim().length > 0).length;
  return {
    logoPercent: Math.round((withLogo / partners.length) * 100),
    aboutUsPercent: Math.round((withAboutUs / partners.length) * 100),
  };
}

export function listingsByCategoryBelowThreshold(
  listings: Pick<MarketplaceListing, "categoryId" | "status">[],
  categories: Pick<MarketplaceCategory, "id" | "label" | "minLiveListings">[]
): { categoryId: string; label: string; liveCount: number; minLiveListings: number }[] {
  return categories
    .map((c) => ({
      categoryId: c.id,
      label: c.label,
      liveCount: listings.filter((l) => l.categoryId === c.id && l.status === "Live").length,
      minLiveListings: c.minLiveListings,
    }))
    .filter((c) => c.liveCount < c.minLiveListings);
}
