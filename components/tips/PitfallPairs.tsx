import { X, Check } from "lucide-react";
import { PITFALLS, type PitfallPair } from "@/content/tips";

export function PitfallPairs({ pairs = PITFALLS }: { pairs?: PitfallPair[] }) {
  if (pairs.length === 0) return null;
  return (
    <ul className="mt-6 grid gap-3 md:grid-cols-2">
      {pairs.map((p) => (
        <li key={p.avoid} className="rounded-2xl bg-white border border-cream-200 shadow-sm overflow-hidden">
          <div className="flex items-start gap-2.5 p-4">
            <X aria-hidden="true" className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" strokeWidth={2.5} />
            <p className="text-[15px] text-gray-700"><span className="font-semibold text-gray-900">Avoid: </span>{p.avoid}</p>
          </div>
          <div className="flex items-start gap-2.5 p-4 bg-forest-50 border-t border-forest-100">
            <Check aria-hidden="true" className="w-4 h-4 mt-0.5 text-forest-600 flex-shrink-0" strokeWidth={2.5} />
            <p className="text-[15px] text-gray-800"><span className="font-semibold text-forest-800">Do this instead: </span>{p.instead}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
