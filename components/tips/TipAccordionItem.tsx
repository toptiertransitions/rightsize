"use client";

import { ChevronDown } from "lucide-react";
import type { TipItem } from "@/content/tips";
import { cn } from "@/lib/utils";

export function TipAccordionItem({ item, id, open, onToggle }: { item: TipItem; id: string; open: boolean; onToggle: () => void }) {
  const panelId = `${id}-panel`;
  const buttonId = `${id}-button`;
  return (
    <div className="border-b border-cream-200 last:border-b-0">
      <h4>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-4 min-h-[52px] py-3 text-left text-[15px] font-medium text-gray-900 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2"
        >
          {item.question}
          <ChevronDown
            aria-hidden="true"
            className={cn("w-5 h-5 flex-shrink-0 text-forest-600 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
          />
        </button>
      </h4>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden" inert={!open}>
          <div className="pb-4 pr-8 text-[15px] leading-relaxed text-gray-600">
            <p>{item.answer}</p>
            {item.link && (
              <a href={item.link.href} className="inline-block mt-2 text-sm font-semibold text-forest-700 underline underline-offset-2 hover:text-forest-800">
                {item.link.label}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
