/**
 * Airtable client using the REST API with Personal Access Token auth.
 * No Google Cloud, no service accounts — just PAT + Base ID.
 */

import Airtable from "airtable";
import { AIRTABLE_TABLES } from "./config";
import type {
  Tenant,
  User,
  Membership,
  Room,
  Item,
  UserRole,
  DensityLevel,
  ItemCondition,
  SizeClass,
  FragilityLevel,
  ItemUseType,
  PrimaryRoute,
  ItemStatus,
  RoomType,
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
export async function getTenants(): Promise<Tenant[]> {
  const base = getBase();
  const records = await base(AIRTABLE_TABLES.TENANTS)
    .select({ sort: [{ field: "CreatedAt", direction: "desc" }] })
    .all();
  return records.map(mapTenant);
}

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
}): Promise<Tenant> {
  const base = getBase();
  const record = await base(AIRTABLE_TABLES.TENANTS).create({
    Name: data.name,
    Slug: data.slug,
    OwnerUserId: data.ownerUserId,
    Plan: data.plan || "free",
    CreatedAt: new Date().toISOString(),
  });
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

export async function createItem(data: Partial<Item> & {
  tenantId: string;
  itemName: string;
}): Promise<Item> {
  const base = getBase();
  const now = new Date().toISOString();
  const record = await base(AIRTABLE_TABLES.ITEMS).create({
    TenantId: data.tenantId,
    RoomId: data.roomId || "",
    PhotoUrl: data.photoUrl || "",
    PhotoPublicId: data.photoPublicId || "",
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
    CreatedAt: now,
    UpdatedAt: now,
  });
  return mapItem(record);
}

export async function updateItem(
  id: string,
  data: Partial<Item>
): Promise<Item> {
  const base = getBase();
  const fields: Airtable.FieldSet = { UpdatedAt: new Date().toISOString() };

  const fieldMap: Record<keyof Item, string> = {
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

  const record = await base(AIRTABLE_TABLES.ITEMS).update(id, fields);
  return mapItem(record);
}

function mapItem(record: Airtable.Record<Airtable.FieldSet>): Item {
  const f = record.fields;
  return {
    id: record.id,
    airtableId: record.id,
    tenantId: toStr(f["TenantId"]),
    roomId: toStr(f["RoomId"]) || undefined,
    photoUrl: toStr(f["PhotoUrl"]) || undefined,
    photoPublicId: toStr(f["PhotoPublicId"]) || undefined,
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
