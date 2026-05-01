# Claude Code Reconstruction Prompt
## Rightsize by Top Tier + ProFound Finds
### Date: March 26, 2026

---

## HOW TO USE THIS DOCUMENT

This document serves two purposes:

1. **System Overview** — A complete reference of both apps' architecture, data model, integrations, and business logic.
2. **Reconstruction Prompt** — The section below (starting with "RECONSTRUCTION PROMPT") is formatted to be copy-pasted directly into a Claude Code session to rebuild both apps from scratch in an emergency.

If you need to rebuild: open a new Claude Code session, paste everything from the "RECONSTRUCTION PROMPT" header onward, and follow the instructions in order. The Airtable base (`app5pCCePZGJarcWc`) contains all live data and does not need to be rebuilt — only the application code needs to be recreated.

---

---

# RECONSTRUCTION PROMPT

You are Claude Code. Your task is to rebuild two production web applications from scratch:

1. **Rightsize by Top Tier** — a multi-tenant B2B SaaS for senior downsizing project management
2. **ProFound Finds** — a public luxury consignment storefront that sources inventory from Rightsize

Read every section carefully before writing any code. The Airtable base already exists with live data — do not modify it. Build only the application layer.

---

## WHAT TO BUILD

### Application 1: Rightsize by Top Tier Transitions
- **Location**: `/Users/mattkamhi/rightsize`
- **Deployed at**: https://app.toptiertransitions.com
- **Purpose**: Multi-tenant B2B SaaS for senior downsizing project management. TTT staff manage client projects; clients get read-only access to their own project.

**Tech Stack:**
- Next.js 15 App Router + TypeScript (strict mode)
- Tailwind CSS 3
- Clerk Auth v7 (`@clerk/nextjs`)
- Airtable (primary data store, Personal Access Token auth)
- Anthropic Claude AI (`claude-sonnet-4-6` for item photo analysis, `claude-haiku-4-5-20251001` for fast grouping tasks)
- Cloudinary (image and file management)
- Resend (transactional email)
- Square POS (catalog sync + sales webhooks, raw fetch against REST API v2, no SDK)
- QuickBooks Online (invoice sync via OAuth2)
- Google Calendar (staff scheduling, `googleapis` package)
- Gmail API (CRM email sync, `googleapis` package)
- `@react-pdf/renderer` v4 (PDF generation)
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (drag-and-drop)
- `bwip-js` (barcode generation)
- `recharts` (data visualization)
- `remove.bg` API (background removal)
- `svix` (Clerk webhook verification)
- `@upstash/ratelimit` (rate limiting on API routes)
- `us-zips` (zip code lookups)
- Vercel deployment

**Color/Design System:**
- Primary: forest green — Tailwind custom color `forest`, DEFAULT = `#2E6B4F`
- Background accent: cream — Tailwind custom color `cream`, DEFAULT = `#F5F0E8`
- Font: Inter (sans-serif only)
- Admin pages: dark theme (`bg-gray-900 text-gray-100`)
- Protected pages: white/light backgrounds, card-based layouts

### Application 2: ProFound Finds
- **Location**: `/Users/mattkamhi/profoundfinds`
- **Deployed at**: https://www.profoundfinds.com
- **Purpose**: Public luxury consignment storefront. No auth. Sources inventory from Rightsize `/api/storefront/` routes. Processes payments via Stripe.

**Tech Stack:**
- Next.js 15 App Router + TypeScript (strict mode)
- Tailwind CSS 3 with custom design tokens
- Stripe Payments (`stripe`, `@stripe/react-stripe-js`, `@stripe/stripe-js`)
  - Stripe API version: `2025-02-24.acacia`
  - PaymentIntent creation via raw fetch (not Stripe Node SDK — SDK has issues in Next.js 15 serverless)
  - Webhook verification via Stripe SDK's `constructEvent`
- `@upstash/redis` for item reservations (15-minute TTL)
- Resend (purchase confirmation emails)
- No auth (fully public storefront)
- Vercel deployment with daily cron job

**Design System (exact values):**
- Sage: `#7A9E7E` (dark: `#4A6B4E`, tint: `#EAF0EA`) — Tailwind: `sage`
- Cream: `#FAF8F5` — Tailwind: `cream` (body background)
- Charcoal: `#2C2C2C` — Tailwind: `charcoal` (body text)
- Gold: `#B8960C` — Tailwind: `gold` (accent, Dutch auction timer)
- Serif font: Cormorant Garamond (headings) — CSS var: `--font-cormorant`
- Sans font: Inter (body) — CSS var: `--font-inter`
- Both fonts loaded via `next/font/google`

---

---

## RIGHTSIZE — FULL RECONSTRUCTION GUIDE

### Step 1: Initialize the Project

```bash
npx create-next-app@latest rightsize --typescript --tailwind --app --src-dir=no
cd rightsize
npm install \
  @clerk/nextjs \
  airtable \
  @anthropic-ai/sdk \
  cloudinary \
  resend \
  svix \
  googleapis \
  @react-pdf/renderer \
  sharp \
  recharts \
  @dnd-kit/core \
  @dnd-kit/sortable \
  @dnd-kit/utilities \
  bwip-js \
  us-zips \
  @upstash/ratelimit \
  tailwind-merge \
  clsx
```

---

### Step 2: Core Configuration Files

