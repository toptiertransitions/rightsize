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
  referralFeeConfirmedBy?: string;
  referralFeeConfirmedAt?: string;
}

export type MarketplaceDeliveryMode = "In-person" | "Virtual" | "Both";
export type MarketplacePriceTier = "$" | "$$" | "$$$" | "Contact for pricing";
export type MarketplaceLifecycleStatus = "Prospect" | "Invited" | "Submitted" | "Live" | "Paused" | "Archived";
export type MarketplacePartnerSource = "Manual" | "CRM" | "Self-signup" | "Import";

export interface MarketplaceServiceArea {
  zips: string[];
  counties: string[];
  statewide: boolean;
  nationwide: boolean;
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
  lifecycleStatus: MarketplaceLifecycleStatus;
  source: MarketplacePartnerSource;
  /** Linked CRMReferralCompanies record id, if this company is ALSO a CRM
   * referral partner. Optional — most marketplace partners need no login at
   * all. When set, that company's existing ReferralContact.clerkUserId
   * portal already covers login; this model adds no login field of its own. */
  crmReferralCompanyId?: string;
  /** Linked LocalVendors record id, if this company is ALSO a disposition-
   * side vendor (e.g. buys items from the Consignment Catalog). Same note
   * as above — login, if any, lives on that LocalVendor's clerkUserId. */
  localVendorId?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

export type MarketplaceListingStatus = "Draft" | "Submitted" | "Live" | "Paused";
export type MarketplaceFeeType = "none" | "percent" | "flat";

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
  createdAt: string;
  updatedAt: string;
}

/** The same shape, with referralTerms physically absent — never partial or
 * redacted, just not present on the type — for public/partner-facing reads.
 * See lib/marketplace/data.ts's getPublicListing/getPartnerOwnListing. */
export type MarketplacePublicListing = Omit<
  MarketplaceListing,
  "feeType" | "feeValue" | "creditToSeniorPercent" | "referralNotes" | "agreementOnFile" | "agreementDate"
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
}
