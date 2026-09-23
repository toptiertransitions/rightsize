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
}

export function SelectedPartnersTray({ categories, selectedPartners, onEmptyClick, onChangeClick }: Props) {
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {categories.map((category) => {
          const partner = selectedPartners[category];
          if (!partner) {
            return <EmptySlot key={category} category={category} onClick={() => onEmptyClick(category)} />;
          }
          return (
            <div
              key={category}
              className="flex flex-col items-center gap-2 rounded-2xl border border-forest-200 bg-white p-3 text-center motion-safe:animate-[fadeInScale_0.25s_ease-out]"
            >
              <PartnerLogo logo={partner.logo} name={partner.vendorName} size="mobile" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate max-w-[100px]">{partner.vendorName}</p>
                <p className="text-[10px] text-gray-400">{category}</p>
              </div>
              <button
                type="button"
                onClick={() => onChangeClick(category)}
                className="text-[11px] font-medium text-forest-600 hover:text-forest-800 hover:underline"
              >
                Change
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
