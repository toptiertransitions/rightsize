"use client";

import type { PartnerProfile } from "@/lib/partners/types";
import { PartnerLogo } from "./PartnerLogo";
import { RatingStars } from "./RatingStars";

function cleanDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").replace(/\/$/, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  }
}

interface Props {
  partner: PartnerProfile;
  isTopMatch?: boolean;
  matchedLocation: "area" | "nearby";
  isSelected: boolean;
  canEdit: boolean;
  pending?: boolean;
  onSelect: () => void;
  onDeselect: () => void;
}

export function PartnerCard({ partner, isTopMatch, matchedLocation, isSelected, canEdit, pending, onSelect, onDeselect }: Props) {
  return (
    <div
      className={`relative flex gap-4 rounded-2xl border p-4 sm:p-5 bg-white transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:active:scale-[0.99] ${
        isSelected ? "border-forest-400 ring-1 ring-forest-300 shadow-sm" : "border-gray-200 shadow-sm"
      }`}
    >
      {isTopMatch && (
        <span className="absolute -top-2 left-4 text-[10px] font-bold uppercase tracking-wide bg-forest-600 text-white px-2 py-0.5 rounded-full shadow-sm">
          Top Match
        </span>
      )}

      <PartnerLogo logo={partner.logo} name={partner.vendorName} />

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug line-clamp-2">
            {partner.vendorName}
          </h3>
          {matchedLocation === "nearby" && (
            <span className="text-[11px] text-amber-600 font-medium">Serves nearby</span>
          )}
        </div>

        <RatingStars rating={partner.avgRating} reviewCount={partner.reviewCount} />

        {partner.projectsCompleted > 0 && (
          <p className="text-xs text-gray-500">
            {partner.projectsCompleted} project{partner.projectsCompleted !== 1 ? "s" : ""} with Top Tier
          </p>
        )}

        <div className="flex items-center justify-between gap-3 mt-1">
          {partner.website ? (
            <a
              href={partner.website.startsWith("http") ? partner.website : `https://${partner.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-forest-600 hover:text-forest-800 hover:underline truncate min-h-[44px] sm:min-h-0 flex items-center"
            >
              {cleanDomain(partner.website)}
            </a>
          ) : <span />}

          <button
            type="button"
            aria-pressed={isSelected}
            disabled={!canEdit || pending}
            onClick={isSelected ? onDeselect : onSelect}
            className={`flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500 disabled:opacity-50 disabled:cursor-not-allowed ${
              isSelected
                ? "bg-forest-50 text-forest-700 border border-forest-300"
                : "bg-forest-600 text-white hover:bg-forest-700"
            }`}
          >
            {pending ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : isSelected ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Selected
              </>
            ) : (
              "Select"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
