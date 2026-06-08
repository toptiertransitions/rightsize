"use client";
interface Props { onMapMore: () => void; }
export function OutreachCompleteState({ onMapMore }: Props) {
  return (
    <div className="text-center py-10">
      <div className="w-12 h-12 rounded-full bg-[#2d4a3e]/10 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-[#2d4a3e]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-base font-semibold text-gray-800">Outreach complete for this batch.</p>
      <p className="text-sm text-gray-500 mt-1">All items have been placed or removed.</p>
      <button onClick={onMapMore}
        className="mt-6 text-sm font-medium text-[#2d4a3e] hover:underline underline-offset-2">
        + Map additional items
      </button>
    </div>
  );
}
