"use client";

import { Home, KeyRound, Truck, Building2, HeartHandshake, Stethoscope, ClipboardCheck, Scale, PiggyBank, Flower2, Gift, Trash2 } from "lucide-react";
import { Tile } from "@/components/onboarding/shared";
import type { WizardData } from "../wizardTypes";
import type { ServiceInterest } from "@/lib/types";

const OPTIONS: { key: ServiceInterest; label: string; icon: React.ReactNode }[] = [
  { key: "full_service", label: "Full Service Move Management", icon: <Home className="w-[18px] h-[18px]" /> },
  { key: "realtor", label: "Realtor Recommendations", icon: <KeyRound className="w-[18px] h-[18px]" /> },
  { key: "senior_community", label: "Senior Community Recommendations", icon: <Building2 className="w-[18px] h-[18px]" /> },
  { key: "mover", label: "Mover Recommendations", icon: <Truck className="w-[18px] h-[18px]" /> },
  { key: "donation", label: "Donation Organization Recommendations", icon: <Gift className="w-[18px] h-[18px]" /> },
  { key: "hauling", label: "Junk Hauling Recommendations", icon: <Trash2 className="w-[18px] h-[18px]" /> },
  { key: "companion_care", label: "Companion Care Recommendations", icon: <HeartHandshake className="w-[18px] h-[18px]" /> },
  { key: "home_health_care", label: "Home Health Care Recommendations", icon: <Stethoscope className="w-[18px] h-[18px]" /> },
  { key: "care_manager", label: "Care Manager Recommendations", icon: <ClipboardCheck className="w-[18px] h-[18px]" /> },
  { key: "estate_attorney", label: "Estate Attorney Recommendations", icon: <Scale className="w-[18px] h-[18px]" /> },
  { key: "financial_advisory", label: "Financial Advisory Recommendations", icon: <PiggyBank className="w-[18px] h-[18px]" /> },
  { key: "after_loss_support", label: "After Loss Support Recommendations", icon: <Flower2 className="w-[18px] h-[18px]" /> },
];

interface Props {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  onAppOnlyAdvance: () => void;
  /** Set when a senior community referred this resident: they already have
   * their community, so community recommendations are greyed out. */
  referringCommunity?: { name: string; logoUrl: string | null } | null;
}

export function Step2Interests({ data, update, onAppOnlyAdvance, referringCommunity }: Props) {
  function toggle(key: ServiceInterest) {
    if (referringCommunity && key === "senior_community") return;
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
        {OPTIONS.map(opt => referringCommunity && opt.key === "senior_community" ? (
          <ReferredCommunityTile key={opt.key} label={opt.label} icon={opt.icon} community={referringCommunity} />
        ) : (
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

// Greyed-out stand-in for the Senior Community tile, marked with the
// community that referred the resident.
function ReferredCommunityTile({ label, icon, community }: { label: string; icon: React.ReactNode; community: { name: string; logoUrl: string | null } }) {
  return (
    <div
      aria-disabled="true"
      title={`${community.name} referred you to Rightsize, so they're already your community`}
      className="relative flex flex-col items-start gap-2.5 min-h-[92px] p-4 rounded-2xl border border-gray-200 bg-gray-50 text-left cursor-not-allowed"
    >
      <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-100 text-gray-300">{icon}</span>
      <span className="text-sm font-semibold text-gray-400 leading-snug">{label}</span>
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600">
        <span className="shrink-0">Referred by</span>
        {community.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={community.logoUrl} alt={community.name} className="h-4 w-auto max-w-[84px] object-contain" />
        ) : (
          <span className="truncate font-semibold">{community.name}</span>
        )}
      </span>
    </div>
  );
}

export function step2Valid(data: WizardData): boolean {
  return data.appOnlyIntent || data.serviceInterests.length > 0;
}
