import type { Metadata } from "next";
import Link from "next/link";
import { getAllCategories, getAllListingsAdmin } from "@/lib/marketplace/data";

export const metadata: Metadata = {
  title: "Partner Marketplace | Top Tier Transitions",
  description: "Vetted movers, realtors, financial advisors, estate attorneys, senior communities, and more — matched to your move, by Top Tier Transitions.",
  alternates: { canonical: "/marketplace" },
};

export const revalidate = 300;

export default async function MarketplacePage() {
  const [categories, listings] = await Promise.all([getAllCategories(), getAllListingsAdmin()]);

  const visible = categories
    .map((c) => ({ category: c, liveCount: listings.filter((l) => l.categoryId === c.id && l.status === "Live").length }))
    .filter((c) => c.liveCount >= c.category.minLiveListings)
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder);

  const comingSoon = categories
    .map((c) => ({ category: c, liveCount: listings.filter((l) => l.categoryId === c.id && l.status === "Live").length }))
    .filter((c) => c.liveCount < c.category.minLiveListings)
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Partner Marketplace</h1>
          <p className="text-gray-500 max-w-2xl">
            Every partner here has been vetted by Top Tier Transitions. Browse a category, or tell us what you need and
            we'll point you to the right people.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex items-center mt-5 h-11 px-5 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors"
          >
            Get matched to the right partners
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {visible.map(({ category, liveCount }) => (
            <Link
              key={category.id}
              href={`/marketplace/${category.slug}`}
              className="rounded-2xl border border-gray-100 p-5 hover:border-forest-200 hover:shadow-sm transition-all"
            >
              <h2 className="text-sm font-semibold text-gray-900 mb-1">{category.label}</h2>
              <p className="text-xs text-gray-500 line-clamp-2 mb-2">{category.description}</p>
              <p className="text-[11px] text-gray-400">{liveCount} partner{liveCount !== 1 ? "s" : ""}</p>
            </Link>
          ))}
        </div>

        {comingSoon.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Coming Soon</h2>
            <div className="flex flex-wrap gap-2">
              {comingSoon.map(({ category }) => (
                <span key={category.id} className="text-sm px-3 py-1.5 rounded-full bg-gray-50 text-gray-400 border border-gray-100">
                  {category.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400 max-w-2xl">
            Top Tier Transitions may receive a referral fee from some partners listed here. It never affects which
            partners we recommend or how they're ranked.
          </p>
        </div>
      </main>
    </div>
  );
}
