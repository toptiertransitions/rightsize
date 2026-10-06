// ─── Marketplace data-access layer ─────────────────────────────────────────────
// The ONLY place in the app that talks to the Partners/MarketplaceCategories/
// MarketplaceListings/MarketplaceReferralTermsAuditLog/MarketplaceIntroductionEvents
// Airtable tables directly. No component, route, or server action should call
// fetch() against these tables itself — go through the functions here so the
// referral-terms exposure boundary (see getPublicListing/getPartnerOwnListing)
// stays enforced in one place.
import { AIRTABLE_TABLES } from "../config";
import type {
  MarketplaceCategory,
  MarketplaceFieldDef,
  MarketplaceFieldType,
  MarketplaceIntroductionChannel,
  MarketplaceIntroductionEvent,
  MarketplaceIntroductionStatus,
  MarketplaceListing,
  MarketplaceListingStatus,
  MarketplaceFeeType,
  MarketplacePartner,
  MarketplacePublicListing,
  MarketplaceReferralPolicy,
  MarketplaceReferralTermsAuditEntry,
  MarketplaceServiceArea,
} from "./types";

type AirtableRec = { id: string; fields: Record<string, unknown> };

function marketplaceFetch(table: string, path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

async function fetchAllRecords(table: string): Promise<AirtableRec[]> {
  let all: AirtableRec[] = [];
  let offset: string | undefined;
  do {
    const qs = offset ? `?offset=${offset}` : "";
    const res = await marketplaceFetch(table, qs);
    const data = await res.json();
    if (!res.ok) throw new Error(`Airtable fetch failed for ${table}: ${JSON.stringify(data)}`);
    all = all.concat(data.records);
    offset = data.offset;
  } while (offset);
  return all;
}

function str(v: unknown): string { return v != null ? String(v) : ""; }
function num(v: unknown): number { return v != null ? Number(v) : 0; }
function bool(v: unknown): boolean { return v === true; }
function strArr(v: unknown): string[] { return Array.isArray(v) ? v.map(String) : []; }
function linkedId(v: unknown): string { return Array.isArray(v) && v.length > 0 ? String(v[0]) : ""; }

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ─── Categories (config, not code) ────────────────────────────────────────────

function mapCategory(rec: AirtableRec): MarketplaceCategory {
  const f = rec.fields;
  const fieldSchema = parseJson<MarketplaceFieldDef[]>(f["FieldSchemaJson"], []);
  const referralPolicy: MarketplaceReferralPolicy = {
    feesAllowed: bool(f["FeesAllowed"]),
    requiresDisclosure: bool(f["RequiresDisclosure"]),
    disclosureText: str(f["DisclosureText"]),
    creditToSeniorAllowed: bool(f["CreditToSeniorAllowed"]),
  };
  return {
    id: rec.id,
    slug: str(f["Slug"]),
    label: str(f["Label"]),
    description: str(f["Description"]),
    icon: str(f["Icon"]),
    sortOrder: num(f["SortOrder"]),
    minLiveListings: num(f["MinLiveListings"]) || 3,
    fieldSchema,
    completenessRules: parseJson(f["CompletenessRulesJson"], { requiredFieldKeys: [] }),
    referralPolicy,
    allowsVirtual: bool(f["AllowsVirtual"]),
    referralFeeConfirmedBy: str(f["ReferralFeeConfirmedBy"]) || undefined,
    referralFeeConfirmedAt: str(f["ReferralFeeConfirmedAt"]) || undefined,
  };
}

export async function getAllCategories(): Promise<MarketplaceCategory[]> {
  const records = await fetchAllRecords(AIRTABLE_TABLES.MARKETPLACE_CATEGORIES);
  return records.map(mapCategory).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getCategoryBySlug(slug: string): Promise<MarketplaceCategory | null> {
  const all = await getAllCategories();
  return all.find((c) => c.slug === slug) ?? null;
}

export async function getCategoryById(id: string): Promise<MarketplaceCategory | null> {
  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_CATEGORIES, `/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  return mapCategory(data);
}

interface UpdateCategoryData {
  label?: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
  minLiveListings?: number;
  fieldSchema?: MarketplaceFieldDef[];
  completenessRules?: { requiredFieldKeys: string[] };
  referralPolicy?: Partial<MarketplaceReferralPolicy>;
  allowsVirtual?: boolean;
  referralFeeConfirmedBy?: string;
  referralFeeConfirmedAt?: string;
}

/** Admin-only (see lib/marketplace/permissions.ts's canEditCategories). */
export async function updateCategory(id: string, data: UpdateCategoryData): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (data.label !== undefined) fields["Label"] = data.label;
  if (data.description !== undefined) fields["Description"] = data.description;
  if (data.icon !== undefined) fields["Icon"] = data.icon;
  if (data.sortOrder !== undefined) fields["SortOrder"] = data.sortOrder;
  if (data.minLiveListings !== undefined) fields["MinLiveListings"] = data.minLiveListings;
  if (data.fieldSchema !== undefined) fields["FieldSchemaJson"] = JSON.stringify(data.fieldSchema);
  if (data.completenessRules !== undefined) fields["CompletenessRulesJson"] = JSON.stringify(data.completenessRules);
  if (data.referralPolicy?.feesAllowed !== undefined) fields["FeesAllowed"] = data.referralPolicy.feesAllowed;
  if (data.referralPolicy?.requiresDisclosure !== undefined) fields["RequiresDisclosure"] = data.referralPolicy.requiresDisclosure;
  if (data.referralPolicy?.disclosureText !== undefined) fields["DisclosureText"] = data.referralPolicy.disclosureText;
  if (data.referralPolicy?.creditToSeniorAllowed !== undefined) fields["CreditToSeniorAllowed"] = data.referralPolicy.creditToSeniorAllowed;
  if (data.allowsVirtual !== undefined) fields["AllowsVirtual"] = data.allowsVirtual;
  if (data.referralFeeConfirmedBy !== undefined) fields["ReferralFeeConfirmedBy"] = data.referralFeeConfirmedBy;
  if (data.referralFeeConfirmedAt !== undefined) fields["ReferralFeeConfirmedAt"] = data.referralFeeConfirmedAt;

  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_CATEGORIES, "", {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });
  if (!res.ok) throw new Error(`updateCategory failed: ${await res.text()}`);
}

// ─── Partners ──────────────────────────────────────────────────────────────────

function mapPartner(rec: AirtableRec): MarketplacePartner {
  const f = rec.fields;
  return {
    id: rec.id,
    companyName: str(f["CompanyName"]),
    slug: str(f["Slug"]),
    pocName: str(f["POCName"]),
    email: str(f["Email"]),
    phone: str(f["Phone"]),
    website: str(f["Website"]),
    address: str(f["Address"]),
    city: str(f["City"]),
    state: str(f["State"]),
    zip: str(f["Zip"]),
    logo: str(f["Logo"]),
    shortBio: str(f["ShortBio"]),
    aboutUs: str(f["AboutUs"]),
    deliveryMode: (str(f["DeliveryMode"]) || "In-person") as MarketplacePartner["deliveryMode"],
    serviceArea: parseJson<MarketplaceServiceArea>(f["ServiceAreaJson"], { zips: [], counties: [], statewide: false, nationwide: false }),
    languages: strArr(f["Languages"]),
    seniorSpecialty: strArr(f["SeniorSpecialty"]),
    priceTier: (str(f["PriceTier"]) || "") as MarketplacePartner["priceTier"],
    responsivenessScore: f["ResponsivenessScore"] != null ? num(f["ResponsivenessScore"]) : undefined,
    featuredRank: f["FeaturedRank"] != null ? num(f["FeaturedRank"]) : undefined,
    projectsCompletedAdjustment: num(f["ProjectsCompletedAdjustment"]),
    lifecycleStatus: (str(f["LifecycleStatus"]) || "Prospect") as MarketplacePartner["lifecycleStatus"],
    source: (str(f["Source"]) || "Manual") as MarketplacePartner["source"],
    crmReferralCompanyId: linkedId(f["CrmReferralCompanyId"]) || undefined,
    crmReferralContactId: linkedId(f["CrmReferralContactId"]) || undefined,
    localVendorId: linkedId(f["LocalVendorId"]) || undefined,
    createdAt: str(f["CreatedAt"]),
    updatedAt: str(f["UpdatedAt"]),
    approvedAt: str(f["ApprovedAt"]) || undefined,
    approvedBy: str(f["ApprovedBy"]) || undefined,
  };
}

export async function getAllPartners(): Promise<MarketplacePartner[]> {
  const records = await fetchAllRecords(AIRTABLE_TABLES.MARKETPLACE_PARTNERS);
  return records.map(mapPartner);
}

export async function getPartnerById(id: string): Promise<MarketplacePartner | null> {
  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_PARTNERS, `/${id}`);
  if (!res.ok) return null;
  return mapPartner(await res.json());
}

interface CreatePartnerData {
  companyName: string;
  slug: string;
  pocName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  deliveryMode?: MarketplacePartner["deliveryMode"];
  source?: MarketplacePartner["source"];
  crmReferralCompanyId?: string;
  localVendorId?: string;
}

export async function createPartner(data: CreatePartnerData): Promise<MarketplacePartner> {
  const now = new Date().toISOString();
  const fields: Record<string, unknown> = {
    CompanyName: data.companyName,
    Slug: data.slug,
    POCName: data.pocName ?? "",
    Email: data.email ?? "",
    Phone: data.phone ?? "",
    Website: data.website ?? "",
    Address: data.address ?? "",
    City: data.city ?? "",
    State: data.state ?? "",
    Zip: data.zip ?? "",
    DeliveryMode: data.deliveryMode ?? "In-person",
    ServiceAreaJson: JSON.stringify({ zips: [], counties: [], statewide: false, nationwide: false }),
    ProjectsCompletedAdjustment: 0,
    LifecycleStatus: "Prospect",
    Source: data.source ?? "Manual",
    CreatedAt: now,
    UpdatedAt: now,
    ...(data.crmReferralCompanyId ? { CrmReferralCompanyId: [data.crmReferralCompanyId] } : {}),
    ...(data.localVendorId ? { LocalVendorId: [data.localVendorId] } : {}),
  };
  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_PARTNERS, "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`createPartner failed: ${JSON.stringify(result)}`);
  return mapPartner(result.records[0]);
}

interface UpdatePartnerData extends Partial<Omit<CreatePartnerData, "crmReferralCompanyId" | "localVendorId">> {
  crmReferralContactId?: string | null;
  logo?: string;
  shortBio?: string;
  aboutUs?: string;
  serviceArea?: MarketplaceServiceArea;
  languages?: string[];
  seniorSpecialty?: string[];
  priceTier?: MarketplacePartner["priceTier"];
  responsivenessScore?: number | null;
  featuredRank?: number | null;
  projectsCompletedAdjustment?: number;
  lifecycleStatus?: MarketplacePartner["lifecycleStatus"];
  crmReferralCompanyId?: string | null;
  localVendorId?: string | null;
  approvedAt?: string;
  approvedBy?: string;
}

export async function updatePartner(id: string, data: UpdatePartnerData): Promise<void> {
  const fields: Record<string, unknown> = { UpdatedAt: new Date().toISOString() };
  if (data.companyName !== undefined) fields["CompanyName"] = data.companyName;
  if (data.slug !== undefined) fields["Slug"] = data.slug;
  if (data.pocName !== undefined) fields["POCName"] = data.pocName;
  if (data.email !== undefined) fields["Email"] = data.email;
  if (data.phone !== undefined) fields["Phone"] = data.phone;
  if (data.website !== undefined) fields["Website"] = data.website;
  if (data.address !== undefined) fields["Address"] = data.address;
  if (data.city !== undefined) fields["City"] = data.city;
  if (data.state !== undefined) fields["State"] = data.state;
  if (data.zip !== undefined) fields["Zip"] = data.zip;
  if (data.logo !== undefined) fields["Logo"] = data.logo;
  if (data.shortBio !== undefined) fields["ShortBio"] = data.shortBio;
  if (data.aboutUs !== undefined) fields["AboutUs"] = data.aboutUs;
  if (data.deliveryMode !== undefined) fields["DeliveryMode"] = data.deliveryMode;
  if (data.serviceArea !== undefined) fields["ServiceAreaJson"] = JSON.stringify(data.serviceArea);
  if (data.languages !== undefined) fields["Languages"] = data.languages;
  if (data.seniorSpecialty !== undefined) fields["SeniorSpecialty"] = data.seniorSpecialty;
  if (data.priceTier !== undefined) fields["PriceTier"] = data.priceTier;
  if (data.responsivenessScore !== undefined) fields["ResponsivenessScore"] = data.responsivenessScore;
  if (data.featuredRank !== undefined) fields["FeaturedRank"] = data.featuredRank;
  if (data.projectsCompletedAdjustment !== undefined) fields["ProjectsCompletedAdjustment"] = data.projectsCompletedAdjustment;
  if (data.lifecycleStatus !== undefined) fields["LifecycleStatus"] = data.lifecycleStatus;
  if (data.source !== undefined) fields["Source"] = data.source;
  if (data.crmReferralCompanyId !== undefined) fields["CrmReferralCompanyId"] = data.crmReferralCompanyId ? [data.crmReferralCompanyId] : [];
  if (data.crmReferralContactId !== undefined) fields["CrmReferralContactId"] = data.crmReferralContactId ? [data.crmReferralContactId] : [];
  if (data.localVendorId !== undefined) fields["LocalVendorId"] = data.localVendorId ? [data.localVendorId] : [];
  if (data.approvedAt !== undefined) fields["ApprovedAt"] = data.approvedAt;
  if (data.approvedBy !== undefined) fields["ApprovedBy"] = data.approvedBy;

  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_PARTNERS, "", {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });
  if (!res.ok) throw new Error(`updatePartner failed: ${await res.text()}`);
}

// ─── Listings ──────────────────────────────────────────────────────────────────
// Two mappers on purpose: mapListingAdmin (everything, admin-only callers) and
// toPublicListing (referral-terms fields physically omitted, never redacted-
// but-present). Nothing outside this file should read raw Listing Airtable
// records — every public/partner-facing query below returns
// MarketplacePublicListing, not MarketplaceListing.

function mapListingAdmin(rec: AirtableRec): MarketplaceListing {
  const f = rec.fields;
  return {
    id: rec.id,
    partnerId: linkedId(f["PartnerId"]),
    categoryId: linkedId(f["CategoryId"]),
    isPrimary: bool(f["IsPrimary"]),
    status: (str(f["Status"]) || "Draft") as MarketplaceListingStatus,
    attributes: parseJson<Record<string, unknown>>(f["AttributesJson"], {}),
    feeType: (str(f["FeeType"]) || "none") as MarketplaceFeeType,
    feeValue: num(f["FeeValue"]),
    creditToSeniorPercent: num(f["CreditToSeniorPercent"]),
    referralNotes: str(f["ReferralNotes"]),
    agreementOnFile: bool(f["AgreementOnFile"]),
    agreementDate: str(f["AgreementDate"]),
    completenessPercent: num(f["CompletenessPercent"]),
    createdAt: str(f["CreatedAt"]),
    updatedAt: str(f["UpdatedAt"]),
  };
}

export function toPublicListing(listing: MarketplaceListing): MarketplacePublicListing {
  const {
    feeType: _feeType,
    feeValue: _feeValue,
    creditToSeniorPercent: _creditToSeniorPercent,
    referralNotes: _referralNotes,
    agreementOnFile: _agreementOnFile,
    agreementDate: _agreementDate,
    ...publicFields
  } = listing;
  return publicFields;
}

/** Admin-only — includes referralTerms. Never expose this return value
 * through a public or partner-facing API response. */
export async function getAllListingsAdmin(): Promise<MarketplaceListing[]> {
  const records = await fetchAllRecords(AIRTABLE_TABLES.MARKETPLACE_LISTINGS);
  return records.map(mapListingAdmin);
}

/** Public-safe — Live listings only, referralTerms fields not present on
 * the returned type at all. */
export async function getLiveListingsForCategory(categoryId: string): Promise<MarketplacePublicListing[]> {
  const all = await getAllListingsAdmin();
  return all
    .filter((l) => l.categoryId === categoryId && l.status === "Live")
    .map(toPublicListing);
}

/** Partner self-service — this partner's own listings, referralTerms still
 * never included (referral terms are internal-only, not partner-editable). */
export async function getOwnListingsForPartner(partnerId: string): Promise<MarketplacePublicListing[]> {
  const all = await getAllListingsAdmin();
  return all.filter((l) => l.partnerId === partnerId).map(toPublicListing);
}

export async function getListingsForPartnerAdmin(partnerId: string): Promise<MarketplaceListing[]> {
  const all = await getAllListingsAdmin();
  return all.filter((l) => l.partnerId === partnerId);
}

interface CreateListingData {
  partnerId: string;
  categoryId: string;
  isPrimary?: boolean;
  status?: MarketplaceListingStatus;
  attributes?: Record<string, unknown>;
}

export async function createListing(data: CreateListingData): Promise<MarketplaceListing> {
  const now = new Date().toISOString();
  const fields: Record<string, unknown> = {
    ListingKey: `${data.partnerId}:${data.categoryId}`,
    PartnerId: [data.partnerId],
    CategoryId: [data.categoryId],
    IsPrimary: data.isPrimary ?? false,
    Status: data.status ?? "Draft",
    AttributesJson: JSON.stringify(data.attributes ?? {}),
    FeeType: "none",
    FeeValue: 0,
    CreditToSeniorPercent: 0,
    AgreementOnFile: false,
    CompletenessPercent: 0,
    CreatedAt: now,
    UpdatedAt: now,
  };
  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_LISTINGS, "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`createListing failed: ${JSON.stringify(result)}`);
  return mapListingAdmin(result.records[0]);
}

interface UpdateListingData {
  isPrimary?: boolean;
  status?: MarketplaceListingStatus;
  attributes?: Record<string, unknown>;
  completenessPercent?: number;
}

/** Non-referral-terms fields — safe for a partner-self-service or admin
 * caller. Use updateListingReferralTerms (below) for fee/credit/notes, which
 * additionally writes an audit-log entry and is admin-only. */
export async function updateListing(id: string, data: UpdateListingData): Promise<void> {
  const fields: Record<string, unknown> = { UpdatedAt: new Date().toISOString() };
  if (data.isPrimary !== undefined) fields["IsPrimary"] = data.isPrimary;
  if (data.status !== undefined) fields["Status"] = data.status;
  if (data.attributes !== undefined) fields["AttributesJson"] = JSON.stringify(data.attributes);
  if (data.completenessPercent !== undefined) fields["CompletenessPercent"] = data.completenessPercent;

  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_LISTINGS, "", {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });
  if (!res.ok) throw new Error(`updateListing failed: ${await res.text()}`);
}

interface UpdateReferralTermsData {
  feeType?: MarketplaceFeeType;
  feeValue?: number;
  creditToSeniorPercent?: number;
  referralNotes?: string;
  agreementOnFile?: boolean;
  agreementDate?: string;
  confirmedRestrictedCategory?: boolean;
}

/** Admin-only (canEditReferralTerms). Writes the change, then logs every
 * changed field to MarketplaceReferralTermsAuditLog. */
export async function updateListingReferralTerms(
  id: string,
  data: UpdateReferralTermsData,
  changedBy: string
): Promise<void> {
  const before = mapListingAdmin(
    await (await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_LISTINGS, `/${id}`)).json()
  );

  const fields: Record<string, unknown> = { UpdatedAt: new Date().toISOString() };
  const changes: { field: string; oldValue: string; newValue: string }[] = [];
  if (data.feeType !== undefined && data.feeType !== before.feeType) {
    fields["FeeType"] = data.feeType;
    changes.push({ field: "FeeType", oldValue: before.feeType, newValue: data.feeType });
  }
  if (data.feeValue !== undefined && data.feeValue !== before.feeValue) {
    fields["FeeValue"] = data.feeValue;
    changes.push({ field: "FeeValue", oldValue: String(before.feeValue), newValue: String(data.feeValue) });
  }
  if (data.creditToSeniorPercent !== undefined && data.creditToSeniorPercent !== before.creditToSeniorPercent) {
    fields["CreditToSeniorPercent"] = data.creditToSeniorPercent;
    changes.push({ field: "CreditToSeniorPercent", oldValue: String(before.creditToSeniorPercent), newValue: String(data.creditToSeniorPercent) });
  }
  if (data.referralNotes !== undefined && data.referralNotes !== before.referralNotes) {
    fields["ReferralNotes"] = data.referralNotes;
    changes.push({ field: "ReferralNotes", oldValue: before.referralNotes, newValue: data.referralNotes });
  }
  if (data.agreementOnFile !== undefined && data.agreementOnFile !== before.agreementOnFile) {
    fields["AgreementOnFile"] = data.agreementOnFile;
    changes.push({ field: "AgreementOnFile", oldValue: String(before.agreementOnFile), newValue: String(data.agreementOnFile) });
  }
  if (data.agreementDate !== undefined && data.agreementDate !== before.agreementDate) {
    fields["AgreementDate"] = data.agreementDate;
    changes.push({ field: "AgreementDate", oldValue: before.agreementDate, newValue: data.agreementDate });
  }

  if (changes.length === 0) return;

  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_LISTINGS, "", {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });
  if (!res.ok) throw new Error(`updateListingReferralTerms failed: ${await res.text()}`);

  for (const change of changes) {
    await createReferralTermsAuditEntry({
      listingId: id,
      changedBy,
      fieldChanged: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      confirmedRestrictedCategory: data.confirmedRestrictedCategory ?? false,
    });
  }
}

// ─── Referral terms audit log ──────────────────────────────────────────────────

function mapAuditEntry(rec: AirtableRec): MarketplaceReferralTermsAuditEntry {
  const f = rec.fields;
  return {
    id: rec.id,
    listingId: linkedId(f["ListingId"]),
    changedBy: str(f["ChangedBy"]),
    changedAt: str(f["ChangedAt"]),
    fieldChanged: str(f["FieldChanged"]),
    oldValue: str(f["OldValue"]),
    newValue: str(f["NewValue"]),
    confirmedRestrictedCategory: bool(f["ConfirmedRestrictedCategory"]),
  };
}

interface CreateAuditEntryData {
  listingId: string;
  changedBy: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  confirmedRestrictedCategory: boolean;
}

async function createReferralTermsAuditEntry(data: CreateAuditEntryData): Promise<void> {
  const now = new Date().toISOString();
  const fields = {
    ChangeKey: `${data.listingId}:${now}:${data.fieldChanged}`,
    ListingId: [data.listingId],
    ChangedBy: data.changedBy,
    ChangedAt: now,
    FieldChanged: data.fieldChanged,
    OldValue: data.oldValue,
    NewValue: data.newValue,
    ConfirmedRestrictedCategory: data.confirmedRestrictedCategory,
  };
  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_REFERRAL_TERMS_AUDIT_LOG, "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!res.ok) throw new Error(`createReferralTermsAuditEntry failed: ${await res.text()}`);
}

/** Admin-only (canViewReferralAuditLog). */
export async function getAuditLogForListing(listingId: string): Promise<MarketplaceReferralTermsAuditEntry[]> {
  const records = await fetchAllRecords(AIRTABLE_TABLES.MARKETPLACE_REFERRAL_TERMS_AUDIT_LOG);
  return records.map(mapAuditEntry).filter((e) => e.listingId === listingId);
}

// ─── Introduction events ────────────────────────────────────────────────────────

function mapIntroductionEvent(rec: AirtableRec): MarketplaceIntroductionEvent {
  const f = rec.fields;
  return {
    id: rec.id,
    listingId: linkedId(f["ListingId"]),
    partnerId: linkedId(f["PartnerId"]),
    tenantId: str(f["TenantId"]),
    clientName: str(f["ClientName"]),
    clientEmail: str(f["ClientEmail"]),
    clientPhone: str(f["ClientPhone"]),
    categoryAnswersSnapshot: parseJson(f["CategoryAnswersSnapshot"], {}),
    referralTermsSnapshot: parseJson(f["ReferralTermsSnapshot"], { feeType: "none" as MarketplaceFeeType, feeValue: 0, creditToSeniorPercent: 0 }),
    channel: (str(f["Channel"]) || "Email") as MarketplaceIntroductionChannel,
    trackingToken: str(f["TrackingToken"]),
    status: (str(f["Status"]) || "Requested") as MarketplaceIntroductionStatus,
    requestedAt: str(f["RequestedAt"]),
    deliveredAt: str(f["DeliveredAt"]) || undefined,
    viewedAt: str(f["ViewedAt"]) || undefined,
    statusUpdatedAt: str(f["StatusUpdatedAt"]) || undefined,
    billedAt: str(f["BilledAt"]) || undefined,
    disclosureAcknowledgedAt: str(f["DisclosureAcknowledgedAt"]) || undefined,
  };
}

interface CreateIntroductionEventData {
  listingId: string;
  partnerId: string;
  tenantId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  categoryAnswersSnapshot: Record<string, string | string[]>;
  referralTermsSnapshot: { feeType: MarketplaceFeeType; feeValue: number; creditToSeniorPercent: number };
  channel: MarketplaceIntroductionChannel;
  disclosureAcknowledgedAt?: string;
}

function generateTrackingToken(): string {
  return `it_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function createIntroductionEvent(data: CreateIntroductionEventData): Promise<MarketplaceIntroductionEvent> {
  const now = new Date().toISOString();
  const fields = {
    EventKey: `${data.listingId}:${now}`,
    ListingId: [data.listingId],
    PartnerId: [data.partnerId],
    TenantId: data.tenantId,
    ClientName: data.clientName,
    ClientEmail: data.clientEmail,
    ClientPhone: data.clientPhone,
    CategoryAnswersSnapshot: JSON.stringify(data.categoryAnswersSnapshot),
    ReferralTermsSnapshot: JSON.stringify(data.referralTermsSnapshot),
    Channel: data.channel,
    TrackingToken: generateTrackingToken(),
    Status: "Requested",
    RequestedAt: now,
    ...(data.disclosureAcknowledgedAt ? { DisclosureAcknowledgedAt: data.disclosureAcknowledgedAt } : {}),
  };
  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_INTRODUCTION_EVENTS, "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`createIntroductionEvent failed: ${JSON.stringify(result)}`);
  return mapIntroductionEvent(result.records[0]);
}

export async function getIntroductionEventByToken(token: string): Promise<MarketplaceIntroductionEvent | null> {
  const res = await marketplaceFetch(
    AIRTABLE_TABLES.MARKETPLACE_INTRODUCTION_EVENTS,
    `?filterByFormula=${encodeURIComponent(`{TrackingToken} = "${token}"`)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapIntroductionEvent(data.records[0]);
}

export async function getIntroductionEventsForPartner(partnerId: string): Promise<MarketplaceIntroductionEvent[]> {
  const records = await fetchAllRecords(AIRTABLE_TABLES.MARKETPLACE_INTRODUCTION_EVENTS);
  return records.map(mapIntroductionEvent).filter((e) => e.partnerId === partnerId);
}

export async function updateIntroductionEventStatus(
  id: string,
  status: MarketplaceIntroductionStatus,
  extra?: { deliveredAt?: string; viewedAt?: string; billedAt?: string }
): Promise<void> {
  const fields: Record<string, unknown> = { Status: status, StatusUpdatedAt: new Date().toISOString() };
  if (extra?.deliveredAt) fields["DeliveredAt"] = extra.deliveredAt;
  if (extra?.viewedAt) fields["ViewedAt"] = extra.viewedAt;
  if (extra?.billedAt) fields["BilledAt"] = extra.billedAt;
  const res = await marketplaceFetch(AIRTABLE_TABLES.MARKETPLACE_INTRODUCTION_EVENTS, "", {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }] }),
  });
  if (!res.ok) throw new Error(`updateIntroductionEventStatus failed: ${await res.text()}`);
}
