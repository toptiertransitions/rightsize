import { Hourglass, MessageCircle, Users, Scale, Footprints, Heart } from "lucide-react";
import { FAMILY_PRINCIPLES, type FamilyPrinciple } from "@/content/tips";

const ICONS: Record<FamilyPrinciple["icon"], React.ComponentType<{ className?: string }>> = {
  patience: Hourglass,
  communicate: MessageCircle,
  roles: Users,
  neutral: Scale,
  steps: Footprints,
};

// The guide's circle with the senior at the center, as a stacked layout
// that reads well on a phone.
export function FamilySupportCircle({ principles = FAMILY_PRINCIPLES }: { principles?: FamilyPrinciple[] }) {
  if (principles.length === 0) return null;
  return (
    <section aria-label="Five ways to support the family" className="mt-8 rounded-3xl bg-white border border-cream-200 shadow-sm p-5 sm:p-6">
      <div className="flex flex-col items-center text-center">
        <span aria-hidden="true" className="w-14 h-14 rounded-full bg-forest-600 text-white flex items-center justify-center shadow-sm">
          <Heart className="w-6 h-6" />
        </span>
        <p className="mt-2 text-sm font-semibold text-gray-900">The senior at the center</p>
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {principles.map((p) => {
          const Icon = ICONS[p.icon];
          return (
            <li key={p.label} className="flex items-start gap-3 rounded-2xl bg-cream-50 border border-cream-200 p-4">
              <span aria-hidden="true" className="w-9 h-9 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center flex-shrink-0">
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">{p.label}</p>
                <p className="text-sm text-gray-600">{p.line}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
