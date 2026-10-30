import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "./MarketplaceNav";
import { getAllCategories, getAllPartners, getAllListingsAdmin } from "@/lib/marketplace/data";
import { computeProfileFillRate } from "@/lib/marketplace/completeness";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { hasCapability, type MarketplaceRole } from "@/lib/marketplace/permissions";
import { partnerCategoryLabel } from "@/lib/marketplace/partnerScreens";
import { CategoryPublicToggle } from "./CategoryPublicToggle";
import { PartnerReviewClient, type ReviewRow } from "./PartnerReviewClient";
import { MARKETPLACE_LIFECYCLE_STATUSES } from "@/lib/marketplace/types";
import { isTTTAdmin } from "@/lib/config";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STALE_DAYS = 90;

function daysAgo(iso: string): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export default async function MarketplaceDashboardPage() {
  const { userId } = await auth();
  const [categories, partners, listings, role] = await Promise.all([
    getAllCategories(),
    getAllPartners(),
    getAllListingsAdmin(),
    userId ? getSystemRole(userId).catch(() => null) : Promise.resolve(null),
  ]);
  const canToggle = hasCapability(role as MarketplaceRole, "editCategories");

  const byLifecycle: Record<string, number> = {};
  for (const p of partners) byLifecycle[p.lifecycleStatus] = (byLifecycle[p.lifecycleStatus] ?? 0) + 1;

  const fillRate = computeProfileFillRate(partners.map((p) => ({ logo: p.logo, aboutUs: p.aboutUs })));

  const categoryLabel = new Map(categories.map((c) => [c.id, partnerCategoryLabel(c.label)]));
  const reviewRows: ReviewRow[] = partners
    .map((p) => ({
      id: p.id,
      companyName: p.companyName,
      pocName: p.pocName,
      email: p.email,
      categories: listings.filter((l) => l.partnerId === p.id).map((l) => categoryLabel.get(l.categoryId) ?? "").filter(Boolean),
      status: p.lifecycleStatus,
      updatedAt: p.updatedAt,
      reviewedAt: p.reviewedAt,
      reviewedBy: p.reviewedBy,
    }))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const canReview = role === "TTTAdmin" || (!!userId && isTTTAdmin(userId));
  const stalePartners = partners.filter((p) => p.lifecycleStatus === "Live" && daysAgo(p.updatedAt) > STALE_DAYS);

  // A category a live partner added later, submitted on its own. First-time
  // submissions (partner itself Submitted) stay in Partner Review below.
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const newCategoryRows = listings
    .filter((l) => l.status === "Submitted" && ["Live", "Paused"].includes(partnerById.get(l.partnerId)?.lifecycleStatus ?? ""))
    .map((l) => ({ listing: l, partner: partnerById.get(l.partnerId)!, label: categoryLabel.get(l.categoryId) ?? "Category" }))
    .sort((a, b) => (b.listing.updatedAt || "").localeCompare(a.listing.updatedAt || ""));

  const listingsByCategory = categories.map((c) => ({
    category: c,
    live: listings.filter((l) => l.categoryId === c.id && l.status === "Live").length,
    total: listings.filter((l) => l.categoryId === c.id).length,
  }));

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />

      <main className="max-w-7xl mx-auto px-6 pb-12 space-y-8">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Marketplace Dashboard</h1>
          <p className="text-sm text-gray-500">{partners.length} partners · {listings.length} listings across {categories.length} categories</p>
        </div>

        {/* Lifecycle counts */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Partners by Lifecycle Stage</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {MARKETPLACE_LIFECYCLE_STATUSES.map((stage) => (
              <div key={stage} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-2xl font-bold text-white">{byLifecycle[stage] ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stage}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Fill rates */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Profile Fill Rates</h2>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{fillRate.logoPercent}%</p>
              <p className="text-xs text-gray-500 mt-0.5">Have a logo</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{fillRate.aboutUsPercent}%</p>
              <p className="text-xs text-gray-500 mt-0.5">Have an About Us</p>
            </div>
          </div>
        </section>

        {/* Live vs threshold per category */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Categories: Live Listings and Public Status</h2>
          <p className="text-xs text-gray-500 mb-3">
            Public turns a category on for clients (their Rightsize Partners page and the public marketplace). Within a public category, matching (zip codes, services, and the rest) decides which partners a client sees.
            {!canToggle && " Only TTT Admins can change this."}
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Live</th>
                  <th className="px-4 py-2.5">Total Listings</th>
                  <th className="px-4 py-2.5">Public</th>
                </tr>
              </thead>
              <tbody>
                {listingsByCategory.map(({ category, live, total }) => (
                  <tr key={category.id} className="border-b border-gray-800/60 last:border-0">
                    <td className="px-4 py-2.5 text-gray-200">{partnerCategoryLabel(category.label)}</td>
                    <td className="px-4 py-2.5 text-gray-300 tabular-nums">{live}</td>
                    <td className="px-4 py-2.5 text-gray-400 tabular-nums">{total}</td>
                    <td className="px-4 py-2.5">
                      <CategoryPublicToggle categoryId={category.id} label={partnerCategoryLabel(category.label)} initial={category.publicVisible} canEdit={canToggle} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* New categories from partners who are already live */}
        {newCategoryRows.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">New Categories Awaiting Approval</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800/60">
              {newCategoryRows.map(({ listing, partner, label }) => (
                <Link key={listing.id} href={`/admin/marketplace/partners/${partner.id}?tab=listings`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-800/40 transition-colors">
                  <span className="text-sm text-gray-200">
                    {partner.companyName}
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300">{label}</span>
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">Review and move to Live →</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Partner review: Submitted by default, filter any statuses */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Partner Review</h2>
          <PartnerReviewClient rows={reviewRows} canReview={canReview} />
        </section>

        {/* Stale profiles */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Stale Live Profiles (no update in {STALE_DAYS}+ days)</h2>
          {stalePartners.length === 0 ? (
            <p className="text-sm text-gray-500">None.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800/60">
              {stalePartners.map((p) => (
                <Link key={p.id} href={`/admin/marketplace/partners/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors">
                  <span className="text-sm text-gray-200">{p.companyName}</span>
                  <span className="text-xs text-gray-500">{daysAgo(p.updatedAt)} days</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
