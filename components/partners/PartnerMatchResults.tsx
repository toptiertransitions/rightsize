"use client";

import { useState } from "react";
import type { ScoredMatch, ScoringResult } from "@/lib/partners/scoring";
import { MAX_INTRO_REQUESTS_PER_CATEGORY } from "@/lib/partners/scoring";
import { communityCompletionLabel } from "@/lib/partners/copy";
import { PartnerLogo } from "./PartnerLogo";
import { RatingStars } from "./RatingStars";

interface Props {
  result: ScoringResult;
  requestedPartnerIds: string[];
  canEdit: boolean;
  pendingPartnerId: string | null;
  onRequestIntro: (partnerId: string, disclosureAcknowledged: boolean) => void;
  selectedPartnerId?: string;
  pendingSelect: boolean;
  onSelect: (partnerId: string) => void;
  onDeselect: () => void;
  onLearnMore?: (partnerId: string) => void;
}

// The pill, not a question: shows the client which of their 1-2 local
// options plus a virtual option (see scoring.ts's composition rule) each
// actually is, without ever asking them to pre-filter on it.
function DeliveryPill({ match }: { match: ScoredMatch }) {
  if (match.matchedLocation === "virtual") {
    return <span className="inline-flex items-center text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">Virtual</span>;
  }
  if (match.partner.deliveryMode === "Both") {
    return <span className="inline-flex items-center text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">Local + Virtual</span>;
  }
  return null;
}

function MatchCard({
  match,
  featured,
  requested,
  atCap,
  canEdit,
  pending,
  onRequestIntro,
  isSelected,
  selectPending,
  onSelect,
  onDeselect,
  onLearnMore,
}: {
  match: ScoredMatch;
  featured: boolean;
  requested: boolean;
  atCap: boolean;
  canEdit: boolean;
  pending: boolean;
  onRequestIntro: (partnerId: string, disclosureAcknowledged: boolean) => void;
  isSelected: boolean;
  selectPending: boolean;
  onSelect: (partnerId: string) => void;
  onDeselect: () => void;
  onLearnMore?: (partnerId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const { partner } = match;
  const needsAcknowledgment = Boolean(partner.hasReferralDisclosure);

  return (
    <div
      className={`relative flex gap-4 rounded-2xl border p-4 sm:p-5 bg-white ${
        featured ? "border-forest-300 ring-1 ring-forest-200 shadow-sm" : "border-gray-200"
      }`}
    >
      <PartnerLogo logo={partner.logo} name={partner.vendorName} />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {featured && <p className="text-xs font-semibold text-forest-600 uppercase tracking-wide">Best match</p>}
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug">{partner.vendorName}</h3>
          <DeliveryPill match={match} />
        </div>
        {partner.reviewCount > 0 && <RatingStars rating={partner.avgRating} reviewCount={partner.reviewCount} />}
        <p className="text-sm text-gray-600 leading-relaxed">{match.whyThisMatch}</p>

        {onLearnMore && (
          <button
            type="button"
            onClick={() => onLearnMore(partner.id)}
            className="self-start text-xs font-medium text-gray-500 hover:text-forest-700 underline underline-offset-2 min-h-[28px] flex items-center"
          >
            Learn more
          </button>
        )}

        {!!partner.communityCompletionCount && partner.communityName && (
          <p className="text-xs font-medium text-forest-700">
            {communityCompletionLabel(partner.category, partner.communityCompletionCount, partner.communityName)}
          </p>
        )}

        {requested ? (
          <p className="mt-1 text-sm font-medium text-forest-600 inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Intro requested
          </p>
        ) : canEdit && !confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={atCap || pending}
            className="mt-1 min-h-[44px] px-4 rounded-xl text-sm font-semibold w-fit transition-colors bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500"
          >
            Request intro
          </button>
        ) : canEdit && confirming ? (
          <div className="mt-1 rounded-xl bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs text-gray-600 mb-2.5 leading-relaxed">
              We&rsquo;ll share your answers and contact info with {partner.vendorName} so they can reach out.
            </p>
            {!!partner.seniorCreditAmount && (
              <p className="text-xs font-medium text-forest-700 mb-2.5 leading-relaxed">
                Because you were referred through Top Tier, you&rsquo;ll receive a ${partner.seniorCreditAmount.toFixed(2)} credit toward move management services.
              </p>
            )}
            {needsAcknowledgment && (
              <label className="flex items-start gap-2 text-xs text-gray-500 mb-2.5 leading-relaxed">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                <span>{partner.disclosureText || "Top Tier Transitions may receive a referral fee from this partner. It does not affect our recommendation."}</span>
              </label>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onRequestIntro(partner.id, acknowledged)}
                disabled={pending || (needsAcknowledgment && !acknowledged)}
                className="min-h-[40px] px-3.5 rounded-lg text-sm font-semibold bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-50"
              >
                {pending ? "Requesting…" : "Yes, request intro"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="min-h-[40px] px-3.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {canEdit && (
          <div className="pt-2 mt-0.5 border-t border-gray-100">
            <button
              type="button"
              onClick={() => (isSelected ? onDeselect() : onSelect(partner.id))}
              disabled={selectPending}
              className={`min-h-[36px] -ml-2 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2 transition-colors disabled:opacity-50 ${
                isSelected ? "text-forest-700" : "text-gray-400 hover:text-forest-700"
              }`}
            >
              {isSelected ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  On your team
                </>
              ) : (
                "Choose this partner"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PartnerMatchResults({ result, requestedPartnerIds, canEdit, pendingPartnerId, onRequestIntro, selectedPartnerId, pendingSelect, onSelect, onDeselect, onLearnMore }: Props) {
  const remaining = Math.max(0, MAX_INTRO_REQUESTS_PER_CATEGORY - requestedPartnerIds.length);
  const atCap = remaining <= 0;

  if (!result.best) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-semibold text-gray-900 mb-1">We&rsquo;re still looking</p>
        <p className="text-sm text-gray-500">
          We don&rsquo;t have a partner in your area for this yet — we&rsquo;ll reach out as soon as we do.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <MatchCard
        match={result.best}
        featured
        requested={requestedPartnerIds.includes(result.best.partner.id)}
        atCap={atCap}
        canEdit={canEdit}
        pending={pendingPartnerId === result.best.partner.id}
        onRequestIntro={onRequestIntro}
        isSelected={selectedPartnerId === result.best.partner.id}
        selectPending={pendingSelect}
        onSelect={onSelect}
        onDeselect={onDeselect}
        onLearnMore={onLearnMore}
      />
      {result.alternates.map((m) => (
        <MatchCard
          key={m.partner.id}
          match={m}
          featured={false}
          requested={requestedPartnerIds.includes(m.partner.id)}
          atCap={atCap}
          canEdit={canEdit}
          pending={pendingPartnerId === m.partner.id}
          onRequestIntro={onRequestIntro}
          isSelected={selectedPartnerId === m.partner.id}
          selectPending={pendingSelect}
          onSelect={onSelect}
          onDeselect={onDeselect}
          onLearnMore={onLearnMore}
        />
      ))}
      {atCap && (
        <p className="text-xs text-gray-400 px-1">
          You&rsquo;ve requested intros for the maximum of {MAX_INTRO_REQUESTS_PER_CATEGORY} partners in this category.
        </p>
      )}
    </div>
  );
}
