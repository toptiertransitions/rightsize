import { CircleDot } from "lucide-react";
import { MOVE_DAY_LISTS } from "@/content/tips";

// Read-only lists, intentionally not checklists (nothing is saved).
export function MoveDayLists({ lists = MOVE_DAY_LISTS }: { lists?: { title: string; items: string[] }[] }) {
  const shown = lists.filter((l) => l.items.length > 0);
  if (shown.length === 0) return null;
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {shown.map((list) => (
        <section key={list.title} aria-label={list.title} className="rounded-2xl bg-white border border-cream-200 shadow-sm p-5">
          <h4 className="text-base font-bold text-gray-900">{list.title}</h4>
          <ul className="mt-3 space-y-2.5">
            {list.items.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[15px] text-gray-700 leading-snug">
                <CircleDot aria-hidden="true" className="w-4 h-4 mt-0.5 text-forest-500 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
