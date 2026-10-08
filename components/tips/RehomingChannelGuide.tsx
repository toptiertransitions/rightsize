import { REHOMING_CHANNELS, REHOMING_FOOTNOTE, type ChannelRow } from "@/content/tips";

export function RehomingChannelGuide({ rows = REHOMING_CHANNELS }: { rows?: ChannelRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="channel-guide-title" className="mt-8">
      <h4 id="channel-guide-title" className="text-lg font-bold text-gray-900">Where to rehome what</h4>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.category} className="rounded-2xl bg-white border border-cream-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[15px] font-semibold text-gray-900 leading-snug">{r.category}</p>
              {r.tier && (
                <span className="flex-shrink-0 rounded-full bg-cream-100 border border-cream-200 px-2.5 py-0.5 text-xs font-semibold text-gray-700 tabular-nums">
                  <span className="sr-only">Typical value: </span>{r.tier}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-semibold text-forest-700">{r.channel}</p>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">{r.why}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-400">{REHOMING_FOOTNOTE}</p>
    </section>
  );
}
