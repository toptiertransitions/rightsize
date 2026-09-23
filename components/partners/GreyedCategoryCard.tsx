"use client";

import type { PartnerCategory } from "@/lib/types";
import { CategoryIcon } from "./categoryIcons";

interface Props {
  category: PartnerCategory;
  label: string;
  onActivate: () => void;
  pending: boolean;
}

// Not-yet-selected category for a NonTTTClient user. Deliberately not using
// the disabled attribute or pointer-events-none on the card itself — only
// the icon/label group is faded; the reactivation CTA stays fully legible
// and interactive, since it's the one thing on this card meant to be used.
export function GreyedCategoryCard({ category, label, onActivate, pending }: Props) {
  return (
    <section aria-disabled="true" className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
      <div className="flex items-center gap-2.5 mb-4 opacity-50">
        <span className="w-8 h-8 rounded-lg bg-gray-200 text-gray-400 flex items-center justify-center flex-shrink-0">
          <CategoryIcon category={category} className="w-4 h-4" />
        </span>
        <h2 className="text-base sm:text-lg font-bold text-gray-500">{label}</h2>
      </div>
      <button
        type="button"
        onClick={onActivate}
        disabled={pending}
        aria-label={`${label}, not selected. Actually, I want help with this.`}
        className="min-h-[48px] px-4 rounded-xl border border-forest-300 text-sm font-semibold text-forest-700 bg-white hover:bg-forest-50 hover:border-forest-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500"
      >
        {pending ? "Adding…" : "Actually, I want help with this."}
      </button>
    </section>
  );
}
