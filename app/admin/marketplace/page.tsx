import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "./MarketplaceNav";
import { getAllCategories, getAllPartners, getAllListingsAdmin } from "@/lib/marketplace/data";
import { computeProfileFillRate } from "@/lib/marketplace/completeness";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { hasCapability, type MarketplaceRole } from "@/lib/marketplace/permissions";
import { partnerCategoryLabel } from "@/lib/marketplace/partnerScreens";
import { CategoryPublicToggle } from "./CategoryPublicToggle";
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
