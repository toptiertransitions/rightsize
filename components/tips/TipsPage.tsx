"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  PHASES, MOVER_QUOTES, MOVER_QUOTES_COPY, REHOMING_CHANNELS, FAMILY_PRINCIPLES, MOVE_DAY_LISTS,
  TIMELINE_STEPS, PITFALLS, TIPS_SUBTITLE, TIPS_PHONE_HREF, TIPS_PHONE_DISPLAY, ALL_TOP_TIER_TIPS,
  type PhaseId,
} from "@/content/tips";
import { TipsSearch } from "./TipsSearch";
import { PhaseFilterChips, type PhaseFilter } from "./PhaseFilterChips";
import { PhaseSection } from "./PhaseSection";
import { MoverQuoteComparison } from "./MoverQuoteComparison";
import { RehomingChannelGuide } from "./RehomingChannelGuide";
import { FamilySupportCircle } from "./FamilySupportCircle";
import { MoveDayLists } from "./MoveDayLists";
import { ThirtyDayTimeline } from "./ThirtyDayTimeline";
import { PitfallPairs } from "./PitfallPairs";
import { TipsCTA } from "./TipsCTA";
import { searchWords, textMatches } from "./search";

const CHIPS: { id: PhaseFilter; label: string }[] = [
  { id: "all", label: "All" },
  ...PHASES.map((p) => ({ id: p.id as PhaseFilter, label: p.chip })),
];

const MOVER_QUOTES_TEXT = [
  MOVER_QUOTES_COPY.title, MOVER_QUOTES_COPY.subtitle, MOVER_QUOTES_COPY.takeaway, MOVER_QUOTES_COPY.tip,
  ...MOVER_QUOTES.flatMap((q) => [q.name, q.estimatedTime, q.rate, q.crew, q.quote, "supplies travel time surge pricing"]),
].join(" ");

// `tipOfDayIndex` comes from the server so the "Did you know?" card renders
// the same tip on the server and the client (no hydration mismatch).
export function TipsPage({ tipOfDayIndex }: { tipOfDayIndex: number }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PhaseFilter>("all");
  const words = useMemo(() => searchWords(query), [query]);
  const searching = words.length > 0;

  const sections = useMemo(() => {
    return PHASES.filter((p) => filter === "all" || p.id === filter).map((phase) => {
      const items = phase.items.filter((i) => textMatches(words, i.question, i.answer, phase.title));
      const showCallout = !!phase.callout && textMatches(words, phase.callout.text, phase.title);
      const extra = extraFor(phase.id, words);
      const visible = items.length > 0 || showCallout || extra.hasContent;
      return { phase, items, showCallout, extra, visible };
    });
  }, [filter, words]);

  const visibleSections = sections.filter((s) => s.visible);
  const tipOfDay = ALL_TOP_TIER_TIPS[tipOfDayIndex % ALL_TOP_TIER_TIPS.length];

  return (
    <div className="max-w-3xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Tips</h1>
        <p className="mt-2 text-base text-gray-600">{TIPS_SUBTITLE}</p>
      </header>

      {!searching && filter === "all" && (
        <aside className="mt-6 rounded-2xl bg-white border border-cream-200 shadow-sm p-5 flex gap-4 items-start">
          <span aria-hidden="true" className="w-10 h-10 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-forest-700">Did you know?</p>
            <p className="mt-1 text-[15px] text-gray-800 leading-relaxed">{tipOfDay}</p>
          </div>
        </aside>
      )}

      <div className="mt-6 space-y-3">
        <TipsSearch value={query} onChange={setQuery} />
        <PhaseFilterChips chips={CHIPS} value={filter} onChange={setFilter} />
      </div>

      <h2 className="sr-only">Tips by phase</h2>
      {visibleSections.length === 0 ? (
        <div className="mt-10 rounded-2xl bg-white border border-cream-200 p-8 text-center" role="status">
          <p className="text-[15px] text-gray-700">
            No tips match that search. Try a different word, or call us at{" "}
            <a href={TIPS_PHONE_HREF} className="font-semibold text-forest-700 underline underline-offset-2">{TIPS_PHONE_DISPLAY}</a>.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-12">
          {visibleSections.map(({ phase, items, showCallout, extra }) => (
            <PhaseSection key={`${phase.id}-${searching ? "s" : "b"}`} phase={phase} items={items} showCallout={showCallout} forceOpen={searching} calloutAfterContent={phase.id === "timeline"}>
              {extra.node}
            </PhaseSection>
          ))}
        </div>
      )}

      <TipsCTA />
    </div>
  );
}

function extraFor(id: PhaseId, words: string[]): { hasContent: boolean; node: React.ReactNode } {
  switch (id) {
    case "schedule": {
      const show = textMatches(words, MOVER_QUOTES_TEXT);
      return { hasContent: show, node: show ? <MoverQuoteComparison /> : null };
    }
    case "rehome": {
      const rows = REHOMING_CHANNELS.filter((r) => textMatches(words, r.category, r.channel, r.why));
      return { hasContent: rows.length > 0, node: <RehomingChannelGuide rows={rows} /> };
    }
    case "family": {
      const principles = FAMILY_PRINCIPLES.filter((p) => textMatches(words, p.label, p.line));
      return { hasContent: principles.length > 0, node: <FamilySupportCircle principles={principles} /> };
    }
    case "moveDay": {
      const lists = MOVE_DAY_LISTS.map((l) => ({
        title: l.title,
        items: textMatches(words, l.title) ? l.items : l.items.filter((i) => textMatches(words, i)),
      }));
      return { hasContent: lists.some((l) => l.items.length > 0), node: <MoveDayLists lists={lists} /> };
    }
    case "timeline": {
      const steps = TIMELINE_STEPS.filter((s) => textMatches(words, s.label, s.text));
      return { hasContent: steps.length > 0, node: <ThirtyDayTimeline steps={steps} /> };
    }
    case "pitfalls": {
      const pairs = PITFALLS.filter((p) => textMatches(words, p.avoid, p.instead));
      return { hasContent: pairs.length > 0, node: <PitfallPairs pairs={pairs} /> };
    }
    default:
      return { hasContent: false, node: null };
  }
}
