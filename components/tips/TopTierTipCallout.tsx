import { Lightbulb } from "lucide-react";

export function TopTierTipCallout({ text, label = "Top Tier Tip" }: { text: string; label?: string }) {
  return (
    <aside className="relative mt-5 rounded-2xl bg-forest-50 border border-forest-100 p-5 pl-16">
      <span aria-hidden="true" className="absolute left-5 top-5 w-8 h-8 rounded-full bg-white border border-forest-100 flex items-center justify-center">
        <Lightbulb className="w-4 h-4 text-forest-600" />
      </span>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-forest-700">{label}</p>
      <p className="mt-1 text-[15px] leading-relaxed text-gray-800">{text}</p>
    </aside>
  );
}
