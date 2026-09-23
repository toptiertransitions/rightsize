"use client";

import { Chip } from "@/components/onboarding/shared";
import type { WizardData } from "../wizardTypes";

const RANGE_OPTIONS = [
  { key: "asap", label: "ASAP" },
  { key: "1_3", label: "1 to 3 months" },
  { key: "3_6", label: "3 to 6 months" },
  { key: "6_12", label: "6 to 12 months" },
  { key: "not_sure", label: "Not sure yet" },
];

interface Props {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
}

export function Step3Timeline({ data, update }: Props) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-5">When are you planning to move?</h2>

      <div className="flex flex-wrap gap-2 mb-5">
        {RANGE_OPTIONS.map(opt => (
          <Chip
            key={opt.key}
            label={opt.label}
            selected={data.timelineType === "range" && data.timelineValue === opt.key}
            onClick={() => update({ timelineType: "range", timelineValue: opt.key })}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={() => update({ timelineType: "month", timelineValue: data.timelineType === "month" ? data.timelineValue : "" })}
          className={`text-left text-sm font-medium min-h-[44px] ${data.timelineType === "month" ? "text-forest-700" : "text-gray-500 hover:text-gray-700"}`}
        >
          I know the month
        </button>
        {data.timelineType === "month" && (
          <input
            type="month"
            value={data.timelineValue}
            onChange={e => update({ timelineValue: e.target.value })}
            className="w-full max-w-[220px] h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
          />
        )}

        <button
          type="button"
          onClick={() => update({ timelineType: "date", timelineValue: data.timelineType === "date" ? data.timelineValue : "" })}
          className={`text-left text-sm font-medium min-h-[44px] ${data.timelineType === "date" ? "text-forest-700" : "text-gray-500 hover:text-gray-700"}`}
        >
          I have a specific date
        </button>
        {data.timelineType === "date" && (
          <input
            type="date"
            value={data.timelineValue}
            onChange={e => update({ timelineValue: e.target.value })}
            className="w-full max-w-[220px] h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
          />
        )}
      </div>
    </div>
  );
}

export function step3Valid(data: WizardData): boolean {
  return !!data.timelineType && data.timelineValue.trim().length > 0;
}
