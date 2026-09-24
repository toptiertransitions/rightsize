import type { PartnerCategory, Tenant } from "@/lib/types";

export type PartnerQuestionType = "single-select" | "chips-multi" | "text" | "zip";

export interface PartnerQuestionOption {
  value: string;
  label: string;
}

export type PrefillTenant = Pick<
  Tenant,
  | "currentZip"
  | "destinationZip"
  | "destinationType"
  | "destinationCommunity"
  | "destinationCommunityOther"
  | "timelineType"
  | "timelineValue"
  | "sqftRange"
  | "homeDensity"
  | "bedrooms"
>;

export interface PartnerQuestion {
  id: string;
  prompt: string;
  helper?: string;
  type: PartnerQuestionType;
  options?: PartnerQuestionOption[];
  optional?: boolean;
  /** Best-guess answer from onboarding data, shown pre-selected so the user
   * can just confirm or change it rather than re-entering what we already
   * know. */
  prefill?: (tenant: PrefillTenant) => string | undefined;
  /** When true AND prefill() returns a value, this question is skipped
   * entirely (auto-answered, never shown as a step) rather than merely
   * pre-selected — for data we already collected during onboarding and
   * shouldn't make the user re-confirm. */
  skipIfPrefilled?: boolean;
}

const TIMELINE_OPTIONS: PartnerQuestionOption[] = [
  { value: "asap", label: "As soon as possible" },
  { value: "1_3_months", label: "1–3 months" },
  { value: "3_6_months", label: "3–6 months" },
  { value: "6_plus_months", label: "6+ months" },
  { value: "not_sure", label: "Not sure yet" },
];

// Onboarding's "range" chip keys ("1_3", "3_6", "6_12") don't match these
// categories' TIMELINE_OPTIONS values ("1_3_months", "3_6_months",
// "6_plus_months") — this maps between the two vocabularies rather than
// passing the raw onboarding value through unmatched.
const ONBOARDING_RANGE_TO_TIMELINE_OPTION: Record<string, string> = {
  asap: "asap",
  "1_3": "1_3_months",
  "3_6": "3_6_months",
  "6_12": "6_plus_months",
  not_sure: "not_sure",
};

// A "month"/"date" onboarding timeline has no direct chip equivalent, so it's
// bucketed by how far away it is — same buckets TIMELINE_OPTIONS already uses.
function bucketByMonthsAway(target: Date): string {
  if (isNaN(target.getTime())) return "not_sure";
  const now = new Date();
  const monthsAway = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  if (monthsAway <= 0) return "asap";
  if (monthsAway <= 3) return "1_3_months";
  if (monthsAway <= 6) return "3_6_months";
  return "6_plus_months";
}

function prefillTimeline(tenant: PrefillTenant): string | undefined {
  if (!tenant.timelineType || !tenant.timelineValue) return undefined;
  if (tenant.timelineType === "range") return ONBOARDING_RANGE_TO_TIMELINE_OPTION[tenant.timelineValue];
  if (tenant.timelineType === "month") {
    const [y, m] = tenant.timelineValue.split("-").map(Number);
    if (!y || !m) return undefined;
    return bucketByMonthsAway(new Date(y, m - 1, 1));
  }
  if (tenant.timelineType === "date") return bucketByMonthsAway(new Date(`${tenant.timelineValue}T00:00:00`));
  return undefined;
}

function prefillZipFromCurrent(tenant: PrefillTenant): string | undefined {
  return tenant.currentZip || undefined;
}

function prefillZipFromDestination(tenant: PrefillTenant): string | undefined {
  return tenant.destinationZip || undefined;
}

const HOME_DENSITY_TO_VOLUME: Record<NonNullable<Tenant["homeDensity"]>, string> = {
  light: "few_items",
  comfortable: "partial_truck",
  full: "full_truck",
  collector: "multiple_loads",
};

function prefillVolumeFromDensity(tenant: PrefillTenant): string | undefined {
  return tenant.homeDensity ? HOME_DENSITY_TO_VOLUME[tenant.homeDensity] : undefined;
}

const BEDROOMS_TO_HOME_SIZE: Array<[max: number, value: string]> = [
  [0, "studio"],
  [1, "1br"],
  [2, "2br"],
  [3, "3br"],
];

