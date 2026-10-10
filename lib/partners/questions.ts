import { PARTNER_CATEGORIES, type PartnerCategory, type Tenant } from "@/lib/types";

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
  /** Grey example text in a text answer box; disappears once they type. */
  placeholder?: string;
  /** Best-guess answer from onboarding data, shown pre-selected so the user
   * can just confirm or change it rather than re-entering what we already
   * know. */
  prefill?: (tenant: PrefillTenant) => string | undefined;
  /** When true AND prefill() returns a value, this question is skipped
   * entirely (auto-answered, never shown as a step) rather than merely
   * pre-selected — for data we already collected during onboarding and
   * shouldn't make the user re-confirm. */
  skipIfPrefilled?: boolean;
  /** Maps this question to the Category.fieldSchema attribute key it should
   * be scored against (lib/partners/scoring.ts's attribute-overlap factor).
   * Left unset for questions with no vendor-attribute equivalent (zip,
   * timeline, free-text notes) — those drive hard filtering or are purely
   * informational, not scored. */
  matchQuestionKey?: string;
  /** How this question is asked of PARTNERS when they set their matching
   * criteria (lib/partners/criteria.ts): every select question becomes a
   * "which of these do you serve?" question with the same options, so
   * adding or changing a client question updates the partner side too.
   * Leave unset for a generic fallback wording. */
  partnerPrompt?: string;
  /** false = describes the client's situation, not something a partner
   * serves or doesn't (e.g. "Do you already have a will?"), so it's never
   * a partner criterion. */
  partnerCriteria?: false;
  /** For a yes/no category field (matchQuestionKey points at a boolean):
   * the client answers that need the partner to have it set to Yes. Any
   * other answer doesn't score this question. */
  requiresAttributeTrue?: string[];
}

// Prepended to every category's question list (see getPartnerQuestions) —
// not duplicated into each PARTNER_QUESTIONS entry, so there's exactly one
// place to change it. whoFor is informational only, shown to the partner
// on intro, never scored.
//
// In-person vs. virtual is deliberately NOT a question here — some
// categories (grief counseling, financial advisory, estate planning) have
// partners who are virtual-only or virtual-first, while others never will
// be, and asking the client to pre-filter on it would just throw away
// good local options before they're ever seen. Instead it's surfaced as a
// pill on the matched-partner cards themselves (see
// components/partners/PartnerMatchResults.tsx) so the client sees a mix —
// 1-2 local options plus a virtual one when available — and picks.
// Schedule questions, shared so Companion Care, Home Health Care and Care
// Management ask (and partners answer) exactly the same thing. Optional in
// the two categories that added them later, so earlier requests stay complete.
const DAYS_PER_WEEK_QUESTION: PartnerQuestion = {
  id: "daysPerWeek",
  partnerPrompt: "Which schedules do you take on?",
  prompt: "How many days per week are you looking for?",
  type: "single-select",
  options: [
    { value: "daily", label: "Daily" },
    { value: "3_4_days", label: "3-4 days a week" },
    { value: "1_2_days", label: "1-2 days a week" },
    { value: "occasionally", label: "Just occasionally" },
  ],
};
const HOURS_PER_VISIT_QUESTION: PartnerQuestion = {
  id: "hoursPerVisit",
  partnerPrompt: "Which visit lengths do you offer?",
  prompt: "How many hours per visit?",
  type: "single-select",
  options: [
    { value: "live_in", label: "24/7 or live-in" },
    { value: "4_plus", label: "4+ hours per visit" },
    { value: "2_4", label: "2-4 hours per visit" },
    { value: "under_2", label: "Under 2 hours per visit" },
  ],
};

const UNIVERSAL_QUESTIONS: PartnerQuestion[] = [
  {
    id: "whoFor",
    prompt: "Who are we helping?",
    type: "single-select",
    options: [
      { value: "self", label: "Myself" },
      { value: "parent", label: "My parent" },
      { value: "spouse", label: "My spouse" },
      { value: "other", label: "Someone else" },
    ],
  },
];

