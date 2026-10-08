"use client";

import type { PhaseId } from "@/content/tips";
import { cn } from "@/lib/utils";

export type PhaseFilter = "all" | PhaseId;

export function PhaseFilterChips({ chips, value, onChange }: { chips: { id: PhaseFilter; label: string }[]; value: PhaseFilter; onChange: (v: PhaseFilter) => void }) {
  return (
    <div
      role="group"
      aria-label="Filter tips by phase"
      className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap"
    >
      {chips.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c.id)}
            className={cn(
              "w-full sm:w-auto min-h-[44px] px-2 sm:px-4 rounded-full border text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2",
              active ? "bg-forest-600 border-forest-600 text-white" : "bg-white border-cream-300 text-gray-700 hover:border-forest-300"
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
