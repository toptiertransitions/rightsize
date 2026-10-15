// ─── The new Partner/Category/Listing marketplace model ───────────────────────
// Deliberately independent of LocalVendor/PartnerCategory (lib/types.ts) — see
// the Phase 0 plan. The old model keeps running untouched until Phase 6.

export type MarketplaceFieldType =
  | "text"
  | "longtext"
  | "number"
  | "select"
  | "multiselect"
  | "boolean"
  | "currency"
  | "range"
  | "url"
  | "file";

export interface MarketplaceFieldDef {
  key: string;
  label: string;
  type: MarketplaceFieldType;
  options?: string[];
  required?: boolean;
  filterable?: boolean;
  showOnCard?: boolean;
  showOnProfile?: boolean;
  helpText?: string;
  /** Maps to a lib/partners/questions.ts PartnerQuestion id, once that
   * migration happens in Phase 5 — unused until then. */
  matchQuestionKey?: string;
}

export interface MarketplaceReferralPolicy {
  feesAllowed: boolean;
  requiresDisclosure: boolean;
  disclosureText: string;
  creditToSeniorAllowed: boolean;
}

export interface MarketplaceCategory {
  id: string;
  slug: string;
  label: string;
  description: string;
  icon: string;
  sortOrder: number;
  minLiveListings: number;
  fieldSchema: MarketplaceFieldDef[];
  completenessRules: { requiredFieldKeys: string[] };
  referralPolicy: MarketplaceReferralPolicy;
  allowsVirtual: boolean;
  /** Shown to clients (Rightsize Partners page and the public marketplace).
   * Set by admins with the toggle on the marketplace dashboard; matching
   * decides who's actually shown within a visible category. */
  publicVisible: boolean;
  referralFeeConfirmedBy?: string;
  referralFeeConfirmedAt?: string;
}

export type MarketplaceDeliveryMode = "In-person" | "Virtual" | "Both";
export type MarketplacePriceTier = "$" | "$$" | "$$$" | "Contact for pricing";
export type MarketplaceLifecycleStatus =
  | "Prospect" | "Invited" | "Submitted" | "Waiting on Partner" | "Rejected" | "Live" | "Paused" | "Archived";

/** Every lifecycle status, in pipeline order */
export const MARKETPLACE_LIFECYCLE_STATUSES: MarketplaceLifecycleStatus[] = [
  "Prospect", "Invited", "Submitted", "Waiting on Partner", "Rejected", "Live", "Paused", "Archived",
];
export type MarketplacePartnerSource = "Manual" | "CRM" | "Self-signup" | "Import";

export interface MarketplaceServiceArea {
  zips: string[];
  counties: string[];
  statewide: boolean;
  nationwide: boolean;
  /** Set when the partner chose "Zip + radius": every zip within `miles` of
   * `zip` is expanded into `zips` at save time (matching only reads zips). */
  radius?: { zip: string; miles: number };
}