// Zip question ids used to vary by category (propertyZip, areaZip,
// pickupZip) before this migration unified them to plain "zip" — kept here
// so an existing PartnerRequest.Answers blob saved under the old key still
// resolves correctly. Mover keeps fromZip/toZip as-is; those are two
// genuinely different concepts (origin vs. destination), not a naming
// inconsistency to fix.
const LEGACY_ANSWER_KEY_ALIASES: Partial<Record<PartnerCategory, Record<string, string>>> = {
  Realtor: { propertyZip: "zip" },
  Community: { areaZip: "zip" },
  Hauler: { pickupZip: "zip" },
};

/** Remaps any answer stored under a pre-migration key to its current key —
 * apply this to every answers object read from Airtable before using it,
 * so a client mid-flow when this shipped isn't silently treated as having
 * skipped a question they already answered. Not applied inside the save
 * path's own read-merge-write (lib/airtable.ts's savePartnerRequestAnswers,
 * kept free of this domain-specific concern) — that just means an old key
 * can linger alongside the new one in storage until overwritten, which is
 * harmless since every read path normalizes through this function anyway. */
export function migrateLegacyAnswerKeys(
  category: PartnerCategory,
  answers: Record<string, string | string[]>
): Record<string, string | string[]> {
  const aliases = LEGACY_ANSWER_KEY_ALIASES[category];
  if (!aliases) return answers;
  const migrated = { ...answers };
  for (const [oldKey, newKey] of Object.entries(aliases)) {
    if (migrated[oldKey] !== undefined && migrated[newKey] === undefined) {
      migrated[newKey] = migrated[oldKey];
    }
  }
  return migrated;
}

// Question ids that mean the exact same real-world thing in every category
// that asks them — who the request is for, the client's zip, how soon they
// need this — so once a client answers one of these for ANY category, every
// other category's survey should reuse it instead of asking again. Deliberately
// narrow: category-specific questions that happen to share a generic id
// elsewhere in the app (there are none today) would need to be excluded here,
// not just left out by accident. Mover's fromZip/toZip don't qualify — they're
// a different id, not "zip", so they're unaffected and keep getting their own
// tenant-based prefill.
export const CROSS_CATEGORY_SHARED_QUESTION_IDS = new Set(["whoFor", "zip", "timeline"]);

/** Answers already given for a DIFFERENT category's survey that apply here
 * too — same person, same zip, same timeline. Scans every other category's
 * saved answers (in PARTNER_CATEGORIES' stable order, so the result is
 * deterministic when more than one other category has an answer) and
 * returns a value only for CROSS_CATEGORY_SHARED_QUESTION_IDS. Feed the
 * result into getPrefillAnswers/getVisibleQuestions as crossCategoryAnswers
 * to both skip the question and carry the value into this category's own
 * saved answers. */