**`middleware.ts`** — Clerk route protection. All routes are protected except the list below:

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/calculator(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite(.*)",
  "/api/invites/(.*)",
  "/api/mcp",
  "/api/square/webhook",
  "/api/storefront/(.*)",
  "/api/contracts/sign",
  "/sign/(.*)",
  "/pay/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

**`next.config.ts`** — IMPORTANT: `@react-pdf/renderer` and its sub-packages must be listed as `serverExternalPackages` or Next.js will try to bundle them and fail. Also set up image remote patterns and a redirect from `/dashboard` to `/home`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@react-pdf/layout",
    "@react-pdf/render",
    "@react-pdf/font",
    "@react-pdf/textkit",
    "fontkit",
    "linebreak",
  ],
  async redirects() {
    return [
      { source: "/dashboard", destination: "/home", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.squarespace-cdn.com" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};

export default nextConfig;
```

**`tailwind.config.ts`** — Custom color palette:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: "#2E6B4F",
          50: "#f0f7f4",
          100: "#daeee5",
          200: "#b7ddcc",
          300: "#8cc5ae",
          400: "#5fa78a",
          500: "#3e8b6e",
          600: "#2E6B4F",
          700: "#255840",
          800: "#204834",
          900: "#1c3c2c",
        },
        cream: {
          DEFAULT: "#F5F0E8",
          50: "#fdfcfa",
          100: "#F5F0E8",
          200: "#ece3d1",
          300: "#ddd1b8",
          400: "#ccb99a",
          500: "#b89e7a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

**`app/layout.tsx`** — Root layout with Clerk, Inter font via Google Fonts `<link>`, and Dancing Script loaded for the contract signing page signature display. Set `dynamic = "force-dynamic"` at root level. Load the company logo URL from InvoiceSettings and use it as the favicon:

```typescript
import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { unstable_cache } from "next/cache";
import { getInvoiceSettings } from "@/lib/airtable";
import "./globals.css";

export const dynamic = "force-dynamic";

const getCachedLogoUrl = unstable_cache(
  async () => {
    const settings = await getInvoiceSettings().catch(() => null);
    return settings?.logoUrl || null;
  },
  ["invoice-settings-logo"],
  { revalidate: 3600 }
);

export async function generateMetadata(): Promise<Metadata> {
  const logoUrl = await getCachedLogoUrl();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.toptiertransitions.com";
  return {
    title: "Rightsize by Top Tier",
    description: "The all-in-one platform for senior downsizing.",
    metadataBase: new URL(appUrl),
    ...(logoUrl && { icons: { icon: logoUrl, shortcut: logoUrl, apple: logoUrl } }),
  };
}

export const viewport: Viewport = { themeColor: "#2E6B4F" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

**`vercel.json`** — Rightsize (no crons needed here):
```json
{ "framework": "nextjs" }
```

---

### Step 3: `lib/types.ts` — All TypeScript Interfaces

This is the complete type file. Every interface is used somewhere in the app.

```typescript
// ─── Roles ────────────────────────────────────────────────────────────────────
export type UserRole = "Owner" | "Collaborator" | "Viewer" | "TTTStaff" | "TTTManager" | "TTTSales" | "TTTAdmin";
export type SystemRole = "TTTStaff" | "TTTManager" | "TTTSales" | "TTTAdmin";

// ─── Staff Availability ───────────────────────────────────────────────────────
export interface DaySchedule {
  available: boolean;
  start: string; // "09:00"
  end: string;   // "17:00"
}

export type WeeklySchedule = {
  Mon: DaySchedule; Tue: DaySchedule; Wed: DaySchedule; Thu: DaySchedule;
  Fri: DaySchedule; Sat: DaySchedule; Sun: DaySchedule;
};

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  Mon: { available: true,  start: "09:00", end: "17:00" },
  Tue: { available: true,  start: "09:00", end: "17:00" },
  Wed: { available: true,  start: "09:00", end: "17:00" },
  Thu: { available: true,  start: "09:00", end: "17:00" },
  Fri: { available: true,  start: "09:00", end: "17:00" },
  Sat: { available: false, start: "09:00", end: "17:00" },
  Sun: { available: false, start: "09:00", end: "17:00" },
};

export interface TimeOffEntry {
  id: string;
  date: string;        // "YYYY-MM-DD"
  allDay: boolean;
  startTime?: string;  // "HH:MM"
  endTime?: string;    // "HH:MM"
}

export interface StaffMember {
  id: string;
  clerkUserId: string;
  displayName: string;
  email: string;
  phone?: string;
  role: SystemRole;
  isActive: boolean;
  createdAt: string;
  weeklySchedule?: WeeklySchedule;
  timeOff?: TimeOffEntry[];
  profileImageUrl?: string;
  hourlyRate?: number;
}

// ─── Tenant ───────────────────────────────────────────────────────────────────
export type PayoutMethod = "Zelle" | "Venmo" | "Check" | "Other";

export interface Tenant {
  id: string;
  airtableId: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  ownerUserId: string;
  createdAt: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  estimatedHours?: number;
  isArchived?: boolean;
  isTTT?: boolean;
  isConsignmentOnly?: boolean;
  destinationSqFt?: number;
  payoutMethod?: PayoutMethod;
  payoutUsername?: string;
  payoutCheckAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  consignmentExpense?: number;
  consignmentExpenseNote?: string;
}

// ─── User / Membership ────────────────────────────────────────────────────────
export interface User {
  id: string; airtableId: string; clerkUserId: string; email: string; name: string; createdAt: string;
}

export interface Membership {
  id: string; airtableId: string; tenantId: string; userId: string; role: UserRole; createdAt: string;
}

// ─── Room ─────────────────────────────────────────────────────────────────────
export type DensityLevel = "Low" | "Medium" | "High";

export type RoomType =
  | "Living Room" | "Bedroom" | "Master Bedroom" | "Kitchen" | "Dining Room"
  | "Office/Study" | "Garage" | "Basement" | "Attic" | "Bathroom" | "Closet"
  | "Storage Room" | "Sunroom" | "Other";

export const ROOM_TYPES: RoomType[] = [
  "Living Room","Bedroom","Master Bedroom","Kitchen","Dining Room",
  "Office/Study","Garage","Basement","Attic","Bathroom","Closet",
  "Storage Room","Sunroom","Other",
];

export interface Room {
  id: string; airtableId: string; tenantId: string; name: string;
  roomType: RoomType; squareFeet: number; density: DensityLevel; createdAt: string;
}

// ─── Item ─────────────────────────────────────────────────────────────────────
export type ItemCondition = "Excellent" | "Good" | "Fair" | "Poor" | "For Parts";
export type SizeClass = "Small & Shippable" | "Fits in Car-SUV" | "Needs Movers";
export type FragilityLevel = "Not Fragile" | "Somewhat Fragile" | "Very Fragile";
export type ItemUseType = "Daily Use" | "Collector Item";

export type PrimaryRoute =
  | "Keep" | "Family Keeping" | "ProFoundFinds Consignment" | "FB/Marketplace"
  | "Online Marketplace" | "Other Consignment" | "Donate" | "Discard" | "Estate Sale";

export type ItemStatus =
  | "Pending Review" | "Approved" | "Listed" | "Reserved" | "Sold"
  | "Donated" | "Discarded" | "Rejected / Revisit";

export interface ItemPhoto { url: string; publicId: string; }

export interface Item {
  id: string; airtableId: string; tenantId: string; roomId?: string;
  photos?: ItemPhoto[];
  photoUrl?: string;        // derived: photos[0].url
  photoPublicId?: string;
  itemName: string; category: string;
  condition: ItemCondition; conditionNotes: string;
  sizeClass: SizeClass; fragility: FragilityLevel; itemType: ItemUseType;
  valueLow: number; valueMid: number; valueHigh: number;
  primaryRoute: PrimaryRoute; routeReasoning: string; consignmentCategory: string;
  listingTitleEbay: string; listingDescriptionEbay: string;
  listingFb: string; listingOfferup: string; staffTips: string;
  status: ItemStatus; createdAt: string; updatedAt: string;
  salePrice?: number; consignorPayout?: number; saleDate?: string;
  circleHandItemId?: string; routingStatus?: string;
  assignedVendorId?: string; vendorDecision?: VendorDecision; vendorNotes?: string;
  payoutPaidAmount?: number; payoutPaidAt?: string;
  vendorPriceApproved?: boolean; vendorExpectedPrice?: number; vendorRespondedAt?: string;
  barcodeNumber?: string; quantity?: number; quantitySold?: number;
  clientSharePercent?: number; deliveryDate?: string;
  squareCatalogItemId?: string; squareCatalogVariationId?: string; squareSyncedAt?: string;
  staffSellerId?: string; staffSellerName?: string;
  staffCommissionPercent?: number; staffTimeMinutes?: number;
  completedDate?: string;
  saleChannel?: string; buyerName?: string; buyerEmail?: string;
  stripePaymentIntentId?: string; onlineListingSlug?: string;
  storefrontActive?: boolean; pickupLocation?: string;
  estateSaleId?: string; commissionPaidAt?: string;
}

// ─── AI Analysis (snake_case — matches Claude JSON output) ────────────────────
export interface ItemAnalysis {
  item_name: string; category: string;
  condition: ItemCondition; condition_notes: string;
  size_class: SizeClass; fragility: FragilityLevel; item_type: ItemUseType;
  value_low: number; value_mid: number; value_high: number;
  primary_route: PrimaryRoute; route_reasoning: string; consignment_category: string;
  listing_title_ebay: string; listing_description_ebay: string;
  listing_fb: string; listing_offerup: string; staff_tips: string;
  quantity?: number;
}

// ─── Estate Sale ──────────────────────────────────────────────────────────────
export type EstateStatus = "Upcoming" | "Active" | "Closed";
export type EstateSaleType = "Online" | "In-Person";

export interface Estate {
  id: string; airtableId: string; name: string; slug: string; tenantId: string;
  description: string; status: EstateStatus; saleType: EstateSaleType;
  saleStartDate: string; saleEndDate: string;
  dropIntervalHours: number; dropPercent: number; floorPercent: number;
  pickupAddress: string; pickupWindowStart: string; pickupWindowEnd: string;
  shippingAvailable: boolean; shippingNotes: string; terms: string;
  contactEmail: string; contactPhone: string; cityRegion: string;
  featuredImageUrl: string; featuredImagePublicId: string;
  galleryJson: string;  // JSON array of { url, publicId }
  createdAt: string;
}

// ─── Plan Entry ───────────────────────────────────────────────────────────────
export const PLAN_ACTIVITIES: string[] = [
  "Coordinating","Rightsizing","Packing to Move","Packing for Donation/Dispersal",
  "Managing Moving Day","Unpacking","Setting Up Your Space","Donating/Dispersal",
  "Cleaning","Other Service",
];
export type PlanActivity = string;

export interface PlanHelper {
  email: string; status: "pending" | "accepted" | "declined"; comment?: string;
}

export interface PlanEntry {
  id: string; airtableId: string; tenantId: string; date: string;
  activity: PlanActivity; roomId?: string; roomLabel?: string; notes?: string;
  startTime?: string; endTime?: string;
  helpers?: PlanHelper[]; googleEventId?: string; createdAt: string;
}

// ─── Vendor ───────────────────────────────────────────────────────────────────
export type VendorType =
  | "Move Manager" | "Mover" | "Future Home/Community" | "Realtor" | "Broker"
  | "Donation Org" | "Consignment Store" | "Junk Hauler" | "Attorney" | "Other";

export const VENDOR_TYPES: VendorType[] = [
  "Move Manager","Mover","Future Home/Community","Realtor","Broker",
  "Donation Org","Consignment Store","Junk Hauler","Attorney","Other",
];

export type VendorDecision = "Pending" | "Approved" | "Rejected" | "Hold";

export interface Vendor {
  id: string; airtableId: string; tenantId: string; vendorType: VendorType;
  vendorName: string; pocName: string; email: string; phone: string; arrangement: string;
  date1Label: string; date1: string; date2Label: string; date2: string;
  date3Label: string; date3: string; createdAt: string;
}

// ─── Local Vendor Directory ───────────────────────────────────────────────────
export interface LocalVendor {
  id: string; airtableId: string; vendorType: VendorType; vendorName: string;
  pocName: string; email: string; phone: string; address: string;
  city: string; state: string; zip: string; website: string;
  itemCategories: string;    // comma-separated
  consignmentTake: number;   // % (0 if N/A)
  zipCodesServed: string;    // comma-separated
  notes: string; isActive: boolean; createdAt: string; clerkUserId?: string;
  prefCategories: Array<{ category: string; minPrice: number; maxPrice: number }>;
}

// ─── Routing Rules ────────────────────────────────────────────────────────────
export interface RoutingRule {
  id: string; airtableId: string; primaryRoute: PrimaryRoute; vendorType: VendorType;
  minCondition: "Any" | "Fair or better" | "Good or better" | "Excellent only";
  matchCategories: string; matchSizeClasses: string; matchFragility: string;
  minValueMid: number; maxValueMid: number;
  priority: number; isActive: boolean; createdAt: string;
}

// ─── Project Files ────────────────────────────────────────────────────────────
export type FileTag = "Floorplan" | "Room Image" | "Layout Image" | "Damage Image" | "Vendor File" | "Payment Proof";

export interface ProjectFile {
  id: string; airtableId: string; tenantId: string; fileName: string;
  fileTag: FileTag; roomLabel?: string; vendorId?: string;
  cloudinaryUrl: string; cloudinaryPublicId: string; resourceType: string;
  sortOrder?: number; createdAt: string;
}

// ─── Time Tracking ────────────────────────────────────────────────────────────
export const TIME_FOCUS_AREAS: string[] = [
  "Coordinating","Rightsizing","Packing to Move","Packing for Donation/Dispersal",
  "Managing Moving Day","Unpacking","Setting Up Your Space","Donating/Dispersal",
  "Cleaning","Other Service",
];
export type FocusArea = string;

export interface TimeEntry {
  id: string; clerkUserId: string; staffName: string; tenantId: string;
  projectName: string; date: string; startTime: string; endTime: string;
  durationMinutes: number; focusArea: FocusArea;
  travelMiles?: number; travelMinutes?: number; notes?: string; createdAt: string;
  hoursPaidAt?: string; mileagePaidAt?: string; travelPaidAt?: string;
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
export type ExpenseCategory =
  | "Meals & Entertainment" | "Travel & Transportation" | "Office Supplies"
  | "Technology & Software" | "Marketing & Advertising" | "Professional Services"
  | "Utilities" | "Other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Meals & Entertainment","Travel & Transportation","Office Supplies",
  "Technology & Software","Marketing & Advertising","Professional Services",
  "Utilities","Other",
];

export interface Expense {
  id: string; clerkUserId: string; staffName: string;
  date: string; vendor: string; total: number; category: ExpenseCategory;
  description: string; receiptUrl?: string; receiptPublicId?: string; notes?: string;
  createdAt: string; tenantId?: string; tenantName?: string;
  reimbursable: boolean; paidAt?: string;
}

// ─── Item Sale Event ──────────────────────────────────────────────────────────
export interface ItemSaleEvent {
  id: string; itemId: string; tenantId: string; itemName: string;
  quantitySold: number; unitPrice: number; totalAmount: number; clientPayout: number;
  squarePaymentId: string; squareOrderId?: string; saleDate: string;
  payoutPaid: boolean; payoutPaidAt?: string; notes?: string; createdAt: string;
}

// ─── Services ─────────────────────────────────────────────────────────────────
export interface Service {
  id: string; airtableId: string; name: string; description: string;
  hourlyRate: number; estimatorLow: number; estimatorAvg: number; estimatorHigh: number;
  sortOrder: number; isActive: boolean; createdAt: string; qboItemId?: string;
}

// ─── Contracts ────────────────────────────────────────────────────────────────
export interface ContractSettings {
  id: string; airtableId: string;
  rightsizingRate: number; packingRate: number; unpackingRate: number;
  rightsizingLow: number; rightsizingAvg: number; rightsizingHigh: number;
  packingPerHundred: number; unpackingPerHundred: number; createdAt: string;
}

export interface ContractTemplate {
  id: string; airtableId: string; name: string; body: string;
  isActive: boolean; createdAt: string;
}

export interface ContractLineItem {
  serviceId: string; serviceName: string; hours: number; rate: number;
}

export type ContractStatus = "Draft" | "Sent" | "Signed" | "Archived";

export interface Contract {
  id: string; airtableId: string; tenantId: string; templateId: string;
  contractBody: string;
  rightsizingHours: number; packingHours: number; unpackingHours: number;
  rightsizingRate: number; packingRate: number; unpackingRate: number; totalCost: number;
  status: ContractStatus; signatureData?: string;
  signatureMethod?: "draw" | "type"; signedAt?: string; signedByName?: string;
  signToken: string; sentByClerkId?: string; sentAt?: string; recipientEmail?: string;
  autoSendDeposit?: boolean; createdAt: string; lineItems?: ContractLineItem[];
}

// ─── Invoicing ────────────────────────────────────────────────────────────────
export type InvoiceType = "Deposit" | "Full";
export type InvoiceDepositType = "PercentOfEstimate" | "SpecificAmount";
export type InvoiceStatus = "Unpaid" | "PartiallyPaid" | "Paid";

export interface InvoiceLineItem { serviceId: string; serviceName: string; hours: number; rate: number; }
export interface InvoiceExpenseItem { expenseId?: string; vendor: string; description: string; date: string; amount: number; }

export interface Invoice {
  id: string; tenantId: string; type: InvoiceType; invoiceNumber: string;
  serviceId: string; serviceName: string;
  depositType?: InvoiceDepositType; depositPercent?: number; amount: number;
  contractId?: string; lineItems?: InvoiceLineItem[]; expenseItems?: InvoiceExpenseItem[];
  qboInvoiceId?: string; qboDocNumber?: string;
  status: InvoiceStatus; paidAmount?: number; paidAt?: string;
  sentToEmail?: string; ccEmail?: string; emailSent?: boolean;
  notes?: string; createdAt: string; createdByClerkId: string;
}

export interface InvoiceSettings {
  id?: string; companyName: string; companyAddress: string;
  companyPhone: string; companyEmail: string; paymentLinkUrl: string;
  invoiceFooter: string; logoUrl: string; logoPublicId: string; updatedAt: string;
  venmoHandle?: string; venmoQrUrl?: string; venmoQrPublicId?: string;
  zelleHandle?: string; zelleQrUrl?: string; zelleQrPublicId?: string;
}

// ─── QBO ──────────────────────────────────────────────────────────────────────
export interface QBOTokenRecord {
  id: string; accessToken: string; refreshToken: string;
  expiresAt: string; realmId: string; companyName: string;
}

// ─── CRM ──────────────────────────────────────────────────────────────────────
export type ReferralPriority = "High" | "Medium" | "Low" | "";

export interface ReferralCompany {
  id: string; name: string; type: string; address: string; city: string;
  state: string; zip: string; priority: ReferralPriority; notes: string;
  website?: string; assignedToClerkId: string; createdAt: string; lastActivityDate?: string;
}

export type ReferralContactStage =
  | "Identified" | "Met" | "Agreed to Refer" | "Shared Leads"
  | "Active Referral" | "Inactive Referral";

export interface ReferralContact {
  id: string; name: string; title: string; email: string; phone: string;
  referralCompanyId: string; notes: string; stage: ReferralContactStage;
  dateIntroduced?: string; interests?: string; coffeeOrder?: string;
  orgsGroups?: string; createdAt: string; lastActivityDate?: string;
}

export interface ClientContact {
  id: string; name: string; email: string; phone: string; source: string;
  referralPartnerId?: string; clientReferralId?: string; notes: string;
  assignedToClerkId: string; createdAt: string;
}

export type OpportunityStage = "Lead" | "Qualifying" | "Proposing" | "Won" | "Lost";

export interface KeyPerson { name: string; relationship: string; email?: string; referralContactId?: string; }

export interface ClientOpportunity {
  id: string; tenantId: string; clientContactId: string; stage: OpportunityStage;
  keyPeople: KeyPerson[]; notes: string; nextStepDate?: string; nextStepNote?: string;
  estimatedValue: number; wonAt?: string; lostAt?: string; lostReason?: string;
  assignedToClerkId: string; createdAt: string;
  address?: string; city?: string; state?: string; zip?: string;
}

export type CRMActivityType = "Call" | "Email" | "Meeting" | "Note" | "Task";

export interface CRMActivity {
  id: string; opportunityId: string; clientContactId?: string;
  type: CRMActivityType; note: string; isGmailImported: boolean;
  gmailMessageId?: string; gmailThreadId?: string;
  activityDate: string; createdByClerkId: string; createdAt: string;
}

export interface GmailToken {
  id: string; clerkUserId: string; accessToken: string;
  refreshToken: string; expiresAt: string; email: string;
}

// ─── Drip Campaigns ───────────────────────────────────────────────────────────
export type DripAudience = "Referral Partners" | "Client Contacts" | "Both";
export type DripContactType = "referral" | "client";
export type EnrollmentStatus = "Active" | "Paused" | "Completed" | "Unsubscribed";

export interface DripStep { dayOffset: number; subject: string; previewText: string; bodyHtml: string; }

export interface DripCampaign {
  id: string; name: string; description: string; audience: DripAudience;
  tags: string[]; steps: DripStep[]; isActive: boolean; createdAt: string;
}

export interface DripEnrollment {
  id: string; campaignId: string; campaignName: string;
  contactType: DripContactType; contactId: string; contactEmail: string;
  contactName: string; company: string; enrolledAt: string;
  currentStep: number; lastSentAt?: string;
  status: EnrollmentStatus; enrolledByClerkId: string;
}

export interface DripSettings {
  id?: string; senderName: string; senderEmail: string;
  logoUrl: string; logoPublicId: string; primaryColor: string;
  companyName: string; companyTagline: string; companyAddress: string;
  signatureHtml: string; updatedAt: string;
}

// ─── Calculator ───────────────────────────────────────────────────────────────
export type HelperType = "Solo" | "Family" | "Mixed" | "TTT";

export interface CalculatorRoom { id: string; name: string; roomType: RoomType; squareFeet: number; density: DensityLevel; }
export interface CalculatorInput { rooms: CalculatorRoom[]; destinationSqFt: number; helperType: HelperType; }

export interface CalculatorResult {
  rightsizingHours: number; packingHours: number; unpackingHours: number;
  totalHours: number; estimatedWeeks: number; helperType: HelperType;
  roomBreakdown: Array<{ name: string; roomType: RoomType; squareFeet: number; density: DensityLevel; hours: number; }>;
}

// ─── Supply Tracking ──────────────────────────────────────────────────────────
export interface CrateLocation {
  id: string; name: string; type: "Storage" | "Project";
  crateCount: number; tenantId?: string; isActive: boolean;
}

export interface InventoryItem { id: string; name: string; quantity: number; unit?: string; notes?: string; }

export interface InventoryContainer {
  id: string; name: string; containerType: "HQ" | "Kit";
  tenantId?: string; items: InventoryItem[]; isActive: boolean;
}

// ─── Subcontractor ────────────────────────────────────────────────────────────
export interface Subcontractor {
  id: string; name: string; charges: number; scope: string;
  paid: boolean; paidDate?: string; tenantId?: string; tenantName?: string; createdAt: string;
}

// ─── Item Categories ──────────────────────────────────────────────────────────
export const ITEM_CATEGORIES: string[] = [
  "Furniture","Electronics","Appliances","Clothing & Accessories","Books & Media",
  "Art & Collectibles","Jewelry","Sporting Goods","Tools & Hardware","Kitchen & Dining",
  "Bedroom","Bathroom","Office","Toys & Games","Musical Instruments",
  "Outdoor & Garden","Holiday & Seasonal","Antiques","Other",
];

// ─── Sold Item Row ────────────────────────────────────────────────────────────
export interface SoldItemRow {
  saleDate: string; staffSellerName?: string; tenantName: string; itemName: string;
  valueMid: number; staffCommissionPercent?: number; staffTimeMinutes?: number;
  channel: "FB" | "eBay";
}

// ─── Intake Form ──────────────────────────────────────────────────────────────
export interface IntakeForm {
  bedrooms?: number; hasKitchen?: boolean; hasDiningRoom?: boolean;
  numLivingSpaces?: number; numBathrooms?: number;
  hasBasement?: boolean; hasAttic?: boolean; garbageDay?: string;
  homeDetailsNotes?: string; timeframe?: string; financialTakeoverDate?: string;
  beginPackingDate?: string; moveInDate?: string; sellingCurrentHome?: boolean;
  closingDate?: string; moversToFamily?: boolean; moversToFamilyDetails?: string;
  moversToStorage?: boolean; storageLocation?: string; medicalDevices?: string;
  giftItems?: string; sentimentalItems?: string; itemsToSell?: string;
  storageNeeded?: boolean; storageDetails?: string; additionalNotes?: string;
  updatedAt?: string; updatedByName?: string; updatedByEmail?: string;
}

// ─── Zelle Payment ────────────────────────────────────────────────────────────
export interface ZellePayment {
  messageId: string; payerName: string; amount: number; sentOn: string; memo: string;
}
```

---

### Step 4: `lib/config.ts`

```typescript
import type { DensityLevel, HelperType } from "./types";

export const CALCULATOR_CONFIG = {
  rightsizingRatePerHundredSqFt: 1.0,
  densityMultipliers: { Low: 0.5, Medium: 1.0, High: 2.0 } as Record<DensityLevel, number>,
  packingRatePerHundredSqFt: 1.0,
  unpackingRatePerHundredSqFt: 1.0,
  helperHoursPerWeek: { Solo: 10, Family: 20, Mixed: 35, TTT: 50 } as Record<HelperType, number>,
} as const;

export const AIRTABLE_TABLES = {
  TENANTS:               process.env.AIRTABLE_TENANTS_TABLE            || "Tenants",
  USERS:                 process.env.AIRTABLE_USERS_TABLE              || "Users",
  MEMBERSHIPS:           process.env.AIRTABLE_MEMBERSHIPS_TABLE        || "Memberships",
  ROOMS:                 process.env.AIRTABLE_ROOMS_TABLE              || "Rooms",
  ITEMS:                 process.env.AIRTABLE_ITEMS_TABLE              || "Items",
  PLAN_ENTRIES:          process.env.AIRTABLE_PLAN_ENTRIES_TABLE       || "PlanEntries",
  VENDORS:               process.env.AIRTABLE_VENDORS_TABLE            || "Vendors",
  LOCAL_VENDORS:         process.env.AIRTABLE_LOCAL_VENDORS_TABLE      || "LocalVendors",
  FILES:                 process.env.AIRTABLE_FILES_TABLE              || "ProjectFiles",
  TIME_ENTRIES:          process.env.TIME_ENTRIES_TABLE_ID             || "TimeEntries",
  STAFF_ROLES:           process.env.STAFF_ROLES_TABLE_ID              || "StaffRoles",
  ROUTING_RULES:         process.env.AIRTABLE_ROUTING_RULES_TABLE      || "RoutingRules",
  CONTRACT_SETTINGS:     process.env.AIRTABLE_CONTRACT_SETTINGS_TABLE  || "ContractSettings",
  CONTRACT_TEMPLATES:    process.env.AIRTABLE_CONTRACT_TEMPLATES_TABLE || "ContractTemplates",
  CONTRACTS:             process.env.AIRTABLE_CONTRACTS_TABLE          || "Contracts",
  CRM_COMPANIES:         process.env.AIRTABLE_CRM_COMPANIES_TABLE      || "CRMReferralCompanies",
  CRM_CONTACTS:          process.env.AIRTABLE_CRM_CONTACTS_TABLE       || "CRMReferralContacts",
  CRM_CLIENT_CONTACTS:   process.env.AIRTABLE_CRM_CLIENT_CONTACTS_TABLE|| "CRMClientContacts",
  CRM_OPPORTUNITIES:     process.env.AIRTABLE_CRM_OPPORTUNITIES_TABLE  || "CRMOpportunities",
  CRM_ACTIVITIES:        process.env.AIRTABLE_CRM_ACTIVITIES_TABLE     || "CRMActivities",
  GMAIL_TOKENS:          process.env.AIRTABLE_GMAIL_TOKENS_TABLE       || "GmailTokens",
  SERVICES:              process.env.AIRTABLE_SERVICES_TABLE           || "Services",
  QBO_TOKENS:            process.env.QBO_TOKENS_TABLE_ID               || "QBOTokens",
  INVOICES:              process.env.AIRTABLE_INVOICES_TABLE           || "Invoices",
  INVOICE_SETTINGS:      process.env.AIRTABLE_INVOICE_SETTINGS_TABLE   || "InvoiceSettings",
  EXPENSES:              process.env.AIRTABLE_EXPENSES_TABLE           || "Expenses",
  DRIP_CAMPAIGNS:        process.env.AIRTABLE_DRIP_CAMPAIGNS_TABLE     || "DripCampaigns",
  DRIP_ENROLLMENTS:      process.env.AIRTABLE_DRIP_ENROLLMENTS_TABLE   || "DripEnrollments",
  DRIP_SETTINGS:         process.env.AIRTABLE_DRIP_SETTINGS_TABLE      || "DripSettings",
  ITEM_SALE_EVENTS:      process.env.AIRTABLE_ITEM_SALE_EVENTS_TABLE   || "ItemSaleEvents",
  SUPPLY_CRATE_LOCATIONS:process.env.AIRTABLE_SUPPLY_CRATE_LOCATIONS_TABLE || "SupplyCrateLocations",
  SUPPLY_INVENTORY:      process.env.AIRTABLE_SUPPLY_INVENTORY_TABLE   || "SupplyInventory",
  SUBCONTRACTORS:        process.env.AIRTABLE_SUBCONTRACTORS_TABLE     || "Subcontractors",
  FAILED_SALE_SYNC:      process.env.AIRTABLE_FAILED_SALE_SYNC_TABLE   || "FailedSaleSync",
  ESTATES:               process.env.AIRTABLE_ESTATES_TABLE            || "Estates",
} as const;

export const ITEM_STATUS_COLORS: Record<string, string> = {
  "Pending Review": "bg-yellow-100 text-yellow-800",
  "Approved":       "bg-blue-100 text-blue-800",
  "Listed":         "bg-purple-100 text-purple-800",
  "Reserved":       "bg-orange-100 text-orange-800",
  "Sold":           "bg-green-100 text-green-800",
  "Donated":        "bg-teal-100 text-teal-800",
  "Discarded":      "bg-gray-100 text-gray-800",
  "Rejected / Revisit": "bg-red-100 text-red-800",
};

export const ROUTE_COLORS: Record<string, string> = {
  "Keep":                    "bg-green-100 text-green-800",
  "Family Keeping":          "bg-emerald-100 text-emerald-800",
  "ProFoundFinds Consignment":"bg-orange-100 text-orange-800",
  "FB/Marketplace":          "bg-blue-100 text-blue-800",
  "Online Marketplace":      "bg-indigo-100 text-indigo-800",
  "Other Consignment":       "bg-purple-100 text-purple-800",
  "Donate":                  "bg-teal-100 text-teal-800",
  "Discard":                 "bg-gray-100 text-gray-800",
  "Estate Sale":             "bg-amber-100 text-amber-800",
};

export function isTTTAdmin(clerkUserId: string): boolean {
  const ids = (process.env.TTT_ADMIN_USER_IDS || "").split(",").map(s => s.trim());
  return ids.includes(clerkUserId);
}

export function isTTTStaff(clerkUserId: string): boolean {
  const ids = (process.env.TTT_STAFF_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  return ids.includes(clerkUserId) || isTTTAdmin(clerkUserId);
}
```

---

### Step 5: `lib/permissions.ts`

```typescript
import type { SystemRole } from "./types";

export const PERMISSIONS = {
  TIME_VIEW_SELF:   "time:view:self",
  TIME_EDIT_SELF:   "time:edit:self",
  TIME_VIEW_ALL:    "time:view:all",
  TIME_EDIT_ALL:    "time:edit:all",
  TIME_EXPORT:      "time:export",
  PROJECTS_WRITE:   "projects:write",
  PROJECTS_ARCHIVE: "projects:archive",
  STAFF_MANAGE:     "staff:manage",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  TTTStaff:   ["time:view:self","time:edit:self","projects:write"],
  TTTSales:   ["time:view:self","time:edit:self"],
  TTTManager: ["time:view:self","time:edit:self","time:view:all","time:edit:all","time:export","projects:write","projects:archive"],
  TTTAdmin:   ALL_PERMISSIONS,
};

export function hasPermission(role: SystemRole | null, perm: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] as Permission[]).includes(perm);
}
```

---

### Step 6: `lib/airtable.ts` — Data Access Layer

The Airtable client is the core data layer. Key patterns:

```typescript
import Airtable from "airtable";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { AIRTABLE_TABLES, isTTTAdmin, isTTTStaff } from "./config";

function getBase() {
  if (!process.env.AIRTABLE_API_TOKEN) throw new Error("AIRTABLE_API_TOKEN is not set");
  if (!process.env.AIRTABLE_BASE_ID) throw new Error("AIRTABLE_BASE_ID is not set");
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_TOKEN });
  return Airtable.base(process.env.AIRTABLE_BASE_ID);
}

function toStr(v: unknown): string { return typeof v === "string" ? v : ""; }
function toNum(v: unknown): number { return typeof v === "number" ? v : Number(v) || 0; }
```

Implement all of the following function groups. Each follows the `mapXxx(record)` pattern — read all fields defensively with `toStr`/`toNum`, parse JSON blobs with `JSON.parse(... || "[]")` or `JSON.parse(... || "{}")`:

**Tenants:** `getTenants()` (unstable_cache 60s), `getTenantById(id)`, `getTenantBySlug(slug)`, `createTenant(data)`, `updateTenant(id, data)`

Key Airtable fields: `Name`, `Slug`, `Plan`, `OwnerUserId`, `IsTTT` (checkbox), `IsArchived` (checkbox), `IsConsignmentOnly` (checkbox), `Address`, `City`, `State`, `Zip`, `EstimatedHours`, `DestinationSqFt`, `PayoutMethod`, `PayoutUsername`, `PayoutCheckAddress`, `ClientEmail`, `ClientPhone`, `ConsignmentExpense`, `ConsignmentExpenseNote`, `CreatedAt`

**Users:** `getUserByClerkId(clerkUserId)`, `createUser(data)`, `upsertUser(clerkUserId, email, name)`

**Memberships:** `getMembershipsForUser(clerkUserId)`, `getMembershipsForTenant(tenantId)`, `createMembership(data)`, `updateMembership(id, data)`, `deleteMembership(id)`

**System Roles (StaffRoles table):** `getSystemRole(clerkUserId): Promise<SystemRole | null>`, `getStaffMembers()`, `getStaffMember(clerkUserId)`, `upsertStaffMember(data)`, `updateStaffMember(id, data)`. The StaffRoles table stores: `ClerkUserId`, `DisplayName`, `Email`, `Phone`, `Role` (single select), `IsActive` (checkbox), `HourlyRate`, `WeeklySchedule` (JSON text), `TimeOff` (JSON text), `ProfileImageUrl`, `CreatedAt`.

**Rooms:** `getRoomsForTenant(tenantId)`, `createRoom(data)`, `updateRoom(id, data)`, `deleteRoom(id)`. Fields: `TenantId`, `Name`, `RoomType`, `SquareFeet`, `Density`, `CreatedAt`.

**Items:** `getItemsForTenant(tenantId)`, `getItemById(id)`, `createItem(data)`, `updateItem(id, data)`, `deleteItem(id)`, `bulkUpdateItems(ids, data)`. The `photos` field is stored as a JSON text blob. `getProFoundFindsStorefrontItems()` returns items where `PrimaryRoute = "ProFoundFinds Consignment"` AND `StorefrontActive = true` AND `Status` in ("Listed","Reserved","Sold"). For estate items, also join `EstateSaleId`. Key fields include all Item interface fields — map them carefully.

**Plan Entries:** `getPlanEntriesForTenant(tenantId)`, `getPlanEntriesForTodayByEmail(email)`, `createPlanEntry(data)`, `updatePlanEntry(id, data)`, `deletePlanEntry(id)`. Fields: `TenantId`, `Date`, `Activity`, `RoomId`, `RoomLabel`, `Notes`, `StartTime`, `EndTime`, `Helpers` (JSON), `GoogleEventId`, `CreatedAt`.

**Vendors (project-level):** `getVendorsForTenant(tenantId)`, `createVendor(data)`, `updateVendor(id, data)`, `deleteVendor(id)`. Fields: `TenantId`, `VendorType`, `VendorName`, `POCName`, `Email`, `Phone`, `Arrangement`, `Date1Label`, `Date1`, `Date2Label`, `Date2`, `Date3Label`, `Date3`, `CreatedAt`.

**Local Vendors (TTT directory):** `getLocalVendors()`, `getLocalVendorByClerkId(clerkUserId)`, `createLocalVendor(data)`, `updateLocalVendor(id, data)`. Fields include `PrefCategories` (JSON text: `[{category,minPrice,maxPrice}]`).

**Project Files:** `getFilesForTenant(tenantId)`, `createFile(data)`, `updateFile(id, data)`, `deleteFile(id)`.

**Time Entries:** `getTimeEntries(opts?: {clerkUserId?, tenantId?})`, `getTimeEntriesInRange(from, to, clerkUserId?)`, `createTimeEntry(data)`, `updateTimeEntry(id, data)`, `deleteTimeEntry(id)`, `bulkUpdateTimeEntries(ids, data)`. Fields: `ClerkUserId`, `StaffName`, `TenantId`, `ProjectName`, `Date`, `StartTime`, `EndTime`, `DurationMinutes`, `FocusArea`, `TravelMiles`, `TravelMinutes`, `Notes`, `HoursPaidAt`, `MileagePaidAt`, `TravelPaidAt`, `CreatedAt`.

**Expenses:** `getExpenses(opts?)`, `getExpensesInRange(from, to, clerkUserId?)`, `createExpense(data)`, `updateExpense(id, data)`, `bulkUpdateExpenses(ids, data)`. Fields: `ClerkUserId`, `StaffName`, `Date`, `Vendor`, `Total`, `Category`, `Description`, `ReceiptUrl`, `ReceiptPublicId`, `Notes`, `TenantId`, `TenantName`, `Reimbursable` (checkbox), `PaidAt`, `CreatedAt`.

**Item Sale Events:** `getItemSaleEventsForTenant(tenantId)`, `createItemSaleEvent(data)`, `updateItemSaleEvent(id, data)`. Fields: `ItemId`, `TenantId`, `ItemName`, `QuantitySold`, `UnitPrice`, `TotalAmount`, `ClientPayout`, `SquarePaymentId`, `SquareOrderId`, `SaleDate`, `PayoutPaid` (checkbox), `PayoutPaidAt`, `Notes`, `CreatedAt`.

**Routing Rules:** `getRoutingRules()`, `createRoutingRule(data)`, `updateRoutingRule(id, data)`, `deleteRoutingRule(id)`.

**Contract Settings:** `getContractSettings(tenantId)`, `upsertContractSettings(tenantId, data)`.

**Contract Templates:** `getContractTemplates()`, `createContractTemplate(data)`, `updateContractTemplate(id, data)`.

**Contracts:** `getContractsForTenant(tenantId)`, `getContractById(id)`, `getContractByToken(token)`, `createContract(data)`, `updateContract(id, data)`. The `signToken` is a UUID stored in Airtable as `SignToken`.

**Services:** `getServices()`, `createService(data)`, `updateService(id, data)`.

**Invoices:** `getInvoicesForTenant(tenantId)`, `getInvoiceById(id)`, `createInvoice(data)`, `updateInvoice(id, data)`. `LineItems` and `ExpenseItems` stored as JSON text blobs.

**Invoice Settings:** `getInvoiceSettings()`, `upsertInvoiceSettings(data)`. Single record per TTT org (no TenantId).

**CRM:** `getReferralCompanies()`, `getReferralCompanyById(id)`, `createReferralCompany(data)`, `updateReferralCompany(id, data)`; `getReferralContacts(companyId?)`, `getReferralContactById(id)`, `createReferralContact(data)`, `updateReferralContact(id, data)`; `getClientContacts()`, `createClientContact(data)`, `updateClientContact(id, data)`; `getOpportunities()`, `getOpportunityById(id)`, `createOpportunity(data)`, `updateOpportunity(id, data)`; `getActivitiesForOpportunity(opportunityId)`, `getActivitiesForContact(contactId)`, `createActivity(data)`, `updateActivity(id, data)`.

**Gmail Tokens:** `getGmailToken(clerkUserId)`, `saveGmailToken(data)`. **Calendar Tokens:** `getCalendarToken()`, `saveCalendarToken(data)`.

**QBO Tokens:** `getQBOToken()`, `saveQBOToken(data)`.

**Drip Campaigns:** `getDripCampaigns()`, `createDripCampaign(data)`, `updateDripCampaign(id, data)`; `getDripEnrollments(campaignId?)`, `createDripEnrollment(data)`, `updateDripEnrollment(id, data)`, `bulkUpdateDripEnrollments(ids, data)`; `getDripSettings()`, `upsertDripSettings(data)`.

**Estates:** `getEstates()`, `getEstateById(id)`, `getEstateBySlug(slug)`, `getEstatesForStorefront()` (status Active or Upcoming), `getEstateWithItems(slug)` (returns `{estate, items}`), `getItemsForEstateSale(estateId)`, `createEstate(data)`, `updateEstate(id, data)`.

**Supply:** `getCrateLocations()`, `createCrateLocation(data)`, `updateCrateLocation(id, data)`; `getInventoryContainers()`, `createInventoryContainer(data)`, `updateInventoryContainer(id, data)`.

**Subcontractors:** `getSubcontractors(tenantId?)`, `createSubcontractor(data)`, `updateSubcontractor(id, data)`.

**Failed Sale Sync:** `logFailedSaleSync(data)` — writes to FailedSaleSync table when `/api/storefront/sale` fails all retries.

**Sold Items for Commission:** `getSoldItemsWithCommission(from, to, staffSellerId?)` — items with `Status=Sold`, `StaffSellerId` set, `PrimaryRoute` in FB/Marketplace or Online Marketplace, filtered by `SaleDate` range.

**Intake Form:** `getIntakeForm(tenantId)`, `upsertIntakeForm(tenantId, data)` — stored in Tenants table as a JSON blob in an `IntakeForm` field.

---

### Step 7: `lib/anthropic.ts`

Two Claude functions:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { ItemAnalysis } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPT = `You are an expert estate sale appraiser and senior downsizing specialist.
Analyze the photo of this household item and return a JSON object with EXACTLY these fields:
{
  "item_name": "Short descriptive name",
  "category": "Category from: Furniture, Art & Collectibles, Electronics, Kitchen & Dining, Books & Media, Clothing & Accessories, Tools & Hardware, Sports & Outdoors, Décor & Accessories, Other",
  "condition": "Excellent | Good | Fair | Poor | For Parts",
  "condition_notes": "Brief honest description of condition",
  "size_class": "Small & Shippable | Fits in Car-SUV | Needs Movers",
  "fragility": "Not Fragile | Somewhat Fragile | Very Fragile",
  "item_type": "Daily Use | Collector Item",
  "value_low": number,
  "value_mid": number,
  "value_high": number,
  "primary_route": "Keep | Family Keeping | ProFoundFinds Consignment | FB/Marketplace | Online Marketplace | Other Consignment | Donate | Discard",
  "route_reasoning": "1-2 sentences",
  "consignment_category": "category string or empty string",
  "listing_title_ebay": "SEO-optimized eBay title under 80 chars",
  "listing_description_ebay": "2-3 paragraph eBay description",
  "listing_fb": "Short casual Facebook Marketplace post",
  "listing_offerup": "Short OfferUp listing",
  "staff_tips": "Practical tip for TTT helper"
}
Return ONLY valid JSON, no markdown, no code fences.`;

// Supports base64 string OR { url } object as imageData
export async function analyzeItemPhoto(
  imageData: string | { url: string },
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg"
): Promise<ItemAnalysis> {
  const imageSource = typeof imageData === "string"
    ? { type: "base64" as const, media_type: mimeType, data: imageData }
    : { type: "url" as const, url: imageData.url };

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: [
      { type: "image", source: imageSource },
      { type: "text", text: ANALYSIS_PROMPT },
    ]}],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned) as ItemAnalysis;
}

// Fast grouping for movers quote — uses Haiku
export interface MoverGroup { category: string; count: number; }

export async function groupItemsForMovers(itemNames: string[]): Promise<MoverGroup[]> {
  if (itemNames.length === 0) return [];
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content:
      `Group these ${itemNames.length} items into practical moving categories. Combine similar items. Sort by count desc.
Items:\n${itemNames.join("\n")}
Return ONLY valid JSON array: [{"category":"Beds","count":3}]`
    }],
  });
  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return (JSON.parse(cleaned) as MoverGroup[]).filter(g => typeof g.category === "string" && g.count > 0);
}
```

---

### Step 8: `lib/estate-utils.ts` — Dutch Auction

```typescript
import type { Estate } from "./types";
export { getEstatesForStorefront, getEstateWithItems, getItemsForEstateSale } from "./airtable";

