"use client";

import { useState } from "react";
import { Chip, ChoiceCard } from "@/components/onboarding/shared";
import type { WizardData } from "../wizardTypes";
import type { SqftRange, HomeDensity } from "@/lib/types";

const SQFT_OPTIONS: { key: SqftRange; label: string }[] = [
  { key: "under_1000", label: "Under 1,000" },
  { key: "1000_2000", label: "1,000 to 2,000" },
  { key: "2000_3000", label: "2,000 to 3,000" },
  { key: "3000_4500", label: "3,000 to 4,500" },
  { key: "4500_plus", label: "4,500+" },
  { key: "not_sure", label: "Not sure" },
];

const DENSITY_OPTIONS: { key: HomeDensity; title: string; description: string }[] = [
  { key: "light", title: "Pretty light", description: "Already fairly empty, or I keep things minimal." },
  { key: "comfortable", title: "Comfortably full", description: "A normal lived-in home." },
  { key: "full", title: "Full of a lifetime", description: "Years of memories in every room." },
  { key: "collector", title: "I'm a collector", description: "I have collections I care about." },
];

interface Props {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
}

export function Step5Starting({ data, update }: Props) {
  const [showExact, setShowExact] = useState(data.sqftExact != null);

  return (
    <div className="space-y-7">
      <h2 className="text-xl font-bold text-gray-900 leading-snug">
        Rightsizing is the hardest part, so knowing your starting point is a great first step.
      </h2>

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">About how many square feet is your current home?</h3>
        <p className="text-xs text-gray-500 mb-4">Include attics, basements, garages, and any storage units.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {SQFT_OPTIONS.map(opt => (
            <Chip
              key={opt.key}
              label={opt.label}
              selected={data.sqftRange === opt.key}
              onClick={() => update({ sqftRange: opt.key })}
            />
          ))}
        </div>
        {!showExact ? (
          <button type="button" onClick={() => setShowExact(true)} className="text-sm text-forest-600 hover:text-forest-700 underline underline-offset-2 min-h-[44px]">
            Enter exact number
          </button>
        ) : (
          <input
            type="number"
            min={1}
            value={data.sqftExact ?? ""}
            onChange={e => update({ sqftExact: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 2400"
            className="w-full max-w-[180px] h-12 px-4 rounded-xl border border-gray-300 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
          />
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">How would you describe your home today?</h3>
        <div className="space-y-2.5">
          {DENSITY_OPTIONS.map(opt => (
            <ChoiceCard
              key={opt.key}
              title={opt.title}
              description={opt.description}
              selected={data.homeDensity === opt.key}
              onClick={() => update({ homeDensity: opt.key })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function step5Valid(data: WizardData): boolean {
  return !!data.sqftRange && !!data.homeDensity;
}
