import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "./MarketplaceNav";
import { getAllCategories, getAllPartners, getAllListingsAdmin } from "@/lib/marketplace/data";
import { computeProfileFillRate, listingsByCategoryBelowThreshold } from "@/lib/marketplace/completeness";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STALE_DAYS = 90;

function daysAgo(iso: string): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export default async function MarketplaceDashboardPage() {
  const [categories, partners, listings] = await Promise.all([
    getAllCategories(),
    getAllPartners(),
    getAllListingsAdmin(),
  ]);

  const byLifecycle: Record<string, number> = {};
  for (const p of partners) byLifecycle[p.lifecycleStatus] = (byLifecycle[p.lifecycleStatus] ?? 0) + 1;

  const fillRate = computeProfileFillRate(partners.map((p) => ({ logo: p.logo, aboutUs: p.aboutUs })));
  const belowThreshold = listingsByCategoryBelowThreshold(listings, categories);

  const needingReview = partners.filter((p) => p.lifecycleStatus === "Submitted");
  const stalePartners = partners.filter((p) => p.lifecycleStatus === "Live" && daysAgo(p.updatedAt) > STALE_DAYS);

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
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            {(["Prospect", "Invited", "Submitted", "Live", "Paused", "Archived"] as const).map((stage) => (
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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Live Listings vs. Threshold, by Category</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Live</th>
                  <th className="px-4 py-2.5">Total Listings</th>
                  <th className="px-4 py-2.5">Threshold</th>
                  <th className="px-4 py-2.5">Public Status</th>
                </tr>
              </thead>
              <tbody>
                {listingsByCategory.map(({ category, live, total }) => {
                  const belowMin = live < category.minLiveListings;
                  return (
                    <tr key={category.id} className="border-b border-gray-800/60 last:border-0">
                      <td className="px-4 py-2.5 text-gray-200">{category.label}</td>
                      <td className="px-4 py-2.5 text-gray-300 tabular-nums">{live}</td>
                      <td className="px-4 py-2.5 text-gray-400 tabular-nums">{total}</td>
                      <td className="px-4 py-2.5 text-gray-400 tabular-nums">{category.minLiveListings}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${belowMin ? "bg-amber-900/40 text-amber-300" : "bg-green-900/40 text-green-300"}`}>
                          {belowMin ? "Coming soon" : "Visible"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {belowThreshold.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">{belowThreshold.length} of {categories.length} categories are below their visibility threshold and show as "Coming soon" publicly.</p>
          )}
        </section>

        {/* Needing review */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Partners Needing Review ({needingReview.length})</h2>
          {needingReview.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing in Submitted status.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800/60">
              {needingReview.map((p) => (
                <Link key={p.id} href={`/admin/marketplace/partners/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors">
                  <span className="text-sm text-gray-200">{p.companyName}</span>
                  <span className="text-xs text-gray-500">Submitted</span>
                </Link>
              ))}
            </div>
          )}
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