export interface DutchPricing {
  currentPrice: number;
  startingPrice: number;
  nextDropAt: string | null;
  atFloor: boolean;
}

export function computeDutchPrice(
  startingPrice: number,
  estate: Estate,
  nowMs: number
): DutchPricing {
  const saleStart = new Date(estate.saleStartDate).getTime();
  const intervalMs = estate.dropIntervalHours * 3_600_000;
  const dropFactor = 1 - estate.dropPercent / 100;
  const floorPrice = Math.round(startingPrice * (estate.floorPercent / 100) * 100) / 100;

  let currentPrice = startingPrice;
  let atFloor = false;
  let nextDropAt: string | null = null;

  if (nowMs >= saleStart && intervalMs > 0) {
    const n = Math.floor((nowMs - saleStart) / intervalMs);
    const raw = startingPrice * Math.pow(dropFactor, n);
    currentPrice = Math.max(Math.round(raw * 100) / 100, floorPrice);
    atFloor = currentPrice <= floorPrice;
    if (!atFloor) {
      nextDropAt = new Date(saleStart + (n + 1) * intervalMs).toISOString();
    }
  } else if (nowMs < saleStart) {
    nextDropAt = new Date(saleStart).toISOString();
  }

  return { currentPrice, startingPrice, nextDropAt, atFloor };
}
```

---

### Step 9: `lib/pay-utils.ts` — Payroll Calculations

Two key functions:

```typescript
import type { TimeEntry } from "./types";

