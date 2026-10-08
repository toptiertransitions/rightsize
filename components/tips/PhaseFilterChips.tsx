"use client";

import type { PhaseId } from "@/content/tips";
import { cn } from "@/lib/utils";

export type PhaseFilter = "all" | PhaseId;

export function PhaseFilterChips({ chips, value, onChange }: { chips: { id: PhaseFilter; label: string }[]; value: PhaseFilter; onChange: (v: PhaseFilter) => void }) {
  return (
    <div
      role="group"
      aria-label="Filter tips by phase"
      className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              "snap-start shrink-0 min-h-[44px] px-4 rounded-full border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2",
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
