// Preferred partners: marketplace partners a TTT Admin tagged for a senior
// community (Tenant Config). For a client tied to that community, matching
// puts them first (when they meet the usual criteria) and labels them.
// Server-only.
//
// A client is tied to a community when its project has the community's
// brand (join link, code, or Tenant Config), when the community is its
// Community partner (referral or destination lock), or when its destination
// community is that community's partner listing.
import "server-only";
import { AIRTABLE_TABLES } from "@/lib/config";
import { getAllBrands } from "@/lib/brands/data";
import type { CommunityBrand } from "@/lib/brands/shared";
import type { Tenant } from "@/lib/types";
import type { PartnerProfile } from "./types";
import { findDestinationCommunityPartner } from "./destinationCommunity";

async function communitySelectionPartnerId(tenantId: string): Promise<string | null> {
  const q = new URLSearchParams({ filterByFormula: `AND({Category} = "Community", {TenantId} = "${tenantId.replace(/"/g, "")}")`, maxRecords: "1" });
  const res = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLES.PARTNER_SELECTIONS)}?${q}`, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rec = ((await res.json()) as { records: Array<{ fields: Record<string, unknown> }> }).records[0];
  return rec ? String(rec.fields.PartnerId ?? "") || null : null;
}

/** Every community this project is tied to. */
export async function getTenantCommunityBrands(
  tenant: Pick<Tenant, "id" | "communityBrandId" | "destinationCommunity" | "destState">,
  community: { communityName: string } | null,
  directory: PartnerProfile[]
): Promise<CommunityBrand[]> {
  const brands = await getAllBrands();
  const out = new Map<string, CommunityBrand>();
  const add = (b?: CommunityBrand) => { if (b) out.set(b.id, b); };

  if (tenant.communityBrandId) add(brands.find((b) => b.id === tenant.communityBrandId));
  const selected = await communitySelectionPartnerId(tenant.id).catch(() => null);
  if (selected) add(brands.find((b) => b.marketplacePartnerId === selected));
  const dest = findDestinationCommunityPartner(tenant, community, directory);
  if (dest) add(brands.find((b) => b.marketplacePartnerId === dest.id));
  return [...out.values()];
}

/** partnerId -> community names that prefer it, across the given communities. */
export function preferredMap(brands: CommunityBrand[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const b of brands) {
    for (const id of b.preferredPartnerIds) map.set(id, [...(map.get(id) ?? []), b.displayName]);
  }
  return map;
}
