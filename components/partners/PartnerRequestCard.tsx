"use client";

import type { PartnerCategory } from "@/lib/types";
import type { ScoringResult } from "@/lib/partners/scoring";
import { isPartnerRequestComplete } from "@/lib/partners/questions";
import { nonTTTCategoryLabel } from "@/lib/partners/nonTTTCategories";
import { CategoryIcon } from "./categoryIcons";
import { PartnerMatchResults } from "./PartnerMatchResults";

interface Props {
  category: PartnerCategory;
  answers: Record<string, string | string[]>;
  onOpenFlow: () => void;
  sectionRef: (el: HTMLElement | null) => void;
  canEdit: boolean;
  matchResult?: ScoringResult;
  requestedPartnerIds: string[];
  pendingPartnerId: string | null;
  onRequestIntro: (partnerId: string) => void;
}

// NonTTTClient-only: replaces the static "3 random partners" CategorySection
// for a category once it has a guided matching flow (see lib/partners/questions.ts).
// Once the flow is complete, `matchResult` (computed server-side in page.tsx
// via lib/partners/scoring.ts) drives real match results instead of a
// holding message.
export function PartnerRequestCard({
  category, answers, onOpenFlow, sectionRef, canEdit, matchResult, requestedPartnerIds, pendingPartnerId, onRequestIntro,
}: Props) {
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

      {complete && matchResult ? (
        <div className="flex flex-col gap-3">
          <PartnerMatchResults
            result={matchResult}
            requestedPartnerIds={requestedPartnerIds}
            canEdit={canEdit}
            pendingPartnerId={pendingPartnerId}
            onRequestIntro={onRequestIntro}
          />
          {canEdit && (
            <button
              type="button"
              onClick={onOpenFlow}
              className="min-h-[44px] w-fit text-sm font-semibold text-forest-600 hover:text-forest-700 underline underline-offset-2"
            >
              Edit your answers
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          {complete ? (
            <>
              <div className="flex items-start gap-3.5 mb-4">
                <span className="relative flex-shrink-0 w-10 h-10 rounded-full bg-forest-50 flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-forest-200/60 motion-safe:animate-ping" />
                  <svg className="relative w-5 h-5 text-forest-600 motion-safe:animate-spin" style={{ animationDuration: "1.4s" }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Finding your best match&hellip;</p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    We&rsquo;re comparing trusted {label.toLowerCase()} partners near you — this only takes a moment.
                  </p>
                </div>
              </div>
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
      )}
    </section>
  );
}
