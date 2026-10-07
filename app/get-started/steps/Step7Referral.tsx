"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOW_HEARD_OPTIONS, matchesQuery, type ReferralPartnerOption } from "@/lib/partners/referralShared";
import { getSignupReferralOptions } from "../actions";
import type { WizardData } from "../wizardTypes";

interface Props {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
}

const FOLLOW_UP: Record<string, { label: string; placeholder: string }> = {
  realtor: { label: "What's your realtor's name?", placeholder: "Search or type a name or brokerage…" },
  senior_community: { label: "Which senior community?", placeholder: "Search or type a community name…" },
};

export function Step7Referral({ data, update }: Props) {
  const option = HOW_HEARD_OPTIONS.find(o => o.key === data.howHeard);
  const followUp = option?.category ? FOLLOW_UP[option.key] : undefined;

  const [options, setOptions] = useState<ReferralPartnerOption[] | null>(null);
  const [focused, setFocused] = useState(false);

  // Loaded the first time a follow-up is actually needed — every wizard
  // step is mounted up front, so this avoids fetching for people who never
  // pick Realtor / Senior Community.
  useEffect(() => {
    if (!followUp || options) return;
    getSignupReferralOptions().then(setOptions).catch(() => setOptions([]));
  }, [followUp, options]);

  const results = useMemo(() => {
    if (!option?.category || !options || !data.howHeardDetail.trim()) return [];
    return options
      .filter(o => o.category === option.category && matchesQuery(`${o.name} ${o.city}`, data.howHeardDetail))
      .slice(0, 5);
  }, [options, option?.category, data.howHeardDetail]);

  const picked = data.referralPartnerId ? options?.find(o => o.partnerId === data.referralPartnerId) : undefined;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">How did you hear about us?</h2>
      <p className="text-sm text-gray-500 mb-5">Rightsize and Top Tier Transitions</p>

      <div className="flex flex-col gap-2 mb-5" role="radiogroup">
        {HOW_HEARD_OPTIONS.map(o => {
          const selected = data.howHeard === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => update({ howHeard: o.key, howHeardDetail: selected ? data.howHeardDetail : "", referralPartnerId: selected ? data.referralPartnerId : "" })}
              className={cn(
                "flex items-center justify-between min-h-[52px] px-4 rounded-2xl border text-left text-[15px] font-medium transition-all active:scale-[0.99]",
                selected ? "border-forest-500 bg-forest-50 ring-1 ring-forest-500 text-gray-900" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              )}
            >
              {o.label}
              <span className={cn(
                "w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0",
                selected ? "bg-forest-600 border-forest-600 text-white" : "border-gray-300"
              )}>
                {selected && <Check className="w-3 h-3" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>

      {followUp && (
        <div className="motion-safe:animate-[fadeInScale_0.25s_ease-out]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            {followUp.label} <span className="text-gray-400">· Optional</span>
          </label>

          {picked ? (
            <div className="flex items-center gap-3 h-12 px-4 rounded-xl border border-forest-400 bg-white">
              <Check className="w-4 h-4 text-forest-600 flex-shrink-0" strokeWidth={3} />
              <span className="flex-1 min-w-0 truncate text-base text-gray-900">{picked.name}</span>
              <button
                type="button"
                aria-label="Clear"
                onClick={() => update({ referralPartnerId: "", howHeardDetail: "" })}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={data.howHeardDetail}
                  onChange={e => update({ howHeardDetail: e.target.value, referralPartnerId: "" })}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setTimeout(() => setFocused(false), 150)}
                  placeholder={followUp.placeholder}
                  className="w-full h-12 pl-9 pr-3 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
                />
              </div>
              {focused && results.length > 0 && (
                <div className="mt-2 bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                  {results.map(r => (
                    <button
                      key={r.partnerId}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => update({ referralPartnerId: r.partnerId, howHeardDetail: r.name })}
                      className="w-full text-left px-4 py-3 min-h-[48px] hover:bg-gray-50 transition-colors"
                    >
                      <span className="block text-sm font-medium text-gray-800">{r.name}</span>
                      {r.city && <span className="block text-xs text-gray-400">{r.city}{r.state ? `, ${r.state}` : ""}</span>}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1.5">Not in the list? Just type their name.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function step7Valid(data: WizardData): boolean {
  return !!data.howHeard;
}
