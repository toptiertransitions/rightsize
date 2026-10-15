import type { PartnerCategory } from "@/lib/types";

// Senior communities are where the client lives, not a vendor they hired.
export function isReviewableCategory(category: PartnerCategory): boolean {
  return category !== "Community";
}

export interface PartnerReviewSummary {
  /** Raw (unweighted) average of Published reviews, 1 decimal; 0 if none. */
  avg: number;
  count: number;
  hiddenCount: number;
}

// Admin view of a partner's reviews. Reviews are keyed by the marketplace
// Partner id, or by the legacy LocalVendor id on older rows — `resolveId`
// maps either to the marketplace Partner id. Clients see a confidence-
// weighted average instead (lib/marketplace/legacyAdapter.ts), which pulls
// a partner with few reviews toward the network-wide mean.
export function summarizeReviewsByPartner(
  reviews: readonly { partnerId: string; score: number; status: string }[],
  resolveId: (reviewPartnerId: string) => string | undefined
): Map<string, PartnerReviewSummary> {
  const sums = new Map<string, { total: number; count: number; hiddenCount: number }>();
  for (const r of reviews) {
    const id = resolveId(r.partnerId);
    if (!id || !r.score) continue;
    const s = sums.get(id) ?? { total: 0, count: 0, hiddenCount: 0 };
    if (r.status === "Hidden") s.hiddenCount++;
    else { s.total += r.score; s.count++; }
    sums.set(id, s);
  }
  return new Map([...sums].map(([id, s]) => [id, {
    avg: s.count ? Math.round((s.total / s.count) * 10) / 10 : 0,
    count: s.count,
    hiddenCount: s.hiddenCount,
  }]));
}

// reviewPartnerId (marketplace or legacy LocalVendor id) -> marketplace Partner id
export function partnerIdResolver(partners: readonly { id: string; localVendorId?: string }[]): (id: string) => string | undefined {
  const map = new Map<string, string>();
  for (const p of partners) {
    map.set(p.id, p.id);
    if (p.localVendorId && !map.has(p.localVendorId)) map.set(p.localVendorId, p.id);
  }
  return (id) => map.get(id);
}