function prefillHomeSizeFromBedrooms(tenant: PrefillTenant): string | undefined {
  if (tenant.bedrooms == null) return undefined;
  const match = BEDROOMS_TO_HOME_SIZE.find(([max]) => tenant.bedrooms! <= max);
  return match ? match[1] : "4br_plus";
}

// Move Manager has no flow here — it's always Top Tier Transitions itself
// (see TTTMoveManagerCard.tsx), never a marketplace match to question toward.
export const PARTNER_QUESTIONS: Partial<Record<PartnerCategory, PartnerQuestion[]>> = {
  Realtor: [
    {
      id: "intent",
      prompt: "Are you selling your current home, buying a new one, or both?",
      type: "single-select",
      options: [
        { value: "selling", label: "Selling" },
        { value: "buying", label: "Buying" },
        { value: "both", label: "Both" },
      ],
    },
    {
      id: "propertyZip",
      prompt: "What's the zip code for the property?",
      type: "zip",
      prefill: prefillZipFromCurrent,
    },
    {
      id: "timeline",
      prompt: "When are you hoping to list or close?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
    },
    {
      id: "propertyType",
      prompt: "What type of property is it?",
      type: "single-select",
      options: [
        { value: "single_family", label: "Single-family home" },
        { value: "condo_townhome", label: "Condo or townhome" },
        { value: "multi_family", label: "Multi-family" },
        { value: "other", label: "Other" },
      ],
    },
    {
      id: "notes",
      prompt: "Anything else your realtor should know?",
      type: "text",
      optional: true,
    },
  ],

  Community: [
    {
      id: "careType",
      prompt: "What type of community are you looking for?",
      type: "single-select",
      options: [
        { value: "independent_living", label: "Independent living" },
        { value: "assisted_living", label: "Assisted living" },
        { value: "memory_care", label: "Memory care" },
        { value: "continuing_care", label: "Continuing care" },
        { value: "not_sure", label: "Not sure yet" },
      ],
    },
    {
      id: "communityName",
      prompt: "Do you already have a community in mind?",
      helper: "If so, let us know which one. If not, that's okay too.",
      type: "text",
      optional: true,
      prefill: (tenant) => tenant.destinationCommunityOther || undefined,
    },
    {
      id: "areaZip",
      prompt: "What zip code or area are you looking in?",
      type: "zip",
      prefill: prefillZipFromDestination,
    },
    {
      id: "timeline",
      prompt: "When are you hoping to move?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
    },
    {
      id: "budget",
      prompt: "Do you have a monthly budget range in mind?",
      type: "text",
      optional: true,
    },
  ],

  Mover: [
    {
      id: "fromZip",
      prompt: "What zip code are you moving from?",
      type: "zip",
      prefill: prefillZipFromCurrent,
    },
    {
      id: "toZip",
      prompt: "What zip code are you moving to?",
      type: "zip",
      prefill: prefillZipFromDestination,
    },
    {
      id: "timeline",
      prompt: "When's the move?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
    },
    {
      id: "homeSize",
      prompt: "Roughly how much needs to move?",
      type: "single-select",
      options: [
        { value: "studio", label: "Studio" },
        { value: "1br", label: "1 bedroom" },
        { value: "2br", label: "2 bedrooms" },
        { value: "3br", label: "3 bedrooms" },
        { value: "4br_plus", label: "4+ bedrooms" },
      ],
      prefill: prefillHomeSizeFromBedrooms,
    },
    {
      id: "packingHelp",
      prompt: "Do you need packing help, or just the move itself?",
      type: "single-select",
      options: [
        { value: "packing_and_move", label: "Packing and moving" },
        { value: "move_only", label: "Just the move" },
        { value: "not_sure", label: "Not sure yet" },
      ],
    },
  ],

  Hauler: [
    {
      id: "items",
      prompt: "What needs to be hauled away?",
      helper: "Choose all that apply.",
      type: "chips-multi",
      options: [
        { value: "furniture", label: "Furniture" },
        { value: "appliances", label: "Appliances" },
        { value: "general_junk", label: "General junk" },
        { value: "construction_debris", label: "Construction debris" },
        { value: "other", label: "Other" },
      ],
    },
    {
      id: "volume",
      prompt: "Roughly how much volume?",
      type: "single-select",
      options: [
        { value: "few_items", label: "A few items" },
        { value: "partial_truck", label: "Partial truckload" },
        { value: "full_truck", label: "Full truckload" },
        { value: "multiple_loads", label: "Multiple loads" },
      ],
      prefill: prefillVolumeFromDensity,
    },
    {
      id: "pickupZip",
      prompt: "What zip code is the pickup?",
      type: "zip",
      prefill: prefillZipFromCurrent,
    },
    {
      id: "timeline",
      prompt: "When do you need this done?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
    },
    {
      id: "specialItems",
      prompt: "Any items needing special handling?",
      helper: "Choose all that apply.",
      type: "chips-multi",
      options: [
        { value: "electronics", label: "Electronics" },
        { value: "appliances_with_freon", label: "Appliances with freon" },
        { value: "paint_or_chemicals", label: "Paint or chemicals" },
        { value: "none", label: "None of these" },
      ],
      optional: true,
    },
  ],

  Donation: [
    {
      id: "items",
      prompt: "What are you hoping to donate?",
      helper: "Choose all that apply.",
      type: "chips-multi",
      options: [
        { value: "furniture", label: "Furniture" },
        { value: "clothing", label: "Clothing" },
        { value: "housewares", label: "Housewares" },
        { value: "electronics", label: "Electronics" },
        { value: "other", label: "Other" },
      ],
    },
    {
      id: "volume",
      prompt: "Roughly how much?",
      type: "single-select",
      options: [
        { value: "few_boxes", label: "A few boxes" },
        { value: "a_rooms_worth", label: "A room's worth" },
        { value: "a_full_household", label: "A full household" },
      ],
      prefill: prefillVolumeFromDensity,
    },
    {
      id: "pickupOrDropoff",
      prompt: "Do you need pickup, or can you drop off?",
      type: "single-select",
      options: [
        { value: "pickup", label: "Pickup" },
        { value: "dropoff", label: "Drop-off" },
        { value: "not_sure", label: "Not sure yet" },
      ],
    },
    {
      id: "zip",
      prompt: "What zip code should we use?",
      type: "zip",
      prefill: prefillZipFromCurrent,
    },
    {
      id: "timeline",
      prompt: "When are you hoping to donate by?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
      optional: true,
    },
  ],
};

