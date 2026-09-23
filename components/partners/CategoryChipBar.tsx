"use client";

import type { PartnerCategory } from "@/lib/types";

interface Props {
  categories: readonly PartnerCategory[];
  activeCategory: PartnerCategory;
  selections: Partial<Record<PartnerCategory, string>>;
  onChipClick: (category: PartnerCategory) => void;
}

export function CategoryChipBar({ categories, activeCategory, selections, onChipClick }: Props) {
  return (
    <div className="sticky top-[env(safe-area-inset-top,0px)] z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-cream-50/95 backdrop-blur-sm border-b border-gray-100">
      <div
        className="flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {categories.map((cat) => {
          const isActive = cat === activeCategory;
          const isSelected = !!selections[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onChipClick(cat)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                isActive
                  ? "bg-forest-600 text-white border-forest-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-forest-300"
              }`}
            >
              {isSelected && (
                <svg className={`w-3 h-3 ${isActive ? "text-white" : "text-forest-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {cat}
            </button>
          );
        })}
      </div>
    </div>
  );
}
