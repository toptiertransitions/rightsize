import { Home, KeyRound, Truck, Building2, Gift, Trash2, HeartHandshake, Stethoscope, ClipboardCheck, Scale, PiggyBank, Flower2 } from "lucide-react";
import type { PartnerCategory } from "@/lib/types";

// Same icon set as the onboarding flow's "How do you want to use
// Rightsize?" step (app/get-started/steps/Step2Interests.tsx) — kept in
// sync with it rather than hand-drawn inline SVGs, so a category reads the
// same icon everywhere a client sees it.
const ICONS: Record<PartnerCategory, typeof Home> = {
  "Move Manager": Home,
  Realtor: KeyRound,
  Community: Building2,
  Mover: Truck,
  Donation: Gift,
  Hauler: Trash2,
  "Companion Care": HeartHandshake,
  "Home Health Care": Stethoscope,
  "Care Manager": ClipboardCheck,
  "Estate Attorney": Scale,
  "Financial Advisory": PiggyBank,
  "After Loss Support": Flower2,
};

export function CategoryIcon({ category, className }: { category: PartnerCategory; className?: string }) {
  const Icon = ICONS[category];
  return <Icon className={className ?? "w-5 h-5"} />;
}
