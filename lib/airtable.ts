/**
 * Airtable client using the REST API with Personal Access Token auth.
 * No Google Cloud, no service accounts — just PAT + Base ID.
 */

import Airtable from "airtable";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { AIRTABLE_TABLES, isTTTAdmin, isTTTStaff } from "./config";
import { getZipCentroid, haversineDistanceMiles } from "./zip-centroids";
import type {
  Tenant,
  User,
  Membership,
  Room,
  Item,
  ItemPhoto,
  PlanEntry,
  PlanHelper,
  PlanActivity,
  UserRole,
  SystemRole,
  StaffMember,
  DensityLevel,
  ItemCondition,
  SizeClass,
  FragilityLevel,
  ItemUseType,
  PrimaryRoute,
  ItemStatus,
  RoomType,
  Vendor,
  VendorType,
  LocalVendor,
  ProjectFile,
  FileTag,
  TimeEntry,
  FocusArea,
  VendorDecision,
  RoutingRule,
  ContractSettings,
  ContractTemplate,
  Contract,
  ContractStatus,
  ContractLineItem,
  ReferralCompany,
  ReferralContact,
  ReferralContactStage,
  ClientContact,
  ClientOpportunity,
  OpportunityStage,
  KeyPerson,
  CRMActivity,
  CRMActivityType,
  GmailToken,
  Service,
  QBOTokenRecord,
  Invoice,
  InvoiceSettings,
  InvoiceStatus,
  InvoiceLineItem,
  InvoiceExpenseItem,
  Expense,
  ExpenseCategory,
  ItemSaleEvent,
  WeeklySchedule,
  TimeOffEntry,
  CrateLocation,
  InventoryContainer,
  InventoryItem,
  Estate,
  EstateStatus,
  EstateSaleType,
} from "./types";

// ─── Initialize Client ────────────────────────────────────────────────────────
function getBase() {
  if (!process.env.AIRTABLE_API_TOKEN) {
    throw new Error("AIRTABLE_API_TOKEN is not set");
  }
  if (!process.env.AIRTABLE_BASE_ID) {
    throw new Error("AIRTABLE_BASE_ID is not set");
  }
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_TOKEN });
  return Airtable.base(process.env.AIRTABLE_BASE_ID);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

// ─── Tenants ──────────────────────────────────────────────────────────────────
export const getTenants = unstable_cache(
  async (): Promise<Tenant[]> => {
    const base = getBase();
    const records = await base(AIRTABLE_TABLES.TENANTS)
      .select({ sort: [{ field: "CreatedAt", direction: "desc" }] })
      .all();
    return records.map(mapTenant);
  },
  ["tenants"],
  { revalidate: 60, tags: ["tenants"] }
);

export async function getTenantById(id: string): Promise<Tenant | null> {
  try {
    const base = getBase();
    const record = await base(AIRTABLE_TABLES.TENANTS).find(id);
    return mapTenant(record);
  } catch {
    return null;
  }
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.TENANTS)
    .select({ filterByFormula: `{Slug} = "${slug}"`, maxRecords: 1 })
    .all();
  return records.length > 0 ? mapTenant(records[0]) : null;
}

export async function createTenant(data: {
  name: string;
  slug: string;
  ownerUserId: string;
  plan?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  isTTT?: boolean;
  clientEmail?: string;
  clientPhone?: string;
}): Promise<Tenant> {
  const base = getBase();
  const fields: Airtable.FieldSet = {
    Name: data.name,
    Slug: data.slug,
    OwnerUserId: data.ownerUserId,
    Plan: data.plan || "free",
    CreatedAt: new Date().toISOString(),
    IsTTT: data.isTTT ?? false,
  };
  if (data.address) fields["Address"] = data.address;
  if (data.city) fields["City"] = data.city;
  if (data.state) fields["State"] = data.state;
  if (data.zip) fields["Zip"] = data.zip;
  if (data.clientEmail) fields["ClientEmail"] = data.clientEmail;
  if (data.clientPhone) fields["ClientPhone"] = data.clientPhone;
  const record = await base(AIRTABLE_TABLES.TENANTS).create(fields);
  return mapTenant(record);
}

function mapTenant(record: Airtable.Record<Airtable.FieldSet>): Tenant {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    name: toStr(f["Name"]),
    slug: toStr(f["Slug"]),
    plan: (toStr(f["Plan"]) || "free") as Tenant["plan"],
    ownerUserId: toStr(f["OwnerUserId"]),
    createdAt: toStr(f["CreatedAt"]),
    address: toStr(f["Address"]) || undefined,
    city: toStr(f["City"]) || undefined,
    state: toStr(f["State"]) || undefined,
    zip: toStr(f["Zip"]) || undefined,
    destAddress: toStr(f["DestAddress"]) || undefined,
    destCity: toStr(f["DestCity"]) || undefined,
    destState: toStr(f["DestState"]) || undefined,
    destZip: toStr(f["DestZip"]) || undefined,
    estimatedHours: f["EstimatedHours"] != null ? toNum(f["EstimatedHours"]) : undefined,
    estimatedServiceHours: (() => { try { const s = toStr(f["EstimatedServiceHours"]); return s ? JSON.parse(s) : undefined; } catch { return undefined; } })(),
    isArchived: f["IsArchived"] === true,
    isTTT: f["IsTTT"] == null ? undefined : f["IsTTT"] === true,
    isConsignmentOnly: f["IsConsignmentOnly"] === true,
    destinationSqFt: f["DestinationSqFt"] != null ? toNum(f["DestinationSqFt"]) : undefined,
    payoutMethod: toStr(f["PayoutMethod"]) as import("./types").PayoutMethod || undefined,
    payoutUsername: toStr(f["PayoutUsername"]) || undefined,
    payoutCheckAddress: toStr(f["PayoutCheckAddress"]) || undefined,
    clientEmail: toStr(f["ClientEmail"]) || undefined,
    clientPhone: toStr(f["ClientPhone"]) || undefined,
    consignmentExpense: f["ConsignmentExpense"] != null ? toNum(f["ConsignmentExpense"]) : undefined,
    consignmentExpenseNote: toStr(f["ConsignmentExpenseNote"]) || undefined,
  };
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function getUserByClerkId(clerkUserId: string): Promise<User | null> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.USERS)
    .select({
      filterByFormula: `{ClerkUserId} = "${clerkUserId}"`,
      maxRecords: 1,
    })
    .all();
  return records.length > 0 ? mapUser(records[0]) : null;
}

export async function createUser(data: {
  clerkUserId: string;
  email: string;
  name: string;
}): Promise<User> {
  const base = getBase();
  const record = await base(AIRTABLE_TABLES.USERS).create({
    ClerkUserId: data.clerkUserId,
    Email: data.email,
    Name: data.name,
    CreatedAt: new Date().toISOString(),
  });
  return mapUser(record);
}

export async function upsertUser(data: {
  clerkUserId: string;
  email: string;
  name: string;
}): Promise<User> {
  const existing = await getUserByClerkId(data.clerkUserId);
  if (existing) return existing;
  return createUser(data);
}

function mapUser(record: Airtable.Record<Airtable.FieldSet>): User {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    clerkUserId: toStr(f["ClerkUserId"]),
    email: toStr(f["Email"]),
    name: toStr(f["Name"]),
    createdAt: toStr(f["CreatedAt"]),
  };
}

// ─── Memberships ──────────────────────────────────────────────────────────────
export async function getMembershipsForUser(
  clerkUserId: string
): Promise<Membership[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.MEMBERSHIPS)
    .select({ filterByFormula: `{ClerkUserId} = "${clerkUserId}"` })
    .all();
  return records.map(mapMembership);
}

export async function getMembershipsForTenant(
  tenantId: string
): Promise<Membership[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.MEMBERSHIPS)
    .select({ filterByFormula: `{TenantId} = "${tenantId}"` })
    .all();
  return records.map(mapMembership);
}

export async function createMembership(data: {
  tenantId: string;
  clerkUserId: string;
  role: UserRole;
}): Promise<Membership> {
  const base = getBase();
  const record = await base(AIRTABLE_TABLES.MEMBERSHIPS).create({
    TenantId: data.tenantId,
    ClerkUserId: data.clerkUserId,
    Role: data.role,
    CreatedAt: new Date().toISOString(),
  });
  return mapMembership(record);
}

export async function getUserRoleForTenant(
  clerkUserId: string,
  tenantId: string
): Promise<UserRole | null> {
  // TTTAdmin users have implicit access to all tenants
  if (isTTTAdmin(clerkUserId)) return "TTTAdmin";

  // TTTManager users also have implicit cross-tenant access
  const sysRole = await getSystemRole(clerkUserId);
  if (sysRole === "TTTManager") return "TTTManager";

  const base = getBase();
  const records = await base(AIRTABLE_TABLES.MEMBERSHIPS)
    .select({
      filterByFormula: `AND({ClerkUserId} = "${clerkUserId}", {TenantId} = "${tenantId}")`,
      maxRecords: 1,
    })
    .all();
  if (records.length === 0) return null;
  return (toStr(records[0].fields["Role"]) || null) as UserRole | null;
}

function mapMembership(
  record: Airtable.Record<Airtable.FieldSet>
): Membership {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    tenantId: toStr(f["TenantId"]),
    userId: toStr(f["ClerkUserId"]),
    role: toStr(f["Role"]) as UserRole,
    createdAt: toStr(f["CreatedAt"]),
  };
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
export async function getRoomsForTenant(tenantId: string): Promise<Room[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ROOMS)
    .select({
      filterByFormula: `{TenantId} = "${tenantId}"`,
      sort: [{ field: "CreatedAt", direction: "desc" }],
    })
    .all();
  return records.map(mapRoom);
}

export async function getRoomById(id: string): Promise<Room | null> {
  try {
    const base = getBase();
    const record = await base(AIRTABLE_TABLES.ROOMS).find(id);
    return mapRoom(record);
  } catch {
    return null;
  }
}

export async function createRoom(data: {
  tenantId: string;
  name: string;
  roomType: RoomType;
  squareFeet: number;
  density: DensityLevel;
}): Promise<Room> {
  const base = getBase();
  const record = await base(AIRTABLE_TABLES.ROOMS).create({
    TenantId: data.tenantId,
    Name: data.name,
    RoomType: data.roomType,
    SquareFeet: data.squareFeet,
    Density: data.density,
    CreatedAt: new Date().toISOString(),
  });
  return mapRoom(record);
}

export async function updateRoom(
  id: string,
  data: Partial<{
    name: string;
    roomType: RoomType;
    squareFeet: number;
    density: DensityLevel;
  }>
): Promise<Room> {
  const base = getBase();
  const fields: Airtable.FieldSet = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.roomType !== undefined) fields["RoomType"] = data.roomType;
  if (data.squareFeet !== undefined) fields["SquareFeet"] = data.squareFeet;
  if (data.density !== undefined) fields["Density"] = data.density;
  const record = await base(AIRTABLE_TABLES.ROOMS).update(id, fields);
  return mapRoom(record);
}

export async function deleteRoom(id: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.ROOMS).destroy(id);
}

function mapRoom(record: Airtable.Record<Airtable.FieldSet>): Room {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    tenantId: toStr(f["TenantId"]),
    name: toStr(f["Name"]),
    roomType: toStr(f["RoomType"]) as RoomType,
    squareFeet: toNum(f["SquareFeet"]),
    density: (toStr(f["Density"]) || "Medium") as DensityLevel,
    createdAt: toStr(f["CreatedAt"]),
  };
}

// ─── Items ────────────────────────────────────────────────────────────────────
export async function getItemsForTenant(tenantId: string): Promise<Item[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({
      filterByFormula: `{TenantId} = "${tenantId}"`,
      sort: [{ field: "CreatedAt", direction: "desc" }],
    })
    .all();
  return records.map(mapItem);
}

export async function getItemById(id: string): Promise<Item | null> {
  try {
    const base = getBase();
    const record = await base(AIRTABLE_TABLES.ITEMS).find(id);
    return mapItem(record);
  } catch {
    return null;
  }
}

// ─── Storefront helpers ───────────────────────────────────────────────────────

export async function getReservedStorefrontItems(): Promise<{ id: string; itemName: string; updatedAt: string; slug: string }[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({
      filterByFormula: `AND(OR({PrimaryRoute} = "ProFoundFinds Consignment", {PrimaryRoute} = "Estate Sale"), {Status} = "In Cart")`,
      fields: ["ItemName", "UpdatedAt", "OnlineListingSlug"],
    })
    .all();
  return records.map((r) => ({
    id: r.id,
    itemName: String(r.fields["ItemName"] ?? ""),
    updatedAt: String(r.fields["UpdatedAt"] ?? new Date(0).toISOString()),
    slug: String(r.fields["OnlineListingSlug"] ?? r.id),
  }));
}

export async function getProFoundFindsStorefrontItems(): Promise<Item[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({
      filterByFormula: `AND({PrimaryRoute} = "ProFoundFinds Consignment", OR({Status} = "Listed", {Status} = "In Cart"), {StorefrontActive})`,
      sort: [{ field: "CreatedAt", direction: "desc" }],
    })
    .all();
  return records.map(record => mapItem(record));
}

export async function getItemByOnlineSlug(slug: string): Promise<Item | null> {
  try {
    const base = getBase();
    const records = await base(AIRTABLE_TABLES.ITEMS)
      .select({
        filterByFormula: `AND({OnlineListingSlug} = "${slug}", OR({PrimaryRoute} = "ProFoundFinds Consignment", {PrimaryRoute} = "Estate Sale"))`,
        maxRecords: 1,
      })
      .all();
    if (!records.length) return null;
    return mapItem(records[0]);
  } catch {
    return null;
  }
}

export async function logFailedSaleSync(data: {
  itemId: string;
  payload: string;
  error: string;
  retryCount: number;
}): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.FAILED_SALE_SYNC).create({
    ItemId: data.itemId,
    Payload: data.payload,
    Error: data.error,
    RetryCount: data.retryCount,
    CreatedAt: new Date().toISOString(),
  }, { typecast: true });
}

export async function createItem(data: Partial<Item> & {
  tenantId: string;
  itemName: string;
}): Promise<Item> {
  const base = getBase();
  const now = new Date().toISOString();
  // Normalise photos — prefer explicit array, fall back to legacy single-photo fields
  const photosToStore: ItemPhoto[] = data.photos?.length
    ? data.photos
    : data.photoUrl
    ? [{ url: data.photoUrl, publicId: data.photoPublicId ?? "" }]
    : [];
  const record = await base(AIRTABLE_TABLES.ITEMS).create({
    TenantId: data.tenantId,
    RoomId: data.roomId || "",
    PhotoUrl: photosToStore[0]?.url || "",
    PhotoPublicId: photosToStore[0]?.publicId || "",
    PhotosJson: photosToStore.length ? JSON.stringify(photosToStore) : "",
    ItemName: data.itemName,
    Category: data.category || "",
    Condition: data.condition || "Good",
    ConditionNotes: data.conditionNotes || "",
    SizeClass: data.sizeClass || "Fits in Car-SUV",
    Fragility: data.fragility || "Not Fragile",
    ItemType: data.itemType || "Daily Use",
    ValueLow: data.valueLow || 0,
    ValueMid: data.valueMid || 0,
    ValueHigh: data.valueHigh || 0,
    PrimaryRoute: data.primaryRoute || "Donate",
    RouteReasoning: data.routeReasoning || "",
    ConsignmentCategory: data.consignmentCategory || "",
    ListingTitleEbay: data.listingTitleEbay || "",
    ListingDescriptionEbay: data.listingDescriptionEbay || "",
    ListingFb: data.listingFb || "",
    ListingOfferup: data.listingOfferup || "",
    StaffTips: data.staffTips || "",
    Status: data.status || "Pending Review",
    StorefrontActive: data.storefrontActive ?? false,
    BarcodeNumber: data.barcodeNumber || "",
    Quantity: data.quantity || 1,
    ClientSharePercent: data.clientSharePercent ?? 0,
    DeliveryDate: data.deliveryDate || "",
    ...(data.widthInches != null ? { WidthInches: data.widthInches } : {}),
    ...(data.heightInches != null ? { HeightInches: data.heightInches } : {}),
    ...(data.depthInches != null ? { DepthInches: data.depthInches } : {}),
    CreatedAt: now,
    UpdatedAt: now,
  }, { typecast: true });
  return mapItem(record);
}

export async function updateItem(
  id: string,
  data: Partial<Item>
): Promise<Item> {
  const base = getBase();
  const fields: Airtable.FieldSet = { UpdatedAt: new Date().toISOString() };

  // Handle photos specially — writes all three related Airtable fields
  if (data.photos !== undefined) {
    fields["PhotosJson"] = data.photos.length ? JSON.stringify(data.photos) : "";
    fields["PhotoUrl"] = data.photos[0]?.url ?? "";
    fields["PhotoPublicId"] = data.photos[0]?.publicId ?? "";
  }

  const fieldMap: Record<keyof Item, string> = {
    photos: "",    // handled above; empty string = skip in loop
    itemName: "ItemName",
    category: "Category",
    condition: "Condition",
    conditionNotes: "ConditionNotes",
    sizeClass: "SizeClass",
    fragility: "Fragility",
    itemType: "ItemType",
    valueLow: "ValueLow",
    valueMid: "ValueMid",
    valueHigh: "ValueHigh",
    primaryRoute: "PrimaryRoute",
    routeReasoning: "RouteReasoning",
    consignmentCategory: "ConsignmentCategory",
    listingTitleEbay: "ListingTitleEbay",
    listingDescriptionEbay: "ListingDescriptionEbay",
    listingFb: "ListingFb",
    listingOfferup: "ListingOfferup",
    staffTips: "StaffTips",
    status: "Status",
    photoUrl: "PhotoUrl",
    photoPublicId: "PhotoPublicId",
    roomId: "RoomId",
    // consignment sale fields
    salePrice: "SalePrice",
    consignorPayout: "ConsignorPayout",
    saleDate: "SaleDate",
    circleHandItemId: "CircleHandItemId",
    routingStatus: "RoutingStatus",
    // vendor assignment
    assignedVendorId: "AssignedVendorId",
    vendorDecision: "VendorDecision",
    vendorNotes: "VendorNotes",
    payoutPaidAmount: "PayoutPaidAmount",
    payoutPaidAt: "PayoutPaidAt",
    vendorPriceApproved: "VendorPriceApproved",
    vendorExpectedPrice: "VendorExpectedPrice",
    vendorRespondedAt: "VendorRespondedAt",
    // PF Inventory fields
    barcodeNumber: "BarcodeNumber",
    quantity: "Quantity",
    quantitySold: "QuantitySold",
    clientSharePercent: "ClientSharePercent",
    deliveryDate: "DeliveryDate",
    // Square integration fields
    squareCatalogItemId: "SquareCatalogItemId",
    squareCatalogVariationId: "SquareCatalogVariationId",
    squareSyncedAt: "SquareSyncedAt",
    // Staff seller fields
    staffSellerId: "StaffSellerId",
    staffSellerName: "StaffSellerName",
    staffCommissionPercent: "StaffCommissionPercent",
    staffTimeMinutes: "StaffTimeMinutes",
    // Completion tracking
    completedDate: "CompletedDate",
    // Storefront fields
    saleChannel: "SaleChannel",
    buyerName: "BuyerName",
    buyerEmail: "BuyerEmail",
    buyerPhone: "BuyerPhone",
    buyerMarketingConsent: "BuyerMarketingConsent",
    buyerConsentAt: "BuyerConsentAt",
    stripePaymentIntentId: "StripePaymentIntentId",
    onlineListingSlug: "OnlineListingSlug",
    storefrontActive: "StorefrontActive",
    pickupLocation: "PickupLocation",
    // Dimensions
    widthInches: "WidthInches",
    heightInches: "HeightInches",
    depthInches: "DepthInches",
    estateSaleId: "EstateSaleId",
    // Pay tracking
    commissionPaidAt: "CommissionPaidAt",
    // non-editable
    id: "id",
    airtableId: "airtableId",
    tenantId: "TenantId",
    createdAt: "CreatedAt",
    updatedAt: "UpdatedAt",
  };

  for (const [key, value] of Object.entries(data)) {
    const airtableKey = fieldMap[key as keyof Item];
    if (airtableKey && !["id", "airtableId"].includes(airtableKey)) {
      fields[airtableKey] = value as Airtable.FieldSet[string];
    }
  }

  const record = await base(AIRTABLE_TABLES.ITEMS).update(id, fields, { typecast: true });
  return mapItem(record);
}

export async function deleteItem(id: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.ITEMS).destroy(id);
}

export async function createStorefrontBuyer(data: {
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  marketingConsent: boolean;
  consentAt: string;
  itemId: string;
  itemName: string;
  estateSaleId?: string;
  estateName?: string;
  estateSlug?: string;
  purchaseAmount: number;
}): Promise<void> {
  const base = getBase();
  const fields: Airtable.FieldSet = {
    BuyerName: data.buyerName,
    BuyerEmail: data.buyerEmail,
    MarketingConsent: data.marketingConsent,
    ConsentAt: data.consentAt,
    ItemId: data.itemId,
    ItemName: data.itemName,
    PurchaseAmount: data.purchaseAmount,
    CreatedAt: new Date().toISOString(),
  };
  if (data.buyerPhone) fields["BuyerPhone"] = data.buyerPhone;
  if (data.estateSaleId) fields["EstateSaleId"] = data.estateSaleId;
  if (data.estateName) fields["EstateName"] = data.estateName;
  if (data.estateSlug) fields["EstateSlug"] = data.estateSlug;
  await base(AIRTABLE_TABLES.STOREFRONT_BUYERS).create(fields);
}

