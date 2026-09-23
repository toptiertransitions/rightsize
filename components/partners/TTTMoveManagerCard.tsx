"use client";

import { nonTTTCategoryLabel } from "@/lib/partners/nonTTTCategories";
import { CategoryIcon } from "./categoryIcons";

interface Props {
  tenantName: string;
}

// Senior Move Manager is never a marketplace match for a self-serve client —
// it's always Top Tier Transitions itself. No questions, no alternates, no
// PartnerSelections write (there's nothing to choose between).
export function TTTMoveManagerCard({ tenantName }: Props) {
  const mailtoHref = `mailto:info@toptiertransitions.com?subject=${encodeURIComponent(
    `Move Management Support${tenantName ? ` – ${tenantName}` : ""}`
  )}&body=${encodeURIComponent(
    `Hi Top Tier Transitions team,\n\nI'm interested in talking about full-service move management for my project${tenantName ? ` (${tenantName})` : ""}.\n\nPlease reach out to discuss how you can help!`
  )}`;

  return (
    <section className="scroll-mt-32 sm:scroll-mt-28">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-8 h-8 rounded-lg bg-forest-50 text-forest-600 flex items-center justify-center flex-shrink-0">
          <CategoryIcon category="Move Manager" className="w-4 h-4" />
        </span>
        <h2 className="text-base sm:text-lg font-bold text-gray-900">{nonTTTCategoryLabel("Move Manager")}</h2>
      </div>

      <div className="relative flex gap-4 rounded-2xl border border-forest-200 bg-forest-50/40 p-4 sm:p-5">
        <div className="w-16 h-16 flex-shrink-0 rounded-xl bg-forest-600 text-white flex items-center justify-center font-bold text-lg">
          TTT
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug">Top Tier Transitions</h3>
          <p className="text-sm text-gray-600">
            We&rsquo;ll personally manage your move from start to finish — sorting, packing, donations, and more.
          </p>
          <a
            href={mailtoHref}
            className="mt-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-fit transition-colors bg-forest-600 text-white hover:bg-forest-700"
          >
            Talk to our team
          </a>
        </div>
      </div>
    </section>
  );
}
