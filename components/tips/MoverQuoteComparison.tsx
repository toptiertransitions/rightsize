import { Check, X } from "lucide-react";
import { MOVER_QUOTES, MOVER_QUOTES_COPY, type MoverQuote } from "@/content/tips";
import { TopTierTipCallout } from "./TopTierTipCallout";

function YesNo({ value, yes, no }: { value: boolean; yes: string; no: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {value
        ? <Check aria-hidden="true" className="w-4 h-4 text-forest-600" strokeWidth={2.5} />
        : <X aria-hidden="true" className="w-4 h-4 text-gray-400" strokeWidth={2.5} />}
      <span>{value ? yes : no}</span>
    </span>
  );
}

const ROWS: { label: string; render: (q: MoverQuote) => React.ReactNode }[] = [
  { label: "Estimated time", render: (q) => q.estimatedTime },
  { label: "Supplies", render: (q) => <YesNo value={q.suppliesIncluded} yes="Included" no="Not included" /> },
  { label: "Rate", render: (q) => q.rate },
  { label: "Crew", render: (q) => q.crew },
  { label: "Travel time", render: (q) => <YesNo value={q.travelTimeIncluded} yes="Included" no="Excluded" /> },
  { label: "Surge pricing", render: (q) => <YesNo value={!q.surgePricing} yes="None" no="Yes" /> },
];

export function MoverQuoteComparison() {
  return (
    <section id="mover-quotes" aria-labelledby="mover-quotes-title" className="mt-8 scroll-mt-28">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{MOVER_QUOTES_COPY.label}</p>
      <h4 id="mover-quotes-title" className="mt-1 text-lg font-bold text-gray-900">{MOVER_QUOTES_COPY.title}</h4>
      <p className="mt-1 text-sm text-gray-600">{MOVER_QUOTES_COPY.subtitle}</p>

      <div className="mt-4 -mx-4 px-4 scroll-px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:grid md:grid-cols-3 md:overflow-visible">
        {MOVER_QUOTES.map((q) => (
          <div key={q.name} className="snap-start shrink-0 w-[78%] sm:w-[45%] md:w-auto rounded-2xl bg-white border border-cream-200 shadow-sm p-5">
            <p className="text-base font-bold text-gray-900">{q.name}</p>
            <dl className="mt-3 divide-y divide-cream-100 text-sm">
              {ROWS.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-gray-500">{r.label}</dt>
                  <dd className="text-right text-gray-800 font-medium">{r.render(q)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 pt-3 border-t border-cream-200 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-gray-700">Quote</span>
              <span className="text-2xl font-bold text-gray-900 tabular-nums">{q.quote}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-cream-300 bg-cream-50 p-4 text-[15px] leading-relaxed text-gray-700">
        {MOVER_QUOTES_COPY.takeaway}
      </div>
      <TopTierTipCallout text={MOVER_QUOTES_COPY.tip} />
    </section>
  );
}
