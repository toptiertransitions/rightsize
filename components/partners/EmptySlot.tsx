"use client";

import type { PartnerCategory } from "@/lib/types";
import { CategoryIcon } from "./categoryIcons";

export function EmptySlot({ category, onClick }: { category: PartnerCategory; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 hover:border-forest-300 hover:bg-forest-50/40 transition-colors min-h-[104px] p-3 text-center"
    >
      <span className="w-9 h-9 rounded-full bg-gray-50 group-hover:bg-white flex items-center justify-center text-gray-300 group-hover:text-forest-500 transition-colors">
        <CategoryIcon category={category} className="w-4.5 h-4.5" />
      </span>
      <span className="text-xs font-medium text-gray-400 group-hover:text-forest-700 leading-tight transition-colors">
        {category}
      </span>
    </button>
  );
}
