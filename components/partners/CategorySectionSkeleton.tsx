// Matches CategorySection's card layout exactly — used by
// app/(protected)/partners/loading.tsx during navigation, so nothing shifts
// once the real, server-fetched content replaces it.
export function CategorySectionSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-8 h-8 rounded-lg bg-gray-100" />
        <div className="h-5 w-28 rounded bg-gray-100" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4 rounded-2xl border border-gray-100 p-4 sm:p-5 bg-white">
          <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-xl bg-gray-100 flex-shrink-0" />
          <div className="flex-1 space-y-2.5 py-1">
            <div className="h-4 w-1/2 bg-gray-100 rounded" />
            <div className="h-3 w-1/3 bg-gray-100 rounded" />
            <div className="h-3 w-1/4 bg-gray-100 rounded" />
            <div className="h-9 w-24 bg-gray-100 rounded-xl mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
