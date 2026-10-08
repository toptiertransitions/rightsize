"use client";

import { useState, useEffect, useRef } from "react";
import { House, Building2, Building, MoreHorizontal, Search, Check } from "lucide-react";
import { Tile } from "@/components/onboarding/shared";
import { cn } from "@/lib/utils";
import type { WizardData } from "../wizardTypes";
import type { DestinationType } from "@/lib/types";

const OPTIONS: { key: DestinationType; label: string; icon: React.ReactNode }[] = [
  { key: "house", label: "House", icon: <House className="w-[18px] h-[18px]" /> },
  { key: "condo", label: "Condo / Apartment", icon: <Building2 className="w-[18px] h-[18px]" /> },
  { key: "senior_community", label: "Senior Community", icon: <Building className="w-[18px] h-[18px]" /> },
  { key: "other", label: "Other", icon: <MoreHorizontal className="w-[18px] h-[18px]" /> },
];

interface Props {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
}

// Clears the community-referral answer (and the step-7 answer it filled in)
// whenever the picked community changes.
function resetReferral(data: WizardData): Partial<WizardData> {
  if (data.communityReferred === null) return {};
  return data.communityReferred
    ? { communityReferred: null, howHeard: "", howHeardDetail: "", referralPartnerId: "" }
    : { communityReferred: null };
}

export function Step4Destination({ data, update }: Props) {
  const [query, setQuery] = useState(data.destinationCommunityName);
  const [results, setResults] = useState<Array<{ id: string; name: string; city: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [notListed, setNotListed] = useState(!!data.destinationCommunityOther);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data.destinationType !== "senior_community" || notListed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/onboarding/senior-communities?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setResults(json.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, data.destinationType, notListed]);

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-5">Where are you moving?</h2>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {OPTIONS.map(opt => (
          <Tile
            key={opt.key}
            label={opt.label}
            icon={opt.icon}
            multi={false}
            selected={data.destinationType === opt.key}
            onClick={() => update({ ...resetReferral(data), destinationType: opt.key, destinationCommunity: "", destinationCommunityName: "", destinationCommunityOther: "", destinationZip: "" })}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => update({ ...resetReferral(data), destinationType: "not_sure", destinationCommunity: "", destinationCommunityName: "", destinationCommunityOther: "", destinationZip: "" })}
        className={`text-sm italic mb-5 min-h-[32px] ${data.destinationType === "not_sure" ? "text-forest-700 font-medium" : "text-gray-400 hover:text-gray-600"}`}
      >
        I don&rsquo;t know yet
      </button>

      {data.destinationType === "senior_community" && !notListed && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Search senior communities</label>
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); update({ ...resetReferral(data), destinationCommunity: "", destinationCommunityName: e.target.value }); }}
              placeholder="Start typing a community name…"
              className="w-full h-12 pl-9 pr-3 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
            />
          </div>
          {data.destinationCommunity ? (
            <CommunityReferralQuestion data={data} update={update} />
          ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {searching && <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>}
            {!searching && query.trim().length > 0 && results.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => { update({ ...resetReferral(data), destinationCommunity: r.id, destinationCommunityName: r.name }); setQuery(r.name); setResults([]); }}
                className="w-full text-left px-4 py-3 min-h-[48px] hover:bg-gray-50 transition-colors"
              >
                <span className="block text-sm font-medium text-gray-800">{r.name}</span>
                {r.city && <span className="block text-xs text-gray-400">{r.city}</span>}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setNotListed(true); update({ ...resetReferral(data), destinationCommunity: "", destinationCommunityName: "" }); }}
              className="w-full text-left px-4 py-3 min-h-[48px] text-sm text-forest-600 hover:bg-gray-50 transition-colors font-medium"
            >
              Not listed? Add it
            </button>
          </div>
          )}
        </div>
      )}

      {data.destinationType === "senior_community" && notListed && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Community name</label>
            <input
              type="text"
              autoFocus
              value={data.destinationCommunityOther}
              onChange={e => update({ destinationCommunityOther: e.target.value })}
              placeholder="Community name"
              className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
            />
            <button type="button" onClick={() => setNotListed(false)} className="text-xs text-gray-400 hover:text-gray-600 mt-1.5 underline underline-offset-2">
              Search instead
            </button>
          </div>
          <DestZipField data={data} update={update} />
        </div>
      )}

      {data.destinationType && data.destinationType !== "senior_community" && data.destinationType !== "not_sure" && (
        <DestZipField data={data} update={update} />
      )}
    </div>
  );
}

function CommunityReferralQuestion({ data, update }: Props) {
  const name = data.destinationCommunityName;

  // The marketplace listing is looked up when the answer is saved (after
  // step 6), so a later change of community can't leave a stale match.
  function answerYes() {
    update({ communityReferred: true, howHeard: "senior_community", howHeardDetail: name, referralPartnerId: "" });
  }

  function answerNo() {
    update({ ...resetReferral(data), communityReferred: false });
  }

  const choice = (label: string, selected: boolean, onClick: () => void) => (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "h-12 rounded-xl border text-[15px] font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5",
        selected
          ? "border-forest-600 bg-forest-600 text-white shadow-sm"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
      )}
    >
      {selected && <Check className="w-4 h-4" strokeWidth={3} />}
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-forest-200 bg-forest-50/40 p-4 motion-safe:animate-[fadeInScale_0.25s_ease-out]">
      <p className="text-[15px] font-semibold text-gray-900 leading-snug">
        Did you hear about Rightsize and Top Tier Transitions from {name}?
      </p>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
        {data.communityReferred
          ? `Great. We'll add ${name} to your Partners page, so their contact info is always one tap away.`
          : "Just so we know who to thank."}
      </p>
      <div className="grid grid-cols-2 gap-2 mt-3" role="radiogroup" aria-label={`Heard about us from ${name}?`}>
        {choice("Yes", data.communityReferred === true, answerYes)}
        {choice("No", data.communityReferred === false, answerNo)}
      </div>
    </div>
  );
}

function DestZipField({ data, update }: Props) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        Destination zip code <span className="text-gray-400 normal-case">(if you know it) · Optional</span>
      </label>
      <input
        type="text"
        inputMode="numeric"
        maxLength={5}
        value={data.destinationZip}
        onChange={e => update({ destinationZip: e.target.value.replace(/\D/g, "").slice(0, 5) })}
        placeholder="60601"
        className="w-full max-w-[180px] h-12 px-4 rounded-xl border border-gray-300 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
      />
    </div>
  );
}

export function step4Valid(data: WizardData): boolean {
  if (!data.destinationType) return false;
  if (data.destinationType === "senior_community") {
    if (data.destinationCommunity) return data.communityReferred !== null;
    return data.destinationCommunityOther.trim().length > 0;
  }
  return true;
}
