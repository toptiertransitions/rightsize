"use client";

import { useState } from "react";
import type { Phase, TipItem } from "@/content/tips";
import { TipAccordionItem } from "./TipAccordionItem";
import { TopTierTipCallout } from "./TopTierTipCallout";

export function PhaseSection({ phase, items, showCallout, children, forceOpen, calloutAfterContent = false }: {
  phase: Phase;
  items: TipItem[];
  showCallout: boolean;
  /** Phase-specific content (guides, lists, comparisons) rendered after the FAQs */
  children?: React.ReactNode;
  /** While searching, open the first match so the answer is visible */
  forceOpen?: boolean;
  /** Show the Top Tier Tip after the phase content instead of before it */
  calloutAfterContent?: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const effectiveOpen = openIndex ?? (forceOpen && items.length > 0 ? 0 : null);
  const headingId = `phase-${phase.id}-title`;

  return (
    <section aria-labelledby={headingId} className="scroll-mt-28">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="w-9 h-9 rounded-full bg-forest-600 text-white text-sm font-bold flex items-center justify-center shadow-sm flex-shrink-0">
          {phase.badge}
        </span>
        <h3 id={headingId} className="text-xl font-bold text-gray-900">
          <span className="sr-only">Phase {phase.badge}: </span>{phase.title}
        </h3>
      </div>
      <p className="mt-2 text-[15px] text-gray-600 leading-relaxed">{phase.intro}</p>

      {items.length > 0 && (
        <div className="mt-4 rounded-2xl bg-white border border-cream-200 shadow-sm px-4 sm:px-5">
          {items.map((item, i) => (
            <TipAccordionItem
              key={item.question}
              id={`tip-${phase.id}-${i}`}
              item={item}
              open={effectiveOpen === i}
              onToggle={() => setOpenIndex(effectiveOpen === i ? -1 : i)}
            />
          ))}
        </div>
      )}

      {!calloutAfterContent && showCallout && phase.callout && <TopTierTipCallout text={phase.callout.text} />}
      {children}
      {calloutAfterContent && showCallout && phase.callout && <TopTierTipCallout text={phase.callout.text} />}
    </section>
  );
}
