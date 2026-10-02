"use client";

import { nonTTTCategoryLabel } from "@/lib/partners/nonTTTCategories";
import { CategoryIcon } from "./categoryIcons";

interface Props {
  tenantName: string;
  selected: boolean;
  selectPending: boolean;
  onTalkToTeam: () => void;
  onDeselect: () => void;
  sectionRef: (el: HTMLElement | null) => void;
}

// Senior Move Manager is never a marketplace match for a self-serve client —
// it's always Top Tier Transitions itself, so there's nothing to choose
// between. But clicking "Talk to our team" does add Top Tier Transitions to
// the Your Team tray above (same PartnerSelections write/select mechanism
// every other partner uses), and it can be removed the same way.
export function TTTMoveManagerCard({ tenantName, selected, selectPending, onTalkToTeam, onDeselect, sectionRef }: Props) {
  const mailtoHref = `mailto:info@toptiertransitions.com?subject=${encodeURIComponent(
    `Move Management Support${tenantName ? ` – ${tenantName}` : ""}`
  )}&body=${encodeURIComponent(
    `Hi Top Tier Transitions team,\n\nI'm interested in talking about full-service move management for my project${tenantName ? ` (${tenantName})` : ""}.\n\nPlease reach out to discuss how you can help!`
  )}`;

  return (
    <section ref={sectionRef} className="scroll-mt-32 sm:scroll-mt-28">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-8 h-8 rounded-lg bg-forest-50 text-forest-600 flex items-center justify-center flex-shrink-0">
          <CategoryIcon category="Move Manager" className="w-4 h-4" />
        </span>
        <h2 className="text-base sm:text-lg font-bold text-gray-900">{nonTTTCategoryLabel("Move Manager")}</h2>
      </div>

      <div className="relative flex gap-4 rounded-2xl border border-forest-200 bg-forest-50/40 p-4 sm:p-5">
        <div className="w-16 h-16 flex-shrink-0 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ttt-icon.png" alt="Top Tier Transitions logo" className="w-full h-full object-contain" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug">Top Tier Transitions</h3>
          <p className="text-sm text-gray-600">
            We&rsquo;ll personally manage your move from start to finish — sorting, packing, donations, and more.
          </p>
          <a
            href={mailtoHref}
            onClick={onTalkToTeam}
            className="mt-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-fit transition-colors bg-forest-600 text-white hover:bg-forest-700"
          >
            Talk to our team
          </a>
          {selected && (
            <button
              type="button"
              onClick={onDeselect}
              disabled={selectPending}
              className="min-h-[36px] -ml-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2 text-forest-700 transition-colors disabled:opacity-50 w-fit"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              On your team
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
