import type { DensityLevel, HelperType } from "./types";

// ─── Calculator Configuration ─────────────────────────────────────────────────
// All multipliers live here — change once, affects everything.
export const CALCULATOR_CONFIG = {
  // Base rate: hours per 100 SF at Medium density
  rightsizingRatePerHundredSqFt: 1.0,

  // Density multipliers applied to the base rightsizing rate
  densityMultipliers: {
    Low: 0.5,
    Medium: 1.0,
    High: 2.0,
  } as Record<DensityLevel, number>,

  // Packing: hours per 100 SF of DESTINATION space
  packingRatePerHundredSqFt: 1.0,

  // Unpacking: hours per 100 SF of DESTINATION space
  unpackingRatePerHundredSqFt: 1.0,

  // Helper capacity in hours per week
  helperHoursPerWeek: {
    Solo: 10,
    Family: 20,
    Mixed: 35,
    TTT: 50,
  } as Record<HelperType, number>,
} as const;

// ─── Airtable Table Names ─────────────────────────────────────────────────────
export const AIRTABLE_TABLES = {
  TENANTS: process.env.AIRTABLE_TENANTS_TABLE || "Tenants",
  USERS: process.env.AIRTABLE_USERS_TABLE || "Users",
  MEMBERSHIPS: process.env.AIRTABLE_MEMBERSHIPS_TABLE || "Memberships",
  ROOMS: process.env.AIRTABLE_ROOMS_TABLE || "Rooms",
  ITEMS: process.env.AIRTABLE_ITEMS_TABLE || "Items",
  PLAN_ENTRIES: process.env.AIRTABLE_PLAN_ENTRIES_TABLE || "PlanEntries",
  VENDORS: process.env.AIRTABLE_VENDORS_TABLE || "Vendors",
  LOCAL_VENDORS: process.env.AIRTABLE_LOCAL_VENDORS_TABLE || "LocalVendors",
  FILES: process.env.AIRTABLE_FILES_TABLE || "ProjectFiles",
} as const;

// ─── Item Status Flow ─────────────────────────────────────────────────────────
export const ITEM_STATUS_COLORS: Record<string, string> = {
  "Pending Review": "bg-yellow-100 text-yellow-800",
  Reviewed: "bg-blue-100 text-blue-800",
  Listed: "bg-purple-100 text-purple-800",
  Sold: "bg-green-100 text-green-800",
  Donated: "bg-teal-100 text-teal-800",
  Discarded: "bg-gray-100 text-gray-800",
  "Rejected / Revisit": "bg-red-100 text-red-800",
};

export const ROUTE_COLORS: Record<string, string> = {
  "Keep": "bg-green-100 text-green-800",
  "Family Keeping": "bg-emerald-100 text-emerald-800",
  "ProFoundFinds Consignment": "bg-orange-100 text-orange-800",
  "FB/Marketplace": "bg-blue-100 text-blue-800",
  "Online Marketplace": "bg-indigo-100 text-indigo-800",
  "Other Consignment": "bg-purple-100 text-purple-800",
  "Donate": "bg-teal-100 text-teal-800",
  "Discard": "bg-gray-100 text-gray-800",
};

// ─── TTT Admin Check ──────────────────────────────────────────────────────────
export function isTTTAdmin(clerkUserId: string): boolean {
  const adminIds = (process.env.TTT_ADMIN_USER_IDS || "").split(",").map((s) =>
    s.trim()
  );
  return adminIds.includes(clerkUserId);
}
