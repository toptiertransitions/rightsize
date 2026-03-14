// ─── Roles ────────────────────────────────────────────────────────────────────
export type UserRole =
  | "Owner"
  | "Collaborator"
  | "Viewer"
  | "TTTStaff"
  | "TTTManager"
  | "TTTSales"
  | "TTTAdmin";

export type SystemRole = "TTTStaff" | "TTTManager" | "TTTSales" | "TTTAdmin";

export interface StaffMember {
  id: string;            // Airtable record ID
  clerkUserId: string;
  displayName: string;
  email: string;
  role: SystemRole;
  isActive: boolean;
  createdAt: string;
}

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
  estimatedHours?: number;
  isArchived?: boolean;
  destinationSqFt?: number;
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
  | "Approved"
  | "Listed"
  | "Sold"
  | "Donated"
  | "Discarded"
  | "Rejected / Revisit";

export interface ItemPhoto {
  url: string;
  publicId: string;
}

export interface Item {
  id: string;
  airtableId: string;
  tenantId: string;
  roomId?: string;
  photos?: ItemPhoto[];       // Ordered; index 0 = primary photo
  photoUrl?: string;          // Derived from photos[0].url for backward compat
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
  // Vendor assignment
  assignedVendorId?: string;
  vendorDecision?: VendorDecision;
  vendorNotes?: string;
  payoutPaidAmount?: number;
  vendorPriceApproved?: boolean;
  vendorExpectedPrice?: number;
  vendorRespondedAt?: string;
  // PF Inventory fields
  barcodeNumber?: string;
  quantity?: number;
  quantitySold?: number;
  clientSharePercent?: number;
  deliveryDate?: string;
  // Square integration fields
  squareCatalogItemId?: string;
  squareCatalogVariationId?: string;
  squareSyncedAt?: string;
  // Staff seller fields (FB/eBay pages)
  staffSellerId?: string;
  staffSellerName?: string;
  staffCommissionPercent?: number;
  staffTimeMinutes?: number;
}

// ─── Sold Item Row (for Time Tracking CSV export) ─────────────────────────────
export interface SoldItemRow {
  saleDate: string;          // YYYY-MM-DD
  staffSellerName?: string;
  tenantName: string;
  itemName: string;
  valueMid: number;
  staffCommissionPercent?: number;
  staffTimeMinutes?: number;
  channel: "FB" | "eBay";
}

// ─── Item Sale Event (one per Square transaction line) ────────────────────────
export interface ItemSaleEvent {
  id: string;
  itemId: string;
  tenantId: string;
  itemName: string;
  quantitySold: number;
  unitPrice: number;
  totalAmount: number;
  clientPayout: number;
  squarePaymentId: string;
  squareOrderId?: string;
  saleDate: string;
  payoutPaid: boolean;
  payoutPaidAt?: string;
  notes?: string;
  createdAt: string;
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
  quantity?: number;
}

// ─── Plan / Daily Focus ───────────────────────────────────────────────────────
export type PlanActivity = string;

export const PLAN_ACTIVITIES: string[] = [
  "Coordinating",
  "Rightsizing",
  "Packing to Move",
  "Packing for Donation/Dispersal",
  "Managing Moving Day",
  "Unpacking",
  "Setting Up Your Space",
  "Donating/Dispersal",
  "Cleaning",
  "Other Service",
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

// ─── Vendor Decision ──────────────────────────────────────────────────────────
export type VendorDecision = "Pending" | "Approved" | "Rejected" | "Hold";

// ─── Routing Rules ────────────────────────────────────────────────────────────
export interface RoutingRule {
  id: string;
  airtableId: string;
  primaryRoute: PrimaryRoute;
  vendorType: VendorType;
  minCondition: "Any" | "Fair or better" | "Good or better" | "Excellent only";
  matchCategories: string;   // comma-sep item categories, blank = any
  matchSizeClasses: string;  // comma-sep SizeClass values, blank = any
  matchFragility: string;    // comma-sep FragilityLevel values, blank = any
  minValueMid: number;       // 0 = no minimum target value
  maxValueMid: number;       // 0 = no maximum target value
  priority: number;
  isActive: boolean;
  createdAt: string;
}

// ─── Item Categories ──────────────────────────────────────────────────────────
export const ITEM_CATEGORIES: string[] = [
  "Furniture",
  "Electronics",
  "Appliances",
  "Clothing & Accessories",
  "Books & Media",
  "Art & Collectibles",
  "Jewelry",
  "Sporting Goods",
  "Tools & Hardware",
  "Kitchen & Dining",
  "Bedroom",
  "Bathroom",
  "Office",
  "Toys & Games",
  "Musical Instruments",
  "Outdoor & Garden",
  "Holiday & Seasonal",
  "Antiques",
  "Other",
];

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
  clerkUserId?: string;
  prefCategories: Array<{ category: string; minPrice: number; maxPrice: number }>;
}