// Travel time: 30 minutes per entry = commute (unpaid). Beyond 30 = payable.
export interface PayableTravelEntry {
  entryId: string; clerkUserId: string; staffName: string; date: string;
  projectName: string; totalTravelMinutes: number;
  commuteMinutes: number; payableMinutes: number; travelPaidAt: string | null;
}

export function calcPayableTravelTime(entries: TimeEntry[]): PayableTravelEntry[] {
  return entries
    .filter(e => (e.travelMinutes ?? 0) > 0)
    .map(e => {
      const total = e.travelMinutes!;
      const commute = Math.min(total, 30);
      const payable = Math.max(0, total - 30);
      return { entryId: e.id, clerkUserId: e.clerkUserId, staffName: e.staffName,
               date: e.date, projectName: e.projectName,
               totalTravelMinutes: total, commuteMinutes: commute, payableMinutes: payable,
               travelPaidAt: e.travelPaidAt ?? null };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Mileage: 20-mile daily deduction per staff member before reimbursement.
export interface DailyMileage {
  clerkUserId: string; staffName: string; date: string;
  totalMiles: number; reimbursableMiles: number; entryIds: string[];
}

export function calcReimbursableMiles(entries: TimeEntry[]): DailyMileage[] {
  const map = new Map<string, DailyMileage>();
  for (const entry of entries) {
    if (!entry.travelMiles || entry.travelMiles <= 0) continue;
    const key = `${entry.clerkUserId}::${entry.date}`;
    const existing = map.get(key);
    if (existing) {
      existing.totalMiles += entry.travelMiles;
      existing.entryIds.push(entry.id);
    } else {
      map.set(key, { clerkUserId: entry.clerkUserId, staffName: entry.staffName,
                     date: entry.date, totalMiles: entry.travelMiles,
                     reimbursableMiles: 0, entryIds: [entry.id] });
    }
  }
  const results: DailyMileage[] = [];
  for (const row of map.values()) {
    row.reimbursableMiles = Math.max(0, row.totalMiles - 20);
    results.push(row);
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}
```

---

### Step 10: `lib/cloudinary.ts`

```typescript
import { v2 as cloudinary } from "cloudinary";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// uploadImage: accepts string (URL or base64) or Buffer
// Folder: `rightsize/${tenantId || "shared"}`
// Transformations: quality:auto:good, fetch_format:auto, width/height 1200 crop:limit
// Returns: { publicId, url, secureUrl, width, height, format }

// uploadFile: for PDFs/raw files — uses resource_type "raw" for non-image
// uploadPng: for processed PNG buffers (barcode, receipt backgrounds)
// deleteImage(publicId): cloudinary.uploader.destroy
// deleteFile(publicId, resourceType): cloudinary.uploader.destroy with resource_type
// getOptimizedUrl(publicId, {width?, height?}): secure URL with auto quality/format
```

---

### Step 11: `lib/invites.ts`

HMAC-based invite tokens (no DB storage needed — self-contained):

```typescript
import { createHmac, timingSafeEqual } from "crypto";
import type { UserRole } from "./types";

export type InviteRole = Extract<UserRole, "Collaborator" | "Viewer" | "Owner">;

// Two payload types: TenantInvitePayload and VendorInvitePayload
// Token format: base64url(JSON(payload)).base64url(HMAC-SHA256(payload, INVITE_SECRET))
// Expiry: 7 days

export function createTenantInviteToken(tenantId: string, role: InviteRole, invitedBy: string): string
export function createVendorInviteToken(vendorId: string, invitedBy: string): string
export function verifyInviteToken(token: string): TenantInvitePayload | VendorInvitePayload | null
```

---

### Step 12: `lib/square.ts`

Raw fetch against Square REST API v2. No SDK.

```typescript
const SQUARE_BASE = process.env.SQUARE_ENVIRONMENT === "production"
  ? "https://connect.squareup.com"
  : "https://connect.squareupsandbox.com";

// squareFetch(path, options): sets Authorization Bearer, Square-Version: 2026-01-22
// findAllSquareItemsBySku(sku): searches ITEM_VARIATION by text_query
// upsertSquareCatalogItem(item): upsert via /catalog/object with idempotency key
// deleteSquareCatalogItem(catalogItemId): DELETE via batch-delete
// validateSquareWebhook(body, signature, webhookKey): HMAC-SHA256 verification
```

---

### Step 13: `lib/qbo.ts` — QuickBooks Online

OAuth2 flow + invoice sync via REST API:

```typescript
// buildQBOAuthUrl(): Intuit OAuth2 authorization URL
// exchangeQBOCode(code, realmId): exchanges code for tokens, saves to QBOTokens table
// refreshQBOToken(): uses refresh_token grant, saves new tokens
// qboFetch(path, options): authenticated fetch with auto-refresh
// createQBOInvoice(invoice, tenant, settings): creates invoice in QBO
// getQBOStatus(): returns {connected, companyName} from stored tokens
```

---

### Step 14: `lib/googleCalendar.ts`

```typescript
import { google } from "googleapis";
// Uses OAuth2 with refresh token stored in Airtable (CalendarTokens) or env var
// CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary"
// TIMEZONE = "America/Chicago"
// createCalendarEvent(planEntry, tenant, helpers): creates event, sends invites
// updateCalendarEvent(googleEventId, planEntry): updates existing event
// deleteCalendarEvent(googleEventId): deletes event
// getCalendarAvailability(staffEmails, date): checks free/busy
```

---

### Step 15: `lib/gmail.ts`

```typescript
// Uses googleapis with per-user OAuth tokens stored in GmailTokens table
// getGmailAuthUrl(state?): returns OAuth2 consent URL
// exchangeGmailCode(code, clerkUserId): exchanges code, saves token
// syncGmailForUser(clerkUserId): fetches recent emails, matches against CRM contacts,
//   creates CRMActivity records for matched emails
// parseZellePayments(clerkUserId): reads Gmail for Zelle payment notifications,
//   returns ZellePayment[]
```

---

### Step 16: `lib/email.ts` — Email Templates (Resend)

All functions return HTML strings. Actual sending done in API routes via Resend:
```typescript
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY!);
// resend.emails.send({ from: process.env.RESEND_FROM_EMAIL!, to, subject, html })
```

Functions in `lib/email.ts` (HTML builder functions, not senders):
- `buildContractSentEmail({ clientName, projectName, signingUrl, totalCost, lineItems })` — forest green header, service table, CTA button
- `buildContractSignedEmail({ managerName?, clientName, projectName, signedAt, totalCost })` — internal notification
- `buildInvoiceEmail({ invoiceNumber, tenantName, type, amount, serviceName, payUrl, companyName, logoUrl?, lineItems? })` — supports line-item breakdown for Full invoices, credit rows (negative rates) shown in blue
- `buildClientWelcomeEmail({ projectName, inviteUrl })` — project access invite
- `buildVendorFileEmail({ vendorName, itemCount, portalUrl, companyName, items[] })` — item list + PDF attachment note
- `buildVendorAssignmentEmail({ vendorName, itemCount, portalUrl })` — new items notification
- `buildPayoutEmail({ clientName, total, itemCount, date, companyName })` — consignment payout
- `buildStaffWelcomeEmail({ firstName, roleLabel, signInUrl })` — TTT staff onboarding
- `buildDripEmail({ settings, bodyHtml, subject, unsubscribeUrl, vars })` — drip campaign with `{{variable}}` substitution
- `buildTimeOffEmail({ staffName, entries[], opsUrl })` — availability notification
- `substituteVars(template, vars)` — replaces `{{key}}` placeholders

---

### Step 17: `lib/remove-bg.ts`

```typescript
export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  // POST to https://api.remove.bg/v1.0/removebg
  // Header: X-Api-Key: process.env.REMOVE_BG_API_KEY
  // Body: FormData with image_file blob + size=auto
  // Returns: PNG buffer
}
```

---

### Step 18: PDF Documents (`lib/contract-pdf.tsx`, `lib/invoice-pdf.tsx`, etc.)

All use `@react-pdf/renderer`. Key pattern for API routes:

```typescript
import { renderToBuffer } from "@react-pdf/renderer";
// In API route:
const buffer = await renderToBuffer(<ContractDocument contract={contract} tenant={tenant} />);
return new Response(buffer, {
  headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="contract.pdf"` }
});
```

Create these PDF documents:
- **`lib/contract-pdf.tsx`** — `ContractDocument`: company header, services table, total, contract body text, signature block (shows drawn signature as image or typed name in Dancing Script font)
- **`lib/invoice-pdf.tsx`** — `InvoiceDocument`: company logo/header, invoice number, client name, line items table (service, hours, rate, amount), subtotal, credits (negative rates in blue), total, payment instructions with QR codes for Venmo/Zelle
- **`lib/movers-pdf.tsx`** — `MoversPdfDocument`: grouped item counts by category (output of `groupItemsForMovers`), sorted by count desc; used for mover quote PDFs
- **`lib/payout-pdf.tsx`** — `PayoutDocument`: consignment payout summary per project — item name, category, sale price, client %, payout amount; total at bottom
- **`lib/vendor-pdf.tsx`** — `VendorDocument`: list of items assigned to a vendor with photo thumbnails, estimated values, condition
- **`lib/label-pdf.tsx`** — `LabelDocument`: barcode labels using `bwip-js` to generate barcode PNG data URL, item name, price

---

### Step 19: App Directory Structure

```
app/
  layout.tsx                    # Root: ClerkProvider, Inter font
  page.tsx                      # Landing / marketing page (public)
  globals.css
  (auth)/
    sign-in/[[...sign-in]]/     # Clerk sign-in component
    sign-up/[[...sign-up]]/     # Clerk sign-up component
  (protected)/
    layout.tsx                  # Sidebar nav layout (project switcher, user button)
    home/                       # Dashboard / home (time tracker for staff, project list)
    catalog/                    # Item catalog for a project
      new/                      # Add new item (photo upload + Claude analysis)
    rooms/                      # Room management for a project
    plan/                       # Daily plan entries with calendar view
    vendors/                    # Project vendors (Move Manager, Movers, etc.)
    vendor/                     # Vendor portal (read-only for LocalVendors)
      not-found/
    sales/                      # Consignment sales / payout tracking
    quoting/                    # Estimator / contract quoting
    invoices/                   # Client invoice list
    expenses/                   # Staff expense logging
    staff/                      # Staff availability view
    crm/                        # CRM (referral companies + contacts)
      drips/                    # Drip campaign enrollment
    onboarding/                 # New project setup wizard
    help/                       # Help/FAQ page
  admin/                        # TTT Admin console (dark theme)
    page.tsx                    # Admin home / projects list
    components/
      AdminHeader.tsx           # Horizontal tab navigation
    pay/                        # Payroll admin (Hours, Commission, Mileage, Expenses)
    users/                      # User management + role assignment
    local-vendors/              # TTT vendor directory management
    routing-rules/              # Routing rule editor
    contract-services/          # Service rates editor
    invoicing/                  # Invoice settings
    expenses/                   # All-staff expense review
    drips/                      # Drip campaign management
    pfinventory/                # ProFoundFinds inventory (dark table)
    fb/                         # Facebook/Marketplace inventory (dark table)
    ebay/                       # eBay inventory (dark table)
    crm/                        # CRM admin
    ops/                        # Ops: crates, supply, subcontractors, staff schedule
    estates/                    # Estate sale management
    items/                      # Item import tools
    integrations/
      circle-hand/              # Circle Hand CSV import
    impersonate/                # Admin: impersonate user
    migrate/                    # One-time data migration scripts
  api/                          # All API routes (see Step 20)
  calculator/                   # Public estimator tool
  invite/                       # Accept project invite (public)
  sign/[token]/                 # Contract signing page (public)
  pay/[invoiceId]/              # Invoice payment page (public)
```

---

### Step 20: API Routes

All protected API routes follow this pattern:

```typescript
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // fetch data...
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

Create routes for all of these:

**Items:** `GET/POST /api/items`, `PATCH/DELETE /api/items/[id]`, `POST /api/items/movers-pdf`

**Rooms:** `GET/POST /api/rooms`, `PATCH/DELETE /api/rooms/[id]`

**Tenants:** `GET/POST /api/tenants`, `PATCH/DELETE /api/tenants/[id]`, `POST /api/tenants/delete-request`

**Plan:** `GET/POST /api/plan`, `PATCH/DELETE /api/plan/[id]`, `POST /api/plan/calendar`, `GET /api/plan/ttt-users`

**Vendors:** `GET/POST /api/vendors`, `PATCH/DELETE /api/vendors/[id]`; `GET/POST/PATCH /api/vendor/decisions` (LocalVendor decisions); `GET/PATCH /api/vendor/preferences` (LocalVendor prefs); `POST /api/vendor-file` (send vendor PDF email)

**Local Vendors:** `GET/POST /api/local-vendors`, `PATCH/DELETE /api/local-vendors/[id]`

**Time Entries:** `GET/POST /api/time-entries`, `PATCH/DELETE /api/time-entries/[id]`

**Expenses:** `GET/POST /api/expenses`, `PATCH/DELETE /api/expenses/[id]`

**Files:** `GET/POST /api/files`, `PATCH/DELETE /api/files/[id]`

**Analyze:** `POST /api/analyze` — upload image → Cloudinary → Claude analysis → return ItemAnalysis

**Upload:** `POST /api/upload` — multipart form → Cloudinary → return {url, publicId}

**Remove Background:** `POST /api/remove-background` — image → remove.bg → return PNG

**Contracts:** `GET/POST /api/contracts`, `PATCH /api/contracts/[id]`, `GET /api/contracts/[id]/pdf`, `POST /api/contracts/sign` (public — updates status to Signed)

**Contract Templates:** `GET/POST /api/contract-templates`, `PATCH /api/contract-templates/[id]`

**Contract Settings:** `GET/PATCH /api/contract-settings`

**Invoices:** `GET/POST /api/invoices`, `PATCH /api/invoices/[id]`, `GET /api/invoices/[id]/pdf`

**Invoice Settings:** `GET/PATCH /api/invoice-settings`

**Pay summary:** `GET /api/pay/summary?from=&to=&clerkUserId=` — aggregates hours, commission, mileage for My Pay section

**Admin Pay:** `GET /api/admin/pay/hours`, `GET /api/admin/pay/commission`, `GET /api/admin/pay/mileage`, `GET /api/admin/pay/expenses`, `POST /api/admin/pay/hours` (bulk mark paid), `POST /api/admin/pay/commission`, `POST /api/admin/pay/mileage`, `POST /api/admin/pay/expenses`

**PF Inventory:** `GET /api/pfinventory` (items for PF admin table), `POST /api/pfinventory/labels` (generate barcode label PDF)

**Sales:** `GET /api/sales` (item sale events for a project), `POST /api/sales/payout` (mark payouts paid), `GET /api/sales/payout-pdf`

**Sold Items:** `GET /api/sold-items` (FB/eBay sold items for commission tracking)

**Square:** `GET /api/square/status`, `POST /api/square/sync` (sync item to Square catalog), `POST /api/square/sync-sales`, `POST /api/square/cleanup-duplicates`, `POST /api/square/full-reset`, `POST /api/square/webhook` (public — payment.created events)

**QBO:** `GET /api/qbo/status`, `GET /api/qbo/auth`, `GET /api/qbo/callback`, `POST /api/qbo/disconnect`, `POST /api/qbo/invoice`, `GET /api/qbo/items`, `GET/PATCH /api/qbo/service-mapping`

**Availability:** `GET /api/availability?date=&emails=` — reads staff WeeklySchedule + TimeOff

**Staff:** `GET /api/staff`, `POST /api/staff/calendar` (sync plan entry to Google Calendar)

**Invites:** `POST /api/invites` (create + send invite email), `GET /api/invites/[token]` (verify token), `POST /api/invites/[token]` (accept invite — creates Membership)

**Item Sale Events:** `GET/POST /api/item-sale-events`, `PATCH /api/item-sale-events/[id]`

**CRM:** `GET/POST /api/crm/companies`, `PATCH /api/crm/companies/[id]`; `GET/POST /api/crm/contacts`, `PATCH /api/crm/contacts/[id]`; `GET/POST /api/crm/client-contacts`, `PATCH /api/crm/client-contacts/[id]`; `GET/POST /api/crm/opportunities`, `PATCH /api/crm/opportunities/[id]`; `GET/POST /api/crm/activities`, `PATCH /api/crm/activities/[id]`

**Drip:** `GET/POST /api/drip/campaigns`, `PATCH /api/drip/campaigns/[id]`; `GET/POST /api/drip/enrollments`, `PATCH /api/drip/enrollments/[id]`; `GET/PATCH /api/drip/settings`; `POST /api/drip/send` (send next step to all active enrollments); `GET /api/drip/unsubscribe` (public — unsubscribe link)

**Supply:** `GET/POST/PATCH /api/supply/crates`, `GET/POST/PATCH /api/supply/inventory`

**Subcontractors:** `GET/POST /api/subcontractors`, `PATCH /api/subcontractors/[id]`

**Intake:** `GET/PATCH /api/intake`

**Zelle:** `POST /api/zelle` — triggers Gmail sync for Zelle payments

**Help:** `POST /api/help` — Claude-powered help chat endpoint

**MCP:** `GET /api/mcp` — public MCP server endpoint (tool registry for AI agents)

**Webhooks (Clerk):** `POST /api/webhooks/clerk` — user.created/updated/deleted events, verified with svix

**Admin special routes:** `GET/POST /api/admin/staff`, `POST /api/admin/staff/invite`; `GET/POST/PATCH /api/admin/services`; `GET/PATCH /api/admin/users`; `POST /api/admin/memberships`; `GET/POST /api/admin/estates`, `PATCH /api/admin/estates/[id]`; `POST /api/admin/routing-rules/apply` (bulk apply routing rules to items); `POST /api/admin/calendar-auth`, `GET /api/admin/calendar-auth/callback`

**Storefront (public — x-storefront-api-key auth):**
- `GET /api/storefront/items` — items where `PrimaryRoute="ProFoundFinds Consignment"` AND `StorefrontActive=true`
- `GET /api/storefront/items/[id]` — single item by ID or `onlineListingSlug`
- `POST /api/storefront/items/[id]/reserve` — set status=Reserved, return `{reservedUntil}`
- `POST /api/storefront/items/[id]/unreserve` — set status back to Listed
- `GET /api/storefront/items/reserved` — items with status=Reserved (for cron cleanup)
- `POST /api/storefront/sale` — mark item Sold, create ItemSaleEvent, ping storefront webhook. Has 3 retry attempts. On total failure, writes to FailedSaleSync table.
- `GET /api/storefront/estates` — Active/Upcoming estates
- `GET /api/storefront/estates/[slug]` — estate + items with Dutch prices computed
- `POST /api/storefront/webhook/item-updated` — invalidates ProFound Finds ISR cache (verified by `x-webhook-secret`)

---

### Step 21: Key Page Patterns

**Protected pages (server components):**
```tsx
// app/(protected)/[page]/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function PageName({ searchParams }: { searchParams: Promise<{tenantId?: string}> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { tenantId } = await searchParams;
  // fetch data server-side
  return <PageClient data={data} />;
}
```

**Client components:** placed in same directory, named `PageClient.tsx` or `PageNameClient.tsx`. Use `"use client"` directive. Handle state, filtering, modals, and user interactions.

**Home page routing logic:**
- `TTTSales` role → redirect to `/crm`
- `TTTStaff`/`TTTManager`/`TTTAdmin` without `?tenantId=` → show time tracker + project list
- Client users (Owner/Collaborator/Viewer) → show their project(s) with plan, catalog summary, vendors

**Admin pages:** All under `/admin/`, use `AdminHeader` component with dark theme. Check `isTTTAdmin(userId)` and redirect to `/home` if not admin.

---

### Step 22: Admin Header Component

```tsx
// app/admin/components/AdminHeader.tsx
"use client";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

type AdminTab = "projects" | "users" | "local-vendors" | "routing-rules" | "bulk-upload" |
  "contract-services" | "invoicing" | "expenses" | "drips" | "pfinventory" | "fb" | "ebay" |
  "crm" | "ops" | "estates" | "pay";

const NAV_LINKS = [
  { tab: "projects",          label: "Home",      href: "/admin" },
  { tab: "users",             label: "Users",     href: "/admin/users" },
  { tab: "local-vendors",     label: "Vendors",   href: "/admin/local-vendors" },
  { tab: "routing-rules",     label: "Routing",   href: "/admin/routing-rules" },
  { tab: "bulk-upload",       label: "CSVs",      href: "/admin/integrations/circle-hand" },
  { tab: "contract-services", label: "Contracts", href: "/admin/contract-services" },
  { tab: "invoicing",         label: "Invoicing", href: "/admin/invoicing" },
  { tab: "expenses",          label: "Expenses",  href: "/admin/expenses" },
  { tab: "drips",             label: "Drips",     href: "/admin/drips" },
  { tab: "pfinventory",       label: "PF",        href: "/admin/pfinventory" },
  { tab: "fb",                label: "FB",        href: "/admin/fb" },
  { tab: "ebay",              label: "eBay",      href: "/admin/ebay" },
  { tab: "crm",               label: "CRM",       href: "/admin/crm" },
  { tab: "ops",               label: "Ops",       href: "/admin/ops" },
  { tab: "estates",           label: "Estates",   href: "/admin/estates" },
  { tab: "pay",               label: "Pay",       href: "/admin/pay" },
];
// Dark header: bg-gray-900 border-b border-gray-800
// Active tab: bg-gray-800 text-white, inactive: text-gray-400 hover:text-white hover:bg-gray-800
// Include "TTT Admin" badge and UserButton on the right side
```

---

### Step 23: Admin Inventory Pages (PF, FB, eBay)

All three inventory admin pages share the same dark-theme data table pattern:

```tsx
// Dark theme: bg-gray-900 text-gray-100
// Summary chips at top: count by status
// Filters: Status (All/Listed/Approved/Sold/Partially Sold), Route, Category, Search, Sort
// Table columns: Image thumbnail | Title | Status badge | Route badge | Qty cell | Price | Actions

// Multi-quantity Qty cell:
{(() => {
  const sold = item.quantitySold ?? 0;
  const remaining = item.quantity ?? 1;
  if (sold > 0) {
    const total = sold + remaining;
    const allSold = remaining === 0;
    return (
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-1">
          <span className={`text-xs font-bold tabular-nums ${allSold ? "text-green-400" : "text-amber-400"}`}>
            {sold}/{total}
          </span>
          <span className="text-[9px] text-gray-500">sold</span>
        </div>
        <div className="w-10 h-0.5 rounded-full bg-gray-700 overflow-hidden">
          <div className={`h-full rounded-full ${allSold ? "bg-green-400" : "bg-amber-400"}`}
               style={{ width: `${(sold / total) * 100}%` }} />
        </div>
      </div>
    );
  }
  return <EditCell value={remaining} type="number" onSave={...} />;
})()}

// "Partially Sold" filter = quantitySold > 0 && quantity > 0
// Inline editing: click cells to edit price, notes, quantity, status
```

---

### Step 24: Admin Pay Page

Four tabs: **Hours | Commission | Mileage | Expenses** (plus **Travel** tab for travel time reimbursement).

Each tab: date range filter (default: first day of current month → today), staff dropdown, paid/unpaid toggle, sortable table with checkboxes, bulk "Mark as Paid" button, 25-per-page pagination.

- **Hours tab:** Date | Staff | Project | Focus Area | Hours | Rate | Pay | Paid?
- **Commission tab:** Item | Route | Staff | Sale Date | Sale Price | Comm% | Comm$ | Paid?
- **Mileage tab:** Date | Staff | Total Miles | -20 Deduction | Reimbursable Miles | $ Amount | Paid?
- **Travel tab:** Date | Staff | Project | Total Travel Min | Commute (30 min) | Payable Min | $ Amount | Paid?
- **Expenses tab:** Date | Staff | Vendor | Category | Amount | Reimbursable | Paid?

---

### Step 25: My Pay Section (Home Page)

```tsx
// app/(protected)/home/MyPaySection.tsx — client component
// Stat cards: Hours Worked | Hourly Pay | Commission Earned |
//             Reimbursable Miles | Reimbursable Expenses | Total Pre-Tax Pay
// Date range: first day of current month → today (adjustable)
// Accordion with line items table
// Mobile: card layout (type badge + amount, project + date below)
// Desktop: 5-col grid: Date | Type | Project | Hours | Amount
// Fetches: GET /api/pay/summary?from=&to=&clerkUserId=
```

---

---

## PROFOUND FINDS — FULL RECONSTRUCTION GUIDE

### Step 1: Initialize the Project

```bash
npx create-next-app@latest profoundfinds --typescript --tailwind --app --src-dir=no
cd profoundfinds
npm install \
  @stripe/react-stripe-js \
  @stripe/stripe-js \
  @upstash/redis \
  resend \
  stripe \
  tailwind-merge \
  clsx
```

---

### Step 2: `tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./context/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sage:     { DEFAULT: "#7A9E7E", dark: "#4A6B4E", tint: "#EAF0EA" },
        cream:    "#FAF8F5",
        charcoal: "#2C2C2C",
        gold:     "#B8960C",
      },
      fontFamily: {
        serif: ["var(--font-cormorant)", "Georgia", "serif"],
        sans:  ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

---

### Step 3: `app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartDrawer } from "@/components/layout/CartDrawer";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300","400","500","600","700"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "ProFound Finds — Luxury Consignment",
  description: "Supporting Seniors by rehoming their unique furniture and decor. Discover remarkable pieces that blend luxury with sustainability.",
  openGraph: {
    title: "ProFound Finds",
    description: "Luxury consignment from senior estates in Chicago.",
    siteName: "ProFound Finds",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`}>
      <body className="min-h-screen flex flex-col bg-cream text-charcoal antialiased">
        <CartProvider>
          <Header />
          <CartDrawer />
          <main className="flex-1">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
```

---

### Step 4: `next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
};

export default nextConfig;
```

---

### Step 5: `vercel.json` — Daily Cron for Reservation Cleanup

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-reservations",
      "schedule": "0 9 * * *"
    }
  ]
}
```

---

### Step 6: `lib/types.ts`

```typescript
export interface StorefrontItem {
  id: string;
  itemName: string;
  slug: string;           // onlineListingSlug or id as fallback
  category: string;
  condition: "Excellent" | "Good" | "Fair" | "Poor" | "For Parts";
  conditionNotes: string;
  description: string;    // mapped from listingDescriptionEbay
  listingPrice: number;   // mapped from valueMid
  photos: { url: string; publicId: string }[];
  status: "Listed" | "Reserved" | "Sold";
  clientCity?: string;
  pickupLocation?: string;  // "Lincoln Park", "River North", "ProFound Finds HQ"
  storefrontActive: boolean;
  createdAt: string;
  estateSaleSlug?: string;
}

export interface StorefrontEstate {
  id: string; name: string; slug: string; description: string;
  status: "Upcoming" | "Active" | "Closed";
  saleType: "Online" | "In-Person";
  saleStartDate: string; saleEndDate: string;
  dropIntervalHours: number; dropPercent: number; floorPercent: number;
  pickupAddress: string; pickupWindowStart: string; pickupWindowEnd: string;
  shippingAvailable: boolean; shippingNotes: string; terms: string;
  contactEmail: string; contactPhone: string; cityRegion: string;
  featuredImageUrl: string; itemCount: number;
}

export interface EstateStorefrontItem extends StorefrontItem {
  currentPrice: number; startingPrice: number;
  nextDropAt: string | null; atFloor: boolean;
}

export interface CartItem {
  item: StorefrontItem; sessionId: string; reservedUntil: string;
}

export interface CheckoutFormData { name: string; email: string; phone: string; }

export interface ReservationRecord { itemId: string; sessionId: string; reservedUntil: string; }
```

---

### Step 7: `lib/dutch-auction.ts`

```typescript
import type { StorefrontEstate } from "./types";

export interface DutchPricing {
  currentPrice: number; startingPrice: number; nextDropAt: string | null; atFloor: boolean;
}

export function computeDutchPrice(
  startingPrice: number,
  estate: Pick<StorefrontEstate, "saleStartDate" | "dropIntervalHours" | "dropPercent" | "floorPercent">,
  nowMs: number
): DutchPricing {
  const saleStart = new Date(estate.saleStartDate).getTime();
  const intervalMs = estate.dropIntervalHours * 3_600_000;
  const dropFactor = 1 - estate.dropPercent / 100;
  const floorPrice = Math.round(startingPrice * (estate.floorPercent / 100) * 100) / 100;

  let currentPrice = startingPrice;
  let atFloor = false;
  let nextDropAt: string | null = null;

  if (nowMs >= saleStart && intervalMs > 0) {
    const n = Math.floor((nowMs - saleStart) / intervalMs);
    const raw = startingPrice * Math.pow(dropFactor, n);
    currentPrice = Math.max(Math.round(raw * 100) / 100, floorPrice);
    atFloor = currentPrice <= floorPrice;
    if (!atFloor) nextDropAt = new Date(saleStart + (n + 1) * intervalMs).toISOString();
  } else if (nowMs < saleStart) {
    nextDropAt = new Date(saleStart).toISOString();
  }

  return { currentPrice, startingPrice, nextDropAt, atFloor };
}
```

---

### Step 8: `lib/kv.ts` — Upstash Redis Reservations

```typescript
import { Redis } from "@upstash/redis";
import type { ReservationRecord } from "./types";

const TTL = 900; // 15 minutes

function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set");
  return new Redis({ url, token });
}

export async function createReservation(itemId: string, sessionId: string): Promise<ReservationRecord> {
  const reservedUntil = new Date(Date.now() + TTL * 1000).toISOString();
  const record: ReservationRecord = { itemId, sessionId, reservedUntil };
  await getRedis().set(`reservation:${itemId}`, record, { ex: TTL });
  return record;
}

export async function getReservation(itemId: string): Promise<ReservationRecord | null> {
  return getRedis().get<ReservationRecord>(`reservation:${itemId}`);
}

export async function deleteReservation(itemId: string): Promise<void> {
  await getRedis().del(`reservation:${itemId}`);
}
```

---

### Step 9: `lib/rightsize.ts` — Rightsize API Integration

```typescript
import type { StorefrontItem, StorefrontEstate, EstateStorefrontItem } from "./types";

const API_URL = process.env.RIGHTSIZE_API_URL!;
const API_KEY = process.env.RIGHTSIZE_API_KEY!;

// All server-side fetches use:
// headers: { "x-storefront-api-key": API_KEY }
// next: { tags: ["storefront-items"], revalidate: 300 }

// Functions:
// fetchStorefrontItems(): Promise<StorefrontItem[]>
//   GET /api/storefront/items — returns data.items[]
//   Maps: slug = onlineListingSlug || id, description = listingDescriptionEbay, listingPrice = valueMid

// fetchStorefrontItemById(idOrSlug): Promise<StorefrontItem | null>
//   GET /api/storefront/items/[idOrSlug] — returns data.item
//   tags: [`storefront-item-${idOrSlug}`], revalidate: 300

// fetchEstates(type?): Promise<StorefrontEstate[]>
//   GET /api/storefront/estates?type=... — returns data.estates[]
//   tags: ["storefront-estates"], revalidate: 60

// fetchEstateBySlug(slug): Promise<StorefrontEstate | null>
//   GET /api/storefront/estates/[slug] — returns data.estate
//   tags: [`storefront-estate-${slug}`], revalidate: 60

// fetchEstateWithItems(slug): Promise<{estate, items: EstateStorefrontItem[]} | null>
//   GET /api/storefront/estates/[slug] — returns data.estate + data.items (items already have Dutch pricing)

// reserveItem(itemId): Promise<{reservedUntil: string}>
//   POST /api/storefront/items/[itemId]/reserve

// unreserveItem(itemId): Promise<void>
//   POST /api/storefront/items/[itemId]/unreserve

// recordSale(data): Promise<void>
//   POST /api/storefront/sale
//   body: {itemId, stripePaymentIntentId, salePrice, buyerName, buyerEmail}
```

---

### Step 10: `lib/stripe.ts`

```typescript
import Stripe from "stripe";

// IMPORTANT: Do NOT use new Stripe() to create PaymentIntents — the Stripe Node SDK
// has issues in Next.js 15 serverless. Use raw fetch instead.

// Webhook verification uses the SDK's constructEvent (no network call needed):
export const stripe = {
  webhooks: {
    constructEvent: (body: string, sig: string, secret: string) =>
      new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" })
        .webhooks.constructEvent(body, sig, secret),
  },
};

// Payment intent creation via raw fetch:
export async function createPaymentIntent(
  amountCents: number,
  metadata: { itemId: string; itemName: string; buyerName: string; buyerEmail: string }
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const params = new URLSearchParams({
    amount: String(amountCents),
    currency: "usd",
    "payment_method_types[]": "card",
    "metadata[itemId]": metadata.itemId,
    "metadata[itemName]": metadata.itemName,
    "metadata[buyerName]": metadata.buyerName,
    "metadata[buyerEmail]": metadata.buyerEmail,
  });

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2025-02-24.acacia",
    },
    body: params.toString(),
    cache: "no-store",
  });

  const data = await res.json() as { id: string; client_secret: string; error?: { message: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Stripe returned ${res.status}`);
  if (!data.client_secret) throw new Error("No client_secret on PaymentIntent");
  return { clientSecret: data.client_secret, paymentIntentId: data.id };
}
```

---

### Step 11: `lib/utils.ts`

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Chicago combined sales tax: IL (6.25%) + Cook County (1.75%) + Chicago (1.25%) + RTA (1%)
export const CHICAGO_TAX_RATE = 0.1025;

export function calcTax(subtotal: number): number {
  return Math.round(subtotal * CHICAGO_TAX_RATE * 100) / 100;
}

export function cn(...inputs: ClassValue[]): string { return twMerge(clsx(inputs)); }

export function formatPrice(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

export function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

---

### Step 12: `context/CartContext.tsx`

```tsx
"use client";
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { CartItem, StorefrontItem } from "@/lib/types";
import { unreserveItem } from "@/lib/rightsize";

const MAX_CART_ITEMS = 3;

interface CartContextValue {
  items: CartItem[];
  addItem: (item: StorefrontItem, sessionId: string, reservedUntil: string) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
  isInCart: (itemId: string) => boolean;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Auto-remove expired reservations every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setItems(prev => {
        const expired = prev.filter(c => new Date(c.reservedUntil).getTime() <= now);
        if (expired.length === 0) return prev;
        expired.forEach(c => unreserveItem(c.item.id).catch(() => {}));
        return prev.filter(c => new Date(c.reservedUntil).getTime() > now);
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const addItem = useCallback((item: StorefrontItem, sessionId: string, reservedUntil: string) => {
    setItems(prev => {
      if (prev.length >= MAX_CART_ITEMS) return prev;
      if (prev.some(c => c.item.id === item.id)) return prev;
      return [...prev, { item, sessionId, reservedUntil }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems(prev => prev.filter(c => c.item.id !== itemId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);
  const isInCart = useCallback((itemId: string) => items.some(c => c.item.id === itemId), [items]);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, isInCart, isOpen, openCart, closeCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
```

---

### Step 13: App Directory Structure

```
app/
  layout.tsx                    # Root: CartProvider, Header, CartDrawer, Footer, fonts
  page.tsx                      # Home page: Hero, FeaturedItems, BrandStory
  globals.css
  about/                        # About page
  contact/                      # Contact form → /api/contact
  shop/                         # All items grid
    [slug]/                     # Single item PDP (product detail page)
  estate-sales/                 # In-person estate sales listing
    [slug]/                     # Individual in-person estate detail
  onlineestatesales/            # Online estate sales listing (Dutch auction)
    [slug]/                     # Individual online estate with live Dutch auction
  checkout/                     # Checkout flow (multi-step)
  api/
    contact/                    # POST: send contact form email
    storefront/
      items/
        [id]/
          reserve/              # POST: call Rightsize reserve + createReservation in KV
      stripe/
        create-intent/          # POST: verify item, compute Dutch price, create PaymentIntent
        webhook/                # POST: payment_intent.succeeded → recordSale + confirmation email
      webhook/
        item-updated/           # POST: invalidate ISR cache (x-webhook-secret auth)
    cron/
      cleanup-reservations/     # GET: find stale Reserved items, unreserve them
```

---

### Step 14: Storefront Proxy Routes

```typescript
// app/api/storefront/items/[id]/reserve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { reserveItem } from "@/lib/rightsize";
import { createReservation } from "@/lib/kv";

export async function POST(_req: NextRequest, { params }: { params: Promise<{id: string}> }) {
  const { id } = await params;
  const sessionId = crypto.randomUUID();
  try {
    const { reservedUntil } = await reserveItem(id);
    await createReservation(id, sessionId).catch(e => console.error("[reserve] KV error:", e));
    revalidateTag("storefront-items");
    revalidateTag(`storefront-item-${id}`);
    return NextResponse.json({ sessionId, reservedUntil });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.toLowerCase().includes("not available") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
```

---

### Step 15: Stripe Create Intent Route

```typescript
// app/api/storefront/stripe/create-intent/route.ts
// 1. Parse body: { itemIds, buyerName, buyerEmail, submittedPrice? }
// 2. Fetch item from Rightsize (fetchStorefrontItemById)
// 3. Verify item.status is "Listed" or "Reserved" (else 409)
// 4. If item.estateSaleSlug: fetch estate, computeDutchPrice server-side
//    - If submittedPrice differs from server price by > $0.01: return 409 { priceChanged: true, newPrice }
// 5. subtotalCents = Math.round(listingPrice * 100)
//    If subtotalCents < 50: return 422 (no price set)
// 6. taxCents = Math.round(subtotalCents * CHICAGO_TAX_RATE)
// 7. amountCents = subtotalCents + taxCents
// 8. createPaymentIntent(amountCents, { itemId, itemName, buyerName, buyerEmail })
// 9. Return { clientSecret, paymentIntentId, finalPrice: listingPrice }
```

---

### Step 16: Stripe Webhook Route

```typescript
// app/api/storefront/stripe/webhook/route.ts
// 1. Read raw body (req.text())
// 2. Verify: stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
// 3. On payment_intent.succeeded:
//    - Extract itemId, buyerName, buyerEmail from pi.metadata
//    - Call recordSale({ itemId, stripePaymentIntentId: pi.id, salePrice: pi.amount_received/100, buyerName, buyerEmail })
//    - Send confirmation email via Resend
// 4. Return { received: true }
// 5. On recordSale failure: return 500 (so Stripe retries)
//
// Confirmation email (Resend):
//   from: "ProFound Finds <noreply@profoundfinds.com>"
//   Subject: "Purchase Confirmed: {itemName}"
//   Pickup address: 329 W 18th Street, Chicago, IL (Suite 845), 312-600-3016
```

---

### Step 17: Cron Cleanup Route

```typescript
// app/api/cron/cleanup-reservations/route.ts
// 1. Verify Authorization: Bearer {CRON_SECRET}
// 2. GET /api/storefront/items/reserved from Rightsize (returns items with status=Reserved)
// 3. Filter: items where updatedAt < 15 minutes ago (stuck reservations)
// 4. For each: unreserveItem(id), revalidateTag("storefront-items")
// 5. Return { checked: N, reverted: M }
```

---

### Step 18: ISR Cache Invalidation Webhook

```typescript
// app/api/storefront/webhook/item-updated/route.ts
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.STOREFRONT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { itemId } = await req.json();
  revalidateTag("storefront-items");
  if (itemId) revalidateTag(`storefront-item-${itemId}`);
  return NextResponse.json({ revalidated: true });
}
```

---

### Step 19: Dutch Auction Timer Component

```tsx
// components/estate/DutchAuctionTimer.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { formatPrice } from "@/lib/utils";

interface Props {
  nextDropAt: string | null;
  currentPrice: number;
  nextPrice: number;    // currentPrice * (1 - dropPercent/100)
  atFloor: boolean;
}

function msUntil(isoStr: string): number { return Math.max(0, new Date(isoStr).getTime() - Date.now()); }

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h ${String(m).padStart(2,"0")}m`;
  }
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export function DutchAuctionTimer({ nextDropAt, currentPrice, nextPrice, atFloor }: Props) {
  const [timeLeft, setTimeLeft] = useState<number>(nextDropAt ? msUntil(nextDropAt) : 0);
  const [pulse, setPulse] = useState(false);

  const update = useCallback(() => {
    if (!nextDropAt) return;
    const ms = msUntil(nextDropAt);
    setTimeLeft(ms);
    setPulse(ms > 0 && ms < 2 * 3_600_000); // pulse when < 2 hours
  }, [nextDropAt]);

  useEffect(() => {
    update();
    // Refresh every 1s when under 1h, every 30s otherwise
    const interval = timeLeft < 3_600_000 ? 1000 : 30_000;
    const timer = setInterval(update, interval);
    return () => clearInterval(timer);
  }, [update, timeLeft]);

  if (atFloor) {
    return (
      <div className="inline-flex items-center gap-2 text-sm font-sans text-charcoal/60">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Final Price — no further drops
      </div>
    );
  }
  if (!nextDropAt) return null;

  return (
    <div className={`inline-flex items-center gap-2 font-sans text-sm ${pulse ? "animate-pulse" : ""}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-gold" />
      <span style={{ color: "#B8960C" }}>
        Drops to {formatPrice(nextPrice)} in{" "}
        <span className="font-semibold tabular-nums">{formatCountdown(timeLeft)}</span>
      </span>
    </div>
  );
}
```

---

### Step 20: Checkout Flow

```tsx
// app/checkout/CheckoutFlow.tsx — "use client"
// Steps: "info" | "payment" | "done"
//
// Info step: name, email, phone form
//
// Payment step:
//   1. POST /api/storefront/stripe/create-intent with { itemIds: [item.id], buyerName, buyerEmail, submittedPrice? }
//   2. If 409 with priceChanged: show modal "Price dropped to $X — confirm new price?"
//      On confirm: retry with submittedPrice = newPrice
//   3. Load Stripe Elements with clientSecret
//   4. <PaymentElement /> + submit button
//   5. await stripe.confirmPayment({ redirect: "if_required" })
//
// Done step:
//   - clearCart()
//   - Show confirmation with item name and pickup info
//   - "Continue Shopping" link
//
// Cart is limited to 3 items (MAX_CART_ITEMS); single-item checkout is the primary flow
```

---

### Step 21: Layout Components

**`components/layout/Header.tsx`** — Responsive header with:
- ProFound Finds wordmark (Cormorant Garamond, sage color)
- Navigation: Shop | Estate Sales | Online Sales | About | Contact
- Cart icon with item count badge (from `useCart()`)
- Opens `CartDrawer` on cart icon click

**`components/layout/CartDrawer.tsx`** — Slide-in panel from right:
- Lists cart items with thumbnail, name, price, reservation countdown
- Remove button calls `unreserveItem` + `removeItem`
- Checkout button → `/checkout`
- Shows 15-minute reservation expiry countdown

**`components/layout/Footer.tsx`** — Links, address (329 W 18th Street Chicago), social links

**`components/home/Hero.tsx`** — Full-width hero with serif headline, CTA buttons

**`components/home/FeaturedItems.tsx`** — Server component fetching `fetchStorefrontItems()`, displays 3-4 featured items

**`components/home/BrandStory.tsx`** — Mission/brand narrative section

**`components/estate/EstateCard.tsx`** — Card showing estate name, dates, item count, featured image, status badge

**`components/estate/EstateItemCard.tsx`** — Item card for estate sale grid; shows Dutch price, timer, Add to Cart button

**`components/ui/Button.tsx`** — Variants: primary (sage), secondary (outline), ghost

**`components/ui/Badge.tsx`** — Status badges (condition, availability)

**`components/ui/PriceTag.tsx`** — Price display with optional strikethrough

**`components/ui/SectionHeading.tsx`** — Serif heading with optional subtitle

---

### Step 22: Key Pages

**`app/page.tsx`** (Home):
```tsx
// Server component
// import { fetchStorefrontItems } from "@/lib/rightsize"
// Render: <Hero /> <FeaturedItems items={...} /> <BrandStory />
```

**`app/shop/page.tsx`**:
```tsx
// Server component: fetchStorefrontItems() → filter storefrontActive=true, status in Listed/Reserved
// Client filters: category, condition, sort
// Grid of item cards with Add to Cart button
// Add to Cart flow: POST /api/storefront/items/[id]/reserve → addItem() in CartContext
```

**`app/shop/[slug]/page.tsx`** (PDP):
```tsx
// Server component: fetchStorefrontItemById(slug)
// Full-width photo gallery (swipe on mobile)
// Price, condition, description, provenance ("From a [city] home")
// Add to Cart button (reserve + add to cart)
// generateStaticParams: not used (ISR with revalidate tags)
```

**`app/onlineestatesales/page.tsx`**:
```tsx
// fetchEstates("Online") → filter Active/Upcoming
// EstateCard grid with sale status badges
```

**`app/onlineestatesales/[slug]/page.tsx`**:
```tsx
// fetchEstateWithItems(slug) — estate + items with Dutch prices from Rightsize
// Estate header: name, description, pickup info, shipping info
// Item grid: EstateItemCard with DutchAuctionTimer
// Items are server-rendered with initial Dutch prices; timer runs client-side
// Add to Cart uses same reserve flow as shop
```

**`app/estate-sales/page.tsx`** and **`app/estate-sales/[slug]/page.tsx`**:
```tsx
// Same as onlineestatesales but for In-Person estate sales
// No Dutch auction pricing — items show fixed price or TBD
// Shows pickup address, dates, contact info
```

---

---

## CRITICAL BUSINESS RULES & NOTES

### Airtable Base
- **Base ID**: `app5pCCePZGJarcWc`
- **Auth**: Personal Access Token (PAT) — never service accounts
- **Scopes needed**: `data.records:read`, `data.records:write`, `schema.bases:read`
- All tables in one base. Table IDs look like `tblXXXXXXXXXXXXXX` — get from URL when viewing each table.

### Data Model Rules
1. **Storefront items**: Only items where `StorefrontActive = true` AND `PrimaryRoute = "ProFoundFinds Consignment"` appear on ProFound Finds storefront.
2. **Estate Sale items**: Items with `EstateSaleId` set are linked to an Estate. Dutch prices are computed at request time from `valueMid` + estate settings.
3. **Item quantity**: `quantity` = remaining units available. `quantitySold` = cumulative sold. Total = `quantity + quantitySold`. A "Partially Sold" item has `quantitySold > 0 AND quantity > 0`.
4. **Item photos**: Stored as `Photos` field (JSON text blob): `[{url, publicId}]`. Index 0 is the primary photo.
5. **AI analysis**: `primary_route` returned by Claude is NEVER "Estate Sale" — that route is TTT-assigned only, never AI-assigned.

### Payroll Rules
6. **Mileage deduction**: 20 miles per day per staff member before reimbursement begins. Calculated in `calcReimbursableMiles()`.
7. **Travel time deduction**: First 30 minutes per time entry = commute (unpaid). Beyond 30 = payable at hourly rate. Calculated in `calcPayableTravelTime()`.
8. **Commission**: Applies only to Sold items with `StaffSellerId` set and `PrimaryRoute` in FB/Marketplace or Online Marketplace. Rate = `StaffCommissionPercent` field.
9. **Consignor payout**: `SalePrice × (ClientSharePercent / 100)`. Stored as `ConsignorPayout` on the item.

### Dutch Auction Rules
10. **Price formula**: `currentPrice = startingPrice × (1 - dropPercent/100)^n` where `n = floor((now - saleStart) / intervalMs)`.
11. **Floor price**: `startingPrice × (floorPercent / 100)`. Price never drops below floor.
12. **Server-side validation**: Dutch prices are ALWAYS recomputed server-side at checkout (`/api/storefront/stripe/create-intent`) to prevent price manipulation.
13. **Price change handling**: If server-computed price differs from client-submitted price by more than $0.01, return HTTP 409 with `{priceChanged: true, newPrice}`. Client must confirm new price before proceeding.

### Reservation Rules
14. **Reservation TTL**: 15 minutes (900 seconds). Stored in both Airtable (`Status = "Reserved"`) and Upstash Redis KV (TTL key).
15. **Dual storage**: Airtable status is the source of truth. KV is used for efficient TTL expiry. Cron job checks Airtable directly for stale Reserved items.
16. **Client polling**: CartContext polls every 10 seconds. When `reservedUntil` passes, calls `unreserveItem` and removes from cart.
17. **Cron schedule**: `0 9 * * *` (daily at 9 AM UTC) — catches any items stuck in Reserved state that weren't cleaned up by client polling.

### Tax
18. **Chicago combined sales tax**: 10.25% total (IL state 6.25% + Cook County 1.75% + Chicago city 1.25% + RTA 1%). Constant `CHICAGO_TAX_RATE = 0.1025` in `lib/utils.ts`.

### Routing Logic
19. **Routing rules**: Priority order (lower number = higher priority). First matching active rule wins. Applied via `/api/admin/routing-rules/apply` which bulk-updates items.
20. **Rule matching criteria**: Category, SizeClass, FragilityLevel (comma-separated match lists, blank = any), minCondition, minValueMid, maxValueMid (0 = no limit).

### Invites
21. **Client invites**: HMAC-signed tokens with 7-day expiry. No database storage needed — self-validating.
22. **Staff invites**: Admin creates StaffRole record, then sends Clerk invitation email with `signInUrl`. Handled by `/api/admin/staff/invite`.

### Square Integration
23. **Square catalog**: Items synced by barcode number (SKU). Upsert via `/v2/catalog/object`.
24. **Webhook verification**: `x-square-hmacsha256-signature` header, HMAC-SHA256 of raw body with `SQUARE_WEBHOOK_SIGNATURE_KEY`.
25. **Square sales**: `payment.created` webhook → find item by SKU → create ItemSaleEvent + update Item to Sold.

### Sale Recording
26. **Retry logic**: `/api/storefront/sale` retries 3 times on failure (500ms, 1000ms, 1500ms delays). On all-retry failure, writes to `FailedSaleSync` table for manual recovery.
27. **Post-sale webhook**: After recording sale, Rightsize pings ProFound Finds at `/api/storefront/webhook/item-updated` to invalidate ISR cache. Verified by `x-webhook-secret` header.

### Multi-tenant Access Control
28. **Client access**: Clients see only their own tenant's data. Access checked via Memberships table.
29. **TTT Staff**: Can view/edit all tenants. Role stored in StaffRoles table.
30. **TTTAdmin**: Full access everywhere. IDs in `TTT_ADMIN_USER_IDS` env var (comma-separated Clerk user IDs).
31. **TTTSales**: Limited to CRM only. Redirected to `/crm` from home page.
32. **LocalVendor users**: Access vendor portal at `/vendor/[vendorId]`. Role determined by `ClerkUserId` field on LocalVendor record.

### PDF Generation
33. **`@react-pdf/renderer` must be in `serverExternalPackages`** in `next.config.ts` (along with all its sub-packages). Otherwise Next.js bundler breaks it.
34. **PDF rendering**: Use `renderToBuffer(<Document />)` in API routes. Return with `Content-Type: application/pdf`.
35. **Barcode labels**: Use `bwip-js` to generate barcode PNG as base64 data URL, embed in PDF as `<Image>`.

---

## ENVIRONMENT VARIABLES CHECKLIST

### Rightsize (`.env.local`)

```bash
# ── Airtable ──────────────────────────────────────────────────────────────────
AIRTABLE_API_TOKEN=pat...
AIRTABLE_BASE_ID=app5pCCePZGJarcWc

# Table IDs (get from Airtable URL when viewing each table)
AIRTABLE_TENANTS_TABLE=tbl...
AIRTABLE_USERS_TABLE=tbl...
AIRTABLE_MEMBERSHIPS_TABLE=tbl...
AIRTABLE_ROOMS_TABLE=tbl...
AIRTABLE_ITEMS_TABLE=tbl...
AIRTABLE_PLAN_ENTRIES_TABLE=tbl...
AIRTABLE_VENDORS_TABLE=tbl...
AIRTABLE_LOCAL_VENDORS_TABLE=tbl...
AIRTABLE_FILES_TABLE=tbl...
TIME_ENTRIES_TABLE_ID=tbl...
STAFF_ROLES_TABLE_ID=tbl...
AIRTABLE_ROUTING_RULES_TABLE=tbl...
AIRTABLE_CONTRACT_SETTINGS_TABLE=tbl...
AIRTABLE_CONTRACT_TEMPLATES_TABLE=tbl...
AIRTABLE_CONTRACTS_TABLE=tbl...
AIRTABLE_CRM_COMPANIES_TABLE=tbl...
AIRTABLE_CRM_CONTACTS_TABLE=tbl...
AIRTABLE_CRM_CLIENT_CONTACTS_TABLE=tbl...
AIRTABLE_CRM_OPPORTUNITIES_TABLE=tbl...
AIRTABLE_CRM_ACTIVITIES_TABLE=tbl...
AIRTABLE_GMAIL_TOKENS_TABLE=tbl...
AIRTABLE_SERVICES_TABLE=tbl...
QBO_TOKENS_TABLE_ID=tbl...
AIRTABLE_INVOICES_TABLE=tbl...
AIRTABLE_INVOICE_SETTINGS_TABLE=tbl...
AIRTABLE_EXPENSES_TABLE=tbl...
AIRTABLE_DRIP_CAMPAIGNS_TABLE=tbl...
AIRTABLE_DRIP_ENROLLMENTS_TABLE=tbl...
AIRTABLE_DRIP_SETTINGS_TABLE=tbl...
AIRTABLE_ITEM_SALE_EVENTS_TABLE=tbl...
AIRTABLE_SUPPLY_CRATE_LOCATIONS_TABLE=tbl...
AIRTABLE_SUPPLY_INVENTORY_TABLE=tbl...
AIRTABLE_SUBCONTRACTORS_TABLE=tbl...
AIRTABLE_FAILED_SALE_SYNC_TABLE=tbl...
AIRTABLE_ESTATES_TABLE=tbl...

# ── Clerk Auth ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
CLERK_WEBHOOK_SECRET=whsec_...  # For /api/webhooks/clerk (Svix verification)

# ── TTT Access Control ────────────────────────────────────────────────────────
TTT_ADMIN_USER_IDS=user_abc,user_def        # Comma-separated Clerk user IDs
TTT_STAFF_USER_IDS=user_ghi,user_jkl        # Comma-separated Clerk user IDs

# ── Anthropic / Claude ────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── Cloudinary ────────────────────────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# ── Resend Email ──────────────────────────────────────────────────────────────
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=no-reply@toptiertransitions.com

# ── Square ────────────────────────────────────────────────────────────────────
SQUARE_ACCESS_TOKEN=...
SQUARE_ENVIRONMENT=production         # or "sandbox"
SQUARE_WEBHOOK_SIGNATURE_KEY=...      # From Square developer dashboard
SQUARE_LOCATION_ID=...

# ── QuickBooks Online ─────────────────────────────────────────────────────────
QBO_CLIENT_ID=...
QBO_CLIENT_SECRET=...
QBO_REDIRECT_URI=https://app.toptiertransitions.com/api/qbo/callback
QBO_ENVIRONMENT=production            # or "sandbox"

# ── Google (Calendar + Gmail CRM) ─────────────────────────────────────────────
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_REFRESH_TOKEN=...     # Fallback if no token stored in Airtable
GOOGLE_REDIRECT_URI=https://app.toptiertransitions.com/api/admin/calendar-auth/callback

# Separate OAuth client for Gmail CRM sync:
GOOGLE_CRM_CLIENT_ID=...
GOOGLE_CRM_CLIENT_SECRET=...

# ── Remove.bg ─────────────────────────────────────────────────────────────────
REMOVE_BG_API_KEY=...

# ── Invite System ─────────────────────────────────────────────────────────────
INVITE_SECRET=...                     # Random secret for HMAC invite tokens

# ── Storefront (ProFound Finds integration) ───────────────────────────────────
STOREFRONT_API_KEY=...                # Shared secret — must match RIGHTSIZE_API_KEY in profoundfinds
STOREFRONT_WEBHOOK_SECRET=...         # For /api/storefront/webhook/item-updated verification
STOREFRONT_URL=https://www.profoundfinds.com

# ── App URL ───────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://app.toptiertransitions.com
```

### ProFound Finds (`.env.local`)

```bash
# ── Rightsize API ─────────────────────────────────────────────────────────────
RIGHTSIZE_API_URL=https://app.toptiertransitions.com
RIGHTSIZE_API_KEY=...                 # Must match STOREFRONT_API_KEY in Rightsize

# ── Stripe ────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...       # From Stripe dashboard webhook endpoint

# ── Upstash Redis (item reservations) ────────────────────────────────────────
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# ── Resend Email ──────────────────────────────────────────────────────────────
RESEND_API_KEY=re_...

# ── Cron Security ─────────────────────────────────────────────────────────────
CRON_SECRET=...                       # Vercel Cron sends this in Authorization: Bearer header

# ── Storefront Webhook ────────────────────────────────────────────────────────
STOREFRONT_WEBHOOK_SECRET=...         # Must match STOREFRONT_WEBHOOK_SECRET in Rightsize
```

---

## FINAL BUILD & DEPLOY CHECKLIST

### Rightsize
```bash
cd /Users/mattkamhi/rightsize
npx next build
# Fix any TypeScript errors before deploying
# Deploy to Vercel (auto-deploy from main branch)
```

### ProFound Finds
```bash
cd /Users/mattkamhi/profoundfinds
npx next build
# If memory issues: NODE_OPTIONS="--max-old-space-size=4096" npx next build
# Deploy to Vercel (auto-deploy from main branch)
```

### Post-Deploy Steps
1. Set all environment variables in Vercel dashboard for each project
2. Configure Stripe webhook endpoint: `https://www.profoundfinds.com/api/storefront/stripe/webhook`
   - Events to listen for: `payment_intent.succeeded`
3. Configure Square webhook: `https://app.toptiertransitions.com/api/square/webhook`
   - Events: `payment.created`
4. Configure Clerk webhook: `https://app.toptiertransitions.com/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`
5. Verify Vercel Cron is enabled for ProFound Finds (daily cleanup at 9 AM UTC)
6. Test end-to-end: add item to cart → checkout → verify Airtable + Stripe + email

---

*Generated March 26, 2026. Both apps build successfully with `npx next build`. Airtable base `app5pCCePZGJarcWc` contains live data.*
