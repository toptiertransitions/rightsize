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
  PlanEntry,
  PlanActivity,
  UserRole,
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
  }, { typecast: true });
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

  const record = await base(AIRTABLE_TABLES.ITEMS).update(id, fields, { typecast: true });
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
export async function updateTenant(id: string, data: { name: string }): Promise<Tenant> {
  const base = getBase();
  const record = await base(AIRTABLE_TABLES.TENANTS).update(id, { Name: data.name });
  return mapTenant(record);
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

export async function getPlanEntryById(id: string): Promise<PlanEntry | null> {
  try {
    const res = await planFetch(`/${id}`);
    if (!res.ok) return null;
    return mapPlanEntry(await res.json());
  } catch {
    return null;
  }
}

export async function createPlanEntry(data: {
  tenantId: string;
  date: string;
  activity: PlanActivity;
  roomId?: string;
  roomLabel?: string;
  notes?: string;
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
  }>
): Promise<PlanEntry> {
  const fields: Record<string, string> = {};
  if (data.date !== undefined) fields["Date"] = data.date;
  if (data.activity !== undefined) fields["Activity"] = data.activity;
  if (data.roomId !== undefined) fields["RoomID"] = data.roomId;
  if (data.roomLabel !== undefined) fields["RoomLabel"] = data.roomLabel;
  if (data.notes !== undefined) fields["Notes"] = data.notes;
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
  return {
    id: record.id,
    airtableId: record.id,
    tenantId: toStr(f["TenantID"]),
    date: toStr(f["Date"]),
    activity: toStr(f["Activity"]) as PlanActivity,
    roomId: toStr(f["RoomID"]) || undefined,
    roomLabel: toStr(f["RoomLabel"]) || undefined,
    notes: toStr(f["Notes"]) || undefined,
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