export function getCrossCategoryAnswers(
  excludeCategory: PartnerCategory,
  allAnswers: Partial<Record<PartnerCategory, Record<string, string | string[]>>>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const id of CROSS_CATEGORY_SHARED_QUESTION_IDS) {
    for (const category of PARTNER_CATEGORIES) {
      if (category === excludeCategory) continue;
      const value = allAnswers[category]?.[id];
      if (typeof value === "string" && value) {
        result[id] = value;
        break;
      }
    }
  }
  return result;
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
      partnerPrompt: "Do you work with sellers, buyers, or both?",
      prompt: "Are you selling your current home, buying a new one, or both?",
      type: "single-select",
      options: [
        { value: "selling", label: "Selling" },
        { value: "buying", label: "Buying" },
        { value: "both", label: "Both" },
      ],
    },
    {
      id: "zip",
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
      partnerPrompt: "Which property types do you handle?",
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
      partnerPrompt: "Which care levels does your community offer?",
      prompt: "What type of community are you looking for?",
      type: "single-select",
      options: [
        { value: "independent_living", label: "Independent living" },
        { value: "assisted_living", label: "Assisted living" },
        { value: "memory_care", label: "Memory care" },
        { value: "continuing_care", label: "CCRC" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      matchQuestionKey: "careLevelsOffered",
    },
    {
      id: "unitType",
      partnerPrompt: "Which apartment sizes do you offer?",
      prompt: "What size apartment are you looking for?",
      type: "single-select",
      options: [
        { value: "studio", label: "Studio" },
        { value: "one_bedroom", label: "1 bedroom" },
        { value: "two_bedroom", label: "2 bedroom" },
        { value: "two_bedroom_plus", label: "2 bedroom plus" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      // Added later: optional so earlier requests stay complete
      optional: true,
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
      id: "zip",
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
      partnerPrompt: "Which move sizes do you take on?",
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
      partnerPrompt: "Which of these do you offer?",
      prompt: "Do you need packing help, or just the move itself?",
      type: "single-select",
      options: [
        { value: "packing_and_move", label: "Packing and moving" },
        { value: "move_only", label: "Just the move" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      matchQuestionKey: "packingServices",
      // Movers answer this with the "Packing Services" yes/no on their
      // details screen, so there's no separate partner criteria screen
      partnerCriteria: false,
      requiresAttributeTrue: ["packing_and_move"],
    },
  ],

  Hauler: [
    {
      id: "items",
      partnerPrompt: "What do you haul away?",
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
      matchQuestionKey: "servicesOffered",
    },
    {
      id: "volume",
      partnerPrompt: "Which job sizes do you take on?",
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
      id: "zip",
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
      partnerPrompt: "Which special items can you handle?",
      prompt: "Any items needing special handling?",
      helper: "Choose all that apply.",
      type: "chips-multi",
      options: [
        { value: "electronics", label: "Electronics" },
        { value: "appliances_with_freon", label: "Appliances with freon" },
        { value: "mattresses", label: "Mattresses & box springs" },
        { value: "pianos", label: "Pianos" },
        { value: "hot_tubs", label: "Hot tubs & spas" },
        { value: "safes", label: "Safes" },
        { value: "exercise_equipment", label: "Exercise equipment" },
        { value: "tires", label: "Tires" },
        { value: "carpet", label: "Carpet & flooring" },
        { value: "yard_waste", label: "Yard waste & brush" },
        { value: "scrap_metal", label: "Scrap metal" },
        { value: "sheds_playsets", label: "Sheds, decks & playsets (tear-down)" },
        { value: "paint_or_chemicals", label: "Paint or chemicals" },
        { value: "none", label: "None of these" },
      ],
      optional: true,
    },
  ],

  Donation: [
    {
      id: "items",
      partnerPrompt: "Which items do you accept?",
      prompt: "What are you hoping to donate?",
      helper: "Choose all that apply.",
      type: "chips-multi",
      options: [
        { value: "furniture", label: "Furniture" },
        { value: "clothing", label: "Clothing & shoes" },
        { value: "housewares", label: "Housewares & kitchen items" },
        { value: "linens", label: "Linens & bedding" },
        { value: "electronics", label: "Electronics" },
        { value: "appliances", label: "Appliances" },
        { value: "books_media", label: "Books & media" },
        { value: "art_decor", label: "Art & home décor" },
        { value: "tools", label: "Tools & hardware" },
        { value: "sporting_goods", label: "Sporting goods & bikes" },
        { value: "toys_games", label: "Toys & games" },
        { value: "medical_equipment", label: "Medical equipment (walkers, wheelchairs)" },
        { value: "building_materials", label: "Building materials" },
        { value: "holiday", label: "Holiday decorations" },
        { value: "office", label: "Office furniture & supplies" },
        { value: "other", label: "Other" },
      ],
      matchQuestionKey: "acceptedItemTypes",
    },
    {
      id: "volume",
      partnerPrompt: "Which donation sizes do you take?",
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
      partnerPrompt: "Do you offer pickup, drop-off, or both?",
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

  "Care Manager": [
    {
      id: "careNeeds",
      partnerPrompt: "Which services do you provide?",
      prompt: "What would you like help with?",
      helper: "Choose all that apply.",
      type: "chips-multi",
      options: [
        { value: "care_assessment", label: "Assessing care needs & a care plan" },
        { value: "finding_services", label: "Finding & coordinating care services" },
        { value: "medical_advocacy", label: "Going to medical appointments & advocating" },
        { value: "medication_oversight", label: "Medication oversight" },
        { value: "hospital_transitions", label: "Hospital, rehab or discharge transitions" },
        { value: "housing_placement", label: "Choosing senior living or a care setting" },
        { value: "dementia_planning", label: "Dementia care planning" },
        { value: "navigating_healthcare", label: "Navigating Medicare, Medicaid & insurance" },
        { value: "crisis_support", label: "Help in a crisis" },
        { value: "family_mediation", label: "Family communication & decision support" },
        { value: "long_distance", label: "Support for family who live far away" },
        { value: "end_of_life", label: "End-of-life & hospice planning" },
        { value: "bill_paying", label: "Bill paying & daily money management" },
        { value: "household_errands", label: "Household management & errands" },
        { value: "transportation", label: "Arranging transportation" },
        { value: "home_safety", label: "Home safety review" },
        { value: "tech_help", label: "Technology setup & help" },
        { value: "social_engagement", label: "Social activities & staying connected" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      matchQuestionKey: "servicesOffered",
    },
    { ...DAYS_PER_WEEK_QUESTION, optional: true },
    { ...HOURS_PER_VISIT_QUESTION, optional: true },
    {
      id: "zip",
      prompt: "What zip code should we use?",
      type: "zip",
      prefill: prefillZipFromCurrent,
    },
    {
      id: "timeline",
      prompt: "How soon do you need to get started?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
    },
    {
      id: "notes",
      prompt: "Anything else the care manager should know?",
      type: "text",
      optional: true,
    },
  ],

  "Estate Attorney": [
    {
      id: "serviceType",
      partnerPrompt: "Which practice areas do you handle?",
      prompt: "What kind of legal help do you need?",
      type: "single-select",
      options: [
        { value: "estate_trust_planning", label: "Estate / trust planning" },
        { value: "probate", label: "Probate" },
        { value: "power_of_attorney", label: "Power of attorney / guardianship" },
        { value: "elder_law_medicaid", label: "Elder law / Medicaid planning" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      matchQuestionKey: "practiceAreas",
    },
    {
      id: "zip",
      prompt: "What zip code should we use to find someone nearby?",
      type: "zip",
      prefill: prefillZipFromCurrent,
    },
    {
      id: "timeline",
      prompt: "How soon do you need to get started?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
    },
    {
      id: "hasExistingDocuments",
      partnerCriteria: false,
      prompt: "Do you already have a will or estate plan in place?",
      type: "single-select",
      options: [
        { value: "needs_updating", label: "Yes, but it needs updating" },
        { value: "current", label: "Yes, and it's current" },
        { value: "starting_fresh", label: "No, starting from scratch" },
        { value: "not_sure", label: "Not sure" },
      ],
      matchQuestionKey: "documentsCommonlyHandled",
    },
    {
      id: "notes",
      prompt: "Anything else the attorney should know?",
      type: "text",
      optional: true,
    },
  ],

  "Financial Advisory": [
    {
      id: "focusArea",
      partnerPrompt: "Which areas do you focus on?",
      prompt: "What would you like help with?",
      helper: "Choose all that apply.",
      type: "chips-multi",
      options: [
        { value: "retirement_income", label: "Retirement income planning" },
        { value: "long_term_care_costs", label: "Long-term care / senior living costs" },
        { value: "selling_home_proceeds", label: "Selling a home & managing proceeds" },
        { value: "estate_legacy_planning", label: "Estate & legacy planning" },
        { value: "medicaid_planning", label: "Medicaid planning" },
        { value: "social_security_medicare", label: "Social Security & Medicare decisions" },
        { value: "tax_planning", label: "Tax planning" },
        { value: "investment_management", label: "Investment management" },
        { value: "insurance_annuities", label: "Insurance & annuities review" },
        { value: "financial_caregiving", label: "Managing finances for an aging parent" },
        { value: "after_spouse_loss", label: "Financial changes after losing a spouse" },
        { value: "budgeting", label: "Budgeting & cash flow" },
        { value: "charitable_giving", label: "Charitable giving" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      matchQuestionKey: "focusAreas",
    },
    {
      id: "zip",
      prompt: "What zip code should we use?",
      type: "zip",
      prefill: prefillZipFromCurrent,
    },
    {
      id: "timeline",
      prompt: "How soon are you hoping to meet with someone?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
    },
    {
      id: "hasAdvisor",
      partnerCriteria: false,
      prompt: "Do you currently work with a financial advisor?",
      type: "single-select",
      options: [
        { value: "second_opinion", label: "Yes, looking for a second opinion" },
        { value: "want_a_change", label: "Yes, but want a change" },
        { value: "first_time", label: "No, this is my first time" },
      ],
    },
    {
      id: "notes",
      prompt: "Anything else the advisor should know?",
      type: "text",
      optional: true,
    },
  ],

  "Companion Care": [
    {
      id: "careNeeds",
      partnerPrompt: "Which kinds of support do you provide?",
      prompt: "What kind of support are you looking for?",
      helper: "Choose all that apply.",
      type: "chips-multi",
      options: [
        { value: "companionship_housekeeping", label: "Companionship & light housekeeping" },
        { value: "meal_prep", label: "Meal preparation" },
        { value: "transportation", label: "Transportation to appointments" },
        { value: "personal_care", label: "Personal care assistance" },
        { value: "medication_reminders", label: "Medication reminders" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      matchQuestionKey: "careTypes",
    },
    DAYS_PER_WEEK_QUESTION,
    HOURS_PER_VISIT_QUESTION,
    {
      id: "zip",
      prompt: "What zip code is the care needed in?",
      type: "zip",
      prefill: prefillZipFromCurrent,
    },
    {
      id: "timeline",
      prompt: "How soon do you need care to begin?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
    },
    // Non-medical companion care is mostly private pay: Original Medicare
    // doesn't cover it. The other real sources are long-term care insurance,
    // Medicaid home and community-based waivers (in Illinois, the Community
    // Care Program through the Dept. on Aging), VA benefits (Aid & Attendance
    // pension or the VA Homemaker/Home Health Aide program), and some
    // Medicare Advantage plans' in-home support benefits.
    {
      id: "payment",
      partnerPrompt: "Which payment sources do you accept?",
      prompt: "How are you planning on paying?",
      helper: "Choose all that apply.",
      type: "chips-multi",
      options: [
        { value: "private_pay", label: "Paying directly (private pay)" },
        { value: "ltc_insurance", label: "Long-term care insurance" },
        { value: "medicaid", label: "Medicaid or a state program (like the Community Care Program)" },
        { value: "va_benefits", label: "VA benefits (like Aid & Attendance)" },
        { value: "medicare_advantage", label: "Medicare Advantage plan benefits" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      matchQuestionKey: "acceptedPayers",
    },
    {
      id: "notes",
      prompt: "Anything else the caregiver should know?",
      type: "text",
      optional: true,
      placeholder: "For example: other care already in place (like home health care), memory concerns, pets in the home, preferred language, or best times for visits.",
    },
  ],

  // Distinct from Companion Care: this is skilled, medically-ordered care
  // (nursing, therapy, medication management) delivered by licensed
  // professionals, typically following a hospital/rehab stay or new
  // diagnosis — vs. Companion Care's non-medical ADL support. The payer
  // question matters a lot more here than for any other category: unlike
  // Companion Care (almost always private pay), home health agencies are
  // commonly Medicare-certified, and which payers a given agency accepts is
  // often the single biggest factor in whether a match can actually help.
  "Home Health Care": [
    {
      id: "careType",
      partnerPrompt: "Which kinds of care do you provide?",
      prompt: "What kind of care is needed?",
      helper: "Choose all that apply.",
      type: "chips-multi",
      options: [
        { value: "skilled_nursing", label: "Skilled nursing care (wound care, injections, catheter or IV care)" },
        { value: "physical_therapy", label: "Physical therapy" },
        { value: "occupational_speech_therapy", label: "Occupational or speech therapy" },
        { value: "medication_management", label: "Medication management" },
        { value: "post_hospital_recovery", label: "Recovery after a hospital or rehab stay" },
        { value: "chronic_disease_management", label: "Ongoing management of a chronic condition (diabetes, heart failure, COPD, etc.)" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      matchQuestionKey: "careTypes",
    },
    { ...DAYS_PER_WEEK_QUESTION, optional: true },
    { ...HOURS_PER_VISIT_QUESTION, optional: true },
    {
      id: "payer",
      partnerPrompt: "Which payers do you accept?",
      prompt: "How will this be paid for?",
      type: "single-select",
      options: [
        { value: "medicare", label: "Medicare" },
        { value: "medicare_advantage", label: "Medicare Advantage plan" },
        { value: "medicaid", label: "Medicaid" },
        { value: "private_insurance", label: "Private insurance" },
        { value: "private_pay", label: "Private pay / self-pay" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      matchQuestionKey: "acceptedPayers",
    },
    {
      id: "zip",
      prompt: "What zip code is the care needed in?",
      type: "zip",
      prefill: prefillZipFromCurrent,
    },
    {
      id: "timeline",
      prompt: "How soon do you need care to begin?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
    },
    {
      id: "notes",
      prompt: "Anything else the care team should know?",
      helper: "For example, if this follows a hospital or rehab stay, or if you already have a doctor's order for home health care.",
      type: "text",
      optional: true,
    },
  ],

  "After Loss Support": [
    {
      id: "supportType",
      partnerPrompt: "How do you help families after a loss?",
      prompt: "What kind of support would help right now?",
      helper: "Choose all that apply. Clearing the home is handled separately.",
      type: "chips-multi",
      // "home_clearing" was retired as an option; older answers that
      // include it are simply not matched on it.
      options: [
        { value: "grief_counseling", label: "Grief counseling" },
        { value: "support_groups", label: "Grief support groups" },
        { value: "paperwork_logistics", label: "Paperwork & logistics after a loss" },
        { value: "notifications", label: "Notifying agencies, banks & accounts" },
        { value: "benefits_claims", label: "Claiming benefits (Social Security, pensions, life insurance)" },
        { value: "estate_settlement", label: "Estate settlement assistance" },
        { value: "executor_support", label: "Coaching & support for the executor" },
        { value: "funeral_planning", label: "Funeral & memorial planning" },
        { value: "obituary_writing", label: "Obituary & eulogy writing" },
        { value: "digital_accounts", label: "Closing online & digital accounts" },
        { value: "financial_guidance", label: "Financial guidance after a loss" },
        { value: "legacy_projects", label: "Legacy & keepsake projects" },
        { value: "not_sure", label: "Not sure yet" },
      ],
      matchQuestionKey: "servicesOffered",
    },
    {
      id: "zip",
      prompt: "What zip code should we use?",
      type: "zip",
      prefill: prefillZipFromCurrent,
    },
    {
      id: "timeline",
      prompt: "How soon would you like to connect with someone?",
      type: "single-select",
      options: TIMELINE_OPTIONS,
      prefill: prefillTimeline,
      skipIfPrefilled: true,
      optional: true,
    },
    {
      id: "notes",
      prompt: "Anything else that would help us connect you with the right support?",
      type: "text",
      optional: true,
    },
  ],
};

// Asked in categories where partners can genuinely help by phone or video
// (the ones marked "Allows virtual" in Marketplace > Categories that have a
// question flow). Optional, so requests answered before it existed stay
// complete. Scoring (lib/partners/scoring.ts) uses it to decide how much to
// show virtual partners; it's never a partner criterion.
export const VIRTUAL_OK_QUESTION_ID = "virtualOk";
const VIRTUAL_CATEGORIES = new Set<PartnerCategory>([
  "Care Manager", "Estate Attorney", "Financial Advisory", "Home Health Care", "After Loss Support",
] as PartnerCategory[]);
const VIRTUAL_OK_QUESTION: PartnerQuestion = {
  id: VIRTUAL_OK_QUESTION_ID,
  prompt: "Would help by phone or video work for you?",
  helper: "Some partners can help remotely. We'll still show local options when there are some.",
  type: "single-select",
  options: [
    { value: "yes", label: "Yes, that works" },
    { value: "in_person", label: "I'd prefer in person" },
    { value: "not_sure", label: "Either is fine" },
  ],
  optional: true,
  partnerCriteria: false,
};

export function getPartnerQuestions(category: PartnerCategory): PartnerQuestion[] {
  const categoryQuestions = PARTNER_QUESTIONS[category];
  if (!categoryQuestions) return []; // Move Manager — no flow, see comment above PARTNER_QUESTIONS
  if (!VIRTUAL_CATEGORIES.has(category)) return [...UNIVERSAL_QUESTIONS, ...categoryQuestions];
  // Right after the zip question, where location is already on their mind
  const zipIdx = categoryQuestions.findIndex((q) => q.type === "zip");
  const at = zipIdx >= 0 ? zipIdx + 1 : categoryQuestions.length;
  return [...UNIVERSAL_QUESTIONS, ...categoryQuestions.slice(0, at), VIRTUAL_OK_QUESTION, ...categoryQuestions.slice(at)];
}

export function getPrefillAnswers(
  category: PartnerCategory,
  tenant: PrefillTenant,
  crossCategoryAnswers: Record<string, string> = {}
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of getPartnerQuestions(category)) {
    // A value already given for another category wins over an inferred
    // onboarding guess — it's a direct answer, not a guess.
    const cross = CROSS_CATEGORY_SHARED_QUESTION_IDS.has(q.id) ? crossCategoryAnswers[q.id] : undefined;
    if (cross) {
      answers[q.id] = cross;
      continue;
    }
    const value = q.prefill?.(tenant);
    if (value) answers[q.id] = value;
  }
  return answers;
}

/** The question steps actually shown to the user — everything except
 * skipIfPrefilled questions that already have a confident prefilled value
 * (those are auto-answered instead, see PartnerRequestFlow), and any
 * CROSS_CATEGORY_SHARED_QUESTION_IDS already answered for another category
 * (always auto-answered, regardless of that question's own skipIfPrefilled
 * setting — the point is never asking the same thing twice). */
export function getVisibleQuestions(
  category: PartnerCategory,
  tenant: PrefillTenant,
  crossCategoryAnswers: Record<string, string> = {}
): PartnerQuestion[] {
  const prefill = getPrefillAnswers(category, tenant, crossCategoryAnswers);
  return getPartnerQuestions(category).filter((q) => {
    if (CROSS_CATEGORY_SHARED_QUESTION_IDS.has(q.id) && crossCategoryAnswers[q.id]) return false;
    return !(q.skipIfPrefilled && prefill[q.id]);
  });
}

// The universal question is prepended first in every flow (see
// getPartnerQuestions), so a genuinely new request can never reach any
// category-specific answer without having already answered it —
// PartnerRequestFlow.tsx's step UI enforces that order and blocks
// advancing past a non-optional, unanswered question. The ONLY way a
// request can have real category answers but be missing this one is if
// it was completed before this question existed. Excluding it here (but
// not from the step UI, where it's still asked normally) means a
// pre-existing "matched" request keeps showing its matches instead of
// silently going incomplete the next time that client visits.
const COMPLETENESS_GATE_EXCLUDED_IDS = new Set(["whoFor"]);

export function isPartnerRequestComplete(category: PartnerCategory, answers: Record<string, string | string[]>): boolean {
  const questions = getPartnerQuestions(category);
  return questions.every((q) => {
    if (q.optional || COMPLETENESS_GATE_EXCLUDED_IDS.has(q.id)) return true;
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
