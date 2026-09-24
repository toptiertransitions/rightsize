"use client";

import type { PartnerCategory } from "@/lib/types";
import type { PartnerProfile } from "@/lib/partners/types";
import { PartnerLogo } from "./PartnerLogo";
import { EmptySlot } from "./EmptySlot";

interface Props {
  categories: readonly PartnerCategory[];
  selectedPartners: Partial<Record<PartnerCategory, PartnerProfile>>;
  onEmptyClick: (category: PartnerCategory) => void;
  onChangeClick: (category: PartnerCategory) => void;
  /** Only the TTT-managed flow has a real file-management UI to jump to
   * (on the selected PartnerCard below) — omitted (default false) in the
   * NonTTTClient flow, which has no "selected partner" card to land on. */
  filesEnabled?: boolean;
  onFilesClick?: (category: PartnerCategory) => void;
}

export function SelectedPartnersTray({ categories, selectedPartners, onEmptyClick, onChangeClick, filesEnabled, onFilesClick }: Props) {
  const filledCount = categories.filter((c) => selectedPartners[c]).length;
  const total = categories.length;
  const pct = Math.round((filledCount / total) * 100);
  const isComplete = filledCount === total;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-700">
          {filledCount} of {total} selected
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-5">
        <div
          className="h-full rounded-full bg-forest-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      {isComplete && (
        <div className="mb-5 rounded-2xl border border-forest-200 bg-forest-50 px-4 py-3 flex items-center gap-3 motion-safe:animate-[fadeInScale_0.4s_ease-out]">
          <span className="w-8 h-8 rounded-full bg-forest-600 text-white flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <p className="text-sm font-semibold text-forest-800">Your team is set.</p>
        </div>
      )}

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((category) => {
          const partner = selectedPartners[category];
          if (!partner) {
            return <EmptySlot key={category} category={category} onClick={() => onEmptyClick(category)} />;
          }
          return (
            <div
              key={category}
              className="min-w-0 h-full flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-forest-200 hover:-translate-y-0.5 transition-all duration-150 motion-reduce:transition-none motion-reduce:transform-none motion-safe:animate-[fadeInScale_0.25s_ease-out]"
            >
              <div className="flex items-start justify-between gap-2 min-w-0">
                <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {category}
                </span>
                <PartnerLogo logo={partner.logo} name={partner.vendorName} size="tray" />
              </div>

              <p
                className="min-h-[2.5rem] text-[15px] font-semibold text-gray-900 leading-snug [text-wrap:balance] line-clamp-2 break-words"
                title={partner.vendorName}
              >
                {partner.vendorName}
              </p>

              <p className="text-xs text-gray-400 mt-auto">Selected</p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onChangeClick(category)}
                  className="self-start text-[11px] font-medium text-forest-600 hover:text-forest-800 hover:underline min-h-[28px] flex items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500 rounded"
                >
                  Change
                </button>
                {filesEnabled && (
                  <button
                    type="button"
                    onClick={() => (onFilesClick ?? onChangeClick)(category)}
                    className="self-start text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:underline min-h-[28px] flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500 rounded"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    Files
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