export function getPartnerQuestions(category: PartnerCategory): PartnerQuestion[] {
  return PARTNER_QUESTIONS[category] ?? [];
}

export function getPrefillAnswers(category: PartnerCategory, tenant: PrefillTenant): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of getPartnerQuestions(category)) {
    const value = q.prefill?.(tenant);
    if (value) answers[q.id] = value;
  }
  return answers;
}

/** The question steps actually shown to the user — everything except
 * skipIfPrefilled questions that already have a confident prefilled value
 * (those are auto-answered instead, see PartnerRequestFlow). */
export function getVisibleQuestions(category: PartnerCategory, tenant: PrefillTenant): PartnerQuestion[] {
  const prefill = getPrefillAnswers(category, tenant);
  return getPartnerQuestions(category).filter((q) => !(q.skipIfPrefilled && prefill[q.id]));
}

export function isPartnerRequestComplete(category: PartnerCategory, answers: Record<string, string | string[]>): boolean {
  const questions = getPartnerQuestions(category);
  return questions.every((q) => {
    if (q.optional) return true;
    const value = answers[q.id];
    return Array.isArray(value) ? value.length > 0 : !!value;
  });
}

// Human-readable {label, value} pairs for a request's answers, used to
// render them in the intro-request notification email — option slugs
// (e.g. "1_3_months") are resolved to their display labels, chips-multi
// arrays are joined into a comma list.
export function formatAnswersForEmail(
  category: PartnerCategory,
  answers: Record<string, string | string[]>
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  for (const q of getPartnerQuestions(category)) {
    const raw = answers[q.id];
    if (raw == null || (Array.isArray(raw) && raw.length === 0) || raw === "") continue;
    const values = Array.isArray(raw) ? raw : [raw];
    const display = values.map((v) => q.options?.find((o) => o.value === v)?.label ?? v).join(", ");
    rows.push({ label: q.prompt, value: display });
  }
  return rows;
}
