"use client";

import type { PartnerCategory } from "@/lib/types";
import { isPartnerRequestComplete } from "@/lib/partners/questions";
import { nonTTTCategoryLabel } from "@/lib/partners/nonTTTCategories";
import { CategoryIcon } from "./categoryIcons";

interface Props {
  category: PartnerCategory;
  answers: Record<string, string | string[]>;
  onOpenFlow: () => void;
  sectionRef: (el: HTMLElement | null) => void;
  canEdit: boolean;
}

// NonTTTClient-only: replaces the static "3 random partners" CategorySection
// for a category once it has a guided matching flow (see lib/partners/questions.ts).
// Phase 2 only ever produces a "draft" PartnerRequest — the actual scoring
// and match results are Phase 3, not built yet, so a completed flow here
// just shows a holding message rather than any real matches.
export function PartnerRequestCard({ category, answers, onOpenFlow, sectionRef, canEdit }: Props) {
  const label = nonTTTCategoryLabel(category);
  const started = Object.keys(answers).length > 0;
  const complete = isPartnerRequestComplete(category, answers);

  return (
    <section id={`partner-category-${category.toLowerCase().replace(/\s+/g, "-")}`} ref={sectionRef} className="scroll-mt-32 sm:scroll-mt-28">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-8 h-8 rounded-lg bg-forest-50 text-forest-600 flex items-center justify-center flex-shrink-0">
          <CategoryIcon category={category} className="w-4 h-4" />
        </span>
        <h2 className="text-base sm:text-lg font-bold text-gray-900">{label}</h2>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        {complete ? (
          <>
            <p className="text-sm font-semibold text-gray-900 mb-1">We&rsquo;re finding your matches</p>
            <p className="text-sm text-gray-500 mb-4">
              We&rsquo;ll let you know as soon as we&rsquo;ve matched you with the right {label.toLowerCase()} partner.
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={onOpenFlow}
                className="min-h-[44px] text-sm font-semibold text-forest-600 hover:text-forest-700 underline underline-offset-2"
              >
                Edit your answers
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">
              {started
                ? "Pick up where you left off — just a couple more questions."
                : `Answer a few quick questions and we'll match you with the right ${label.toLowerCase()} partner.`}
            </p>
            {canEdit ? (
              <button
                type="button"
                onClick={onOpenFlow}
                className="min-h-[48px] px-5 rounded-xl text-sm font-semibold bg-forest-600 text-white hover:bg-forest-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500"
              >
                {started ? "Continue" : "Get matched"}
              </button>
            ) : (
              <p className="text-xs text-gray-400">Ask a project owner to answer these.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