export interface MarketplacePartner {
  id: string;
  companyName: string;
  slug: string;
  pocName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  logo: string;
  shortBio: string;
  aboutUs: string;
  deliveryMode: MarketplaceDeliveryMode;
  serviceArea: MarketplaceServiceArea;
  languages: string[];
  seniorSpecialty: string[];
  priceTier: MarketplacePriceTier | "";
  responsivenessScore?: number;
  featuredRank?: number;
  projectsCompletedAdjustment: number;
  /** Admin toggle (Partners tab). Off by default: the review average is
   * hidden everywhere it would display until a TTTAdmin turns it on. */
  displayReviewScore: boolean;
  lifecycleStatus: MarketplaceLifecycleStatus;
  source: MarketplacePartnerSource;
  /** Linked CRMReferralCompanies record id, if this company is ALSO a CRM
   * referral partner. Optional — most marketplace partners need no login at
   * all. When set, that company's existing ReferralContact.clerkUserId
   * portal already covers login; this model adds no login field of its own. */
  crmReferralCompanyId?: string;
  /** The specific CRMReferralContacts person who was (or will be) invited
   * to the Referral Partner Portal — distinct from crmReferralCompanyId,
   * since a company can have multiple contacts but only one is the actual
   * invited portal user. Set by the admin-only "Invite to Partner Portal"
   * action (app/admin/marketplace/actions.ts); never self-service. */
  crmReferralContactId?: string;
  /** Linked LocalVendors record id, if this company is ALSO a disposition-
   * side vendor (e.g. buys items from the Consignment Catalog). Same note
   * as above — login, if any, lives on that LocalVendor's clerkUserId. */
  localVendorId?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  /** Who on the team gets new-lead alerts (see ./leadRouting.ts) */
  leadRouting: "all" | "selected";
  /** Don't send lead emails to the business Email address */
  leadSkipBusinessEmail: boolean;
  /** Latest review email sent from the dashboard (changes requested or rejected) */
  reviewFeedback?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export type MarketplaceListingStatus = "Draft" | "Submitted" | "Live" | "Paused";
export type MarketplaceFeeType = "none" | "percent" | "flat";
/** Where an introduction request for this listing actually goes. Defaults
 * to TTTAdmin for every listing — no automated external send happens
 * until a TTTAdmin explicitly switches a specific listing to PartnerEmail
 * or CustomURL. See requestPartnerIntroAction. */
export type MarketplaceIntroNotificationMethod = "TTTAdmin" | "PartnerEmail" | "CustomURL";

export interface MarketplaceListing {
  id: string;
  partnerId: string;
  categoryId: string;
  isPrimary: boolean;
  status: MarketplaceListingStatus;
  attributes: Record<string, unknown>;
  feeType: MarketplaceFeeType;
  feeValue: number;
  creditToSeniorPercent: number;
  referralNotes: string;
  agreementOnFile: boolean;
  agreementDate: string;
  completenessPercent: number;
  introNotificationMethod: MarketplaceIntroNotificationMethod;
  introNotificationValue: string;
  createdAt: string;
  updatedAt: string;
}

/** The same shape, with referralTerms (and the equally-internal intro
 * notification routing) physically absent — never partial or redacted,
 * just not present on the type — for public/partner-facing reads. See
 * lib/marketplace/data.ts's getPublicListing/getPartnerOwnListing. */
export type MarketplacePublicListing = Omit<
  MarketplaceListing,
  "feeType" | "feeValue" | "creditToSeniorPercent" | "referralNotes" | "agreementOnFile" | "agreementDate" | "introNotificationMethod" | "introNotificationValue"
>;

export interface MarketplaceReferralTermsAuditEntry {
  id: string;
  listingId: string;
  changedBy: string;
  changedAt: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  confirmedRestrictedCategory: boolean;
}

export type MarketplaceIntroductionChannel = "Email" | "UniqueLink" | "Both";
export type MarketplaceIntroductionStatus =
  | "Requested"
  | "Delivered"
  | "Viewed"
  | "Contacted"
  | "Engaged"
  | "Declined"
  | "Billed";

export interface MarketplaceIntroductionEvent {
  id: string;
  listingId: string;
  partnerId: string;
  tenantId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  categoryAnswersSnapshot: Record<string, string | string[]>;
  referralTermsSnapshot: {
    feeType: MarketplaceFeeType;
    feeValue: number;
    creditToSeniorPercent: number;
  };
  channel: MarketplaceIntroductionChannel;
  trackingToken: string;
  status: MarketplaceIntroductionStatus;
  requestedAt: string;
  deliveredAt?: string;
  viewedAt?: string;
  statusUpdatedAt?: string;
  billedAt?: string;
  disclosureAcknowledgedAt?: string;
  /** When the lead became visible to the partner (portal Leads page +
   * email). Set by an admin's "Release to partner", or at creation for
   * listings that notify the partner directly. Unset = held for TTT admins. */
  releasedAt?: string;
  releasedBy?: string;
}

// ─── Partner users (company accounts) ──────────────────────────────────────────
// Who can sign in to a marketplace partner company's portal. Independent of
// the CRM: a partner user needs no CRMReferralContacts record. Every company
// has at most one Active Primary (the account owner) plus any number of
// Members.

export type PartnerUserRole = "Primary" | "Member";
/** Invited: invite sent, not yet accepted. Revoked: invite cancelled before
 * it was accepted. Removed: had access, taken away. */
export type PartnerUserStatus = "Invited" | "Active" | "Removed" | "Revoked";

export interface PartnerUser {
  id: string;
  partnerId: string;
  email: string;
  clerkUserId?: string;
  name: string;
  title?: string;
  phone?: string;
  role: PartnerUserRole;
  status: PartnerUserStatus;
  inviteToken?: string;
  inviteExpiresAt?: string;
  invitedAt?: string;
  invitedByName?: string;
  invitedByClerkId?: string;
  lastInviteSentAt?: string;
  acceptedAt?: string;
  removedAt?: string;
  removedByName?: string;
  lastActiveAt?: string;
  /** Gets new-lead emails and push notifications */
  notifyLeads: boolean;
  /** How the row came to be: "Admin invite", "Team invite", "Existing login", "Backfill" */
  source?: string;
  createdAt: string;
}

/** What the browser is allowed to see: never the invite token. */
export type PartnerUserView = Omit<PartnerUser, "inviteToken"> & { inviteExpired: boolean };
