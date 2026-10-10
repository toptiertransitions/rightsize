// What a marketplace partner sees in self-serve setup and My Listing, per
// category, beyond the auto-generated "who do you serve" criteria screens
// (lib/partners/criteria.ts). Client-safe: used by the setup wizard, My
// Listing, and the save action on the server.
//
//  - HIDDEN fields: category details partners don't fill in themselves.
//    Admins still see and edit them; saved values are kept.
//  - MIRRORED fields: hidden details that repeat a criteria screen. When the
//    partner saves that screen, the field is filled from it, so required
//    fields (the Draft -> Live gate) never go missing.
//  - FIELD SCREENS: details fields shown as their own full screen (chips,
//    optional "select all"), placed right after a given criteria screen.
//  - Area rules: categories where "Where do you work?" is skipped (senior
//    communities are a place families come to) or always in person.
import type { MarketplaceFieldDef } from "./types";

// ─── Hidden details fields ────────────────────────────────────────────────────

const PARTNER_HIDDEN_FIELDS: Record<string, string[]> = {
  // Visit length is asked on "Which visit lengths do you offer?"
  "Companion Care": ["rateRange", "minimumHours", "agencyOrIndependent"],
  // Care levels are asked on "Which care levels does your community offer?"
  Community: ["careLevelsOffered"],
  // Everything key is asked on its own screen; the rest isn't needed
  Donation: ["acceptedItemTypes", "pickupOffered", "taxReceiptProvided", "minimumDonationSize"],
  Realtor: ["sresCertified", "brokerage", "licenseState", "countiesServed", "avgDaysOnMarketSeniorSellers", "commissionStructureNotes"],
  "Estate Attorney": ["practiceAreas", "documentsCommonlyHandled", "servesVirtually"],
  Hauler: ["donationPartnerships"],
  "Financial Advisory": ["focusAreas"],
  "Home Health Care": ["careTypes", "acceptedPayers"],
  "Care Manager": ["servicesOffered", "hourlyRateRange"],
  "After Loss Support": ["servicesOffered", "format", "slidingScale", "virtualSessions"],
};

export function isHiddenForPartner(categoryLabel: string, key: string): boolean {
  return (PARTNER_HIDDEN_FIELDS[categoryLabel] ?? []).includes(key);
}

// ─── Mirrored fields (criteria answer -> hidden details field) ────────────────

type Mirror =
  | { field: string; labels?: Record<string, string> } // multiselect of labels
  | { field: string; booleanIf: string };              // yes/no: picked this value

const MIRRORS: Record<string, Record<string, Mirror>> = {
  Community: {
    careType: { field: "careLevelsOffered", labels: { continuing_care: "CCRC" } },
  },
  Donation: {
    items: { field: "acceptedItemTypes" },
    pickupOrDropoff: { field: "pickupOffered", booleanIf: "pickup" },
  },
  "Estate Attorney": {
    serviceType: {
      field: "practiceAreas",
      labels: {
        estate_trust_planning: "Estate & trust planning",
        probate: "Probate",
        power_of_attorney: "Power of attorney / guardianship",
        elder_law_medicaid: "Elder law / Medicaid planning",
      },
    },
  },
  "Financial Advisory": {
    focusArea: { field: "focusAreas" },
  },
  "Home Health Care": {
    careType: {
      field: "careTypes",
      labels: {
        skilled_nursing: "Skilled nursing",
        physical_therapy: "Physical therapy",
        occupational_speech_therapy: "Occupational or speech therapy",
        medication_management: "Medication management",
        post_hospital_recovery: "Post-hospital recovery",
        chronic_disease_management: "Chronic disease management",
      },
    },
    payer: {
      field: "acceptedPayers",
      labels: {
        medicare: "Medicare",
        medicare_advantage: "Medicare Advantage",
        medicaid: "Medicaid",
        private_insurance: "Private insurance",
        private_pay: "Private pay",
      },
    },
  },
  "Care Manager": {
    careNeeds: { field: "servicesOffered" },
  },
  "After Loss Support": {
    supportType: { field: "servicesOffered" },
  },
};

/** Fills mirrored hidden fields from the listing's criteria picks, and any
 * derived fields. `optionLabel` resolves a criteria value to its label. */