export async function getStorefrontBuyersByEstate(estateId: string): Promise<import("./types").StorefrontBuyer[]> {
  const base = getBase();
  const records: Airtable.Record<Airtable.FieldSet>[] = [];
  await base(AIRTABLE_TABLES.STOREFRONT_BUYERS)
    .select({ filterByFormula: `{EstateSaleId} = "${estateId}"` })
    .eachPage((page, next) => { records.push(...page); next(); });
  return records.map(r => {
    const f = r.fields;
    return {
      id: r.id,
      buyerName: String(f["BuyerName"] || ""),
      buyerEmail: String(f["BuyerEmail"] || ""),
      buyerPhone: f["BuyerPhone"] ? String(f["BuyerPhone"]) : undefined,
      marketingConsent: f["MarketingConsent"] === true,
      consentAt: f["ConsentAt"] ? String(f["ConsentAt"]) : undefined,
      itemId: String(f["ItemId"] || ""),
      itemName: String(f["ItemName"] || ""),
      estateSaleId: f["EstateSaleId"] ? String(f["EstateSaleId"]) : undefined,
      estateName: f["EstateName"] ? String(f["EstateName"]) : undefined,
      estateSlug: f["EstateSlug"] ? String(f["EstateSlug"]) : undefined,
      purchaseAmount: typeof f["PurchaseAmount"] === "number" ? f["PurchaseAmount"] : 0,
      createdAt: f["CreatedAt"] ? String(f["CreatedAt"]) : "",
    };
  });
}

// Returns the next available ProFoundFinds barcode number (8 digits, starts with 1000).
// Scans every item that has ever been assigned a barcode (even if later re-routed) so
// numbers are permanently consumed and never reused.
export async function getNextBarcodeNumber(): Promise<string> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({ fields: ["BarcodeNumber"], filterByFormula: `NOT({BarcodeNumber} = "")` })
    .all();
  let max = 10000000;
  for (const r of records) {
    const num = parseInt((r.fields["BarcodeNumber"] as string) || "0", 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return String(max + 1);
}

function mapItem(record: Airtable.Record<Airtable.FieldSet>): Item {
  const f = record.fields;
  // Parse photos from PhotosJson; fall back to single photo for backward compat
  let photos: ItemPhoto[] | undefined;
  const photosJson = toStr(f["PhotosJson"]);
  if (photosJson) {
    try { photos = JSON.parse(photosJson); } catch { /* ignore */ }
  }
  if (!photos?.length && toStr(f["PhotoUrl"])) {
    photos = [{ url: toStr(f["PhotoUrl"]), publicId: toStr(f["PhotoPublicId"]) }];
  }
  return {
    id: record.id,
    airtableId: record.id,
    tenantId: toStr(f["TenantId"]),
    roomId: toStr(f["RoomId"]) || undefined,
    photos: photos?.length ? photos : undefined,
    photoUrl: photos?.[0]?.url || undefined,
    photoPublicId: photos?.[0]?.publicId || undefined,
    itemName: toStr(f["ItemName"]),
    category: toStr(f["Category"]),
    condition: (toStr(f["Condition"]) || "Good") as ItemCondition,
    conditionNotes: toStr(f["ConditionNotes"]),
    sizeClass: (toStr(f["SizeClass"]) || "Fits in Car-SUV") as SizeClass,
    fragility: (toStr(f["Fragility"]) || "Not Fragile") as FragilityLevel,
    itemType: (toStr(f["ItemType"]) || "Daily Use") as ItemUseType,
    valueLow: toNum(f["ValueLow"]),
    valueMid: toNum(f["ValueMid"]),
    valueHigh: toNum(f["ValueHigh"]),
    primaryRoute: (toStr(f["PrimaryRoute"]) || "Donate") as PrimaryRoute,
    routeReasoning: toStr(f["RouteReasoning"]),
    consignmentCategory: toStr(f["ConsignmentCategory"]),
    listingTitleEbay: toStr(f["ListingTitleEbay"]),
    listingDescriptionEbay: toStr(f["ListingDescriptionEbay"]),
    listingFb: toStr(f["ListingFb"]),
    listingOfferup: toStr(f["ListingOfferup"]),
    staffTips: toStr(f["StaffTips"]),
    status: (toStr(f["Status"]) || "Pending Review") as ItemStatus,
    createdAt: toStr(f["CreatedAt"]),
    updatedAt: toStr(f["UpdatedAt"]),
    salePrice: f["SalePrice"] != null ? toNum(f["SalePrice"]) : undefined,
    consignorPayout: f["ConsignorPayout"] != null ? toNum(f["ConsignorPayout"]) : undefined,
    saleDate: toStr(f["SaleDate"]) || undefined,
    circleHandItemId: toStr(f["CircleHandItemId"]) || undefined,
    routingStatus: toStr(f["RoutingStatus"]) || undefined,
    assignedVendorId: toStr(f["AssignedVendorId"]) || undefined,
    vendorDecision: (toStr(f["VendorDecision"]) || undefined) as VendorDecision | undefined,
    vendorNotes: toStr(f["VendorNotes"]) || undefined,
    payoutPaidAmount: f["PayoutPaidAmount"] != null ? toNum(f["PayoutPaidAmount"]) : undefined,
    payoutPaidAt: toStr(f["PayoutPaidAt"]) || undefined,
    vendorPriceApproved: f["VendorPriceApproved"] === true ? true : undefined,
    vendorExpectedPrice: f["VendorExpectedPrice"] != null ? toNum(f["VendorExpectedPrice"]) : undefined,
    vendorRespondedAt: toStr(f["VendorRespondedAt"]) || undefined,
    barcodeNumber: toStr(f["BarcodeNumber"]) || undefined,
    quantity: f["Quantity"] != null ? toNum(f["Quantity"]) : undefined,
    quantitySold: f["QuantitySold"] != null ? toNum(f["QuantitySold"]) : undefined,
    clientSharePercent: f["ClientSharePercent"] != null ? toNum(f["ClientSharePercent"]) : undefined,
    deliveryDate: toStr(f["DeliveryDate"]) || undefined,
    squareCatalogItemId: toStr(f["SquareCatalogItemId"]) || undefined,
    squareCatalogVariationId: toStr(f["SquareCatalogVariationId"]) || undefined,
    squareSyncedAt: toStr(f["SquareSyncedAt"]) || undefined,
    staffSellerId: toStr(f["StaffSellerId"]) || undefined,
    staffSellerName: toStr(f["StaffSellerName"]) || undefined,
    staffCommissionPercent: f["StaffCommissionPercent"] != null ? toNum(f["StaffCommissionPercent"]) : undefined,
    staffTimeMinutes: f["StaffTimeMinutes"] != null ? toNum(f["StaffTimeMinutes"]) : undefined,
    completedDate: toStr(f["CompletedDate"]) || undefined,
    // Storefront fields
    saleChannel: toStr(f["SaleChannel"]) || undefined,
    buyerName: toStr(f["BuyerName"]) || undefined,
    buyerEmail: toStr(f["BuyerEmail"]) || undefined,
    stripePaymentIntentId: toStr(f["StripePaymentIntentId"]) || undefined,
    onlineListingSlug: toStr(f["OnlineListingSlug"]) || undefined,
    storefrontActive: f["StorefrontActive"] === true ? true : undefined,
    pickupLocation: toStr(f["PickupLocation"]) || undefined,
    widthInches: f["WidthInches"] != null ? toNum(f["WidthInches"]) : undefined,
    heightInches: f["HeightInches"] != null ? toNum(f["HeightInches"]) : undefined,
    depthInches: f["DepthInches"] != null ? toNum(f["DepthInches"]) : undefined,
    estateSaleId: toStr(f["EstateSaleId"]) || undefined,
    commissionPaidAt: toStr(f["CommissionPaidAt"]) || undefined,
  };
}

// ─── Admin: Membership CRUD ───────────────────────────────────────────────────
export async function getAllMemberships(): Promise<Membership[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.MEMBERSHIPS)
    .select({ sort: [{ field: "CreatedAt", direction: "desc" }] })
    .all();
  return records.map(mapMembership);
}

export async function deleteMembership(id: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.MEMBERSHIPS).destroy(id);
}

export async function updateMembershipRole(id: string, role: UserRole): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.MEMBERSHIPS).update(id, { Role: role });
}

// ─── Tenant mutations ─────────────────────────────────────────────────────────
export async function updateTenant(
  id: string,
  data: { name?: string; address?: string; city?: string; state?: string; zip?: string; destAddress?: string | null; destCity?: string | null; destState?: string | null; destZip?: string | null; estimatedHours?: number; estimatedServiceHours?: Array<{ serviceId: string; serviceName: string; hours: number }> | null; isArchived?: boolean; isTTT?: boolean; isConsignmentOnly?: boolean; destinationSqFt?: number; payoutMethod?: string | null; payoutUsername?: string | null; payoutCheckAddress?: string | null; clientEmail?: string | null; clientPhone?: string | null; consignmentExpense?: number | null; consignmentExpenseNote?: string | null }
): Promise<Tenant> {
  const base = getBase();
  const fields: Airtable.FieldSet = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.address !== undefined) fields["Address"] = data.address;
  if (data.city !== undefined) fields["City"] = data.city;
  if (data.state !== undefined) fields["State"] = data.state;
  if (data.zip !== undefined) fields["Zip"] = data.zip;
  if (data.destAddress !== undefined) fields["DestAddress"] = data.destAddress ?? "";
  if (data.destCity !== undefined) fields["DestCity"] = data.destCity ?? "";
  if (data.destState !== undefined) fields["DestState"] = data.destState ?? "";
  if (data.destZip !== undefined) fields["DestZip"] = data.destZip ?? "";
  if (data.estimatedHours !== undefined) fields["EstimatedHours"] = data.estimatedHours;
  if (data.estimatedServiceHours !== undefined) fields["EstimatedServiceHours"] = data.estimatedServiceHours ? JSON.stringify(data.estimatedServiceHours) : "";
  if (data.isArchived !== undefined) fields["IsArchived"] = data.isArchived;
  if (data.isTTT !== undefined) fields["IsTTT"] = data.isTTT;
  if (data.isConsignmentOnly !== undefined) fields["IsConsignmentOnly"] = data.isConsignmentOnly;
  if (data.destinationSqFt !== undefined) fields["DestinationSqFt"] = data.destinationSqFt;
  if (data.payoutMethod !== undefined) fields["PayoutMethod"] = data.payoutMethod ?? "";
  if (data.payoutUsername !== undefined) fields["PayoutUsername"] = data.payoutUsername ?? "";
  if (data.payoutCheckAddress !== undefined) fields["PayoutCheckAddress"] = data.payoutCheckAddress ?? "";
  if (data.clientEmail !== undefined) fields["ClientEmail"] = data.clientEmail ?? "";
  if (data.clientPhone !== undefined) fields["ClientPhone"] = data.clientPhone ?? "";
  if (data.consignmentExpense !== undefined) fields["ConsignmentExpense"] = data.consignmentExpense ?? 0;
  if (data.consignmentExpenseNote !== undefined) fields["ConsignmentExpenseNote"] = data.consignmentExpenseNote ?? "";
  const record = await base(AIRTABLE_TABLES.TENANTS).update(id, fields);
  return mapTenant(record);
}

// ─── First Visit Intake Form (stored as JSON on Tenant record) ───────────────
// Requires one Airtable field on the Tenants table: IntakeFormJson (Long text)
export async function getIntakeForm(tenantId: string): Promise<import("./types").IntakeForm | null> {
  const base = getBase();
  try {
    const record = await base(AIRTABLE_TABLES.TENANTS).find(tenantId);
    const json = toStr(record.fields["IntakeFormJson"]);
    return json ? (JSON.parse(json) as import("./types").IntakeForm) : null;
  } catch {
    return null;
  }
}

export async function saveIntakeForm(
  tenantId: string,
  form: import("./types").IntakeForm,
): Promise<import("./types").IntakeForm> {
  const base = getBase();
  await base(AIRTABLE_TABLES.TENANTS).update(tenantId, {
    IntakeFormJson: JSON.stringify(form),
  });
  return form;
}

export async function deleteTenantCascade(tenantId: string): Promise<void> {
  const base = getBase();

  // Fetch all related records
  const [memberships, rooms, items] = await Promise.all([
    base(AIRTABLE_TABLES.MEMBERSHIPS).select({ filterByFormula: `{TenantId} = "${tenantId}"` }).all(),
    base(AIRTABLE_TABLES.ROOMS).select({ filterByFormula: `{TenantId} = "${tenantId}"` }).all(),
    base(AIRTABLE_TABLES.ITEMS).select({ filterByFormula: `{TenantId} = "${tenantId}"` }).all(),
  ]);

  // Batch delete in groups of 10 (Airtable limit)
  async function batchDelete(table: string, ids: string[]) {
    for (let i = 0; i < ids.length; i += 10) {
      await base(table).destroy(ids.slice(i, i + 10) as [string, ...string[]]);
    }
  }

  await batchDelete(AIRTABLE_TABLES.ITEMS, items.map(r => r.id));
  await batchDelete(AIRTABLE_TABLES.ROOMS, rooms.map(r => r.id));
  await batchDelete(AIRTABLE_TABLES.MEMBERSHIPS, memberships.map(r => r.id));
  await base(AIRTABLE_TABLES.TENANTS).destroy(tenantId);
}

