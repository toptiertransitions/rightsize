"use client";

import { useMemo, useState } from "react";
import { PartnerCard, type PartnerCardData } from "../PartnerCard";
import { matchesLocation } from "@/lib/marketplace/serviceArea";
import type { MarketplaceDeliveryMode, MarketplaceFieldDef, MarketplaceServiceArea } from "@/lib/marketplace/types";

export interface PublicListingRow {
  slug: string;
  companyName: string;
  logo: string;
  shortBio: string;
  aboutUs: string;
  city: string;
  state: string;
  deliveryMode: MarketplaceDeliveryMode;
  priceTier: string;
  languages: string[];
  seniorSpecialty: string[];
  serviceArea: MarketplaceServiceArea;
  featuredRank?: number;
  responsivenessScore?: number;
  avgRating: number;
  reviewCount: number;
  projectsCompleted: number;
  attributes: Record<string, unknown>;
  hasReferralDisclosure: boolean;
}

interface CategoryInfo {
  label: string;
  slug: string;
  description: string;
  allowsVirtual: boolean;
  filterableFields: MarketplaceFieldDef[];
  cardFields: MarketplaceFieldDef[];
  disclosureText: string;
}

type SortKey = "best" | "response" | "rating" | "distance";

function formatAttr(field: MarketplaceFieldDef, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (field.type === "boolean") return value ? field.label : null;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : null;
  return `${field.label}: ${value}`;
}

export function CategoryListClient({ category, rows }: { category: CategoryInfo; rows: PublicListingRow[] }) {
  const [zip, setZip] = useState("");
  const [virtualOnly, setVirtualOnly] = useState(false);
  const [priceTier, setPriceTier] = useState("");
  const [language, setLanguage] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortKey>("best");

  const allLanguages = useMemo(() => Array.from(new Set(rows.flatMap((r) => r.languages))).sort(), [rows]);
  const allSpecialties = useMemo(() => Array.from(new Set(rows.flatMap((r) => r.seniorSpecialty))).sort(), [rows]);

  const filtered = rows.filter((r) => {
    if (virtualOnly && r.deliveryMode === "In-person") return false;
    if (priceTier && r.priceTier !== priceTier) return false;
    if (language && !r.languages.includes(language)) return false;
    if (specialty && !r.seniorSpecialty.includes(specialty)) return false;
    if (zip.trim() && !matchesLocation(r.serviceArea, { zip: zip.trim() }, r.state, r.deliveryMode)) return false;
    for (const [key, val] of Object.entries(fieldFilters)) {
      if (!val) continue;
      const attrVal = r.attributes[key];
      if (Array.isArray(attrVal)) {
        if (!attrVal.includes(val)) return false;
      } else if (String(attrVal ?? "") !== val) {
        return false;
      }
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "rating") return b.avgRating - a.avgRating;
    if (sort === "response") return (b.responsivenessScore ?? 3) - (a.responsivenessScore ?? 3);
    if (sort === "distance") {
      // No geocoding here — an exact zip match in the service area is
      // treated as "closest," everyone else keeps best-match order. A
      // real distance sort needs lat/lng, which isn't collected yet.
      const aExact = zip.trim() && a.serviceArea.zips.includes(zip.trim()) ? 0 : 1;
      const bExact = zip.trim() && b.serviceArea.zips.includes(zip.trim()) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
    }
    // best match: featured rank first, then rating, then projects completed
    const aFeatured = a.featuredRank ?? Infinity;
    const bFeatured = b.featuredRank ?? Infinity;
    if (aFeatured !== bFeatured) return aFeatured - bFeatured;
    if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
    return b.projectsCompleted - a.projectsCompleted;
  });

  function cardData(r: PublicListingRow): PartnerCardData {
    return {
      slug: r.slug,
      companyName: r.companyName,
      logo: r.logo || undefined,
      shortBio: r.shortBio,
      cardAttributes: category.cardFields.map((f) => formatAttr(f, r.attributes[f.key])).filter((v): v is string => v !== null).slice(0, 3),
      avgRating: r.avgRating,
      reviewCount: r.reviewCount,
      deliveryMode: r.deliveryMode,
      hasReferralDisclosure: r.hasReferralDisclosure,
    };
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{category.label}</h1>
          <p className="text-gray-500 text-sm max-w-xl">{category.description}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex flex-wrap gap-2 mb-6">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Zip code"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-200 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-forest-500/20"
          />
          {category.allowsVirtual && (
            <label className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-600">
              <input type="checkbox" checked={virtualOnly} onChange={(e) => setVirtualOnly(e.target.checked)} />
              Virtual only
            </label>
          )}
          <select value={priceTier} onChange={(e) => setPriceTier(e.target.value)} className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-600">
            <option value="">Any price</option>
            {["$", "$$", "$$$", "Contact for pricing"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {allLanguages.length > 0 && (
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-600">
              <option value="">Any language</option>
              {allLanguages.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          {allSpecialties.length > 0 && (
            <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-600">
              <option value="">Any specialty</option>
              {allSpecialties.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {category.filterableFields.map((f) => (
            <select
              key={f.key}
              value={fieldFilters[f.key] ?? ""}
              onChange={(e) => setFieldFilters({ ...fieldFilters, [f.key]: e.target.value })}
              className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-600"
            >
              <option value="">{f.label}: Any</option>
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-600 ml-auto">
            <option value="best">Best match</option>
            <option value="response">Response time</option>
            <option value="rating">Rating</option>
            <option value="distance">Distance</option>
          </select>
        </div>

        <div className="space-y-3">
          {sorted.map((r) => <PartnerCard key={r.slug} partner={cardData(r)} categoryHref={`/marketplace/${category.slug}`} />)}
          {sorted.length === 0 && <p className="text-sm text-gray-400 py-12 text-center">No partners match these filters.</p>}
        </div>
      </main>
    </div>
  );
}
