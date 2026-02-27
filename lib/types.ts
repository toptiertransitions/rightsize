// ─── Roles ────────────────────────────────────────────────────────────────────
export type UserRole =
  | "Owner"
  | "Collaborator"
  | "Viewer"
  | "TTTStaff"
  | "TTTAdmin";

// ─── Tenant ───────────────────────────────────────────────────────────────────
export interface Tenant {
  id: string; // Airtable record ID
  airtableId: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  ownerUserId: string; // Clerk user ID
  createdAt: string;
}

// ─── User ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  airtableId: string;
  clerkUserId: string;
  email: string;
  name: string;
  createdAt: string;
}

// ─── Membership ───────────────────────────────────────────────────────────────
export interface Membership {
  id: string;
  airtableId: string;
  tenantId: string;
  userId: string;
  role: UserRole;
  createdAt: string;
}

// ─── Room ─────────────────────────────────────────────────────────────────────
export type DensityLevel = "Low" | "Medium" | "High";

export type RoomType =
  | "Living Room"
  | "Bedroom"
  | "Master Bedroom"
  | "Kitchen"
  | "Dining Room"
  | "Office/Study"
  | "Garage"
  | "Basement"
  | "Attic"
  | "Bathroom"
  | "Closet"
  | "Storage Room"
  | "Sunroom"
  | "Other";

export const ROOM_TYPES: RoomType[] = [
  "Living Room",
  "Bedroom",
  "Master Bedroom",
  "Kitchen",
  "Dining Room",
  "Office/Study",
  "Garage",
  "Basement",
  "Attic",
  "Bathroom",
  "Closet",
  "Storage Room",
  "Sunroom",
  "Other",
];

export interface Room {
  id: string;
  airtableId: string;
  tenantId: string;
  name: string;
  roomType: RoomType;
  squareFeet: number;
  density: DensityLevel;
  createdAt: string;
}

// ─── Item / Catalog ───────────────────────────────────────────────────────────
export type ItemCondition =
  | "Excellent"
  | "Good"
  | "Fair"
  | "Poor"
  | "For Parts";

export type SizeClass =
  | "Small & Shippable"
  | "Fits in Car-SUV"
  | "Needs Movers";

export type FragilityLevel = "Not Fragile" | "Somewhat Fragile" | "Very Fragile";

export type ItemUseType = "Daily Use" | "Collector Item";

export type PrimaryRoute =
  | "Online Marketplace"
  | "Local Consignment"
  | "Donate"
  | "Discard";

export type ItemStatus =
  | "Pending Review"
  | "Reviewed"
  | "Listed"
  | "Sold"
  | "Donated"
  | "Discarded";

export interface Item {
  id: string;
  airtableId: string;
  tenantId: string;
  roomId?: string;
  photoUrl?: string;
  photoPublicId?: string;
  // AI-analyzed fields
  itemName: string;
  category: string;
  condition: ItemCondition;
  conditionNotes: string;
  sizeClass: SizeClass;
  fragility: FragilityLevel;
  itemType: ItemUseType;
  valueLow: number;
  valueMid: number;
  valueHigh: number;
  primaryRoute: PrimaryRoute;
  routeReasoning: string;
  consignmentCategory: string;
  listingTitleEbay: string;
  listingDescriptionEbay: string;
  listingFb: string;
  listingOfferup: string;
  staffTips: string;
  // App fields
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── AI Analysis ──────────────────────────────────────────────────────────────
export interface ItemAnalysis {
  item_name: string;
  category: string;
  condition: ItemCondition;
  condition_notes: string;
  size_class: SizeClass;
  fragility: FragilityLevel;
  item_type: ItemUseType;
  value_low: number;
  value_mid: number;
  value_high: number;
  primary_route: PrimaryRoute;
  route_reasoning: string;
  consignment_category: string;
  listing_title_ebay: string;
  listing_description_ebay: string;
  listing_fb: string;
  listing_offerup: string;
  staff_tips: string;
}

// ─── Calculator ───────────────────────────────────────────────────────────────
export interface CalculatorRoom {
  id: string;
  name: string;
  roomType: RoomType;
  squareFeet: number;
  density: DensityLevel;
}

export interface CalculatorInput {
  rooms: CalculatorRoom[];
  destinationSqFt: number;
  helperType: HelperType;
}

export type HelperType = "Solo" | "Family" | "Mixed" | "TTT";

export interface CalculatorResult {
  rightsizingHours: number;
  packingHours: number;
  unpackingHours: number;
  totalHours: number;
  estimatedWeeks: number;
  helperType: HelperType;
  roomBreakdown: Array<{
    name: string;
    roomType: RoomType;
    squareFeet: number;
    density: DensityLevel;
    hours: number;
  }>;
}
