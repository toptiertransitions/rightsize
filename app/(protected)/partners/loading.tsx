import { PARTNER_CATEGORIES } from "@/lib/types";
import { CategorySectionSkeleton } from "@/components/partners/CategorySectionSkeleton";

// Matches PartnersPageClient's structure so nothing shifts once the real
// (server-fetched) content replaces it.
export default function PartnersLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-10 pt-[max(20px,env(safe-area-inset-top))] animate-pulse">
      <div className="mb-6">
        <div className="h-8 w-40 bg-gray-100 rounded mb-2" />
        <div className="h-4 w-72 max-w-full bg-gray-100 rounded" />
      </div>

      <div className="mb-8">
        <div className="h-4 w-28 bg-gray-100 rounded mb-2" />
        <div className="h-1.5 rounded-full bg-gray-100 mb-5" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {PARTNER_CATEGORIES.map((c) => (
            <div key={c} className="rounded-2xl border-2 border-dashed border-gray-100 min-h-[104px]" />
          ))}
        </div>
      </div>

      <div className="h-11 rounded-full bg-gray-100 mb-8" />

      <div className="space-y-10">
        {PARTNER_CATEGORIES.map((c) => <CategorySectionSkeleton key={c} />)}
      </div>
    </div>
  );
}
