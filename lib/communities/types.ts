// Community Details: senior living communities and condo buildings, with
// their Move-Day Rules and Contacts. Client-safe.
//
// RULE_DEFINITIONS drives the UI, the PDF, the completeness score and the
// merge fields. Adding a rule = one entry here plus its Airtable field.

export const COMMUNITY_TYPES = ["Senior Living", "CCRC", "Condo / Association", "Other"] as const;
export type CommunityType = (typeof COMMUNITY_TYPES)[number];

export const COMMUNITY_STATUSES = ["Active", "Prospect", "Inactive"] as const;
export type CommunityStatus = (typeof COMMUNITY_STATUSES)[number];

export const COI_OPTIONS = ["Yes", "No", "Confirm Per Move", "Unknown"] as const;
export type CoiRequired = (typeof COI_OPTIONS)[number];

export const CONTACT_ROLES = [
  "Move-In Coordinator",
  "Move Scheduling",
  "Sales / Residency",
  "Marketing",
  "Maintenance",
  "Executive Director",
  "Property Manager",
  "Association Manager",
  "Front Desk",
  "Other",
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const PHONE_LABELS = ["Office", "Direct", "Mobile", "Text", "24/7", "Main"] as const;
export type PhoneLabel = (typeof PHONE_LABELS)[number];
export interface Phone { label: PhoneLabel; number: string }

export const RULE_STATUSES = ["known", "unknown", "not_applicable"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export type RuleKey =
  | "checkin"
  | "parking"
  | "elevator"
  | "move_hours"
  | "advance_notice"
  | "coi_required"
  | "coi_details"
  | "apartment_access"
  | "trash"
  | "other";

export type RuleIcon = "door" | "truck" | "elevator" | "clock" | "calendar" | "shield" | "file" | "key" | "trash" | "info";

export interface RuleDefinition {
  key: RuleKey;
  label: string;
  /** Short label for compact places (the PDF grid, the glance strip). */
  shortLabel: string;
  help: string;
  icon: RuleIcon;
  /** "coi" is the Yes / No / Confirm Per Move / Unknown select. */
  fieldType: "text" | "coi";
  /** Counts toward completeness. */
  essential: boolean;
  /** Shown in the drawer's "At a glance" strip. */
  glance: boolean;
  /** Its own row in the PDF's "Move-Day at a Glance" panel. COI Details prints inside the COI row; Other Rules & Tips gets its own block. */
  pdfGlance: boolean;
  airtableField: string;
}

export const RULE_DEFINITIONS: RuleDefinition[] = [
  { key: "checkin", label: "Check-in on Arrival", shortLabel: "Check-in", help: "Where the team and movers report first, and who to ask for.", icon: "door", fieldType: "text", essential: true, glance: true, pdfGlance: true, airtableField: "Check-in on Arrival" },
  { key: "parking", label: "Truck Parking / Entrance", shortLabel: "Truck Parking", help: "Where the truck parks and which entrance to use.", icon: "truck", fieldType: "text", essential: true, glance: true, pdfGlance: true, airtableField: "Truck Parking / Entrance" },
  { key: "elevator", label: "Elevator Rules", shortLabel: "Elevator", help: "Freight or service elevator, reservations, lock-off and limits.", icon: "elevator", fieldType: "text", essential: true, glance: true, pdfGlance: true, airtableField: "Elevator Rules" },
  { key: "move_hours", label: "Move Hours & Timing Limits", shortLabel: "Move Hours", help: "Allowed move windows and hard stops (meals, quiet hours).", icon: "clock", fieldType: "text", essential: true, glance: false, pdfGlance: true, airtableField: "Move Hours & Timing Limits" },
  { key: "advance_notice", label: "Advance Notice / Reservation", shortLabel: "Advance Notice", help: "What to book ahead and how far in advance.", icon: "calendar", fieldType: "text", essential: true, glance: false, pdfGlance: true, airtableField: "Advance Notice / Reservation" },
  { key: "coi_required", label: "COI Required", shortLabel: "COI", help: "Does the mover or TTT need a certificate of insurance?", icon: "shield", fieldType: "coi", essential: true, glance: false, pdfGlance: true, airtableField: "COI Required" },
  { key: "coi_details", label: "COI Details", shortLabel: "COI Details", help: "Certificate holder, additional insured wording, who supplies it.", icon: "file", fieldType: "text", essential: false, glance: false, pdfGlance: false, airtableField: "COI Details" },
  { key: "apartment_access", label: "Apartment Access", shortLabel: "Apartment Access", help: "How the unit gets opened on move day.", icon: "key", fieldType: "text", essential: true, glance: false, pdfGlance: true, airtableField: "Apartment Access" },
  { key: "trash", label: "Trash & Packing Materials", shortLabel: "Trash & Packing", help: "Dumpsters, chutes and who hauls packing materials.", icon: "trash", fieldType: "text", essential: true, glance: false, pdfGlance: true, airtableField: "Trash & Packing Materials" },
  { key: "other", label: "Other Rules & Tips", shortLabel: "Other Rules & Tips", help: "Anything else the team should know before move day.", icon: "info", fieldType: "text", essential: false, glance: false, pdfGlance: false, airtableField: "Other Rules & Tips" },
];

export const RULE_KEYS = RULE_DEFINITIONS.map((r) => r.key);
export const ruleDef = (key: RuleKey) => RULE_DEFINITIONS.find((r) => r.key === key)!;

export interface Community {
  id: string;
  name: string;
  type: CommunityType;
  operator: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  linkedCompanyId: string;
  status: CommunityStatus;
  /** Rule text by key. coi_required holds the select value. */
  rules: Record<RuleKey, string>;
  /** Explicit statuses; use ruleStatus() to read the effective one. */
  ruleStatus: Partial<Record<RuleKey, RuleStatus>>;
  floorPlansOnFile: boolean;
  floorPlansNotes: string;
  openItems: string;
  sourceNotes: string;
  lastVerified: string; // YYYY-MM-DD or ""
  lastVerifiedBy: string;
  internalNotes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface CommunityContact {
  id: string;
  communityId: string;
  name: string;
  title: string;
  role: ContactRole | "";
  email: string;
  phones: Phone[];
  isPrimaryMoveIn: boolean;
  notes: string;
  linkedContactId: string;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export const ACTIVITY_ACTIONS = [
  "Created", "Updated", "Archived", "Restored", "PDF Generated", "Contact Added", "Contact Updated", "Contact Removed",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface CommunityActivity {
  id: string;
  communityId: string;
  action: ActivityAction;
  summary: string;
  by: string;
  at: string;
}

/** List rows carry their contacts so search and the primary column need one fetch. */
export interface CommunityWithContacts extends Community {
  contacts: CommunityContact[];
}

/** Effective status: empty text (or an Unknown COI) is unknown unless marked N/A. */
export function ruleStatus(c: Pick<Community, "rules" | "ruleStatus">, key: RuleKey): RuleStatus {
  const explicit = c.ruleStatus[key];
  if (explicit === "not_applicable") return "not_applicable";
  const value = (c.rules[key] ?? "").trim();
  if (!value || explicit === "unknown") return "unknown";
  if (ruleDef(key).fieldType === "coi" && value === "Unknown") return "unknown";
  return "known";
}

export function primaryMoveInContact(contacts: CommunityContact[]): CommunityContact | undefined {
  return contacts.find((c) => c.isPrimaryMoveIn && !c.archived);
}

export function formatAddress(c: Pick<Community, "street" | "city" | "state" | "zip">): string {
  const cityLine = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [c.street, cityLine].filter(Boolean).join(", ");
}

export const emptyRules = (): Record<RuleKey, string> =>
  Object.fromEntries(RULE_KEYS.map((k) => [k, ""])) as Record<RuleKey, string>;