// ─── Project Files ────────────────────────────────────────────────────────────
export type FileTag = "Floorplan" | "Room Image" | "Layout Image" | "Damage Image" | "Vendor File" | "Payment Proof";

export interface ProjectFile {
  id: string;
  airtableId: string;
  tenantId: string;
  fileName: string;
  fileTag: FileTag;
  roomLabel?: string;
  vendorId?: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  resourceType: string; // "image" | "raw"
  sortOrder?: number;
  createdAt: string;
}

// ─── Time Tracking ────────────────────────────────────────────────────────────
export const TIME_FOCUS_AREAS: string[] = [
  "Coordinating",
  "Rightsizing",
  "Packing to Move",
  "Packing for Donation/Dispersal",
  "Managing Moving Day",
  "Unpacking",
  "Setting Up Your Space",
  "Donating/Dispersal",
  "Cleaning",
  "Other Service",
];
export type FocusArea = string;

export interface TimeEntry {
  id: string;           // Airtable record ID
  clerkUserId: string;
  staffName: string;
  tenantId: string;
  projectName: string;
  date: string;         // "YYYY-MM-DD"
  startTime: string;    // "HH:MM" 24h
  endTime: string;      // "HH:MM" 24h
  durationMinutes: number;
  focusArea: FocusArea;
  travelMiles?: number;
  travelMinutes?: number;
  notes?: string;
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

// ─── Contract / Estimator ─────────────────────────────────────────────────────
export interface ContractSettings {
  id: string;
  airtableId: string;
  rightsizingRate: number;
  packingRate: number;
  unpackingRate: number;
  // Estimator logic (hrs per 100 SF)
  rightsizingLow: number;
  rightsizingAvg: number;
  rightsizingHigh: number;
  packingPerHundred: number;
  unpackingPerHundred: number;
  createdAt: string;
}

export interface ContractTemplate {
  id: string;
  airtableId: string;
  name: string;
  body: string;
  isActive: boolean;
  createdAt: string;
}

export interface ContractLineItem {
  serviceId: string;
  serviceName: string;
  hours: number;
  rate: number; // $/hr snapshotted at contract creation
}

export type ContractStatus = "Draft" | "Sent" | "Signed" | "Archived";

export interface Contract {
  id: string;
  airtableId: string;
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
  status: ContractStatus;
  signatureData?: string;
  signatureMethod?: "draw" | "type";
  signedAt?: string;
  signedByName?: string;
  signToken: string;
  sentByClerkId?: string;
  sentAt?: string;
  recipientEmail?: string;
  autoSendDeposit?: boolean;
  createdAt: string;
  lineItems?: ContractLineItem[];
}

// ─── CRM ──────────────────────────────────────────────────────────────────────
export type ReferralPriority = "High" | "Medium" | "Low" | "";

export interface ReferralCompany {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  priority: ReferralPriority;
  notes: string;
  website?: string;
  assignedToClerkId: string;
  createdAt: string;
}

export type ReferralContactStage =
  | "Identified"
  | "Met"
  | "Agreed to Refer"
  | "Shared Leads"
  | "Active Referral"
  | "Inactive Referral";

export interface ReferralContact {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  referralCompanyId: string;
  notes: string;
  stage: ReferralContactStage;
  dateIntroduced?: string;
  interests?: string;
  coffeeOrder?: string;
  orgsGroups?: string;
  createdAt: string;
}

export interface ClientContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  referralPartnerId?: string;
  clientReferralId?: string;
  notes: string;
  assignedToClerkId: string;
  createdAt: string;
}

export type OpportunityStage = "Lead" | "Qualifying" | "Proposing" | "Won" | "Lost";

export interface KeyPerson {
  name: string;
  relationship: string;
  email?: string;
  referralContactId?: string;
}

export interface ClientOpportunity {
  id: string;
  tenantId: string;
  clientContactId: string;
  stage: OpportunityStage;
  keyPeople: KeyPerson[];
  notes: string;
  nextStepDate?: string;
  nextStepNote?: string;
  estimatedValue: number;
  wonAt?: string;
  lostAt?: string;
  lostReason?: string;
  assignedToClerkId: string;
  createdAt: string;
}

