import { TIMELINE_STEPS, type TimelineStep } from "@/content/tips";

export function ThirtyDayTimeline({ steps = TIMELINE_STEPS }: { steps?: TimelineStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="mt-6 relative">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden="true" className="absolute left-[19px] top-10 bottom-0 w-px bg-forest-200" />}
          <span aria-hidden="true" className="relative z-10 w-10 h-10 rounded-full bg-forest-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
            {i + 1}
          </span>
          <div className="pt-1.5">
            <p className="text-sm font-semibold text-forest-700">{s.label}</p>
            <p className="text-[15px] text-gray-700 leading-relaxed">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
