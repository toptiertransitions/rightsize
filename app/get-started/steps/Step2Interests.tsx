"use client";

import { Home, KeyRound, Truck, Building2, HeartHandshake, Stethoscope, ClipboardCheck, Scale, PiggyBank, Flower2, Gift, Trash2 } from "lucide-react";
import { Tile } from "@/components/onboarding/shared";
import type { WizardData } from "../wizardTypes";
import type { ServiceInterest } from "@/lib/types";

const OPTIONS: { key: ServiceInterest; label: string; icon: React.ReactNode }[] = [
  { key: "full_service", label: "Full Service Move Management", icon: <Home className="w-[18px] h-[18px]" /> },
  { key: "realtor", label: "Realtor Recommendations", icon: <KeyRound className="w-[18px] h-[18px]" /> },
  { key: "mover", label: "Mover Recommendations", icon: <Truck className="w-[18px] h-[18px]" /> },
  { key: "senior_community", label: "Senior Community Recommendations", icon: <Building2 className="w-[18px] h-[18px]" /> },
  { key: "companion_care", label: "Companion Care Recommendations", icon: <HeartHandshake className="w-[18px] h-[18px]" /> },
  { key: "home_health_care", label: "Home Health Care Recommendations", icon: <Stethoscope className="w-[18px] h-[18px]" /> },
  { key: "care_manager", label: "Care Manager Recommendations", icon: <ClipboardCheck className="w-[18px] h-[18px]" /> },
  { key: "estate_attorney", label: "Estate Attorney Recommendations", icon: <Scale className="w-[18px] h-[18px]" /> },
  { key: "financial_advisory", label: "Financial Advisory Recommendations", icon: <PiggyBank className="w-[18px] h-[18px]" /> },
  { key: "after_loss_support", label: "After Loss Support Recommendations", icon: <Flower2 className="w-[18px] h-[18px]" /> },
  { key: "donation", label: "Donation Organization Recommendations", icon: <Gift className="w-[18px] h-[18px]" /> },
  { key: "hauling", label: "Junk Hauling Recommendations", icon: <Trash2 className="w-[18px] h-[18px]" /> },
];

interface Props {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  onAppOnlyAdvance: () => void;
}

export function Step2Interests({ data, update, onAppOnlyAdvance }: Props) {
  function toggle(key: ServiceInterest) {
    const has = data.serviceInterests.includes(key);
    update({
      serviceInterests: has ? data.serviceInterests.filter(k => k !== key) : [...data.serviceInterests, key],
      appOnlyIntent: false,
    });
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">How do you want to use Rightsize?</h2>
      <p className="text-sm text-gray-500 mb-5">Pick as many as you like.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {OPTIONS.map(opt => (
          <Tile
            key={opt.key}
            label={opt.label}
            icon={opt.icon}
            selected={data.serviceInterests.includes(opt.key)}
            onClick={() => toggle(opt.key)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => { update({ serviceInterests: [], appOnlyIntent: true }); onAppOnlyAdvance(); }}
        className="mt-6 text-sm text-gray-500 hover:text-forest-700 underline underline-offset-2 min-h-[44px]"
      >
        I just want to use the Rightsize app to simplify my move.
      </button>
    </div>
  );
}

export function step2Valid(data: WizardData): boolean {
  return data.appOnlyIntent || data.serviceInterests.length > 0;
}
