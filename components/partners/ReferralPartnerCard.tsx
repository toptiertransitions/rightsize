"use client";

import { useState } from "react";
import type { PartnerProfile } from "@/lib/partners/types";
import { PartnerLogo } from "./PartnerLogo";
import { RatingStars } from "./RatingStars";
import { PartnerFilesSection } from "./PartnerFilesSection";

interface Props {
  tenantId: string;
  partner: PartnerProfile;
  /** Display label for the category ("Senior Community", "Realtor", …). */
  categoryLabel: string;
  canRemove: boolean;
  removing: boolean;
  onRemove: () => void;
  onLearnMore?: () => void;
}

// The one partner shown for a referral-locked category — the partner who
// referred this client. No Select/Change controls; only a TTTAdmin sees the
// remove action, which reopens the marketplace for this category.
export function ReferralPartnerCard({ tenantId, partner, categoryLabel, canRemove, removing, onRemove, onLearnMore }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="relative rounded-2xl border border-forest-200 bg-gradient-to-b from-forest-50/70 to-white p-4 sm:p-5 shadow-sm">
      <span className="absolute -top-2 left-4 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-forest-600 text-white px-2 py-0.5 rounded-full shadow-sm">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Your {categoryLabel}
      </span>

      <div className="flex gap-4">
        <PartnerLogo logo={partner.logo} name={partner.vendorName} />
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug line-clamp-2">{partner.vendorName}</h3>
            {partner.referralContactName && (
              <p className="text-sm text-gray-600 mt-0.5">{partner.referralContactName}</p>
            )}
          </div>

          {partner.reviewCount > 0 && <RatingStars rating={partner.avgRating} reviewCount={partner.reviewCount} />}

          {(partner.phone || partner.email) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {partner.phone && (
                <a href={`tel:${partner.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-sm text-forest-700 hover:text-forest-900 font-medium min-h-[32px]">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {partner.phone}
                </a>
              )}
              {partner.email && (
                <a href={`mailto:${partner.email}`} className="inline-flex items-center gap-1.5 text-sm text-forest-700 hover:text-forest-900 font-medium min-h-[32px] min-w-0">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="truncate">{partner.email}</span>
                </a>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500 leading-relaxed">
            They referred you to Top Tier, so they&rsquo;re your {categoryLabel.toLowerCase()} partner.
          </p>

          {onLearnMore && partner.aboutUs && (
            <button
              type="button"
              onClick={onLearnMore}
              className="self-start text-xs font-medium text-gray-500 hover:text-forest-700 underline underline-offset-2 min-h-[28px] flex items-center"
            >
              Learn more
            </button>
          )}

          <PartnerFilesSection tenantId={tenantId} partnerId={partner.id} />
        </div>
      </div>

      {canRemove && (
        <div className="mt-4 pt-3 border-t border-forest-100">
          {confirming ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
              <p className="text-xs text-gray-600">Remove this referral and reopen the marketplace for {categoryLabel}?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={removing}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={removing}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {removing ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
              Admin: remove referral partner
            </button>
          )}
        </div>
      )}
    </div>
  );
}