export function applyMirrors(
  categoryLabel: string,
  attributes: Record<string, unknown>,
  criteria: Record<string, string[]>,
  optionLabel: (questionId: string, value: string) => string | undefined
): Record<string, unknown> {
  const out = { ...attributes };
  for (const [questionId, m] of Object.entries(MIRRORS[categoryLabel] ?? {})) {
    const picked = criteria[questionId];
    if (!picked) continue;
    if ("booleanIf" in m) {
      out[m.field] = picked.includes(m.booleanIf);
    } else {
      out[m.field] = picked
        .map((v) => m.labels?.[v] ?? optionLabel(questionId, v))
        .filter((l): l is string => !!l);
    }
  }
  // Realtors: SRES comes from the specialties screen (none picked = no)
  if (categoryLabel === "Realtor" && "realtorSpecialties" in out) {
    const picks = Array.isArray(out.realtorSpecialties) ? (out.realtorSpecialties as string[]) : [];
    out.sresCertified = picks.some((s) => s.startsWith("SRES"));
  }
  return out;
}

// ─── Field screens ────────────────────────────────────────────────────────────

export interface FieldScreen {
  key: string;
  title: string;
  subtitle?: string;
  /** Show right after this criteria question (else after all criteria) */
  after?: string;
  /** Multiselect: offer "Select all" */
  selectAll?: boolean;
  /** Multiselect: allow continuing with nothing picked */
  optional?: boolean;
  /** Only when the partner picked this value on that criteria question */
  showIf?: { questionId: string; value: string };
}

const FIELD_SCREENS: Record<string, FieldScreen[]> = {
  Donation: [
    { key: "itemsNotAccepted", title: "Which items do you not accept?", subtitle: "We'll steer families with these items elsewhere.", after: "items", optional: true },
    { key: "pickupLeadTime", title: "How much notice do you usually need for a pickup?", after: "pickupOrDropoff", showIf: { questionId: "pickupOrDropoff", value: "pickup" } },
  ],
  Realtor: [
    { key: "realtorSpecialties", title: "What are your specialties?", subtitle: "Pick all that apply.", selectAll: true, optional: true },
  ],
  Hauler: [
    { key: "wontHaul", title: "What won't you haul?", subtitle: "Items you can't take for safety, legal, or insurance reasons.", after: "specialItems", optional: true },
  ],
};

export function fieldScreensFor(categoryLabel: string): FieldScreen[] {
  return FIELD_SCREENS[categoryLabel] ?? [];
}

/** Details fields for the setup "A few … details" screen: editable, not
 * hidden, and not already shown as their own screen. */
export function setupDetailsFields(schema: MarketplaceFieldDef[], categoryLabel: string): MarketplaceFieldDef[] {
  const own = new Set(fieldScreensFor(categoryLabel).map((s) => s.key));
  return schema.filter((f) => f.type !== "file" && !isHiddenForPartner(categoryLabel, f.key) && !own.has(f.key));
}

// ─── Service area rules ───────────────────────────────────────────────────────

/** Senior communities are a place families come to: no "Where do you work?"
 * screen; their area is set around their own zip instead. */
export function skipsAreaStep(categoryLabels: string[]): boolean {
  return categoryLabels.length > 0 && categoryLabels.every((l) => l === "Community");
}

/** Always in person: no "How do you work with clients?" choice */
export function inPersonOnly(categoryLabels: string[]): boolean {
  return categoryLabels.length > 0 && categoryLabels.every((l) => l === "Hauler" || l === "Community");
}

// ─── Display names ────────────────────────────────────────────────────────────

const PARTNER_CATEGORY_LABELS: Record<string, string> = {
  "Care Manager": "Care Management / Concierge",
};

export function partnerCategoryLabel(label: string): string {
  return PARTNER_CATEGORY_LABELS[label] ?? label;
}

/** Realtors show as "Brokerage | Town | Name or team" */
export function realtorDisplayName(p: { companyName: string; city: string; pocName: string }): string {
  return [p.companyName, p.city, p.pocName].map((s) => s.trim()).filter(Boolean).join(" | ");
}
