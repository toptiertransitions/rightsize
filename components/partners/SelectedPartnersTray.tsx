"use client";

import type { PartnerCategory } from "@/lib/types";
import type { PartnerProfile } from "@/lib/partners/types";
import { PartnerLogo } from "./PartnerLogo";
import { EmptySlot } from "./EmptySlot";
import { PartnerFilesSection } from "./PartnerFilesSection";

interface Props {
  categories: readonly PartnerCategory[];
  selectedPartners: Partial<Record<PartnerCategory, PartnerProfile>>;
  onEmptyClick: (category: PartnerCategory) => void;
  onChangeClick: (category: PartnerCategory) => void;
  /** File management renders inline, right in this tray — only the
   * TTT-managed flow has a real tenantId/partner-selection concept to hang
   * it off; omitted (default false) in the NonTTTClient flow. */
  filesEnabled?: boolean;
  tenantId?: string;
}

export function SelectedPartnersTray({ categories, selectedPartners, onEmptyClick, onChangeClick, filesEnabled, tenantId }: Props) {
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

              {(partner.phone || partner.email) && (
                <div className="flex flex-col gap-1">
                  {partner.phone && (
                    <a
                      href={`tel:${partner.phone.replace(/[^\d+]/g, "")}`}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-forest-600 min-h-[20px] truncate"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="truncate">{partner.phone}</span>
                    </a>
                  )}
                  {partner.email && (
                    <a
                      href={`mailto:${partner.email}`}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-forest-600 min-h-[20px] truncate"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate">{partner.email}</span>
                    </a>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-400 mt-auto">Selected</p>

              <button
                type="button"
                onClick={() => onChangeClick(category)}
                className="self-start text-[11px] font-medium text-forest-600 hover:text-forest-800 hover:underline min-h-[28px] flex items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500 rounded"
              >
                Change
              </button>

              {filesEnabled && tenantId && <PartnerFilesSection tenantId={tenantId} partnerId={partner.id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