export type CRMActivityType = "Call" | "Email" | "Meeting" | "Note" | "Task";

export interface CRMActivity {
  id: string;
  opportunityId: string;
  clientContactId?: string;
  type: CRMActivityType;
  note: string;
  isGmailImported: boolean;
  gmailMessageId?: string;
  gmailThreadId?: string;
  activityDate: string;
  createdByClerkId: string;
  createdAt: string;
}

export interface GmailToken {
  id: string;
  clerkUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  email: string;
}

// ─── Services ─────────────────────────────────────────────────────────────────
export interface Service {
  id: string;
  airtableId: string;
  name: string;
  description: string;
  hourlyRate: number;
  estimatorLow: number;
  estimatorAvg: number;
  estimatorHigh: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  qboItemId?: string;
}

// ─── QuickBooks Online ─────────────────────────────────────────────────────────
export interface QBOTokenRecord {
  id: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  realmId: string;
  companyName: string;
}

// ─── Invoicing ────────────────────────────────────────────────────────────────
export type InvoiceType = "Deposit" | "Full";
export type InvoiceDepositType = "PercentOfEstimate" | "SpecificAmount";
export type InvoiceStatus = "Unpaid" | "PartiallyPaid" | "Paid";

export interface InvoiceLineItem {
  serviceId: string;
  serviceName: string;
  hours: number;
  rate: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  type: InvoiceType;
  invoiceNumber: string;
  serviceId: string;
  serviceName: string;
  depositType?: InvoiceDepositType;
  depositPercent?: number;
  amount: number;
  contractId?: string;
  lineItems?: InvoiceLineItem[];
  qboInvoiceId?: string;
  qboDocNumber?: string;
  status: InvoiceStatus;
  paidAmount?: number;
  paidAt?: string;
  sentToEmail?: string;
  ccEmail?: string;
  emailSent?: boolean;
  notes?: string;
  createdAt: string;
  createdByClerkId: string;
}

export interface InvoiceSettings {
  id?: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  paymentLinkUrl: string;
  invoiceFooter: string;
  logoUrl: string;
  logoPublicId: string;
  updatedAt: string;
}

// ─── Drip Campaigns ───────────────────────────────────────────────────────────
export type DripAudience = "Referral Partners" | "Client Contacts" | "Both";
export type DripContactType = "referral" | "client";
export type EnrollmentStatus = "Active" | "Paused" | "Completed" | "Unsubscribed";

export interface DripStep {
  dayOffset: number;
  subject: string;
  previewText: string;
  bodyHtml: string;
}

export interface DripCampaign {
  id: string;
  name: string;
  description: string;
  audience: DripAudience;
  tags: string[];
  steps: DripStep[];
  isActive: boolean;
  createdAt: string;
}

export interface DripEnrollment {
  id: string;
  campaignId: string;
  campaignName: string;
  contactType: DripContactType;
  contactId: string;
  contactEmail: string;
  contactName: string;
  company: string;
  enrolledAt: string;
  currentStep: number;
  lastSentAt?: string;
  status: EnrollmentStatus;
  enrolledByClerkId: string;
}

export interface DripSettings {
  id?: string;
  senderName: string;
  senderEmail: string;
  logoUrl: string;
  logoPublicId: string;
  primaryColor: string;
  companyName: string;
  companyTagline: string;
  companyAddress: string;
  signatureHtml: string;
  updatedAt: string;
}

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

// ─── Expenses ─────────────────────────────────────────────────────────────────
export type ExpenseCategory =
  | "Meals & Entertainment"
  | "Travel & Transportation"
  | "Office Supplies"
  | "Technology & Software"
  | "Marketing & Advertising"
  | "Professional Services"
  | "Utilities"
  | "Other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Meals & Entertainment",
  "Travel & Transportation",
  "Office Supplies",
  "Technology & Software",
  "Marketing & Advertising",
  "Professional Services",
  "Utilities",
  "Other",
];

export interface Expense {
  id: string;
  clerkUserId: string;
  staffName: string;
  date: string;               // YYYY-MM-DD extracted from receipt
  vendor: string;             // Vendor/merchant name from receipt
  total: number;              // Total amount from receipt
  category: ExpenseCategory;  // AI-suggested category
  description: string;        // Brief AI description
  receiptUrl?: string;        // Cloudinary URL
  receiptPublicId?: string;   // Cloudinary public ID
  notes?: string;             // User notes
  createdAt: string;          // ISO timestamp when logged
}
