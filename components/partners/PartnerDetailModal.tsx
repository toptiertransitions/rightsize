"use client";

import { useEffect } from "react";
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

export function PartnerDetailModal({ partner, onClose }: { partner: PartnerProfile; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[85vh] flex flex-col motion-safe:animate-[fadeInScale_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <PartnerLogo logo={partner.logo} name={partner.vendorName} size="mobile" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 leading-snug truncate">{partner.vendorName}</h2>
              {!partner.isTeamLead && <RatingStars rating={partner.avgRating} reviewCount={partner.reviewCount} />}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-6 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">About</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              {partner.aboutUs?.trim() || "We don't have a description for this partner yet."}
            </p>
          </div>

          {partner.website && (
            <a
              href={partner.website.startsWith("http") ? partner.website : `https://${partner.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-forest-600 hover:text-forest-800 hover:underline"
            >
              {cleanDomain(partner.website)}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}

          {partner.recentProjectMonths && partner.recentProjectMonths.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent Project Work</h3>
              <ul className="relative pl-5">
                <div className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-gray-200" aria-hidden="true" />
                {partner.recentProjectMonths.map((month, i) => (
                  <li key={`${month}-${i}`} className="relative pb-4 last:pb-0">
                    <span className="absolute -left-5 top-1 w-2 h-2 rounded-full bg-forest-500" aria-hidden="true" />
                    <span className="text-sm text-gray-700">{month}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
