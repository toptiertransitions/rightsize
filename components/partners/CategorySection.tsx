"use client";

import type { PartnerCategory } from "@/lib/types";
import type { MatchResult } from "@/lib/partners/types";
import { PartnerCard } from "./PartnerCard";
import { CategoryIcon } from "./categoryIcons";

interface Props {
  category: PartnerCategory;
  matches: MatchResult[];
  selectedPartnerId?: string;
  canEdit: boolean;
  pending: boolean;
  onSelect: (partnerId: string) => void;
  onDeselect: () => void;
  sectionRef: (el: HTMLElement | null) => void;
}

export function CategorySection({ category, matches, selectedPartnerId, canEdit, pending, onSelect, onDeselect, sectionRef }: Props) {
  const slug = category.toLowerCase().replace(/\s+/g, "-");

  return (
    <section id={`partner-category-${slug}`} ref={sectionRef} className="scroll-mt-32 sm:scroll-mt-28">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-8 h-8 rounded-lg bg-forest-50 text-forest-600 flex items-center justify-center flex-shrink-0">
          <CategoryIcon category={category} className="w-4 h-4" />
        </span>
        <h2 className="text-base sm:text-lg font-bold text-gray-900">{category}</h2>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-8 text-center">
          <p className="text-sm text-gray-400">We&rsquo;re curating partners for this category. Check back soon.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {matches.map((m) => (
            <PartnerCard
              key={m.partner.id}
              partner={m.partner}
              isTopMatch={m.rank === 1}
              matchedLocation={m.matchedLocation}
              isSelected={selectedPartnerId === m.partner.id}
              canEdit={canEdit}
              pending={pending}
              onSelect={() => onSelect(m.partner.id)}
              onDeselect={onDeselect}
            />
          ))}
        </div>
      )}
    </section>
  );
}
