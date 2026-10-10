import { PARTNER_CATEGORIES, type PartnerCategory, type ServiceInterest } from "@/lib/types";
import type { PartnerProfile } from "./types";

// Maps the onboarding wizard's stable ServiceInterest keys to the existing
// PartnerCategory values already used everywhere (matching, PartnerSelections,
// LocalVendors.Category) — two different stable-key vocabularies that happen
// to describe the same six things, never unified into one because doing so
// would touch the shared TTT-client data model.
export const SERVICE_INTEREST_TO_CATEGORY: Record<ServiceInterest, PartnerCategory> = {
  full_service: "Move Manager",
  realtor: "Realtor",
  mover: "Mover",
  senior_community: "Community",
  companion_care: "Companion Care",
  home_health_care: "Home Health Care",
  care_manager: "Care Manager",
  estate_attorney: "Estate Attorney",
  financial_advisory: "Financial Advisory",
  after_loss_support: "After Loss Support",
  donation: "Donation",
  hauling: "Hauler",
};

export const CATEGORY_TO_SERVICE_INTEREST: Record<PartnerCategory, ServiceInterest> = {
  "Move Manager": "full_service",
  Realtor: "realtor",
  Mover: "mover",
  Community: "senior_community",
  "Companion Care": "companion_care",
  "Home Health Care": "home_health_care",
  "Care Manager": "care_manager",
  "Estate Attorney": "estate_attorney",
  "Financial Advisory": "financial_advisory",
  "After Loss Support": "after_loss_support",
  Donation: "donation",
  Hauler: "hauling",
};

// Display-only renames for the NonTTTClient view. The underlying
// PartnerCategory values (headings, Airtable options, PartnerSelections
// rows) never change — TTT clients keep seeing the original labels via the
// existing CategorySection, which this map is never passed into.
export const NON_TTT_CATEGORY_LABELS: Partial<Record<PartnerCategory, string>> = {
  "Move Manager": "Senior Move Manager",
  Community: "Senior Community",
  Donation: "Donation Organization",
  Hauler: "Junk Hauling",
  "Care Manager": "Care Management / Concierge",
};

export function nonTTTCategoryLabel(category: PartnerCategory): string {
  return NON_TTT_CATEGORY_LABELS[category] ?? category;
}

// Stable id for the generic "Top Tier Transitions" Move Manager entry a
// NonTTTClient can add to their Your Team tray via TTTMoveManagerCard's
// "Talk to our team" button — a real PartnerSelections row, unlike the
// TTT-managed flow's isTeamLead-flagged synthetic entry (page.tsx, built
// from the project's assigned Team Lead), which is never written there and
// can't be unselected. This one can, same as any other partner.
export const TTT_MOVE_MANAGER_PARTNER_ID = "ttt-move-manager";

export function buildTTTMoveManagerPartner(): PartnerProfile {
  return {
    id: TTT_MOVE_MANAGER_PARTNER_ID,
    vendorName: "Top Tier Transitions",
    category: "Move Manager",
    logo: "/ttt-icon.png",
    zipCodesServed: "",
    city: "",
    state: "",
    avgRating: 0,
    rawAvgRating: 0,
    reviewCount: 0,
    projectsCompleted: 0,
  };
}

/**
 * Orders categories for a NonTTTClient: onboarding-selected ones first (in
 * PARTNER_CATEGORIES' own stable order), everything else after — except
 * Move Manager jumps to the very front when Full Service Move Management
 * was selected, since Top Tier Transitions is always the answer there and
 * that's the one thing worth leading with.
 */
export function orderCategoriesForNonTTTClient(
  serviceInterests: ServiceInterest[]
): { active: PartnerCategory[]; greyed: PartnerCategory[] } {
  const selected = new Set(serviceInterests);
  const active: PartnerCategory[] = [];
  const greyed: PartnerCategory[] = [];

  for (const category of PARTNER_CATEGORIES) {
    const interest = CATEGORY_TO_SERVICE_INTEREST[category];
    (selected.has(interest) ? active : greyed).push(category);
  }

  if (selected.has("full_service")) {
    const idx = active.indexOf("Move Manager");
    if (idx > 0) {
      active.splice(idx, 1);
      active.unshift("Move Manager");
    }
  }

  return { active, greyed };
}
