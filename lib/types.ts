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
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
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
  | "Keep"
  | "Family Keeping"
  | "ProFoundFinds Consignment"
  | "FB/Marketplace"
  | "Online Marketplace"
  | "Other Consignment"
  | "Donate"
  | "Discard";

export type ItemStatus =
  | "Pending Review"
  | "Reviewed"
  | "Listed"
  | "Sold"
  | "Donated"
  | "Discarded"
  | "Rejected / Revisit";

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
  // Consignment sale fields (populated via Circle Hand import)
  salePrice?: number;
  consignorPayout?: number;
  saleDate?: string;
  circleHandItemId?: string;
  routingStatus?: string;
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

// ─── Plan / Daily Focus ───────────────────────────────────────────────────────
export type PlanActivity =
  | "Sorting"
  | "Packing"
  | "Selling / Listing"
  | "Staging"
  | "Donating"
  | "Discarding"
  | "Photography"
  | "Moving"
  | "Estate Sale Prep"
  | "Other";

export const PLAN_ACTIVITIES: PlanActivity[] = [
  "Sorting",
  "Packing",
  "Selling / Listing",
  "Staging",
  "Donating",
  "Discarding",
  "Photography",
  "Moving",
  "Estate Sale Prep",
  "Other",
];

export interface PlanHelper {
  email: string;
  status: "pending" | "accepted" | "declined";
  comment?: string; // reply comment from the calendar invite
}

export interface PlanEntry {
  id: string;
  airtableId: string;
  tenantId: string;
  date: string; // YYYY-MM-DD
  activity: PlanActivity;
  roomId?: string;
  roomLabel?: string;
  notes?: string;
  startTime?: string;    // "HH:MM" 24-hour
  endTime?: string;      // "HH:MM" 24-hour
  helpers?: PlanHelper[];
  googleEventId?: string; // Google Calendar event ID once invites are sent
  createdAt: string;
}

// ─── Vendors ──────────────────────────────────────────────────────────────────
export type VendorType =
  | "Move Manager"
  | "Mover"
  | "Future Home/Community"
  | "Realtor"
  | "Broker"
  | "Donation Org"
  | "Consignment Store"
  | "Junk Hauler"
  | "Attorney"
  | "Other";

export const VENDOR_TYPES: VendorType[] = [
  "Move Manager",
  "Mover",
  "Future Home/Community",
  "Realtor",
  "Broker",
  "Donation Org",
  "Consignment Store",
  "Junk Hauler",
  "Attorney",
  "Other",
];

export interface Vendor {
  id: string;
  airtableId: string;
  tenantId: string;
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
  createdAt: string;
}

// ─── Local Vendor Directory ───────────────────────────────────────────────────
export interface LocalVendor {
  id: string;
  airtableId: string;
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
  itemCategories: string;   // comma-separated
  consignmentTake: number;  // % (0 if N/A)
  zipCodesServed: string;   // comma-separated
  notes: string;
  isActive: boolean;
  createdAt: string;
}

// ─── Project Files ────────────────────────────────────────────────────────────
export type FileTag = "Floorplan" | "Room Image" | "Layout Image" | "Damage Image";

export interface ProjectFile {
  id: string;
  airtableId: string;
  tenantId: string;
  fileName: string;
  fileTag: FileTag;
  roomLabel?: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  resourceType: string; // "image" | "raw"
  createdAt: string;
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