// ─── Plan Entries (uses fetch directly — Airtable SDK has PAT write issues) ────
function planFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.PLAN_ENTRIES;
  return fetch(`https://api.airtable.com/v0/${base}/${table}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

export async function getPlanEntriesForTenant(tenantId: string): Promise<PlanEntry[]> {
  const formula = encodeURIComponent(`{TenantID} = "${tenantId}"`);
  const res = await planFetch(`?filterByFormula=${formula}&sort[0][field]=Date&sort[0][direction]=asc`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapPlanEntry);
}

export async function getPlanEntriesForTenants(tenantIds: string[]): Promise<PlanEntry[]> {
  if (tenantIds.length === 0) return [];
  if (tenantIds.length === 1) return getPlanEntriesForTenant(tenantIds[0]);
  const orParts = tenantIds.map(id => `{TenantID} = "${id}"`).join(",");
  const formula = encodeURIComponent(`OR(${orParts})`);
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const qs = `?filterByFormula=${formula}&sort[0][field]=Date&sort[0][direction]=asc${offset ? `&offset=${offset}` : ""}`;
    const res = await planFetch(qs);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    records.push(...(data.records as AirtableRecord[]));
    offset = data.offset;
  } while (offset);
  return records.map(mapPlanEntry);
}

export async function getPlanEntryById(id: string): Promise<PlanEntry | null> {
  try {
    const res = await planFetch(`/${id}`);
    if (!res.ok) return null;
    return mapPlanEntry(await res.json());
  } catch {
    return null;
  }
}

// Find all plan entries for a given date where `email` is in the helpers array.
// Fetches up to 200 entries sorted by Date DESC and filters entirely in JS to
// avoid Airtable formula edge cases (special chars in emails, date format mismatches).
export async function getPlanEntriesForTodayByEmail(email: string, date: string): Promise<PlanEntry[]> {
  try {
    const res = await planFetch(`?maxRecords=200&sort[0][field]=Date&sort[0][direction]=desc`);
    if (!res.ok) return [];
    const data = await res.json();
    const all = (data.records as AirtableRecord[]).map(mapPlanEntry);
    const emailLower = email.toLowerCase();
    return all.filter(e => e.date === date && e.helpers?.some(h => h.email.toLowerCase() === emailLower));
  } catch {
    return [];
  }
}

export async function getPlanEntriesForDateRange(
  from: string, // "YYYY-MM-DD"
  to: string
): Promise<PlanEntry[]> {
  // Use < (to + 1 day) instead of <= to, because if the Airtable Date field
  // is a DateTime type, entries stored at e.g. "2026-04-03T04:00:00.000Z"
  // (midnight US Eastern) are technically after "2026-04-03T00:00:00.000Z"
  // (midnight UTC) and would be excluded by <=. Using < next-day is always safe.
  const [ty, tm, td] = to.split("-").map(Number);
  const toNext = new Date(ty, tm - 1, td + 1);
  const toExclusive = `${toNext.getFullYear()}-${String(toNext.getMonth() + 1).padStart(2, "0")}-${String(toNext.getDate()).padStart(2, "0")}`;
  const formula = encodeURIComponent(`AND({Date} >= "${from}", {Date} < "${toExclusive}")`);
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const qs = `?filterByFormula=${formula}&sort[0][field]=Date&sort[0][direction]=asc${offset ? `&offset=${offset}` : ""}`;
    const res = await planFetch(qs);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    records.push(...(data.records as AirtableRecord[]));
    offset = data.offset;
  } while (offset);
  return records.map(mapPlanEntry);
}

export async function createPlanEntry(data: {
  tenantId: string;
  date: string;
  activity: PlanActivity;
  roomId?: string;
  roomLabel?: string;
  notes?: string;
  address?: string;
  startTime?: string;
  endTime?: string;
  helpers?: PlanHelper[];
}): Promise<PlanEntry> {
  const res = await planFetch("", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        TenantID: data.tenantId,
        Date: data.date,
        Activity: data.activity,
        RoomID: data.roomId || "",
        RoomLabel: data.roomLabel || "",
        Notes: data.notes || "",
        Address: data.address || "",
        StartTime: data.startTime || "",
        EndTime: data.endTime || "",
        Helpers: data.helpers?.length ? JSON.stringify(data.helpers) : "",
        GoogleEventId: "",
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapPlanEntry(await res.json());
}

export async function updatePlanEntry(
  id: string,
  data: Partial<{
    date: string;
    activity: PlanActivity;
    roomId: string;
    roomLabel: string;
    notes: string;
    address: string;
    startTime: string;
    endTime: string;
    helpers: PlanHelper[];
    googleEventId: string;
  }>
): Promise<PlanEntry> {
  const fields: Record<string, string> = {};
  if (data.date !== undefined) fields["Date"] = data.date;
  if (data.activity !== undefined) fields["Activity"] = data.activity;
  if (data.roomId !== undefined) fields["RoomID"] = data.roomId;
  if (data.roomLabel !== undefined) fields["RoomLabel"] = data.roomLabel;
  if (data.notes !== undefined) fields["Notes"] = data.notes;
  if (data.address !== undefined) fields["Address"] = data.address;
  if (data.startTime !== undefined) fields["StartTime"] = data.startTime;
  if (data.endTime !== undefined) fields["EndTime"] = data.endTime;
  if (data.helpers !== undefined) fields["Helpers"] = data.helpers.length ? JSON.stringify(data.helpers) : "";
  if (data.googleEventId !== undefined) fields["GoogleEventId"] = data.googleEventId;
  const res = await planFetch(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapPlanEntry(await res.json());
}

export async function deletePlanEntry(id: string): Promise<void> {
  const res = await planFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

function mapPlanEntry(record: AirtableRecord): PlanEntry {
  const f = record.fields;
  let helpers: PlanHelper[] | undefined;
  try {
    const raw = toStr(f["Helpers"]);
    if (raw) helpers = JSON.parse(raw) as PlanHelper[];
  } catch { /* ignore */ }
  return {
    id: record.id,
    airtableId: record.id,
    tenantId: toStr(f["TenantID"]),
    date: toStr(f["Date"]).slice(0, 10),
    activity: toStr(f["Activity"]) as PlanActivity,
    roomId: toStr(f["RoomID"]) || undefined,
    roomLabel: toStr(f["RoomLabel"]) || undefined,
    notes: toStr(f["Notes"]) || undefined,
    address: toStr(f["Address"]) || undefined,
    startTime: toStr(f["StartTime"]) || undefined,
    endTime: toStr(f["EndTime"]) || undefined,
    helpers,
    googleEventId: toStr(f["GoogleEventId"]) || undefined,
    createdAt: toStr(f["CreatedAt"]),
  };
}

// ─── Admin: All Items (TTT Admin use only) ────────────────────────────────────
export async function getAllItems(): Promise<Item[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({ sort: [{ field: "CreatedAt", direction: "desc" }] })
    .all();
  return records.map(mapItem);
}

export async function getItemsByPrimaryRoute(route: string): Promise<Item[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({
      filterByFormula: `{PrimaryRoute} = "${route}"`,
      sort: [{ field: "CreatedAt", direction: "desc" }],
    })
    .all();
  return records.map(mapItem);
}

// ─── Vendors (uses fetch directly — avoids SDK PAT write issues) ──────────────
function vendorFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = process.env.AIRTABLE_VENDORS_TABLE || "Vendors";
  return fetch(`https://api.airtable.com/v0/${base}/${table}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

export async function getVendorsForTenant(tenantId: string): Promise<Vendor[]> {
  const formula = encodeURIComponent(`{TenantId} = "${tenantId}"`);
  const res = await vendorFetch(
    `?filterByFormula=${formula}&sort[0][field]=CreatedAt&sort[0][direction]=desc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapVendor);
}

export async function getVendorById(id: string): Promise<Vendor | null> {
  try {
    const res = await vendorFetch(`/${id}`);
    if (!res.ok) return null;
    return mapVendor(await res.json());
  } catch {
    return null;
  }
}

export async function createVendor(data: {
  tenantId: string;
  vendorType: VendorType;
  vendorName: string;
  pocName: string;
  email: string;
  phone?: string;
  arrangement?: string;
  date1Label?: string;
  date1?: string;
  date2Label?: string;
  date2?: string;
  date3Label?: string;
  date3?: string;
}): Promise<Vendor> {
  const res = await vendorFetch("", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        TenantId: data.tenantId,
        VendorType: data.vendorType,
        VendorName: data.vendorName,
        POCName: data.pocName,
        Email: data.email,
        Phone: data.phone || "",
        Arrangement: data.arrangement || "",
        Date1Label: data.date1Label || "",
        Date1: data.date1 || "",
        Date2Label: data.date2Label || "",
        Date2: data.date2 || "",
        Date3Label: data.date3Label || "",
        Date3: data.date3 || "",
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapVendor(await res.json());
}

export async function updateVendor(
  id: string,
  data: Partial<{
    vendorType: VendorType;
    vendorName: string;
    pocName: string;
    email: string;
    phone: string;
    arrangement: string;
    date1Label: string;
    date1: string;
    date2Label: string;
    date2: string;
    date3Label: string;
    date3: string;
  }>
): Promise<Vendor> {
  const fields: Record<string, string> = {};
  if (data.vendorType !== undefined) fields["VendorType"] = data.vendorType;
  if (data.vendorName !== undefined) fields["VendorName"] = data.vendorName;
  if (data.pocName !== undefined) fields["POCName"] = data.pocName;
  if (data.email !== undefined) fields["Email"] = data.email;
  if (data.phone !== undefined) fields["Phone"] = data.phone;
  if (data.arrangement !== undefined) fields["Arrangement"] = data.arrangement;
  if (data.date1Label !== undefined) fields["Date1Label"] = data.date1Label;
  if (data.date1 !== undefined) fields["Date1"] = data.date1;
  if (data.date2Label !== undefined) fields["Date2Label"] = data.date2Label;
  if (data.date2 !== undefined) fields["Date2"] = data.date2;
  if (data.date3Label !== undefined) fields["Date3Label"] = data.date3Label;
  if (data.date3 !== undefined) fields["Date3"] = data.date3;
  const res = await vendorFetch(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapVendor(await res.json());
}

export async function deleteVendor(id: string): Promise<void> {
  const res = await vendorFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

function mapVendor(record: AirtableRecord): Vendor {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    tenantId: toStr(f["TenantId"]),
    vendorType: (toStr(f["VendorType"]) || "Other") as VendorType,
    vendorName: toStr(f["VendorName"]),
    pocName: toStr(f["POCName"]),
    email: toStr(f["Email"]),
    phone: toStr(f["Phone"]),
    arrangement: toStr(f["Arrangement"]),
    date1Label: toStr(f["Date1Label"]),
    date1: toStr(f["Date1"]),
    date2Label: toStr(f["Date2Label"]),
    date2: toStr(f["Date2"]),
    date3Label: toStr(f["Date3Label"]),
    date3: toStr(f["Date3"]),
    createdAt: toStr(f["CreatedAt"]),
  };
}

// ─── Local Vendors (uses fetch directly — same pattern as vendorFetch) ────────
function localVendorFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = process.env.AIRTABLE_LOCAL_VENDORS_TABLE || "LocalVendors";
  return fetch(`https://api.airtable.com/v0/${base}/${table}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

export async function getLocalVendors(state?: string): Promise<LocalVendor[]> {
  const stateFilter = state ? `AND({IsActive}=TRUE(), {State}="${state}")` : `{IsActive}=TRUE()`;
  const formula = encodeURIComponent(stateFilter);
  const res = await localVendorFetch(
    `?filterByFormula=${formula}&sort[0][field]=VendorType&sort[0][direction]=asc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapLocalVendor);
}

export async function getLocalVendorById(id: string): Promise<LocalVendor | null> {
  try {
    const res = await localVendorFetch(`/${id}`);
    if (!res.ok) return null;
    return mapLocalVendor(await res.json());
  } catch {
    return null;
  }
}

export async function createLocalVendor(data: {
  vendorType: VendorType;
  vendorName: string;
  pocName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  website?: string;
  itemCategories?: string;
  consignmentTake?: number;
  zipCodesServed?: string;
  notes?: string;
  isActive?: boolean;
}): Promise<LocalVendor> {
  const res = await localVendorFetch("", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        VendorType: data.vendorType,
        VendorName: data.vendorName,
        POCName: data.pocName || "",
        Email: data.email || "",
        Phone: data.phone || "",
        Address: data.address || "",
        City: data.city || "",
        State: data.state || "",
        Zip: data.zip || "",
        Website: data.website || "",
        ItemCategories: data.itemCategories || "",
        ConsignmentTake: data.consignmentTake ?? 0,
        ZipCodesServed: data.zipCodesServed || "",
        Notes: data.notes || "",
        IsActive: data.isActive ?? true,
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapLocalVendor(await res.json());
}

export async function updateLocalVendor(
  id: string,
  data: Partial<{
    vendorType: VendorType;
    vendorName: string;
    pocName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    website: string;
    itemCategories: string;
    consignmentTake: number;
    zipCodesServed: string;
    notes: string;
    isActive: boolean;
    clerkUserId: string;
    prefCategories: Array<{ category: string; minPrice: number; maxPrice: number }>;
  }>
): Promise<LocalVendor> {
  const fields: Record<string, unknown> = {};
  if (data.vendorType !== undefined) fields["VendorType"] = data.vendorType;
  if (data.vendorName !== undefined) fields["VendorName"] = data.vendorName;
  if (data.pocName !== undefined) fields["POCName"] = data.pocName;
  if (data.email !== undefined) fields["Email"] = data.email;
  if (data.phone !== undefined) fields["Phone"] = data.phone;
  if (data.address !== undefined) fields["Address"] = data.address;
  if (data.city !== undefined) fields["City"] = data.city;
  if (data.state !== undefined) fields["State"] = data.state;
  if (data.zip !== undefined) fields["Zip"] = data.zip;
  if (data.website !== undefined) fields["Website"] = data.website;
  if (data.itemCategories !== undefined) fields["ItemCategories"] = data.itemCategories;
  if (data.consignmentTake !== undefined) fields["ConsignmentTake"] = data.consignmentTake;
  if (data.zipCodesServed !== undefined) fields["ZipCodesServed"] = data.zipCodesServed;
  if (data.notes !== undefined) fields["Notes"] = data.notes;
  if (data.isActive !== undefined) fields["IsActive"] = data.isActive;
  if (data.clerkUserId !== undefined) fields["ClerkUserId"] = data.clerkUserId;
  if (data.prefCategories !== undefined) {
    for (let i = 1; i <= 5; i++) {
      const slot = data.prefCategories[i - 1];
      fields[`PrefCategory${i}`] = slot?.category ?? "";
      fields[`PrefMinPrice${i}`] = slot?.minPrice ?? 0;
      fields[`PrefMaxPrice${i}`] = slot?.maxPrice ?? 0;
    }
  }
  const res = await localVendorFetch(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapLocalVendor(await res.json());
}

export async function deleteLocalVendor(id: string): Promise<void> {
  const res = await localVendorFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function getAllLocalVendors(): Promise<LocalVendor[]> {
  const res = await localVendorFetch(
    `?sort[0][field]=VendorType&sort[0][direction]=asc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapLocalVendor);
}

export async function getLocalVendorByClerkId(clerkUserId: string): Promise<LocalVendor | null> {
  const encoded = encodeURIComponent(`{ClerkUserId} = "${clerkUserId}"`);
  const res = await localVendorFetch(`?filterByFormula=${encoded}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records || data.records.length === 0) return null;
  return mapLocalVendor(data.records[0]);
}

export async function getItemsForVendor(vendorId: string): Promise<Item[]> {
  const base = getBase();
  const encoded = `{AssignedVendorId} = "${vendorId}"`;
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({ filterByFormula: encoded, sort: [{ field: "CreatedAt", direction: "desc" }] })
    .all();
  return records.map(mapItem);
}

// ─── Routing Rules ────────────────────────────────────────────────────────────
function routingRulesFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.ROUTING_RULES;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function mapRoutingRule(record: AirtableRecord): RoutingRule {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    primaryRoute: (toStr(f["PrimaryRoute"]) || "Donate") as RoutingRule["primaryRoute"],
    vendorType: (toStr(f["VendorType"]) || "Other") as VendorType,
    minCondition: (toStr(f["MinCondition"]) || "Any") as RoutingRule["minCondition"],
    matchCategories: toStr(f["MatchCategories"]),
    matchSizeClasses: toStr(f["MatchSizeClasses"]),
    matchFragility: toStr(f["MatchFragility"]),
    minValueMid: typeof f["MinValueMid"] === "number" ? f["MinValueMid"] : 0,
    maxValueMid: typeof f["MaxValueMid"] === "number" ? f["MaxValueMid"] : 0,
    priority: typeof f["Priority"] === "number" ? f["Priority"] : 99,
    isActive: f["IsActive"] === true,
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getRoutingRules(): Promise<RoutingRule[]> {
  const res = await routingRulesFetch(
    `?sort[0][field]=Priority&sort[0][direction]=asc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapRoutingRule);
}

export async function createRoutingRule(data: Omit<RoutingRule, "id" | "airtableId" | "createdAt">): Promise<RoutingRule> {
  const res = await routingRulesFetch("", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        PrimaryRoute: data.primaryRoute,
        VendorType: data.vendorType,
        MinCondition: data.minCondition,
        MatchCategories: data.matchCategories,
        MatchSizeClasses: data.matchSizeClasses || "",
        MatchFragility: data.matchFragility || "",
        MinValueMid: data.minValueMid || 0,
        MaxValueMid: data.maxValueMid || 0,
        Priority: data.priority,
        IsActive: data.isActive,
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapRoutingRule(await res.json());
}

export async function updateRoutingRule(id: string, data: Partial<Omit<RoutingRule, "id" | "airtableId" | "createdAt">>): Promise<RoutingRule> {
  const fields: Record<string, unknown> = {};
  if (data.primaryRoute !== undefined) fields["PrimaryRoute"] = data.primaryRoute;
  if (data.vendorType !== undefined) fields["VendorType"] = data.vendorType;
  if (data.minCondition !== undefined) fields["MinCondition"] = data.minCondition;
  if (data.matchCategories !== undefined) fields["MatchCategories"] = data.matchCategories;
  if (data.matchSizeClasses !== undefined) fields["MatchSizeClasses"] = data.matchSizeClasses;
  if (data.matchFragility !== undefined) fields["MatchFragility"] = data.matchFragility;
  if (data.minValueMid !== undefined) fields["MinValueMid"] = data.minValueMid;
  if (data.maxValueMid !== undefined) fields["MaxValueMid"] = data.maxValueMid;
  if (data.priority !== undefined) fields["Priority"] = data.priority;
  if (data.isActive !== undefined) fields["IsActive"] = data.isActive;
  const res = await routingRulesFetch(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapRoutingRule(await res.json());
}

export async function deleteRoutingRule(id: string): Promise<void> {
  const res = await routingRulesFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Routing Engine ───────────────────────────────────────────────────────────
const CONDITION_ORDER: Item["condition"][] = ["For Parts", "Poor", "Fair", "Good", "Excellent"];

function conditionMeetsThreshold(
  condition: Item["condition"],
  threshold: RoutingRule["minCondition"]
): boolean {
  if (threshold === "Any") return true;
  const idx = CONDITION_ORDER.indexOf(condition);
  if (threshold === "Fair or better") return idx >= CONDITION_ORDER.indexOf("Fair");
  if (threshold === "Good or better") return idx >= CONDITION_ORDER.indexOf("Good");
  if (threshold === "Excellent only") return condition === "Excellent";
  return true;
}

export function applyRoutingRules(
  items: Item[],
  localVendors: LocalVendor[],
  rules: RoutingRule[],
  projectZip: string
): Array<{ itemId: string; vendorId?: string; primaryRoute: PrimaryRoute }> {
  const assignments: Array<{ itemId: string; vendorId?: string; primaryRoute: PrimaryRoute }> = [];
  const activeRules = rules.filter(r => r.isActive).sort((a, b) => a.priority - b.priority);
  const projectCentroid = getZipCentroid(projectZip);

  for (const item of items) {
    if (item.assignedVendorId) continue; // already vendor-assigned
    if (!["Pending Review", "Approved"].includes(item.status)) continue;

    // Hard constraint: large items can never go to Online Marketplace
    const isLarge = item.sizeClass === "Fits in Car-SUV" || item.sizeClass === "Needs Movers";

    // Hard constraint: condition worse than Good → override to Donate/Discard
    const CONDITION_ORDER_LOCAL: Item["condition"][] = ["For Parts", "Poor", "Fair", "Good", "Excellent"];
    const condIdx = CONDITION_ORDER_LOCAL.indexOf(item.condition);
    if (condIdx >= 0 && condIdx < CONDITION_ORDER_LOCAL.indexOf("Good")) {
      const forcedRoute: PrimaryRoute = (item.valueMid ?? 0) >= 100 ? "Donate" : "Discard";
      assignments.push({ itemId: item.id, primaryRoute: forcedRoute });
      continue;
    }

    for (const rule of activeRules) {
      // Hard constraint: skip Online Marketplace recommendations for large items
      if (isLarge && rule.primaryRoute === "Online Marketplace") continue;

      // Size filter
      if (rule.matchSizeClasses) {
        const sizes = rule.matchSizeClasses.split(",").map(s => s.trim()).filter(Boolean);
        if (sizes.length > 0 && !sizes.includes(item.sizeClass)) continue;
      }
      // Fragility filter
      if (rule.matchFragility) {
        const frags = rule.matchFragility.split(",").map(f => f.trim()).filter(Boolean);
        if (frags.length > 0 && !frags.includes(item.fragility)) continue;
      }
      // Value range filter
      const value = item.valueMid ?? 0;
      if (rule.minValueMid > 0 && value < rule.minValueMid) continue;
      if (rule.maxValueMid > 0 && value > rule.maxValueMid) continue;
      // Condition filter
      if (!conditionMeetsThreshold(item.condition, rule.minCondition)) continue;
      // Category filter
      if (rule.matchCategories) {
        const cats = rule.matchCategories.split(",").map(c => c.trim().toLowerCase()).filter(Boolean);
        if (cats.length > 0 && !cats.includes(item.category.toLowerCase())) continue;
      }

      // Rule matches — find the best local vendor for this route
      const candidates = localVendors.filter(vendor => {
        if (vendor.vendorType !== rule.vendorType) return false;
        if (!vendor.isActive) return false;
        if (vendor.zipCodesServed && projectZip &&
          !vendor.zipCodesServed.split(",").map(z => z.trim()).includes(projectZip)) return false;
        if (vendor.itemCategories &&
          !vendor.itemCategories.split(",").map(c => c.trim().toLowerCase()).includes(item.category.toLowerCase())) return false;
        // Vendor preference filter: if vendor has prefs, item must match at least one slot
        if (vendor.prefCategories.length > 0) {
          const itemCatLower = item.category.toLowerCase();
          const itemValue = item.valueMid ?? 0;
          const matchesPref = vendor.prefCategories.some(pref => {
            if (pref.category.toLowerCase() !== itemCatLower) return false;
            if (pref.minPrice > 0 && itemValue < pref.minPrice) return false;
            if (pref.maxPrice > 0 && itemValue > pref.maxPrice) return false;
            return true;
          });
          if (!matchesPref) return false;
        }
        return true;
      });

      candidates.sort((a, b) => {
        const aCentroid = a.zip ? getZipCentroid(a.zip) : null;
        const bCentroid = b.zip ? getZipCentroid(b.zip) : null;
        const aDist = projectCentroid && aCentroid
          ? haversineDistanceMiles(projectCentroid.lat, projectCentroid.lng, aCentroid.lat, aCentroid.lng)
          : Infinity;
        const bDist = projectCentroid && bCentroid
          ? haversineDistanceMiles(projectCentroid.lat, projectCentroid.lng, bCentroid.lat, bCentroid.lng)
          : Infinity;
        if (aDist !== bDist) return aDist - bDist;
        return a.consignmentTake - b.consignmentTake;
      });

      assignments.push({
        itemId: item.id,
        primaryRoute: rule.primaryRoute,
        // Donate items stay unassigned — vendor is set manually by staff
        vendorId: rule.primaryRoute === "Donate" ? undefined : candidates[0]?.id,
      });
      break; // first matching rule wins
    }
  }

  return assignments;
}

function mapLocalVendor(record: AirtableRecord): LocalVendor {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    vendorType: (toStr(f["VendorType"]) || "Other") as VendorType,
    vendorName: toStr(f["VendorName"]),
    pocName: toStr(f["POCName"]),
    email: toStr(f["Email"]),
    phone: toStr(f["Phone"]),
    address: toStr(f["Address"]),
    city: toStr(f["City"]),
    state: toStr(f["State"]),
    zip: toStr(f["Zip"]),
    website: toStr(f["Website"]),
    itemCategories: toStr(f["ItemCategories"]),
    consignmentTake: typeof f["ConsignmentTake"] === "number" ? f["ConsignmentTake"] : 0,
    zipCodesServed: toStr(f["ZipCodesServed"]),
    notes: toStr(f["Notes"]),
    isActive: f["IsActive"] === true,
    createdAt: toStr(f["CreatedAt"]),
    clerkUserId: toStr(f["ClerkUserId"]) || undefined,
    prefCategories: (() => {
      const slots = [];
      for (let i = 1; i <= 5; i++) {
        const cat = toStr(f[`PrefCategory${i}`]);
        if (cat) {
          slots.push({
            category: cat,
            minPrice: typeof f[`PrefMinPrice${i}`] === "number" ? (f[`PrefMinPrice${i}`] as number) : 0,
            maxPrice: typeof f[`PrefMaxPrice${i}`] === "number" ? (f[`PrefMaxPrice${i}`] as number) : 0,
          });
        }
      }
      return slots;
    })(),
  };
}

// ─── Project Files (uses fetch directly — same pattern as vendorFetch) ─────────
function fileFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.FILES;
  return fetch(`https://api.airtable.com/v0/${base}/${table}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function mapProjectFile(record: AirtableRecord): ProjectFile {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    tenantId: toStr(f["TenantID"]),
    fileName: toStr(f["FileName"]),
    fileTag: toStr(f["FileTag"]) as FileTag,
    roomLabel: toStr(f["RoomLabel"]) || undefined,
    vendorId: toStr(f["VendorId"]) || undefined,
    cloudinaryUrl: toStr(f["CloudinaryUrl"]),
    cloudinaryPublicId: toStr(f["CloudinaryPublicId"]),
    resourceType: toStr(f["ResourceType"]) || "image",
    sortOrder: f["SortOrder"] != null ? toNum(f["SortOrder"]) : undefined,
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getProjectFiles(tenantId: string): Promise<ProjectFile[]> {
  const formula = encodeURIComponent(`{TenantID} = "${tenantId}"`);
  const res = await fileFetch(
    `?filterByFormula=${formula}&sort[0][field]=CreatedAt&sort[0][direction]=desc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapProjectFile);
}

export async function createProjectFile(data: {
  tenantId: string;
  fileName: string;
  fileTag: FileTag;
  roomLabel?: string;
  vendorId?: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  resourceType: string;
}): Promise<ProjectFile> {
  const fields: Record<string, string> = {
    TenantID: data.tenantId,
    FileName: data.fileName,
    FileTag: data.fileTag,
    RoomLabel: data.roomLabel || "",
    CloudinaryUrl: data.cloudinaryUrl,
    CloudinaryPublicId: data.cloudinaryPublicId,
    ResourceType: data.resourceType,
    CreatedAt: new Date().toISOString(),
  };
  if (data.vendorId) fields["VendorId"] = data.vendorId;
  const res = await fileFetch("", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapProjectFile(await res.json());
}

export async function getVendorFilesForTenant(tenantId: string): Promise<ProjectFile[]> {
  const formula = encodeURIComponent(`AND({TenantID}="${tenantId}",{VendorId}!="")`);
  const res = await fileFetch(
    `?filterByFormula=${formula}&sort[0][field]=CreatedAt&sort[0][direction]=desc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapProjectFile);
}

export async function deleteProjectFile(id: string): Promise<void> {
  const res = await fileFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function updateProjectFile(
  id: string,
  data: { fileName?: string; fileTag?: FileTag; roomLabel?: string; sortOrder?: number }
): Promise<ProjectFile> {
  const fields: Record<string, string | number> = {};
  if (data.fileName !== undefined) fields["FileName"] = data.fileName;
  if (data.fileTag !== undefined) fields["FileTag"] = data.fileTag;
  // Always include RoomLabel so clearing it works
  fields["RoomLabel"] = data.roomLabel ?? "";
  if (data.sortOrder !== undefined) fields["SortOrder"] = data.sortOrder;
  const res = await fileFetch(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapProjectFile(await res.json());
}

// ─── Time Entries (uses fetch directly) ───────────────────────────────────────
function timeFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.TIME_ENTRIES;
  return fetch(`https://api.airtable.com/v0/${base}/${table}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function mapTimeEntry(record: AirtableRecord): TimeEntry {
  const f = record.fields;
  return {
    id: record.id,
    clerkUserId: toStr(f["ClerkUserId"]),
    staffName: toStr(f["StaffName"]),
    tenantId: toStr(f["TenantId"]),
    projectName: toStr(f["ProjectName"]),
    date: toStr(f["Date"]),
    startTime: toStr(f["StartTime"]),
    endTime: toStr(f["EndTime"]),
    durationMinutes: typeof f["DurationMinutes"] === "number" ? f["DurationMinutes"] : 0,
    focusArea: (toStr(f["FocusArea"]).replace(/^"+|"+$/g, "").trim() || "Other") as FocusArea,
    travelMiles: f["TravelMiles"] != null ? toNum(f["TravelMiles"]) : undefined,
    travelMinutes: f["TravelMinutes"] != null ? toNum(f["TravelMinutes"]) : undefined,
    notes: toStr(f["Notes"]) || undefined,
    nonBillable: f["NonBillable"] === true ? true : undefined,
    createdAt: toStr(f["CreatedAt"]),
    hoursPaidAt: toStr(f["HoursPaidAt"]) || undefined,
    mileagePaidAt: toStr(f["MileagePaidAt"]) || undefined,
    travelPaidAt: toStr(f["TravelPaidAt"]) || undefined,
  };
}

export async function getTimeEntries(filters?: { clerkUserId?: string; tenantId?: string }): Promise<TimeEntry[]> {
  const parts: string[] = [];
  if (filters?.clerkUserId) parts.push(`{ClerkUserId} = "${filters.clerkUserId}"`);
  if (filters?.tenantId) parts.push(`{TenantId} = "${filters.tenantId}"`);
  const filterStr = parts.length === 1 ? parts[0] : parts.length > 1 ? `AND(${parts.join(", ")})` : "";
  const baseQs = filterStr
    ? `?filterByFormula=${encodeURIComponent(filterStr)}&sort[0][field]=Date&sort[0][direction]=desc`
    : `?sort[0][field]=Date&sort[0][direction]=desc`;
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const qs = baseQs + (offset ? `&offset=${offset}` : "");
    const res = await timeFetch(qs);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    records.push(...(data.records as AirtableRecord[]));
    offset = data.offset;
  } while (offset);
  return records.map(mapTimeEntry);
}

export async function getTimeEntryById(id: string): Promise<TimeEntry | null> {
  try {
    const res = await timeFetch(`/${id}`);
    if (!res.ok) return null;
    return mapTimeEntry(await res.json());
  } catch {
    return null;
  }
}

// Optional fields that can be silently dropped if the Airtable table doesn't have them.
// TravelMiles and TravelMinutes are NOT optional — failing loudly if they're missing is
// preferable to silently discarding user-entered travel data.
const OPTIONAL_TIME_ENTRY_FIELDS = ["Notes", "NonBillable"];

async function timeEntryWrite(path: string, method: "POST" | "PATCH", fields: Record<string, unknown>): Promise<AirtableRecord> {
  const current = { ...fields };
  for (let attempt = 0; attempt <= OPTIONAL_TIME_ENTRY_FIELDS.length; attempt++) {
    const res = await timeFetch(path, { method, body: JSON.stringify({ fields: current, typecast: true }) });
    if (res.ok) return res.json();
    const text = await res.text();
    let errData: { error?: { type?: string; message?: string } };
    try { errData = JSON.parse(text); } catch { throw new Error(text); }
    if (errData?.error?.type === "UNKNOWN_FIELD_NAME") {
      const match = errData.error.message?.match(/"([^"]+)"/);
      if (match && OPTIONAL_TIME_ENTRY_FIELDS.includes(match[1])) {
        delete current[match[1]];
        continue;
      }
    }
    throw new Error(text);
  }
  throw new Error("TimeEntry write failed after stripping optional fields");
}

export async function createTimeEntry(data: Omit<TimeEntry, "id" | "createdAt">): Promise<TimeEntry> {
  const fields: Record<string, unknown> = {
    ClerkUserId: data.clerkUserId,
    StaffName: data.staffName,
    TenantId: data.tenantId,
    ProjectName: data.projectName,
    Date: data.date,
    StartTime: data.startTime,
    EndTime: data.endTime,
    DurationMinutes: data.durationMinutes,
    FocusArea: data.focusArea,
    CreatedAt: new Date().toISOString(),
  };
  if (data.travelMiles != null && data.travelMiles > 0) fields["TravelMiles"] = data.travelMiles;
  if (data.travelMinutes != null && data.travelMinutes > 0) fields["TravelMinutes"] = data.travelMinutes;
  if (data.notes) fields["Notes"] = data.notes;
  if (data.nonBillable) fields["NonBillable"] = true;
  return mapTimeEntry(await timeEntryWrite("", "POST", fields));
}

export async function updateTimeEntry(
  id: string,
  data: Partial<Omit<TimeEntry, "id" | "clerkUserId" | "createdAt">>
): Promise<TimeEntry> {
  const fields: Record<string, unknown> = {};
  if (data.staffName !== undefined) fields["StaffName"] = data.staffName;
  if (data.tenantId !== undefined) fields["TenantId"] = data.tenantId;
  if (data.projectName !== undefined) fields["ProjectName"] = data.projectName;
  if (data.date !== undefined) fields["Date"] = data.date;
  if (data.startTime !== undefined) fields["StartTime"] = data.startTime;
  if (data.endTime !== undefined) fields["EndTime"] = data.endTime;
  if (data.durationMinutes !== undefined) fields["DurationMinutes"] = data.durationMinutes;
  if (data.focusArea !== undefined) fields["FocusArea"] = String(data.focusArea).replace(/^"+|"+$/g, "").trim();
  if (data.travelMiles != null) fields["TravelMiles"] = data.travelMiles;
  if (data.travelMinutes != null) fields["TravelMinutes"] = data.travelMinutes;
  if (data.notes !== undefined) fields["Notes"] = data.notes;
  if (data.nonBillable !== undefined) fields["NonBillable"] = data.nonBillable;
  return mapTimeEntry(await timeEntryWrite(`/${id}`, "PATCH", fields));
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const res = await timeFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Services ─────────────────────────────────────────────────────────────────
function servicesFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.SERVICES;
  return fetch(`https://api.airtable.com/v0/${base}/${table}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function mapService(record: AirtableRecord): Service {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    name: toStr(f["Name"]).replace(/^"+|"+$/g, "").trim(),
    description: toStr(f["Description"]),
    hourlyRate: toNum(f["HourlyRate"]),
    estimatorLow: toNum(f["EstimatorLow"]),
    estimatorAvg: toNum(f["EstimatorAvg"]),
    estimatorHigh: toNum(f["EstimatorHigh"]),
    sortOrder: toNum(f["SortOrder"]),
    isActive: f["IsActive"] === true,
    createdAt: toStr(f["CreatedAt"]),
    qboItemId: toStr(f["QBOItemId"]) || undefined,
  };
}

export const getServices = unstable_cache(
  async (): Promise<Service[]> => {
    const res = await servicesFetch(`?sort[0][field]=SortOrder&sort[0][direction]=asc`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return (data.records as AirtableRecord[]).map(mapService).filter(s => s.isActive);
  },
  ["services"],
  { revalidate: 300 }
);

export async function getAllServices(): Promise<Service[]> {
  const res = await servicesFetch(`?sort[0][field]=SortOrder&sort[0][direction]=asc`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapService);
}

export async function createService(data: {
  name: string;
  description: string;
  hourlyRate: number;
  sortOrder: number;
  isActive: boolean;
}): Promise<Service> {
  const res = await servicesFetch("", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Name: data.name,
        Description: data.description,
        HourlyRate: data.hourlyRate,
        SortOrder: data.sortOrder,
        IsActive: data.isActive,
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapService(await res.json());
}

export async function updateService(id: string, data: {
  name?: string;
  description?: string;
  hourlyRate?: number;
  estimatorLow?: number;
  estimatorAvg?: number;
  estimatorHigh?: number;
  sortOrder?: number;
  isActive?: boolean;
  qboItemId?: string;
}): Promise<Service> {
  const fields: Record<string, unknown> = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.description !== undefined) fields["Description"] = data.description;
  if (data.hourlyRate !== undefined) fields["HourlyRate"] = data.hourlyRate;
  if (data.estimatorLow !== undefined) fields["EstimatorLow"] = data.estimatorLow;
  if (data.estimatorAvg !== undefined) fields["EstimatorAvg"] = data.estimatorAvg;
  if (data.estimatorHigh !== undefined) fields["EstimatorHigh"] = data.estimatorHigh;
  if (data.sortOrder !== undefined) fields["SortOrder"] = data.sortOrder;
  if (data.isActive !== undefined) fields["IsActive"] = data.isActive;
  if (data.qboItemId !== undefined) fields["QBOItemId"] = data.qboItemId;
  const res = await servicesFetch(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapService(await res.json());
}

export async function deleteService(id: string): Promise<void> {
  const res = await servicesFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Staff Roles (uses fetch directly) ───────────────────────────────────────
function staffRolesFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.STAFF_ROLES;
  return fetch(`https://api.airtable.com/v0/${base}/${table}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function mapStaffMember(record: AirtableRecord): StaffMember {
  const f = record.fields;
  let weeklySchedule: WeeklySchedule | undefined;
  let timeOff: TimeOffEntry[] | undefined;
  try { if (f["WeeklyAvailability"]) weeklySchedule = JSON.parse(f["WeeklyAvailability"] as string); } catch {}
  try { if (f["UnavailableDates"]) timeOff = JSON.parse(f["UnavailableDates"] as string); } catch {}
  return {
    id: record.id,
    clerkUserId: toStr(f["ClerkUserId"]),
    displayName: toStr(f["DisplayName"]),
    email: toStr(f["Email"]),
    phone: toStr(f["Phone"]) || undefined,
    role: (toStr(f["Role"]) || "TTTStaff") as SystemRole,
    isActive: f["IsActive"] === true,
    createdAt: toStr(f["CreatedAt"]),
    weeklySchedule,
    timeOff,
    hourlyRate: f["HourlyRate"] != null ? toNum(f["HourlyRate"]) : undefined,
  };
}

export async function getStaffMembers(): Promise<StaffMember[]> {
  const res = await staffRolesFetch(
    `?sort[0][field]=DisplayName&sort[0][direction]=asc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapStaffMember);
}

export async function getStaffMember(clerkUserId: string): Promise<StaffMember | null> {
  const formula = encodeURIComponent(`{ClerkUserId} = "${clerkUserId}"`);
  const res = await staffRolesFetch(`?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapStaffMember(data.records[0] as AirtableRecord);
}

// Returns the subset of the given emails that belong to active TTT staff members.
export async function getStaffMembersByEmails(emails: string[]): Promise<string[]> {
  if (!emails.length) return [];
  const lower = emails.map(e => e.toLowerCase());
  const orFormulas = lower.map(e => `{Email} = "${e}"`).join(",");
  const formula = encodeURIComponent(`AND(OR(${orFormulas}),{IsActive}=TRUE())`);
  const res = await staffRolesFetch(`?filterByFormula=${formula}`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ records: [] }));
  return (data.records as AirtableRecord[])
    .map(r => (r.fields["Email"] as string | undefined)?.toLowerCase() ?? "")
    .filter(Boolean);
}

export async function upsertStaffMember(data: {
  clerkUserId: string;
  displayName: string;
  email: string;
  role: "TTTStaff" | "TTTManager";
  isActive?: boolean;
}): Promise<StaffMember> {
  const existing = await getStaffMember(data.clerkUserId);
  const fields = {
    ClerkUserId: data.clerkUserId,
    DisplayName: data.displayName,
    Email: data.email,
    Role: data.role,
    IsActive: data.isActive ?? true,
  };
  if (existing) {
    const res = await staffRolesFetch(`/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(await res.text());
    return mapStaffMember(await res.json());
  }
  const res = await staffRolesFetch("", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapStaffMember(await res.json());
}

export async function updateStaffMember(
  id: string,
  data: Partial<{ displayName: string; email: string; phone: string; role: "TTTStaff" | "TTTManager"; isActive: boolean; hourlyRate: number | null }>
): Promise<StaffMember> {
  const fields: Record<string, unknown> = {};
  if (data.displayName !== undefined) fields["DisplayName"] = data.displayName;
  if (data.email !== undefined) fields["Email"] = data.email;
  if (data.phone !== undefined) fields["Phone"] = data.phone;
  if (data.role !== undefined) fields["Role"] = data.role;
  if (data.isActive !== undefined) fields["IsActive"] = data.isActive;
  if (data.hourlyRate !== undefined) fields["HourlyRate"] = data.hourlyRate;
  const res = await staffRolesFetch(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapStaffMember(await res.json());
}

export async function deleteStaffMember(id: string): Promise<void> {
  const res = await staffRolesFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// Availability fields — stored as JSON in StaffRoles table.
// Requires two Long Text fields in Airtable: WeeklyAvailability, UnavailableDates
export async function updateStaffAvailability(
  staffMemberId: string,
  data: { weeklySchedule?: WeeklySchedule; timeOff?: TimeOffEntry[] }
): Promise<StaffMember> {
  const fields: Record<string, unknown> = {};
  if (data.weeklySchedule !== undefined) fields["WeeklyAvailability"] = JSON.stringify(data.weeklySchedule);
  if (data.timeOff !== undefined) fields["UnavailableDates"] = JSON.stringify(data.timeOff);
  const res = await staffRolesFetch(`/${staffMemberId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapStaffMember(await res.json());
}

// ─── System Role Resolution ───────────────────────────────────────────────────
// Single source of truth for role lookup.
// 1. TTT_ADMIN_USER_IDS env var  → TTTAdmin (bootstrap)
// 2. TTT_STAFF_USER_IDS env var  → TTTStaff (legacy compat, skipped if also admin)
// 3. StaffRoles table (IsActive) → role from record
// 4. Otherwise → null
export const getSystemRole = cache(async (clerkUserId: string): Promise<SystemRole | null> => {
  if (isTTTAdmin(clerkUserId)) return "TTTAdmin";

  // Check StaffRoles table first (takes precedence over legacy env var for TTTManager)
  try {
    const member = await getStaffMember(clerkUserId);
    if (member && member.isActive) return member.role;
  } catch {
    // Fall through to env var check on Airtable error
  }

  // Legacy env var fallback for TTTStaff
  if (isTTTStaff(clerkUserId)) return "TTTStaff";

  return null;
});

// ─── Contract Settings ────────────────────────────────────────────────────────
function contractFetch(table: string, path: string, options?: RequestInit) {
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

function mapContractSettings(record: AirtableRecord): ContractSettings {
  const f = record.fields;
  const n = (key: string, fallback: number) =>
    typeof f[key] === "number" && (f[key] as number) > 0 ? (f[key] as number) : fallback;
  return {
    id: record.id,
    airtableId: record.id,
    rightsizingRate: n("RightsizingRate", 0),
    packingRate: n("PackingRate", 0),
    unpackingRate: n("UnpackingRate", 0),
    rightsizingLow: n("RightsizingLow", 0.5),
    rightsizingAvg: n("RightsizingAvg", 1.0),
    rightsizingHigh: n("RightsizingHigh", 2.0),
    packingPerHundred: n("PackingPerHundred", 1.0),
    unpackingPerHundred: n("UnpackingPerHundred", 1.0),
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getContractSettings(): Promise<ContractSettings | null> {
  const table = AIRTABLE_TABLES.CONTRACT_SETTINGS;
  const res = await contractFetch(table, "?maxRecords=1");
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapContractSettings(data.records[0] as AirtableRecord);
}

export async function upsertContractSettings(data: {
  rightsizingRate?: number;
  packingRate?: number;
  unpackingRate?: number;
  rightsizingLow?: number;
  rightsizingAvg?: number;
  rightsizingHigh?: number;
  packingPerHundred?: number;
  unpackingPerHundred?: number;
}): Promise<ContractSettings> {
  const table = AIRTABLE_TABLES.CONTRACT_SETTINGS;
  const existing = await getContractSettings();
  const fields: Record<string, unknown> = {};
  if (data.rightsizingRate !== undefined) fields["RightsizingRate"] = data.rightsizingRate;
  if (data.packingRate !== undefined) fields["PackingRate"] = data.packingRate;
  if (data.unpackingRate !== undefined) fields["UnpackingRate"] = data.unpackingRate;
  if (data.rightsizingLow !== undefined) fields["RightsizingLow"] = data.rightsizingLow;
  if (data.rightsizingAvg !== undefined) fields["RightsizingAvg"] = data.rightsizingAvg;
  if (data.rightsizingHigh !== undefined) fields["RightsizingHigh"] = data.rightsizingHigh;
  if (data.packingPerHundred !== undefined) fields["PackingPerHundred"] = data.packingPerHundred;
  if (data.unpackingPerHundred !== undefined) fields["UnpackingPerHundred"] = data.unpackingPerHundred;
  if (existing) {
    const res = await contractFetch(table, `/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(await res.text());
    return mapContractSettings(await res.json());
  }
  const res = await contractFetch(table, "", {
    method: "POST",
    body: JSON.stringify({ fields: { ...fields, CreatedAt: new Date().toISOString() } }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapContractSettings(await res.json());
}

// ─── Contract Templates ───────────────────────────────────────────────────────
function mapContractTemplate(record: AirtableRecord): ContractTemplate {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    name: toStr(f["Name"]),
    body: toStr(f["Body"]),
    isActive: f["IsActive"] === true,
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getContractTemplates(activeOnly = false): Promise<ContractTemplate[]> {
  const table = AIRTABLE_TABLES.CONTRACT_TEMPLATES;
  const qs = activeOnly
    ? `?filterByFormula=${encodeURIComponent("IsActive=TRUE()")}&sort[0][field]=Name&sort[0][direction]=asc`
    : `?sort[0][field]=Name&sort[0][direction]=asc`;
  const res = await contractFetch(table, qs);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapContractTemplate);
}

export async function createContractTemplate(data: {
  name: string;
  body: string;
  isActive: boolean;
}): Promise<ContractTemplate> {
  const table = AIRTABLE_TABLES.CONTRACT_TEMPLATES;
  const res = await contractFetch(table, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Name: data.name,
        Body: data.body,
        IsActive: data.isActive,
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapContractTemplate(await res.json());
}

export async function updateContractTemplate(
  id: string,
  data: Partial<{ name: string; body: string; isActive: boolean }>
): Promise<ContractTemplate> {
  const table = AIRTABLE_TABLES.CONTRACT_TEMPLATES;
  const fields: Record<string, unknown> = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.body !== undefined) fields["Body"] = data.body;
  if (data.isActive !== undefined) fields["IsActive"] = data.isActive;
  const res = await contractFetch(table, `/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapContractTemplate(await res.json());
}

export async function deleteContractTemplate(id: string): Promise<void> {
  const table = AIRTABLE_TABLES.CONTRACT_TEMPLATES;
  const res = await contractFetch(table, `/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Contracts ────────────────────────────────────────────────────────────────
function mapContract(record: AirtableRecord): Contract {
  const f = record.fields;
  let lineItems: ContractLineItem[] | undefined;
  const rawLineItems = toStr(f["ServiceLineItems"]);
  if (rawLineItems) {
    try { lineItems = JSON.parse(rawLineItems); } catch { /* ignore */ }
  }
  return {
    id: record.id,
    airtableId: record.id,
    tenantId: toStr(f["TenantId"]),
    templateId: toStr(f["TemplateId"]),
    contractBody: toStr(f["ContractBody"]),
    rightsizingHours: typeof f["RightsizingHours"] === "number" ? f["RightsizingHours"] : 0,
    packingHours: typeof f["PackingHours"] === "number" ? f["PackingHours"] : 0,
    unpackingHours: typeof f["UnpackingHours"] === "number" ? f["UnpackingHours"] : 0,
    rightsizingRate: typeof f["RightsizingRate"] === "number" ? f["RightsizingRate"] : 0,
    packingRate: typeof f["PackingRate"] === "number" ? f["PackingRate"] : 0,
    unpackingRate: typeof f["UnpackingRate"] === "number" ? f["UnpackingRate"] : 0,
    totalCost: typeof f["TotalCost"] === "number" ? f["TotalCost"] : 0,
    status: (toStr(f["Status"]) || "Draft") as ContractStatus,
    signatureData: toStr(f["SignatureData"]) || undefined,
    signatureMethod: (toStr(f["SignatureMethod"]) || undefined) as "draw" | "type" | undefined,
    signedAt: toStr(f["SignedAt"]) || undefined,
    signedByName: toStr(f["SignedByName"]) || undefined,
    signToken: toStr(f["SignToken"]),
    sentByClerkId: toStr(f["SentByClerkId"]) || undefined,
    sentAt: toStr(f["SentAt"]) || undefined,
    recipientEmail: toStr(f["RecipientEmail"]) || undefined,
    autoSendDeposit: f["AutoSendDeposit"] === true,
    includeServiceDescriptions: f["IncludeServiceDescriptions"] === true,
    includeServiceHours: f["IncludeServiceHours"] === true,
    createdAt: toStr(f["CreatedAt"]),
    lineItems,
  };
}

export async function getContractsForTenant(tenantId: string): Promise<Contract[]> {
  const table = AIRTABLE_TABLES.CONTRACTS;
  const formula = encodeURIComponent(`{TenantId} = "${tenantId}"`);
  const res = await contractFetch(
    table,
    `?filterByFormula=${formula}&sort[0][field]=CreatedAt&sort[0][direction]=desc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapContract);
}

export async function getContractByToken(signToken: string): Promise<Contract | null> {
  const table = AIRTABLE_TABLES.CONTRACTS;
  const formula = encodeURIComponent(`{SignToken} = "${signToken}"`);
  const res = await contractFetch(table, `?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapContract(data.records[0] as AirtableRecord);
}

export async function createContract(data: {
  tenantId: string;
  templateId: string;
  contractBody: string;
  rightsizingHours: number;
  packingHours: number;
  unpackingHours: number;
  rightsizingRate: number;
  packingRate: number;
  unpackingRate: number;
  totalCost: number;
  signToken: string;
  lineItems?: ContractLineItem[];
  recipientEmail?: string;
  autoSendDeposit?: boolean;
  includeServiceDescriptions?: boolean;
  includeServiceHours?: boolean;
}): Promise<Contract> {
  const table = AIRTABLE_TABLES.CONTRACTS;
  const fields: Record<string, unknown> = {
    TenantId: data.tenantId,
    TemplateId: data.templateId,
    ContractBody: data.contractBody,
    RightsizingHours: data.rightsizingHours,
    PackingHours: data.packingHours,
    UnpackingHours: data.unpackingHours,
    RightsizingRate: data.rightsizingRate,
    PackingRate: data.packingRate,
    UnpackingRate: data.unpackingRate,
    TotalCost: data.totalCost,
    Status: "Draft",
    SignToken: data.signToken,
    CreatedAt: new Date().toISOString(),
  };
  if (data.lineItems) {
    fields["ServiceLineItems"] = JSON.stringify(data.lineItems);
  }
  if (data.recipientEmail) fields["RecipientEmail"] = data.recipientEmail;
  if (data.autoSendDeposit) fields["AutoSendDeposit"] = true;
  if (data.includeServiceDescriptions) fields["IncludeServiceDescriptions"] = true;
  if (data.includeServiceHours) fields["IncludeServiceHours"] = true;
  const res = await contractFetch(table, "", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapContract(await res.json());
}

export async function updateContract(
  id: string,
  data: Partial<{
    status: ContractStatus;
    signatureData: string;
    signatureMethod: "draw" | "type";
    signedAt: string;
    signedByName: string;
    sentByClerkId: string;
    sentAt: string;
    signToken: string;
    recipientEmail: string;
    contractBody: string;
    rightsizingHours: number;
    packingHours: number;
    unpackingHours: number;
    totalCost: number;
    lineItems: ContractLineItem[];
  }>
): Promise<Contract> {
  const table = AIRTABLE_TABLES.CONTRACTS;
  const fields: Record<string, unknown> = {};
  if (data.status !== undefined) fields["Status"] = data.status;
  if (data.signatureData !== undefined) fields["SignatureData"] = data.signatureData;
  if (data.signatureMethod !== undefined) fields["SignatureMethod"] = data.signatureMethod;
  if (data.signedAt !== undefined) fields["SignedAt"] = data.signedAt;
  if (data.signedByName !== undefined) fields["SignedByName"] = data.signedByName;
  if (data.sentByClerkId !== undefined) fields["SentByClerkId"] = data.sentByClerkId;
  if (data.sentAt !== undefined) fields["SentAt"] = data.sentAt;
  if (data.signToken !== undefined) fields["SignToken"] = data.signToken;
  if (data.recipientEmail !== undefined) fields["RecipientEmail"] = data.recipientEmail;
  if (data.contractBody !== undefined) fields["ContractBody"] = data.contractBody;
  if (data.rightsizingHours !== undefined) fields["RightsizingHours"] = data.rightsizingHours;
  if (data.packingHours !== undefined) fields["PackingHours"] = data.packingHours;
  if (data.unpackingHours !== undefined) fields["UnpackingHours"] = data.unpackingHours;
  if (data.totalCost !== undefined) fields["TotalCost"] = data.totalCost;
  if (data.lineItems !== undefined) fields["ServiceLineItems"] = JSON.stringify(data.lineItems);
  const res = await contractFetch(table, `/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapContract(await res.json());
}

// ─── CRM helpers ──────────────────────────────────────────────────────────────
function crmFetch(table: string, path: string, options?: RequestInit) {
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

// ─── CRM Referral Companies ───────────────────────────────────────────────────
function mapReferralCompany(record: AirtableRecord): ReferralCompany {
  const f = record.fields;
  const rawPriority = toStr(f["Priority"]);
  return {
    id: record.id,
    name: toStr(f["Name"]),
    type: toStr(f["Type"]),
    address: toStr(f["Address"]),
    city: toStr(f["City"]),
    state: toStr(f["State"]),
    zip: toStr(f["Zip"]),
    priority: (rawPriority === "High" || rawPriority === "Medium" || rawPriority === "Low" ? rawPriority : "") as import("./types").ReferralPriority,
    notes: toStr(f["Notes"]),
    website: toStr(f["Website"]) || undefined,
    assignedToClerkId: toStr(f["AssignedToClerkId"]),
    createdAt: toStr(f["CreatedAt"]),
    lastActivityDate: toStr(f["LastActivityDate"]) || undefined,
  };
}

export async function getReferralCompanies(): Promise<ReferralCompany[]> {
  const all: ReferralCompany[] = [];
  let offset: string | undefined;
  do {
    const qs = `?sort[0][field]=Name&sort[0][direction]=asc${offset ? `&offset=${offset}` : ""}`;
    const res = await crmFetch(AIRTABLE_TABLES.CRM_COMPANIES, qs);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    all.push(...(data.records as AirtableRecord[]).map(mapReferralCompany));
    offset = data.offset;
  } while (offset);
  return all;
}

export async function findReferralCompanyByName(name: string): Promise<ReferralCompany | null> {
  const formula = encodeURIComponent(`LOWER({Name}) = LOWER("${name.replace(/"/g, '\\"')}")`);
  const res = await crmFetch(AIRTABLE_TABLES.CRM_COMPANIES, `?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.length > 0 ? mapReferralCompany(data.records[0]) : null;
}

export async function createReferralCompany(data: {
  name: string;
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  priority?: string;
  notes?: string;
  website?: string;
  assignedToClerkId?: string;
}): Promise<ReferralCompany> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_COMPANIES, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Name: data.name,
        Type: data.type || "",
        Address: data.address || "",
        City: data.city || "",
        State: data.state || "",
        Zip: data.zip || "",
        ...(data.priority ? { Priority: data.priority } : {}),
        Notes: data.notes || "",
        Website: data.website || "",
        AssignedToClerkId: data.assignedToClerkId || "",
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapReferralCompany(await res.json());
}

export async function updateReferralCompany(
  id: string,
  data: Partial<{ name: string; type: string; address: string; city: string; state: string; zip: string; priority: string; notes: string; website: string; assignedToClerkId: string; lastActivityDate: string }>
): Promise<ReferralCompany> {
  const fields: Record<string, unknown> = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.type !== undefined) fields["Type"] = data.type;
  if (data.address !== undefined) fields["Address"] = data.address;
  if (data.city !== undefined) fields["City"] = data.city;
  if (data.state !== undefined) fields["State"] = data.state;
  if (data.zip !== undefined) fields["Zip"] = data.zip;
  if (data.priority !== undefined) fields["Priority"] = data.priority || null;
  if (data.notes !== undefined) fields["Notes"] = data.notes;
  if (data.website !== undefined) fields["Website"] = data.website;
  if (data.assignedToClerkId !== undefined) fields["AssignedToClerkId"] = data.assignedToClerkId;
  if (data.lastActivityDate !== undefined) fields["LastActivityDate"] = data.lastActivityDate;
  const res = await crmFetch(AIRTABLE_TABLES.CRM_COMPANIES, `/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapReferralCompany(await res.json());
}

export async function deleteReferralCompany(id: string): Promise<void> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_COMPANIES, `/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── CRM Referral Contacts ────────────────────────────────────────────────────
function mapReferralContact(record: AirtableRecord): ReferralContact {
  const f = record.fields;
  return {
    id: record.id,
    name: toStr(f["Name"]),
    title: toStr(f["Title"]),
    email: toStr(f["Email"]),
    phone: toStr(f["Phone"]),
    referralCompanyId: toStr(f["ReferralCompanyId"]),
    notes: toStr(f["Notes"]),
    stage: (toStr(f["Stage"]) || "Identified") as ReferralContactStage,
    dateIntroduced: toStr(f["DateIntroduced"]) || undefined,
    interests: toStr(f["Interests"]) || undefined,
    coffeeOrder: toStr(f["CoffeeOrder"]) || undefined,
    orgsGroups: toStr(f["OrgsGroups"]) || undefined,
    createdAt: toStr(f["CreatedAt"]),
    lastActivityDate: toStr(f["LastActivityDate"]) || undefined,
  };
}

export async function getReferralContacts(companyId?: string): Promise<ReferralContact[]> {
  const baseFilter = companyId
    ? `?filterByFormula=${encodeURIComponent(`{ReferralCompanyId} = "${companyId}"`)}&sort[0][field]=Name&sort[0][direction]=asc`
    : `?sort[0][field]=Name&sort[0][direction]=asc`;
  const all: ReferralContact[] = [];
  let offset: string | undefined;
  do {
    const qs = `${baseFilter}${offset ? `&offset=${offset}` : ""}`;
    const res = await crmFetch(AIRTABLE_TABLES.CRM_CONTACTS, qs);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    all.push(...(data.records as AirtableRecord[]).map(mapReferralContact));
    offset = data.offset;
  } while (offset);
  return all;
}

export async function findReferralContactByName(name: string): Promise<ReferralContact | null> {
  const formula = encodeURIComponent(`LOWER({Name}) = LOWER("${name.replace(/"/g, '\\"')}")`);
  const res = await crmFetch(AIRTABLE_TABLES.CRM_CONTACTS, `?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.length > 0 ? mapReferralContact(data.records[0]) : null;
}

export async function createReferralContact(data: {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  referralCompanyId: string;
  notes?: string;
  stage?: string;
  dateIntroduced?: string;
  interests?: string;
  coffeeOrder?: string;
  orgsGroups?: string;
}): Promise<ReferralContact> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_CONTACTS, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Name: data.name,
        Title: data.title || "",
        Email: data.email || "",
        Phone: data.phone || "",
        ReferralCompanyId: data.referralCompanyId,
        Notes: data.notes || "",
        Stage: data.stage || "Identified",
        DateIntroduced: data.dateIntroduced || "",
        Interests: data.interests || "",
        CoffeeOrder: data.coffeeOrder || "",
        OrgsGroups: data.orgsGroups || "",
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapReferralContact(await res.json());
}

export async function updateReferralContact(
  id: string,
  data: Partial<{ name: string; title: string; email: string; phone: string; referralCompanyId: string; notes: string; stage: string; dateIntroduced: string; interests: string; coffeeOrder: string; orgsGroups: string; lastActivityDate: string }>
): Promise<ReferralContact> {
  const fields: Record<string, unknown> = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.title !== undefined) fields["Title"] = data.title;
  if (data.email !== undefined) fields["Email"] = data.email;
  if (data.phone !== undefined) fields["Phone"] = data.phone;
  if (data.referralCompanyId !== undefined) fields["ReferralCompanyId"] = data.referralCompanyId;
  if (data.notes !== undefined) fields["Notes"] = data.notes;
  if (data.stage !== undefined) fields["Stage"] = data.stage || null;
  if (data.dateIntroduced !== undefined) fields["DateIntroduced"] = data.dateIntroduced;
  if (data.interests !== undefined) fields["Interests"] = data.interests;
  if (data.coffeeOrder !== undefined) fields["CoffeeOrder"] = data.coffeeOrder;
  if (data.orgsGroups !== undefined) fields["OrgsGroups"] = data.orgsGroups;
  if (data.lastActivityDate !== undefined) fields["LastActivityDate"] = data.lastActivityDate;
  const res = await crmFetch(AIRTABLE_TABLES.CRM_CONTACTS, `/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapReferralContact(await res.json());
}

export async function deleteReferralContact(id: string): Promise<void> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_CONTACTS, `/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── CRM Client Contacts ──────────────────────────────────────────────────────
function mapClientContact(record: AirtableRecord): ClientContact {
  const f = record.fields;
  return {
    id: record.id,
    name: toStr(f["Name"]),
    email: toStr(f["Email"]),
    phone: toStr(f["Phone"]),
    source: toStr(f["Source"]),
    referralPartnerId: toStr(f["ReferralPartnerId"]) || undefined,
    clientReferralId: toStr(f["ClientReferralId"]) || undefined,
    notes: toStr(f["Notes"]),
    assignedToClerkId: toStr(f["AssignedToClerkId"]),
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getClientContacts(): Promise<ClientContact[]> {
  const all: ClientContact[] = [];
  let offset: string | undefined;
  do {
    const qs = `?sort[0][field]=Name&sort[0][direction]=asc${offset ? `&offset=${offset}` : ""}`;
    const res = await crmFetch(AIRTABLE_TABLES.CRM_CLIENT_CONTACTS, qs);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    all.push(...(data.records as AirtableRecord[]).map(mapClientContact));
    offset = data.offset;
  } while (offset);
  return all;
}

export async function getClientContactById(id: string): Promise<ClientContact | null> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_CLIENT_CONTACTS, `/${id}`);
  if (!res.ok) return null;
  return mapClientContact(await res.json());
}

export async function findClientContactByName(name: string): Promise<ClientContact | null> {
  const formula = encodeURIComponent(`LOWER({Name}) = LOWER("${name.replace(/"/g, '\\"')}")`);
  const res = await crmFetch(AIRTABLE_TABLES.CRM_CLIENT_CONTACTS, `?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.length > 0 ? mapClientContact(data.records[0]) : null;
}

export async function createClientContact(data: {
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  referralPartnerId?: string;
  clientReferralId?: string;
  notes?: string;
  assignedToClerkId?: string;
}): Promise<ClientContact> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_CLIENT_CONTACTS, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Name: data.name,
        Email: data.email || "",
        Phone: data.phone || "",
        Source: data.source || "",
        ReferralPartnerId: data.referralPartnerId || "",
        ClientReferralId: data.clientReferralId || "",
        Notes: data.notes || "",
        AssignedToClerkId: data.assignedToClerkId || "",
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapClientContact(await res.json());
}

export async function updateClientContact(
  id: string,
  data: Partial<{ name: string; email: string; phone: string; source: string; referralPartnerId: string; clientReferralId: string; notes: string; assignedToClerkId: string }>
): Promise<ClientContact> {
  const fields: Record<string, unknown> = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.email !== undefined) fields["Email"] = data.email;
  if (data.phone !== undefined) fields["Phone"] = data.phone;
  if (data.source !== undefined) fields["Source"] = data.source;
  if (data.referralPartnerId !== undefined) fields["ReferralPartnerId"] = data.referralPartnerId;
  if (data.clientReferralId !== undefined) fields["ClientReferralId"] = data.clientReferralId;
  if (data.notes !== undefined) fields["Notes"] = data.notes;
  if (data.assignedToClerkId !== undefined) fields["AssignedToClerkId"] = data.assignedToClerkId;
  const res = await crmFetch(AIRTABLE_TABLES.CRM_CLIENT_CONTACTS, `/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapClientContact(await res.json());
}

export async function deleteClientContact(id: string): Promise<void> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_CLIENT_CONTACTS, `/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function getClientContactByEmail(email: string): Promise<ClientContact | null> {
  const formula = encodeURIComponent(`{Email} = "${email}"`);
  const res = await crmFetch(AIRTABLE_TABLES.CRM_CLIENT_CONTACTS, `?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.length > 0 ? mapClientContact(data.records[0]) : null;
}

// ─── CRM Opportunities ────────────────────────────────────────────────────────
function mapOpportunity(record: AirtableRecord): ClientOpportunity {
  const f = record.fields;
  let keyPeople: KeyPerson[] = [];
  try {
    const raw = toStr(f["KeyPeople"]);
    if (raw) keyPeople = JSON.parse(raw);
  } catch {
    keyPeople = [];
  }
  return {
    id: record.id,
    tenantId: toStr(f["TenantId"]),
    clientContactId: toStr(f["ClientContactId"]),
    stage: (toStr(f["Stage"]) || "Lead") as OpportunityStage,
    keyPeople,
    notes: toStr(f["Notes"]),
    nextStepDate: toStr(f["NextStepDate"]) || undefined,
    nextStepNote: toStr(f["NextStepNote"]) || undefined,
    estimatedValue: typeof f["EstimatedValue"] === "number" ? f["EstimatedValue"] : 0,
    wonAt: toStr(f["WonAt"]) || undefined,
    lostAt: toStr(f["LostAt"]) || undefined,
    lostReason: toStr(f["LostReason"]) || undefined,
    assignedToClerkId: toStr(f["AssignedToClerkId"]),
    createdAt: toStr(f["CreatedAt"]),
    address: toStr(f["Address"]) || undefined,
    city: toStr(f["City"]) || undefined,
    state: toStr(f["State"]) || undefined,
    zip: toStr(f["Zip"]) || undefined,
  };
}

export async function getOpportunities(filters?: { stage?: string; assignedTo?: string }): Promise<ClientOpportunity[]> {
  const parts: string[] = [];
  if (filters?.stage) parts.push(`{Stage} = "${filters.stage}"`);
  if (filters?.assignedTo) parts.push(`{AssignedToClerkId} = "${filters.assignedTo}"`);
  const filterStr = parts.length === 1 ? parts[0] : parts.length > 1 ? `AND(${parts.join(", ")})` : "";
  const qs = filterStr
    ? `?filterByFormula=${encodeURIComponent(filterStr)}&sort[0][field]=CreatedAt&sort[0][direction]=desc`
    : `?sort[0][field]=CreatedAt&sort[0][direction]=desc`;
  const res = await crmFetch(AIRTABLE_TABLES.CRM_OPPORTUNITIES, qs);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapOpportunity);
}

export async function getOpportunityById(id: string): Promise<ClientOpportunity | null> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_OPPORTUNITIES, `/${id}`);
  if (!res.ok) return null;
  return mapOpportunity(await res.json());
}

export async function getOpportunitiesForTenant(tenantId: string): Promise<ClientOpportunity[]> {
  const formula = encodeURIComponent(`{TenantId} = "${tenantId}"`);
  const res = await crmFetch(AIRTABLE_TABLES.CRM_OPPORTUNITIES, `?filterByFormula=${formula}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapOpportunity);
}

export async function getOpportunitiesForContact(clientContactId: string): Promise<ClientOpportunity[]> {
  const formula = encodeURIComponent(`{ClientContactId} = "${clientContactId}"`);
  const res = await crmFetch(AIRTABLE_TABLES.CRM_OPPORTUNITIES, `?filterByFormula=${formula}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapOpportunity);
}

export async function createOpportunity(data: {
  tenantId?: string;
  clientContactId: string;
  stage?: OpportunityStage;
  keyPeople?: KeyPerson[];
  notes?: string;
  nextStepDate?: string;
  nextStepNote?: string;
  estimatedValue?: number;
  assignedToClerkId?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): Promise<ClientOpportunity> {
  const fields: Record<string, unknown> = {
    TenantId: data.tenantId || "",
    ClientContactId: data.clientContactId,
    Stage: data.stage || "Lead",
    KeyPeople: data.keyPeople ? JSON.stringify(data.keyPeople) : "[]",
    Notes: data.notes || "",
    NextStepDate: data.nextStepDate || null,
    NextStepNote: data.nextStepNote || "",
    EstimatedValue: data.estimatedValue ?? 0,
    AssignedToClerkId: data.assignedToClerkId || "",
    CreatedAt: new Date().toISOString(),
  };
  if (data.address !== undefined) fields["Address"] = data.address;
  if (data.city !== undefined) fields["City"] = data.city;
  if (data.state !== undefined) fields["State"] = data.state;
  if (data.zip !== undefined) fields["Zip"] = data.zip;
  const res = await crmFetch(AIRTABLE_TABLES.CRM_OPPORTUNITIES, "", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapOpportunity(await res.json());
}

export async function updateOpportunity(
  id: string,
  data: Partial<{
    tenantId: string;
    clientContactId: string;
    stage: OpportunityStage;
    keyPeople: KeyPerson[];
    notes: string;
    nextStepDate: string;
    nextStepNote: string;
    estimatedValue: number;
    wonAt: string;
    lostAt: string;
    lostReason: string;
    assignedToClerkId: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  }>
): Promise<ClientOpportunity> {
  const fields: Record<string, unknown> = {};
  if (data.tenantId !== undefined) fields["TenantId"] = data.tenantId;
  if (data.clientContactId !== undefined) fields["ClientContactId"] = data.clientContactId;
  if (data.stage !== undefined) fields["Stage"] = data.stage;
  if (data.keyPeople !== undefined) fields["KeyPeople"] = JSON.stringify(data.keyPeople);
  if (data.notes !== undefined) fields["Notes"] = data.notes;
  if (data.nextStepDate !== undefined) fields["NextStepDate"] = data.nextStepDate || null;
  if (data.nextStepNote !== undefined) fields["NextStepNote"] = data.nextStepNote;
  if (data.estimatedValue !== undefined) fields["EstimatedValue"] = data.estimatedValue;
  if (data.wonAt !== undefined) fields["WonAt"] = data.wonAt;
  if (data.lostAt !== undefined) fields["LostAt"] = data.lostAt;
  if (data.lostReason !== undefined) fields["LostReason"] = data.lostReason;
  if (data.assignedToClerkId !== undefined) fields["AssignedToClerkId"] = data.assignedToClerkId;
  if (data.address !== undefined) fields["Address"] = data.address;
  if (data.city !== undefined) fields["City"] = data.city;
  if (data.state !== undefined) fields["State"] = data.state;
  if (data.zip !== undefined) fields["Zip"] = data.zip;
  const res = await crmFetch(AIRTABLE_TABLES.CRM_OPPORTUNITIES, `/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapOpportunity(await res.json());
}

export async function deleteOpportunity(id: string): Promise<void> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_OPPORTUNITIES, `/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── CRM Activities ───────────────────────────────────────────────────────────
function mapCRMActivity(record: AirtableRecord): CRMActivity {
  const f = record.fields;
  return {
    id: record.id,
    opportunityId: toStr(f["OpportunityId"]),
    clientContactId: toStr(f["ClientContactId"]) || undefined,
    type: (toStr(f["Type"]) || "Note") as CRMActivityType,
    note: toStr(f["Note"]),
    isGmailImported: f["IsGmailImported"] === true,
    gmailMessageId: toStr(f["GmailMessageId"]) || undefined,
    gmailThreadId: toStr(f["GmailThreadId"]) || undefined,
    activityDate: toStr(f["ActivityDate"]),
    createdByClerkId: toStr(f["CreatedByClerkId"]),
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getActivitiesForOpportunity(opportunityId: string): Promise<CRMActivity[]> {
  const formula = encodeURIComponent(`{OpportunityId} = "${opportunityId}"`);
  const res = await crmFetch(
    AIRTABLE_TABLES.CRM_ACTIVITIES,
    `?filterByFormula=${formula}&sort[0][field]=ActivityDate&sort[0][direction]=desc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapCRMActivity);
}

export async function getAllActivities(): Promise<CRMActivity[]> {
  const all: CRMActivity[] = [];
  let offset: string | undefined;
  do {
    const qs = `?sort[0][field]=ActivityDate&sort[0][direction]=desc${offset ? `&offset=${offset}` : ""}`;
    const res = await crmFetch(AIRTABLE_TABLES.CRM_ACTIVITIES, qs);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    all.push(...(data.records as AirtableRecord[]).map(mapCRMActivity));
    offset = data.offset;
  } while (offset);
  return all;
}

export async function createActivity(data: {
  opportunityId?: string;
  clientContactId?: string;
  type: CRMActivityType;
  note: string;
  isGmailImported?: boolean;
  gmailMessageId?: string;
  gmailThreadId?: string;
  activityDate: string;
  createdByClerkId: string;
}): Promise<CRMActivity> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_ACTIVITIES, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        OpportunityId: data.opportunityId || "",
        ClientContactId: data.clientContactId || "",
        Type: data.type,
        Note: data.note,
        IsGmailImported: data.isGmailImported ?? false,
        GmailMessageId: data.gmailMessageId || "",
        GmailThreadId: data.gmailThreadId || "",
        ActivityDate: data.activityDate,
        CreatedByClerkId: data.createdByClerkId,
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const activity = mapCRMActivity(await res.json());

  // After saving the activity, propagate LastActivityDate to the referral contact and its company.
  // Uses try/catch so a failure here never blocks the activity from being saved.
  // LastActivityDate is a Date field in Airtable — must be YYYY-MM-DD only (no time component).
  if (data.clientContactId) {
    const dateOnly = data.activityDate ? data.activityDate.slice(0, 10) : "";
    try {
      const contactPatchRes = await crmFetch(AIRTABLE_TABLES.CRM_CONTACTS, `/${data.clientContactId}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: { LastActivityDate: dateOnly } }),
      });
      if (contactPatchRes.ok) {
        const contactRecord = await contactPatchRes.json();
        const companyId = toStr(contactRecord.fields?.ReferralCompanyId);
        if (companyId) {
          await crmFetch(AIRTABLE_TABLES.CRM_COMPANIES, `/${companyId}`, {
            method: "PATCH",
            body: JSON.stringify({ fields: { LastActivityDate: dateOnly } }),
          });
        }
      }
    } catch { /* non-fatal — activity is already saved */ }
  }

  return activity;
}

export async function getActivitiesForContact(clientContactId: string): Promise<CRMActivity[]> {
  const formula = encodeURIComponent(`{ClientContactId} = "${clientContactId}"`);
  const res = await crmFetch(
    AIRTABLE_TABLES.CRM_ACTIVITIES,
    `?filterByFormula=${formula}&sort[0][field]=ActivityDate&sort[0][direction]=desc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapCRMActivity);
}

export async function updateActivity(
  id: string,
  data: Partial<{ type: CRMActivityType; note: string; activityDate: string }>
): Promise<CRMActivity> {
  const fields: Record<string, unknown> = {};
  if (data.type !== undefined) fields["Type"] = data.type;
  if (data.note !== undefined) fields["Note"] = data.note;
  if (data.activityDate !== undefined) fields["ActivityDate"] = data.activityDate;
  const res = await crmFetch(AIRTABLE_TABLES.CRM_ACTIVITIES, `/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapCRMActivity(await res.json());
}

export async function deleteActivity(id: string): Promise<void> {
  const res = await crmFetch(AIRTABLE_TABLES.CRM_ACTIVITIES, `/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** Returns all GmailMessageIds already stored as activities (any contact).
 *  Used at the start of a Gmail sync to skip messages that were already
 *  imported for a different contact in a previous sync run. */
export async function getImportedGmailMessageIds(): Promise<Set<string>> {
  const formula = encodeURIComponent(`LEN({GmailMessageId}) > 0`);
  const ids = new Set<string>();
  let offset: string | undefined;
  do {
    const qs = `?filterByFormula=${formula}&fields[]=GmailMessageId${offset ? `&offset=${offset}` : ""}`;
    const res = await crmFetch(AIRTABLE_TABLES.CRM_ACTIVITIES, qs);
    if (!res.ok) break;
    const data = await res.json();
    for (const record of data.records as AirtableRecord[]) {
      const id = toStr((record.fields as Record<string, unknown>)["GmailMessageId"]);
      if (id) ids.add(id);
    }
    offset = data.offset;
  } while (offset);
  return ids;
}

// Fetch all activities that have a ClientContactId (paginated)
export async function getAllActivitiesWithContactId(): Promise<CRMActivity[]> {
  const formula = encodeURIComponent(`{ClientContactId} != ""`);
  const all: CRMActivity[] = [];
  let offset: string | undefined;
  do {
    const qs = `?filterByFormula=${formula}${offset ? `&offset=${offset}` : ""}`;
    const res = await crmFetch(AIRTABLE_TABLES.CRM_ACTIVITIES, qs);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    all.push(...(data.records as AirtableRecord[]).map(mapCRMActivity));
    offset = data.offset;
  } while (offset);
  return all;
}

// Batch-update LastActivityDate on referral contacts (max 10 per Airtable request)
export async function batchUpdateReferralLastActivity(
  updates: Array<{ id: string; lastActivityDate: string }>
): Promise<void> {
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    const res = await crmFetch(AIRTABLE_TABLES.CRM_CONTACTS, "", {
      method: "PATCH",
      body: JSON.stringify({
        records: batch.map(u => ({
          id: u.id,
          fields: { LastActivityDate: u.lastActivityDate },
        })),
      }),
    });
    if (!res.ok) console.error("batchUpdateReferralLastActivity failed:", await res.text());
  }
}

// Batch-update LastActivityDate on referral companies (max 10 per Airtable request)
export async function batchUpdateCompanyLastActivity(
  updates: Array<{ id: string; lastActivityDate: string }>
): Promise<void> {
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    const res = await crmFetch(AIRTABLE_TABLES.CRM_COMPANIES, "", {
      method: "PATCH",
      body: JSON.stringify({
        records: batch.map(u => ({
          id: u.id,
          fields: { LastActivityDate: u.lastActivityDate },
        })),
      }),
    });
    if (!res.ok) console.error("batchUpdateCompanyLastActivity failed:", await res.text());
  }
}

// ─── Gmail Tokens ─────────────────────────────────────────────────────────────
function mapGmailToken(record: AirtableRecord): GmailToken {
  const f = record.fields;
  return {
    id: record.id,
    clerkUserId: toStr(f["ClerkUserId"]),
    accessToken: toStr(f["AccessToken"]),
    refreshToken: toStr(f["RefreshToken"]),
    expiresAt: toStr(f["ExpiresAt"]),
    email: toStr(f["Email"]),
  };
}

/** Returns all stored Gmail tokens (one per connected user, excluding the system calendar key). */
export async function getAllGmailTokens(): Promise<GmailToken[]> {
  const formula = encodeURIComponent(`AND(LEN({RefreshToken}) > 10, {ClerkUserId} != "__gcal__")`);
  const res = await crmFetch(
    AIRTABLE_TABLES.GMAIL_TOKENS,
    `?filterByFormula=${formula}&sort[0][field]=UpdatedAt&sort[0][direction]=desc`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapGmailToken);
}

export async function getGmailToken(clerkUserId: string): Promise<GmailToken | null> {
  const formula = encodeURIComponent(`{ClerkUserId} = "${clerkUserId}"`);
  const res = await crmFetch(AIRTABLE_TABLES.GMAIL_TOKENS, `?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapGmailToken(data.records[0] as AirtableRecord);
}

export async function saveGmailToken(
  clerkUserId: string,
  data: { accessToken: string; refreshToken: string; expiresAt: string; email: string }
): Promise<GmailToken> {
  const existing = await getGmailToken(clerkUserId);
  const fields: Record<string, string> = {
    ClerkUserId: clerkUserId,
    AccessToken: data.accessToken,
    ExpiresAt: data.expiresAt,
    Email: data.email,
    UpdatedAt: new Date().toISOString(),
  };
  // Only write RefreshToken when we actually have one — never overwrite with empty
  if (data.refreshToken) fields.RefreshToken = data.refreshToken;
  if (existing) {
    const res = await crmFetch(AIRTABLE_TABLES.GMAIL_TOKENS, `/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(await res.text());
    return mapGmailToken(await res.json());
  }
  const res = await crmFetch(AIRTABLE_TABLES.GMAIL_TOKENS, "", {
    method: "POST",
    body: JSON.stringify({ fields: { ...fields, CreatedAt: new Date().toISOString() } }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapGmailToken(await res.json());
}

export async function deleteGmailToken(id: string): Promise<void> {
  const res = await crmFetch(AIRTABLE_TABLES.GMAIL_TOKENS, `/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** Returns the Gmail token for a specific email address (most recently updated). */
export async function getGmailTokenByEmail(email: string): Promise<GmailToken | null> {
  const formula = encodeURIComponent(`{Email} = "${email}"`);
  const res = await crmFetch(
    AIRTABLE_TABLES.GMAIL_TOKENS,
    `?filterByFormula=${formula}&sort[0][field]=UpdatedAt&sort[0][direction]=desc&maxRecords=1`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapGmailToken(data.records[0] as AirtableRecord);
}

/** Returns the first available Gmail token that has a refresh token. Used as fallback for shared syncs. */
export async function getAnyGmailToken(): Promise<GmailToken | null> {
  const formula = encodeURIComponent(`LEN({RefreshToken}) > 10`);
  const res = await crmFetch(AIRTABLE_TABLES.GMAIL_TOKENS, `?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapGmailToken(data.records[0] as AirtableRecord);
}

// ─── Google Calendar Token (stored in GmailTokens table with system key) ──────
const GCAL_SYSTEM_KEY = "__gcal__";

export async function getCalendarToken(): Promise<{ id: string; refreshToken: string; email: string } | null> {
  const formula = encodeURIComponent(`{ClerkUserId} = "${GCAL_SYSTEM_KEY}"`);
  const res = await crmFetch(AIRTABLE_TABLES.GMAIL_TOKENS, `?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  const f = (data.records[0] as AirtableRecord).fields;
  const token = toStr(f["RefreshToken"]);
  return token ? { id: data.records[0].id, refreshToken: token, email: toStr(f["Email"]) } : null;
}

export async function saveCalendarToken(refreshToken: string, email?: string): Promise<void> {
  const existing = await getCalendarToken().catch(() => null);
  const fields: Record<string, string> = {
    ClerkUserId: GCAL_SYSTEM_KEY,
    RefreshToken: refreshToken,
    UpdatedAt: new Date().toISOString(),
  };
  if (email) fields.Email = email;
  if (existing) {
    const res = await crmFetch(AIRTABLE_TABLES.GMAIL_TOKENS, `/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(await res.text());
  } else {
    const res = await crmFetch(AIRTABLE_TABLES.GMAIL_TOKENS, "", {
      method: "POST",
      body: JSON.stringify({ fields: { ...fields, CreatedAt: new Date().toISOString() } }),
    });
    if (!res.ok) throw new Error(await res.text());
  }
}

export async function deleteContract(id: string): Promise<void> {
  const table = AIRTABLE_TABLES.CONTRACTS;
  const res = await contractFetch(table, `/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Contract by ID ───────────────────────────────────────────────────────────
export async function getContractById(id: string): Promise<Contract | null> {
  try {
    const table = AIRTABLE_TABLES.CONTRACTS;
    const res = await contractFetch(table, `/${id}`);
    if (!res.ok) return null;
    return mapContract(await res.json());
  } catch {
    return null;
  }
}

// ─── QBO Tokens ───────────────────────────────────────────────────────────────
const QBO_SYSTEM_KEY = "__qbo__";

function mapQBOToken(record: AirtableRecord): QBOTokenRecord {
  const f = record.fields;
  return {
    id: record.id,
    accessToken: toStr(f["AccessToken"]),
    refreshToken: toStr(f["RefreshToken"]),
    expiresAt: toStr(f["ExpiresAt"]),
    realmId: toStr(f["RealmId"]),
    companyName: toStr(f["CompanyName"]),
  };
}

export async function getQBOToken(): Promise<QBOTokenRecord | null> {
  const formula = encodeURIComponent(`{ClerkUserId} = "${QBO_SYSTEM_KEY}"`);
  const res = await crmFetch(AIRTABLE_TABLES.QBO_TOKENS, `?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapQBOToken(data.records[0] as AirtableRecord);
}

export async function saveQBOToken(data: {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  realmId: string;
  companyName: string;
}): Promise<QBOTokenRecord> {
  const existing = await getQBOToken();
  const fields = {
    ClerkUserId: QBO_SYSTEM_KEY,
    AccessToken: data.accessToken,
    RefreshToken: data.refreshToken,
    ExpiresAt: data.expiresAt,
    RealmId: data.realmId,
    CompanyName: data.companyName,
  };
  if (existing) {
    const res = await crmFetch(AIRTABLE_TABLES.QBO_TOKENS, `/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(await res.text());
    return mapQBOToken(await res.json());
  }
  const res = await crmFetch(AIRTABLE_TABLES.QBO_TOKENS, "", {
    method: "POST",
    body: JSON.stringify({ fields: { ...fields, CreatedAt: new Date().toISOString() } }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapQBOToken(await res.json());
}

export async function deleteQBOToken(): Promise<void> {
  const existing = await getQBOToken();
  if (!existing) return;
  const res = await crmFetch(AIRTABLE_TABLES.QBO_TOKENS, `/${existing.id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
function invoicesFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.INVOICES;
  return fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function invoiceSettingsFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.INVOICE_SETTINGS;
  return fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function mapInvoice(record: AirtableRecord): Invoice {
  const f = record.fields;
  let lineItems: InvoiceLineItem[] | undefined;
  const rawLineItems = toStr(f["LineItemsJson"]);
  if (rawLineItems) {
    try { lineItems = JSON.parse(rawLineItems); } catch { /* ignore */ }
  }
  let expenseItems: InvoiceExpenseItem[] | undefined;
  const rawExpenses = toStr(f["ExpensesJson"]);
  if (rawExpenses) {
    try { expenseItems = JSON.parse(rawExpenses); } catch { /* ignore */ }
  }
  return {
    id: record.id,
    tenantId: toStr(f["TenantId"]),
    type: (toStr(f["Type"]) || "Deposit") as Invoice["type"],
    invoiceNumber: toStr(f["InvoiceNumber"]),
    serviceId: toStr(f["ServiceId"]),
    serviceName: toStr(f["ServiceName"]),
    depositType: (toStr(f["DepositType"]) || undefined) as Invoice["depositType"],
    depositPercent: typeof f["DepositPercent"] === "number" ? f["DepositPercent"] as number : undefined,
    amount: typeof f["Amount"] === "number" ? f["Amount"] as number : 0,
    contractId: toStr(f["ContractId"]) || undefined,
    lineItems,
    expenseItems,
    qboInvoiceId: toStr(f["QBOInvoiceId"]) || undefined,
    qboDocNumber: toStr(f["QBODocNumber"]) || undefined,
    status: (toStr(f["Status"]) || "Unpaid") as InvoiceStatus,
    paidAmount: typeof f["PaidAmount"] === "number" ? f["PaidAmount"] as number : undefined,
    paidAt: toStr(f["PaidAt"]) || undefined,
    sentToEmail: toStr(f["SentToEmail"]) || undefined,
    ccEmail: toStr(f["CcEmail"]) || undefined,
    emailSent: f["EmailSent"] === true,
    notes: toStr(f["Notes"]) || undefined,
    createdAt: toStr(f["CreatedAt"]),
    createdByClerkId: toStr(f["CreatedByClerkId"]),
  };
}

export async function getInvoicesForTenant(tenantId: string): Promise<Invoice[]> {
  const formula = encodeURIComponent(`{TenantId} = "${tenantId}"`);
  const res = await invoicesFetch(
    `?filterByFormula=${formula}&sort[0][field]=CreatedAt&sort[0][direction]=desc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapInvoice);
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const res = await invoicesFetch(`/${id}`);
  if (!res.ok) return null;
  return mapInvoice(await res.json() as AirtableRecord);
}

export async function getAllInvoiceCount(): Promise<number> {
  const res = await invoicesFetch(`?fields[]=InvoiceNumber`);
  if (!res.ok) return 0;
  const data = await res.json();
  return (data.records as AirtableRecord[]).length;
}

export async function createInvoice(data: {
  tenantId: string;
  type: Invoice["type"];
  invoiceNumber: string;
  serviceId: string;
  serviceName: string;
  depositType?: Invoice["depositType"];
  depositPercent?: number;
  amount: number;
  contractId?: string;
  lineItems?: InvoiceLineItem[];
  expenseItems?: InvoiceExpenseItem[];
  qboInvoiceId?: string;
  qboDocNumber?: string;
  sentToEmail?: string;
  ccEmail?: string;
  emailSent?: boolean;
  createdByClerkId: string;
}): Promise<Invoice> {
  const fields: Record<string, unknown> = {
    TenantId: data.tenantId,
    Type: data.type,
    InvoiceNumber: data.invoiceNumber,
    ServiceId: data.serviceId,
    ServiceName: data.serviceName,
    Amount: data.amount,
    Status: "Unpaid",
    CreatedByClerkId: data.createdByClerkId,
    CreatedAt: new Date().toISOString(),
  };
  if (data.depositType) fields["DepositType"] = data.depositType;
  if (data.depositPercent !== undefined) fields["DepositPercent"] = data.depositPercent;
  if (data.contractId) fields["ContractId"] = data.contractId;
  if (data.lineItems) fields["LineItemsJson"] = JSON.stringify(data.lineItems);
  if (data.expenseItems?.length) fields["ExpensesJson"] = JSON.stringify(data.expenseItems);
  if (data.qboInvoiceId) fields["QBOInvoiceId"] = data.qboInvoiceId;
  if (data.qboDocNumber) fields["QBODocNumber"] = data.qboDocNumber;
  if (data.sentToEmail) fields["SentToEmail"] = data.sentToEmail;
  if (data.ccEmail) fields["CcEmail"] = data.ccEmail;
  if (data.emailSent !== undefined) fields["EmailSent"] = data.emailSent;

  const res = await invoicesFetch("", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapInvoice(await res.json() as AirtableRecord);
}

export async function updateInvoice(
  id: string,
  data: Partial<{
    status: InvoiceStatus;
    paidAmount: number;
    paidAt: string;
    notes: string;
    qboInvoiceId: string;
    qboDocNumber: string;
    emailSent: boolean;
    sentToEmail: string;
    ccEmail: string;
  }>
): Promise<Invoice> {
  const fields: Record<string, unknown> = {};
  if (data.status !== undefined) fields["Status"] = data.status;
  if (data.paidAmount !== undefined) fields["PaidAmount"] = data.paidAmount;
  if (data.paidAt !== undefined) fields["PaidAt"] = data.paidAt;
  if (data.notes !== undefined) fields["Notes"] = data.notes;
  if (data.qboInvoiceId !== undefined) fields["QBOInvoiceId"] = data.qboInvoiceId;
  if (data.qboDocNumber !== undefined) fields["QBODocNumber"] = data.qboDocNumber;
  if (data.emailSent !== undefined) fields["EmailSent"] = data.emailSent;
  if (data.sentToEmail) fields["SentToEmail"] = data.sentToEmail;
  if (data.ccEmail) fields["CCEmail"] = data.ccEmail;
  const res = await invoicesFetch(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapInvoice(await res.json() as AirtableRecord);
}

export async function deleteInvoice(id: string): Promise<void> {
  const res = await invoicesFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Invoice Settings ─────────────────────────────────────────────────────────
function mapInvoiceSettings(record: AirtableRecord): InvoiceSettings {
  const f = record.fields;
  return {
    id: record.id,
    companyName: toStr(f["CompanyName"]),
    companyAddress: toStr(f["CompanyAddress"]),
    companyPhone: toStr(f["CompanyPhone"]),
    companyEmail: toStr(f["CompanyEmail"]),
    paymentLinkUrl: toStr(f["PaymentLinkUrl"]),
    invoiceFooter: toStr(f["InvoiceFooter"]),
    logoUrl: toStr(f["LogoUrl"]),
    logoPublicId: toStr(f["LogoPublicId"]),
    updatedAt: toStr(f["UpdatedAt"]),
    venmoHandle: toStr(f["VenmoHandle"]) || undefined,
    venmoQrUrl: toStr(f["VenmoQrUrl"]) || undefined,
    venmoQrPublicId: toStr(f["VenmoQrPublicId"]) || undefined,
    zelleHandle: toStr(f["ZelleHandle"]) || undefined,
    zelleQrUrl: toStr(f["ZelleQrUrl"]) || undefined,
    zelleQrPublicId: toStr(f["ZelleQrPublicId"]) || undefined,
  };
}

export async function getInvoiceSettings(): Promise<InvoiceSettings | null> {
  const res = await invoiceSettingsFetch("?maxRecords=1");
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapInvoiceSettings(data.records[0] as AirtableRecord);
}

export async function upsertInvoiceSettings(data: Partial<Omit<InvoiceSettings, "id">>): Promise<InvoiceSettings> {
  const existing = await getInvoiceSettings();
  const fields: Record<string, unknown> = { UpdatedAt: new Date().toISOString() };
  if (data.companyName !== undefined) fields["CompanyName"] = data.companyName;
  if (data.companyAddress !== undefined) fields["CompanyAddress"] = data.companyAddress;
  if (data.companyPhone !== undefined) fields["CompanyPhone"] = data.companyPhone;
  if (data.companyEmail !== undefined) fields["CompanyEmail"] = data.companyEmail;
  if (data.paymentLinkUrl !== undefined) fields["PaymentLinkUrl"] = data.paymentLinkUrl;
  if (data.invoiceFooter !== undefined) fields["InvoiceFooter"] = data.invoiceFooter;
  if (data.logoUrl !== undefined) fields["LogoUrl"] = data.logoUrl;
  if (data.logoPublicId !== undefined) fields["LogoPublicId"] = data.logoPublicId;
  if (data.venmoHandle !== undefined) fields["VenmoHandle"] = data.venmoHandle;
  if (data.venmoQrUrl !== undefined) fields["VenmoQrUrl"] = data.venmoQrUrl;
  if (data.venmoQrPublicId !== undefined) fields["VenmoQrPublicId"] = data.venmoQrPublicId;
  if (data.zelleHandle !== undefined) fields["ZelleHandle"] = data.zelleHandle;
  if (data.zelleQrUrl !== undefined) fields["ZelleQrUrl"] = data.zelleQrUrl;
  if (data.zelleQrPublicId !== undefined) fields["ZelleQrPublicId"] = data.zelleQrPublicId;

  if (existing?.id) {
    const res = await invoiceSettingsFetch(`/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(await res.text());
    return mapInvoiceSettings(await res.json() as AirtableRecord);
  }
  const res = await invoiceSettingsFetch("", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapInvoiceSettings(await res.json() as AirtableRecord);
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
function expensesFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.EXPENSES;
  return fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function mapExpense(record: AirtableRecord): Expense {
  const f = record.fields;
  return {
    id: record.id,
    clerkUserId: toStr(f["ClerkUserId"]),
    staffName: toStr(f["StaffName"]),
    date: toStr(f["Date"]),
    vendor: toStr(f["Vendor"]),
    total: typeof f["Total"] === "number" ? f["Total"] : 0,
    category: (toStr(f["Category"]) || "Other") as ExpenseCategory,
    description: toStr(f["Description"]),
    receiptUrl: toStr(f["ReceiptUrl"]) || undefined,
    receiptPublicId: toStr(f["ReceiptPublicId"]) || undefined,
    notes: toStr(f["Notes"]) || undefined,
    createdAt: toStr(f["CreatedAt"]),
    tenantId: toStr(f["TenantId"]) || undefined,
    tenantName: toStr(f["TenantName"]) || undefined,
    reimbursable: f["Reimbursable"] === true,
    billable: f["Billable"] === true,
    paidAt: toStr(f["PaidAt"]) || undefined,
  };
}

export async function getExpenses(): Promise<Expense[]> {
  const res = await expensesFetch(
    `?sort[0][field]=Date&sort[0][direction]=desc&sort[1][field]=CreatedAt&sort[1][direction]=desc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapExpense);
}

export async function getExpensesForUser(clerkUserId: string): Promise<Expense[]> {
  const formula = encodeURIComponent(`{ClerkUserId} = "${clerkUserId}"`);
  const res = await expensesFetch(
    `?filterByFormula=${formula}&sort[0][field]=Date&sort[0][direction]=desc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapExpense);
}

export async function createExpense(data: {
  clerkUserId: string;
  staffName: string;
  date: string;
  vendor: string;
  total: number;
  category: ExpenseCategory;
  description: string;
  receiptUrl?: string;
  receiptPublicId?: string;
  notes?: string;
  reimbursable?: boolean;
  tenantId?: string;
  tenantName?: string;
}): Promise<Expense> {
  const fields: Record<string, unknown> = {
    ClerkUserId: data.clerkUserId,
    StaffName: data.staffName,
    Date: data.date,
    Vendor: data.vendor,
    Total: data.total,
    Category: data.category,
    Description: data.description,
    Reimbursable: data.reimbursable ?? false,
    CreatedAt: new Date().toISOString(),
  };
  if (data.receiptUrl) fields["ReceiptUrl"] = data.receiptUrl;
  if (data.receiptPublicId) fields["ReceiptPublicId"] = data.receiptPublicId;
  if (data.notes) fields["Notes"] = data.notes;
  if (data.tenantId) fields["TenantId"] = data.tenantId;
  if (data.tenantName) fields["TenantName"] = data.tenantName;
  const res = await expensesFetch("", { method: "POST", body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(await res.text());
  return mapExpense(await res.json() as AirtableRecord);
}

export async function updateExpense(
  id: string,
  data: Partial<Pick<Expense, "date" | "vendor" | "total" | "category" | "description" | "notes" | "tenantId" | "tenantName" | "reimbursable" | "billable" | "paidAt">>
): Promise<Expense> {
  const fields: Record<string, unknown> = {};
  if (data.date !== undefined) fields["Date"] = data.date;
  if (data.vendor !== undefined) fields["Vendor"] = data.vendor;
  if (data.total !== undefined) fields["Total"] = data.total;
  if (data.category !== undefined) fields["Category"] = data.category;
  if (data.description !== undefined) fields["Description"] = data.description;
  if (data.notes !== undefined) fields["Notes"] = data.notes;
  if (data.tenantId !== undefined) fields["TenantId"] = data.tenantId || null;
  if (data.tenantName !== undefined) fields["TenantName"] = data.tenantName || null;
  if (data.reimbursable !== undefined) fields["Reimbursable"] = data.reimbursable;
  if (data.billable !== undefined) fields["Billable"] = data.billable;
  if (data.paidAt !== undefined) fields["PaidAt"] = data.paidAt || null;
  let res = await expensesFetch(`/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
  if (!res.ok) {
    const errText = await res.text();
    // Airtable returns UNKNOWN_FIELD_NAME when optional new fields haven't been added yet —
    // retry without them so existing saves still work.
    if (errText.includes("UNKNOWN_FIELD_NAME")) {
      delete fields["Billable"];
      delete fields["PaidAt"];
      res = await expensesFetch(`/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
      if (!res.ok) throw new Error(await res.text());
    } else {
      throw new Error(errText);
    }
  }
  return mapExpense(await res.json() as AirtableRecord);
}

export async function getReimbursableExpenses(from: string, to: string): Promise<Expense[]> {
  const formula = encodeURIComponent(`AND({Reimbursable} = TRUE(), {Date} >= "${from}", {Date} <= "${to}")`);
  const res = await expensesFetch(
    `?filterByFormula=${formula}&sort[0][field]=Date&sort[0][direction]=asc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapExpense);
}

export async function getExpensesForTenant(tenantId: string): Promise<Expense[]> {
  const formula = encodeURIComponent(`{TenantId} = "${tenantId}"`);
  const res = await expensesFetch(
    `?filterByFormula=${formula}&sort[0][field]=Date&sort[0][direction]=desc`
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapExpense);
}

export async function deleteExpense(id: string): Promise<void> {
  const res = await expensesFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// ─── Pay: range queries and bulk updates ──────────────────────────────────────

export async function getTimeEntriesInRange(
  from: string,
  to: string,
  clerkUserId?: string
): Promise<TimeEntry[]> {
  const parts = [`{Date} >= "${from}"`, `{Date} <= "${to}"`];
  if (clerkUserId) parts.push(`{ClerkUserId} = "${clerkUserId}"`);
  const formula = encodeURIComponent(`AND(${parts.join(", ")})`);
  const baseQs = `?filterByFormula=${formula}&sort[0][field]=Date&sort[0][direction]=asc&sort[1][field]=CreatedAt&sort[1][direction]=asc`;
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const res = await timeFetch(baseQs + (offset ? `&offset=${offset}` : ""));
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    records.push(...(data.records as AirtableRecord[]));
    offset = data.offset;
  } while (offset);
  return records.map(mapTimeEntry);
}

export async function getSoldItemsForCommission(
  from: string,
  to: string,
  staffSellerId?: string
): Promise<Item[]> {
  const parts = [
    `{Status} = "Sold"`,
    `{SaleDate} >= "${from}"`,
    `{SaleDate} <= "${to}"`,
    `{StaffSellerId} != ""`,
  ];
  if (staffSellerId) parts.push(`{StaffSellerId} = "${staffSellerId}"`);
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({
      filterByFormula: `AND(${parts.join(", ")})`,
      sort: [{ field: "SaleDate", direction: "asc" }],
    })
    .all();
  return records.map(mapItem);
}

export async function getReimbursableExpensesInRange(
  from: string,
  to: string,
  clerkUserId?: string
): Promise<Expense[]> {
  const parts = [
    `{Date} >= "${from}"`,
    `{Date} <= "${to}"`,
  ];
  if (clerkUserId) parts.push(`{ClerkUserId} = "${clerkUserId}"`);
  const formula = encodeURIComponent(`AND(${parts.join(", ")})`);
  const baseQs = `?filterByFormula=${formula}&sort[0][field]=Date&sort[0][direction]=asc`;
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const res = await expensesFetch(baseQs + (offset ? `&offset=${offset}` : ""));
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    records.push(...(data.records as AirtableRecord[]));
    offset = data.offset;
  } while (offset);
  return records.map(mapExpense);
}

// Bulk update time entries in batches of 10
export async function bulkUpdateTimeEntries(
  ids: string[],
  data: Partial<{ hoursPaidAt: string | null; mileagePaidAt: string | null; travelPaidAt: string | null }>
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (data.hoursPaidAt !== undefined) fields["HoursPaidAt"] = data.hoursPaidAt;
  if (data.mileagePaidAt !== undefined) fields["MileagePaidAt"] = data.mileagePaidAt;
  if (data.travelPaidAt !== undefined) fields["TravelPaidAt"] = data.travelPaidAt;
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const res = await timeFetch("", {
      method: "PATCH",
      body: JSON.stringify({ records: batch.map(id => ({ id, fields })) }),
    });
    if (!res.ok) throw new Error(await res.text());
  }
}

// Bulk update items in batches of 10 (using Airtable SDK)
export async function bulkUpdateItems(
  ids: string[],
  data: Partial<{ commissionPaidAt: string | null }>
): Promise<void> {
  const fields: Airtable.FieldSet = {};
  if (data.commissionPaidAt !== undefined) {
    // Airtable SDK does not accept null; pass empty string to clear, or the value
    fields["CommissionPaidAt"] = data.commissionPaidAt ?? "" as unknown as string;
  }
  const base = getBase();
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    await base(AIRTABLE_TABLES.ITEMS).update(
      batch.map(id => ({ id, fields }))
    );
  }
}

// Bulk update expenses in batches of 10
export async function bulkUpdateExpenses(
  ids: string[],
  data: Partial<{ paidAt: string | null }>
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (data.paidAt !== undefined) fields["PaidAt"] = data.paidAt;
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const res = await expensesFetch("", {
      method: "PATCH",
      body: JSON.stringify({ records: batch.map(id => ({ id, fields })) }),
    });
    if (!res.ok) throw new Error(await res.text());
  }
}

// ─── Drip Campaigns ───────────────────────────────────────────────────────────
function dripCampaignsFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.DRIP_CAMPAIGNS;
  return fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

function dripEnrollmentsFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.DRIP_ENROLLMENTS;
  return fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

function dripSettingsFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.DRIP_SETTINGS;
  return fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

function mapDripCampaign(record: AirtableRecord): import("./types").DripCampaign {
  const f = record.fields;
  let steps: import("./types").DripStep[] = [];
  try { steps = JSON.parse(toStr(f["StepsJson"]) || "[]"); } catch {}
  return {
    id: record.id,
    name: toStr(f["Name"]),
    description: toStr(f["Description"]),
    audience: (toStr(f["Audience"]) || "Both") as import("./types").DripAudience,
    tags: toStr(f["Tags"]) ? toStr(f["Tags"]).split(",").map(t => t.trim()).filter(Boolean) : [],
    steps,
    isActive: f["IsActive"] === true,
    createdAt: toStr(f["CreatedAt"]),
  };
}

function mapDripEnrollment(record: AirtableRecord): import("./types").DripEnrollment {
  const f = record.fields;
  return {
    id: record.id,
    campaignId: toStr(f["CampaignId"]),
    campaignName: toStr(f["CampaignName"]),
    contactType: (toStr(f["ContactType"]) || "referral") as import("./types").DripContactType,
    contactId: toStr(f["ContactId"]),
    contactEmail: toStr(f["ContactEmail"]),
    contactName: toStr(f["ContactName"]),
    company: toStr(f["Company"]),
    enrolledAt: toStr(f["EnrolledAt"]),
    currentStep: typeof f["CurrentStep"] === "number" ? f["CurrentStep"] : 0,
    lastSentAt: toStr(f["LastSentAt"]) || undefined,
    status: (toStr(f["Status"]) || "Active") as import("./types").EnrollmentStatus,
    enrolledByClerkId: toStr(f["EnrolledByClerkId"]),
  };
}

function mapDripSettings(record: AirtableRecord): import("./types").DripSettings {
  const f = record.fields;
  return {
    id: record.id,
    senderName: toStr(f["SenderName"]),
    senderEmail: toStr(f["SenderEmail"]),
    logoUrl: toStr(f["LogoUrl"]),
    logoPublicId: toStr(f["LogoPublicId"]),
    primaryColor: toStr(f["PrimaryColor"]) || "#2E6B4F",
    companyName: toStr(f["CompanyName"]),
    companyTagline: toStr(f["CompanyTagline"]),
    companyAddress: toStr(f["CompanyAddress"]),
    signatureHtml: toStr(f["SignatureHtml"]),
    updatedAt: toStr(f["UpdatedAt"]),
  };
}

// Campaigns
export async function getDripCampaigns(): Promise<import("./types").DripCampaign[]> {
  const res = await dripCampaignsFetch(`?sort[0][field]=CreatedAt&sort[0][direction]=desc`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapDripCampaign);
}

export async function getDripCampaignById(id: string): Promise<import("./types").DripCampaign | null> {
  const res = await dripCampaignsFetch(`/${id}`);
  if (!res.ok) return null;
  return mapDripCampaign(await res.json() as AirtableRecord);
}

export async function createDripCampaign(data: Omit<import("./types").DripCampaign, "id" | "createdAt">): Promise<import("./types").DripCampaign> {
  const fields: Record<string, unknown> = {
    Name: data.name,
    Description: data.description,
    Audience: data.audience,
    Tags: data.tags.join(", "),
    StepsJson: JSON.stringify(data.steps),
    IsActive: data.isActive,
    CreatedAt: new Date().toISOString(),
  };
  const res = await dripCampaignsFetch("", { method: "POST", body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(await res.text());
  return mapDripCampaign(await res.json() as AirtableRecord);
}

export async function updateDripCampaign(id: string, data: Partial<Omit<import("./types").DripCampaign, "id" | "createdAt">>): Promise<import("./types").DripCampaign> {
  const fields: Record<string, unknown> = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.description !== undefined) fields["Description"] = data.description;
  if (data.audience !== undefined) fields["Audience"] = data.audience;
  if (data.tags !== undefined) fields["Tags"] = data.tags.join(", ");
  if (data.steps !== undefined) fields["StepsJson"] = JSON.stringify(data.steps);
  if (data.isActive !== undefined) fields["IsActive"] = data.isActive;
  const res = await dripCampaignsFetch(`/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(await res.text());
  return mapDripCampaign(await res.json() as AirtableRecord);
}

export async function deleteDripCampaign(id: string): Promise<void> {
  const res = await dripCampaignsFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// Enrollments
export async function getDripEnrollments(filters?: { campaignId?: string; status?: string }): Promise<import("./types").DripEnrollment[]> {
  const parts: string[] = [];
  if (filters?.campaignId) parts.push(`{CampaignId} = "${filters.campaignId}"`);
  if (filters?.status) parts.push(`{Status} = "${filters.status}"`);
  const formula = parts.length > 0 ? encodeURIComponent(parts.length === 1 ? parts[0] : `AND(${parts.join(",")})`) : "";
  const query = formula ? `?filterByFormula=${formula}&sort[0][field]=EnrolledAt&sort[0][direction]=desc` : `?sort[0][field]=EnrolledAt&sort[0][direction]=desc`;
  const res = await dripEnrollmentsFetch(query);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapDripEnrollment);
}

export async function createDripEnrollment(data: Omit<import("./types").DripEnrollment, "id">): Promise<import("./types").DripEnrollment> {
  const fields: Record<string, unknown> = {
    CampaignId: data.campaignId,
    CampaignName: data.campaignName,
    ContactType: data.contactType,
    ContactId: data.contactId,
    ContactEmail: data.contactEmail,
    ContactName: data.contactName,
    Company: data.company,
    EnrolledAt: data.enrolledAt,
    CurrentStep: data.currentStep,
    Status: data.status,
    EnrolledByClerkId: data.enrolledByClerkId,
  };
  if (data.lastSentAt) fields["LastSentAt"] = data.lastSentAt;
  const res = await dripEnrollmentsFetch("", { method: "POST", body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(await res.text());
  return mapDripEnrollment(await res.json() as AirtableRecord);
}

export async function updateDripEnrollment(id: string, data: Partial<Pick<import("./types").DripEnrollment, "currentStep" | "lastSentAt" | "status">>): Promise<import("./types").DripEnrollment> {
  const fields: Record<string, unknown> = {};
  if (data.currentStep !== undefined) fields["CurrentStep"] = data.currentStep;
  if (data.lastSentAt !== undefined) fields["LastSentAt"] = data.lastSentAt;
  if (data.status !== undefined) fields["Status"] = data.status;
  const res = await dripEnrollmentsFetch(`/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(await res.text());
  return mapDripEnrollment(await res.json() as AirtableRecord);
}

export async function deleteDripEnrollment(id: string): Promise<void> {
  const res = await dripEnrollmentsFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

// Drip Settings
export async function getDripSettings(): Promise<import("./types").DripSettings | null> {
  const res = await dripSettingsFetch(`?maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapDripSettings(data.records[0] as AirtableRecord);
}

export async function upsertDripSettings(data: Partial<Omit<import("./types").DripSettings, "id" | "updatedAt">>): Promise<import("./types").DripSettings> {
  const fields: Record<string, unknown> = { UpdatedAt: new Date().toISOString() };
  if (data.senderName !== undefined) fields["SenderName"] = data.senderName;
  if (data.senderEmail !== undefined) fields["SenderEmail"] = data.senderEmail;
  if (data.logoUrl !== undefined) fields["LogoUrl"] = data.logoUrl;
  if (data.logoPublicId !== undefined) fields["LogoPublicId"] = data.logoPublicId;
  if (data.primaryColor !== undefined) fields["PrimaryColor"] = data.primaryColor;
  if (data.companyName !== undefined) fields["CompanyName"] = data.companyName;
  if (data.companyTagline !== undefined) fields["CompanyTagline"] = data.companyTagline;
  if (data.companyAddress !== undefined) fields["CompanyAddress"] = data.companyAddress;
  if (data.signatureHtml !== undefined) fields["SignatureHtml"] = data.signatureHtml;
  // check if record exists
  const existing = await getDripSettings();
  if (existing?.id) {
    const res = await dripSettingsFetch(`/${existing.id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
    if (!res.ok) throw new Error(await res.text());
    return mapDripSettings(await res.json() as AirtableRecord);
  }
  const res = await dripSettingsFetch("", { method: "POST", body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(await res.text());
  return mapDripSettings(await res.json() as AirtableRecord);
}

// ─── Item Sale Events ─────────────────────────────────────────────────────────

function saleEventsFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const base = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.ITEM_SALE_EVENTS;
  return fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function mapItemSaleEvent(record: AirtableRecord): ItemSaleEvent {
  const f = record.fields as Record<string, unknown>;
  return {
    id: record.id,
    itemId: toStr(f["ItemId"]),
    tenantId: toStr(f["TenantId"]),
    itemName: toStr(f["ItemName"] ?? ""),
    quantitySold: toNum(f["QuantitySold"] ?? 0),
    unitPrice: toNum(f["SalePrice"] ?? 0),
    totalAmount: toNum(f["TotalAmount"] ?? 0),
    clientPayout: toNum(f["ClientPayout"] ?? 0),
    squarePaymentId: toStr(f["SquarePaymentId"]),
    squareOrderId: toStr(f["SquareOrderId"]) || undefined,
    saleDate: toStr(f["SaleDate"]),
    payoutPaid: f["PayoutPaid"] === true,
    payoutPaidAt: toStr(f["PayoutPaidAt"]) || undefined,
    notes: toStr(f["Notes"]) || undefined,
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getItemSaleEvents(itemId?: string): Promise<ItemSaleEvent[]> {
  const formula = itemId
    ? `?filterByFormula=${encodeURIComponent(`{ItemId} = "${itemId}"`)}&sort[0][field]=SaleDate&sort[0][direction]=desc`
    : `?sort[0][field]=SaleDate&sort[0][direction]=desc`;
  const res = await saleEventsFetch(formula);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapItemSaleEvent);
}

export async function getItemSaleEventsForTenant(tenantId: string): Promise<ItemSaleEvent[]> {
  const formula = `?filterByFormula=${encodeURIComponent(`{TenantId} = "${tenantId}"`)}&sort[0][field]=SaleDate&sort[0][direction]=desc`;
  const res = await saleEventsFetch(formula);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records as AirtableRecord[]).map(mapItemSaleEvent);
}

export async function getSaleEventBySquarePaymentId(paymentId: string): Promise<ItemSaleEvent | null> {
  const formula = encodeURIComponent(`{SquarePaymentId} = "${paymentId}"`);
  const res = await saleEventsFetch(`?filterByFormula=${formula}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapItemSaleEvent(data.records[0] as AirtableRecord);
}

// Check for an existing sale event for a specific item + payment intent (idempotency check)
export async function getSaleEventByPaymentAndItem(paymentId: string, itemId: string): Promise<ItemSaleEvent | null> {
  const formula = encodeURIComponent(`AND({SquarePaymentId} = "${paymentId}", {ItemId} = "${itemId}")`);
  const res = await saleEventsFetch(`?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  return mapItemSaleEvent(data.records[0] as AirtableRecord);
}

export async function createItemSaleEvent(data: Omit<ItemSaleEvent, "id" | "createdAt">): Promise<ItemSaleEvent> {
  const fields: Record<string, unknown> = {
    ItemId: data.itemId,
    TenantId: data.tenantId,
    QuantitySold: data.quantitySold,
    SalePrice: data.unitPrice,
    TotalAmount: data.totalAmount,
    ClientPayout: data.clientPayout,
    SquarePaymentId: data.squarePaymentId,
    SquareOrderId: data.squareOrderId || "",
    SaleDate: data.saleDate,
    PayoutPaid: data.payoutPaid ?? false,
    ...(data.notes ? { Notes: data.notes } : {}),
  };
  const res = await saleEventsFetch("", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapItemSaleEvent(await res.json() as AirtableRecord);
}

export async function updateItemSaleEvent(id: string, data: Partial<Pick<ItemSaleEvent, "payoutPaid" | "payoutPaidAt" | "notes" | "clientPayout">>): Promise<ItemSaleEvent> {
  const fields: Record<string, unknown> = {};
  if (data.payoutPaid !== undefined) fields["PayoutPaid"] = data.payoutPaid;
  if (data.payoutPaidAt !== undefined) fields["PayoutPaidAt"] = data.payoutPaidAt;
  if (data.notes !== undefined) fields["Notes"] = data.notes;
  if (data.clientPayout !== undefined) fields["ClientPayout"] = data.clientPayout;
  const res = await saleEventsFetch(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapItemSaleEvent(await res.json() as AirtableRecord);
}

export async function deleteItemSaleEvent(id: string): Promise<void> {
  const res = await saleEventsFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/** Called by the webhook handler: decrement quantity, flip status when qty hits 0. */
export async function applySquareSaleToItem(opts: {
  itemId: string;
  quantitySold: number;
  currentQuantity: number;
  currentQuantitySold: number;
  salePrice?: number;
  clientPayout?: number;
}): Promise<Item> {
  const newQty = Math.max(0, opts.currentQuantity - opts.quantitySold);
  const newQtySold = opts.currentQuantitySold + opts.quantitySold;
  const newStatus = newQty === 0 ? "Sold" : undefined;
  const fields: Airtable.FieldSet = {
    Quantity: newQty,
    QuantitySold: newQtySold,
  };
  if (newStatus) {
    fields["Status"] = newStatus;
    fields["SaleDate"] = new Date().toISOString();
    if (opts.salePrice != null) fields["SalePrice"] = opts.salePrice;
    if (opts.clientPayout != null) fields["ConsignorPayout"] = opts.clientPayout;
  }
  const base = getBase();
  const record = await base(AIRTABLE_TABLES.ITEMS).update(opts.itemId, fields, { typecast: true });
  return mapItem(record);
}

/** Look up a PF item by its Square catalog variation ID. */
export async function getItemBySquareVariationId(variationId: string): Promise<Item | null> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({ filterByFormula: `{SquareCatalogVariationId} = "${variationId}"`, maxRecords: 1 })
    .all();
  if (!records.length) return null;
  return mapItem(records[0]);
}

/** Look up a PF item by its barcode number (SKU fallback for Square matching). */
export async function getItemByBarcodeNumber(barcode: string): Promise<Item | null> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({ filterByFormula: `{BarcodeNumber} = "${barcode}"`, maxRecords: 1 })
    .all();
  if (!records.length) return null;
  return mapItem(records[0]);
}

// ─── Supply Tracking: Crate Locations ────────────────────────────────────────

function mapCrateLocation(record: Airtable.Record<Airtable.FieldSet>): CrateLocation {
  const f = record.fields;
  return {
    id: record.id,
    name: toStr(f["Name"]),
    type: (toStr(f["Type"]) || "Storage") as "Storage" | "Project",
    crateCount: toNum(f["CrateCount"]),
    tenantId: toStr(f["TenantId"]) || undefined,
    isActive: f["IsActive"] !== false,
  };
}

export async function getCrateLocations(): Promise<CrateLocation[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.SUPPLY_CRATE_LOCATIONS)
    .select({ filterByFormula: "{IsActive} = 1", sort: [{ field: "Name", direction: "asc" }] })
    .all();
  return records.map(mapCrateLocation);
}

export async function createCrateLocation(data: { name: string; type: "Storage" | "Project"; crateCount: number; tenantId?: string }): Promise<CrateLocation> {
  const base = getBase();
  const fields: Airtable.FieldSet = {
    Name: data.name,
    Type: data.type,
    CrateCount: data.crateCount,
    IsActive: true,
  };
  if (data.tenantId) fields["TenantId"] = data.tenantId;
  const record = await base(AIRTABLE_TABLES.SUPPLY_CRATE_LOCATIONS).create(fields);
  return mapCrateLocation(record);
}

export async function updateCrateLocation(id: string, data: Partial<{ name: string; crateCount: number; tenantId: string }>): Promise<CrateLocation> {
  const base = getBase();
  const fields: Airtable.FieldSet = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.crateCount !== undefined) fields["CrateCount"] = data.crateCount;
  if (data.tenantId !== undefined) fields["TenantId"] = data.tenantId;
  const record = await base(AIRTABLE_TABLES.SUPPLY_CRATE_LOCATIONS).update(id, fields);
  return mapCrateLocation(record);
}

export async function deleteCrateLocation(id: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.SUPPLY_CRATE_LOCATIONS).destroy(id);
}

// ─── Supply Tracking: Inventory Containers ───────────────────────────────────

function mapInventoryContainer(record: Airtable.Record<Airtable.FieldSet>): InventoryContainer {
  const f = record.fields;
  let items: InventoryItem[] = [];
  try {
    const raw = toStr(f["Items"]);
    if (raw) items = JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    id: record.id,
    name: toStr(f["Name"]),
    containerType: (toStr(f["ContainerType"]) || "HQ") as "HQ" | "Kit",
    tenantId: toStr(f["TenantId"]) || undefined,
    items,
    isActive: f["IsActive"] !== false,
  };
}

export async function getInventoryContainers(): Promise<InventoryContainer[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.SUPPLY_INVENTORY)
    .select({ filterByFormula: "{IsActive} = 1", sort: [{ field: "Name", direction: "asc" }] })
    .all();
  return records.map(mapInventoryContainer);
}

export async function createInventoryContainer(data: { name: string; containerType: "HQ" | "Kit"; tenantId?: string }): Promise<InventoryContainer> {
  const base = getBase();
  const fields: Airtable.FieldSet = {
    Name: data.name,
    ContainerType: data.containerType,
    Items: "[]",
    IsActive: true,
  };
  if (data.tenantId) fields["TenantId"] = data.tenantId;
  const record = await base(AIRTABLE_TABLES.SUPPLY_INVENTORY).create(fields);
  return mapInventoryContainer(record);
}

export async function updateInventoryContainer(id: string, data: Partial<{ name: string; items: InventoryItem[]; tenantId: string }>): Promise<InventoryContainer> {
  const base = getBase();
  const fields: Airtable.FieldSet = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.items !== undefined) fields["Items"] = JSON.stringify(data.items);
  if (data.tenantId !== undefined) fields["TenantId"] = data.tenantId;
  const record = await base(AIRTABLE_TABLES.SUPPLY_INVENTORY).update(id, fields);
  return mapInventoryContainer(record);
}

export async function deleteInventoryContainer(id: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.SUPPLY_INVENTORY).destroy(id);
}

// ─── Subcontractors ───────────────────────────────────────────────────────────

function mapSubcontractor(record: Airtable.Record<Airtable.FieldSet>): import("./types").Subcontractor {
  const f = record.fields;
  return {
    id: record.id,
    name: toStr(f["Name"]),
    charges: typeof f["Charges"] === "number" ? (f["Charges"] as number) : 0,
    scope: toStr(f["Scope"]),
    paid: f["Paid"] === true,
    paidDate: toStr(f["PaidDate"]) || undefined,
    tenantId: toStr(f["TenantId"]) || undefined,
    tenantName: toStr(f["TenantName"]) || undefined,
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getSubcontractors(): Promise<import("./types").Subcontractor[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.SUBCONTRACTORS)
    .select({ sort: [{ field: "CreatedAt", direction: "desc" }] })
    .all();
  return records.map(mapSubcontractor);
}

export async function createSubcontractor(data: {
  name: string;
  charges: number;
  scope: string;
  paid?: boolean;
  paidDate?: string;
  tenantId?: string;
  tenantName?: string;
}): Promise<import("./types").Subcontractor> {
  const base = getBase();
  const fields: Airtable.FieldSet = {
    Name: data.name,
    Charges: data.charges,
    Scope: data.scope,
    Paid: data.paid ?? false,
    CreatedAt: new Date().toISOString(),
  };
  if (data.paidDate) fields["PaidDate"] = data.paidDate;
  if (data.tenantId) fields["TenantId"] = data.tenantId;
  if (data.tenantName) fields["TenantName"] = data.tenantName;
  const record = await base(AIRTABLE_TABLES.SUBCONTRACTORS).create(fields);
  return mapSubcontractor(record);
}

export async function updateSubcontractor(
  id: string,
  data: Partial<{
    name: string;
    charges: number;
    scope: string;
    paid: boolean;
    paidDate: string | null;
    tenantId: string | null;
    tenantName: string | null;
  }>
): Promise<import("./types").Subcontractor> {
  const base = getBase();
  const fields: Airtable.FieldSet = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.charges !== undefined) fields["Charges"] = data.charges;
  if (data.scope !== undefined) fields["Scope"] = data.scope;
  if (data.paid !== undefined) fields["Paid"] = data.paid;
  if (data.paidDate !== undefined) fields["PaidDate"] = data.paidDate ?? "";
  if (data.tenantId !== undefined) fields["TenantId"] = data.tenantId ?? "";
  if (data.tenantName !== undefined) fields["TenantName"] = data.tenantName ?? "";
  const record = await base(AIRTABLE_TABLES.SUBCONTRACTORS).update(id, fields);
  return mapSubcontractor(record);
}

export async function deleteSubcontractor(id: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.SUBCONTRACTORS).destroy(id);
}

// ─── Estates ──────────────────────────────────────────────────────────────────

function mapEstate(record: Airtable.Record<Airtable.FieldSet>): Estate {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    name: toStr(f["Name"]),
    slug: toStr(f["Slug"]),
    tenantId: toStr(f["TenantId"]),
    description: toStr(f["Description"]),
    status: (toStr(f["Status"]) || "Upcoming") as EstateStatus,
    saleType: (toStr(f["SaleType"]) || "Online") as EstateSaleType,
    saleStartDate: toStr(f["SaleStartDate"]),
    saleEndDate: toStr(f["SaleEndDate"]),
    saleStartTime: toStr(f["SaleStartTime"]) || undefined,
    saleEndTime: toStr(f["SaleEndTime"]) || undefined,
    dropIntervalHours: f["DropIntervalHours"] != null ? toNum(f["DropIntervalHours"]) : 48,
    dropPercent: f["DropPercent"] != null ? toNum(f["DropPercent"]) : 10,
    floorPercent: f["FloorPercent"] != null ? toNum(f["FloorPercent"]) : 40,
    pickupAddress: toStr(f["PickupAddress"]),
    pickupWindowStart: toStr(f["PickupWindowStart"]),
    pickupWindowEnd: toStr(f["PickupWindowEnd"]),
    pickupWindowStartTime: toStr(f["PickupWindowStartTime"]) || undefined,
    pickupWindowEndTime: toStr(f["PickupWindowEndTime"]) || undefined,
    shippingAvailable: f["ShippingAvailable"] === true,
    shippingNotes: toStr(f["ShippingNotes"]),
    hideSoldItems: f["HideSoldItems"] === true,
    terms: toStr(f["Terms"]),
    contactEmail: toStr(f["ContactEmail"]),
    contactPhone: toStr(f["ContactPhone"]),
    cityRegion: toStr(f["CityRegion"]),
    featuredImageUrl: toStr(f["FeaturedImageUrl"]),
    featuredImagePublicId: toStr(f["FeaturedImagePublicId"]),
    galleryJson: toStr(f["GalleryJson"]),
    createdAt: toStr(f["CreatedAt"]),
  };
}

export async function getEstates(): Promise<Estate[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ESTATES)
    .select({ sort: [{ field: "CreatedAt", direction: "desc" }] })
    .all();
  return records.map(mapEstate);
}

export async function getEstatesForTenant(tenantId: string): Promise<Estate[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ESTATES)
    .select({
      filterByFormula: `{TenantId} = "${tenantId}"`,
      sort: [{ field: "SaleStartDate", direction: "desc" }],
    })
    .all();
  return records.map(mapEstate);
}

export async function getEstateById(id: string): Promise<Estate | null> {
  try {
    const base = getBase();
    const record = await base(AIRTABLE_TABLES.ESTATES).find(id);
    return mapEstate(record);
  } catch {
    return null;
  }
}

export async function getEstateBySlug(slug: string): Promise<Estate | null> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ESTATES)
    .select({ filterByFormula: `{Slug} = "${slug}"`, maxRecords: 1 })
    .all();
  return records.length > 0 ? mapEstate(records[0]) : null;
}

export async function getEstateWithItems(
  slug: string
): Promise<{ estate: Estate; items: Item[] } | null> {
  const estate = await getEstateBySlug(slug);
  if (!estate) return null;
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({
      filterByFormula: `AND({EstateSaleId} = "${estate.id}", {PrimaryRoute} = "Estate Sale", OR({Status} = "Listed", {Status} = "In Cart", {Status} = "Sold"))`,
      sort: [{ field: "CreatedAt", direction: "desc" }],
    })
    .all();
  const items = records.map(mapItem);
  return { estate, items };
}

export async function createEstate(
  data: Omit<Estate, "id" | "airtableId" | "createdAt">
): Promise<Estate> {
  const base = getBase();
  const record = await base(AIRTABLE_TABLES.ESTATES).create(
    {
      Name: data.name,
      Slug: data.slug,
      TenantId: data.tenantId,
      Description: data.description,
      Status: data.status,
      SaleType: data.saleType,
      SaleStartDate: data.saleStartDate,
      SaleStartTime: data.saleStartTime || "",
      SaleEndDate: data.saleEndDate,
      SaleEndTime: data.saleEndTime || "",
      DropIntervalHours: data.dropIntervalHours,
      DropPercent: data.dropPercent,
      FloorPercent: data.floorPercent,
      PickupAddress: data.pickupAddress,
      PickupWindowStart: data.pickupWindowStart,
      PickupWindowEnd: data.pickupWindowEnd,
      PickupWindowStartTime: data.pickupWindowStartTime || "",
      PickupWindowEndTime: data.pickupWindowEndTime || "",
      ShippingAvailable: data.shippingAvailable,
      ShippingNotes: data.shippingNotes,
      HideSoldItems: data.hideSoldItems ?? false,
      Terms: data.terms,
      ContactEmail: data.contactEmail,
      ContactPhone: data.contactPhone,
      CityRegion: data.cityRegion,
      FeaturedImageUrl: data.featuredImageUrl,
      FeaturedImagePublicId: data.featuredImagePublicId,
      GalleryJson: data.galleryJson || "",
      CreatedAt: new Date().toISOString(),
    },
    { typecast: true }
  );
  return mapEstate(record);
}

export async function updateEstate(
  id: string,
  data: Partial<Omit<Estate, "id" | "airtableId" | "createdAt">>
): Promise<Estate> {
  const base = getBase();
  const fields: Airtable.FieldSet = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.slug !== undefined) fields["Slug"] = data.slug;
  if (data.tenantId !== undefined) fields["TenantId"] = data.tenantId;
  if (data.description !== undefined) fields["Description"] = data.description;
  if (data.status !== undefined) fields["Status"] = data.status;
  if (data.saleType !== undefined) fields["SaleType"] = data.saleType;
  if (data.saleStartDate !== undefined) fields["SaleStartDate"] = data.saleStartDate;
  if (data.saleStartTime !== undefined) fields["SaleStartTime"] = data.saleStartTime;
  if (data.saleEndDate !== undefined) fields["SaleEndDate"] = data.saleEndDate;
  if (data.saleEndTime !== undefined) fields["SaleEndTime"] = data.saleEndTime;
  if (data.dropIntervalHours !== undefined) fields["DropIntervalHours"] = data.dropIntervalHours;
  if (data.dropPercent !== undefined) fields["DropPercent"] = data.dropPercent;
  if (data.floorPercent !== undefined) fields["FloorPercent"] = data.floorPercent;
  if (data.pickupAddress !== undefined) fields["PickupAddress"] = data.pickupAddress;
  if (data.pickupWindowStart !== undefined) fields["PickupWindowStart"] = data.pickupWindowStart;
  if (data.pickupWindowEnd !== undefined) fields["PickupWindowEnd"] = data.pickupWindowEnd;
  if (data.pickupWindowStartTime !== undefined) fields["PickupWindowStartTime"] = data.pickupWindowStartTime;
  if (data.pickupWindowEndTime !== undefined) fields["PickupWindowEndTime"] = data.pickupWindowEndTime;
  if (data.shippingAvailable !== undefined) fields["ShippingAvailable"] = data.shippingAvailable;
  if (data.shippingNotes !== undefined) fields["ShippingNotes"] = data.shippingNotes;
  if (data.hideSoldItems !== undefined) fields["HideSoldItems"] = data.hideSoldItems;
  if (data.terms !== undefined) fields["Terms"] = data.terms;
  if (data.contactEmail !== undefined) fields["ContactEmail"] = data.contactEmail;
  if (data.contactPhone !== undefined) fields["ContactPhone"] = data.contactPhone;
  if (data.cityRegion !== undefined) fields["CityRegion"] = data.cityRegion;
  if (data.featuredImageUrl !== undefined) fields["FeaturedImageUrl"] = data.featuredImageUrl;
  if (data.featuredImagePublicId !== undefined) fields["FeaturedImagePublicId"] = data.featuredImagePublicId;
  if (data.galleryJson !== undefined) fields["GalleryJson"] = data.galleryJson;
  const record = await base(AIRTABLE_TABLES.ESTATES).update(id, fields, { typecast: true });
  return mapEstate(record);
}

export async function deleteEstate(id: string): Promise<void> {
  const base = getBase();
  await base(AIRTABLE_TABLES.ESTATES).destroy(id);
}

export async function getEstatesForStorefront(saleType?: string): Promise<Estate[]> {
  const base = getBase();
  const typeFilter = saleType ? `{SaleType} = "${saleType}"` : null;
  const statusFilter = `OR({Status} = "Active", {Status} = "Upcoming", {Status} = "Closed")`;
  const filterByFormula = typeFilter
    ? `AND(${typeFilter}, ${statusFilter})`
    : statusFilter;
  const records = await base(AIRTABLE_TABLES.ESTATES)
    .select({
      filterByFormula,
      sort: [{ field: "SaleStartDate", direction: "desc" }],
    })
    .all();
  return records.map(mapEstate);
}

export async function getItemsForEstateSale(estateId: string): Promise<Item[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({
      filterByFormula: `AND({EstateSaleId} = "${estateId}", {PrimaryRoute} = "Estate Sale", OR({Status} = "Listed", {Status} = "In Cart", {Status} = "Sold"))`,
      sort: [{ field: "CreatedAt", direction: "desc" }],
    })
    .all();
  return records.map(mapItem);
}
