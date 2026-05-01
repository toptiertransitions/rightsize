# Claude Code Reconstruction Prompt
## Rightsize by Top Tier + ProFound Finds
### Date: April 29, 2026

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
  notInScopeDefault?: string;  // default "not in scope" disclaimer text for contracts
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
  notInScope?: string;  // per-contract "not in scope" text shown in PDF
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
  PROJECT_NOTES:         process.env.AIRTABLE_PROJECT_NOTES_TABLE      || "ProjectNotes",
  NOTE_COMMENTS:         process.env.AIRTABLE_NOTE_COMMENTS_TABLE      || "NoteComments",
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

**Contracts:** `getContractsForTenant(tenantId)`, `getContractById(id)`, `getContractByToken(token)`, `createContract(data)`, `updateContract(id, data)`. The `signToken` is a UUID stored in Airtable as `SignToken`. The `NotInScope` field is a text blob stored on the contract record.

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

### Step 7: `lib/airtable-notes.ts` — Internal Notes CRUD

NEW: This module handles the TTT-staff-only internal notes board on the /plan page. Two Airtable tables: `ProjectNotes` and `NoteComments`.

```typescript
import Airtable from "airtable";

export interface ProjectNote {
  id: string;           // Airtable record ID
  tenantId: string;
  content: string;
  authorClerkId: string;
  authorName: string;
  authorPhotoUrl?: string;
  createdAt: string;
  comments: NoteComment[];
}

export interface NoteComment {
  id: string;           // Airtable record ID
  noteId: string;       // the ProjectNote record ID
  content: string;
  authorClerkId: string;
  authorName: string;
  authorPhotoUrl?: string;
  createdAt: string;
}

function getBase() {
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_TOKEN! });
  return Airtable.base(process.env.AIRTABLE_BASE_ID!);
}

const NOTES_TABLE    = process.env.AIRTABLE_PROJECT_NOTES_TABLE   || "ProjectNotes";
const COMMENTS_TABLE = process.env.AIRTABLE_NOTE_COMMENTS_TABLE   || "NoteComments";

// getProjectNotes(tenantId): fetches all notes for a tenant (newest first) plus their comments.
// Two Airtable API calls:
//   1. filter notes: {TenantId} = "tenantId", sort by CreatedAt desc
//   2. if notes exist, filter comments: OR({NoteRecordId}="id1",{NoteRecordId}="id2",...)
//      sort by CreatedAt asc (oldest comment first)
// Returns notes with comments nested.

export async function getProjectNotes(tenantId: string): Promise<ProjectNote[]> {
  const base = getBase();
  const noteRecords = await base(NOTES_TABLE)
    .select({ filterByFormula: `{TenantId} = "${tenantId}"`, sort: [{ field: "CreatedAt", direction: "desc" }] })
    .all();

  const notes: ProjectNote[] = noteRecords.map(r => ({
    id: r.id,
    tenantId: String(r.fields["TenantId"] ?? ""),
    content: String(r.fields["Content"] ?? ""),
    authorClerkId: String(r.fields["AuthorClerkId"] ?? ""),
    authorName: String(r.fields["AuthorName"] ?? ""),
    authorPhotoUrl: r.fields["AuthorPhotoUrl"] ? String(r.fields["AuthorPhotoUrl"]) : undefined,
    createdAt: String(r.fields["CreatedAt"] ?? new Date().toISOString()),
    comments: [],
  }));

  if (notes.length === 0) return notes;

  const idFilter = notes.map(n => `{NoteRecordId} = "${n.id}"`).join(",");
  const commentRecords = await base(COMMENTS_TABLE)
    .select({ filterByFormula: `OR(${idFilter})`, sort: [{ field: "CreatedAt", direction: "asc" }] })
    .all();

  const commentsByNote = new Map<string, NoteComment[]>();
  for (const r of commentRecords) {
    const noteId = String(r.fields["NoteRecordId"] ?? "");
    const comment: NoteComment = {
      id: r.id,
      noteId,
      content: String(r.fields["Content"] ?? ""),
      authorClerkId: String(r.fields["AuthorClerkId"] ?? ""),
      authorName: String(r.fields["AuthorName"] ?? ""),
      authorPhotoUrl: r.fields["AuthorPhotoUrl"] ? String(r.fields["AuthorPhotoUrl"]) : undefined,
      createdAt: String(r.fields["CreatedAt"] ?? new Date().toISOString()),
    };
    const arr = commentsByNote.get(noteId) ?? [];
    arr.push(comment);
    commentsByNote.set(noteId, arr);
  }

  return notes.map(n => ({ ...n, comments: commentsByNote.get(n.id) ?? [] }));
}

// createProjectNote: creates a note record.
// Airtable fields: TenantId, Content, AuthorClerkId, AuthorName, AuthorPhotoUrl, CreatedAt
export async function createProjectNote(data: {
  tenantId: string; content: string; authorClerkId: string;
  authorName: string; authorPhotoUrl?: string;
}): Promise<ProjectNote> {
  const base = getBase();
  const createdAt = new Date().toISOString();
  const r = await base(NOTES_TABLE).create({
    TenantId: data.tenantId,
    Content: data.content,
    AuthorClerkId: data.authorClerkId,
    AuthorName: data.authorName,
    AuthorPhotoUrl: data.authorPhotoUrl ?? "",
    CreatedAt: createdAt,
  });
  return {
    id: r.id, tenantId: data.tenantId, content: data.content,
    authorClerkId: data.authorClerkId, authorName: data.authorName,
    authorPhotoUrl: data.authorPhotoUrl, createdAt, comments: [],
  };
}

// createNoteComment: creates a comment linked to a note record.
// Airtable fields: NoteRecordId, Content, AuthorClerkId, AuthorName, AuthorPhotoUrl, CreatedAt
export async function createNoteComment(data: {
  noteId: string; content: string; authorClerkId: string;
  authorName: string; authorPhotoUrl?: string;
}): Promise<NoteComment> {
  const base = getBase();
  const createdAt = new Date().toISOString();
  const r = await base(COMMENTS_TABLE).create({
    NoteRecordId: data.noteId,
    Content: data.content,
    AuthorClerkId: data.authorClerkId,
    AuthorName: data.authorName,
    AuthorPhotoUrl: data.authorPhotoUrl ?? "",
    CreatedAt: createdAt,
  });
  return {
    id: r.id, noteId: data.noteId, content: data.content,
    authorClerkId: data.authorClerkId, authorName: data.authorName,
    authorPhotoUrl: data.authorPhotoUrl, createdAt,
  };
}

// deleteProjectNote: deletes the note and all its comments (cascade).
export async function deleteProjectNote(noteId: string): Promise<void> {
  const base = getBase();
  const comments = await base(COMMENTS_TABLE)
    .select({ filterByFormula: `{NoteRecordId} = "${noteId}"` })
    .all();
  for (const c of comments) await base(COMMENTS_TABLE).destroy(c.id);
  await base(NOTES_TABLE).destroy(noteId);
}
```

---

### Step 8: `lib/anthropic.ts`

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

### Step 9: `lib/estate-utils.ts` — Dutch Auction

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

### Step 10: `lib/pay-utils.ts` — Payroll Calculations

```typescript
import type { TimeEntry } from "./types";

// Travel time: 30 minutes per entry = commute (unpaid). Beyond 30 = payable.
export function calcPayableTravelTime(entries: TimeEntry[]) { ... }

// Mileage: 20-mile daily deduction per staff member before reimbursement.
export function calcReimbursableMiles(entries: TimeEntry[]) { ... }
```

(See original for full implementation — logic unchanged from March 26 version.)

---

### Step 11: `lib/cloudinary.ts`

```typescript
import { v2 as cloudinary } from "cloudinary";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// uploadImage: accepts string (URL or base64) or Buffer
// uploadFile: for PDFs/raw files — uses resource_type "raw"
// uploadPng: for processed PNG buffers
// deleteImage(publicId), deleteFile(publicId, resourceType)
// getOptimizedUrl(publicId, {width?, height?})

// IMPORTANT: Do NOT use cloudinary.utils.private_download_url() for serving PDFs
// uploaded with the default type="upload". That API only works for type="private"
// resources and returns 404 for type="upload" assets.
// For proof-of-payment PDFs: regenerate on-demand via /api/sales/payout-pdf with
// viewOnly=true rather than trying to re-fetch from Cloudinary storage.
```

---

### Step 12: `lib/invites.ts`

HMAC-based invite tokens (no DB storage needed — self-contained):

```typescript
import { createHmac, timingSafeEqual } from "crypto";
import type { UserRole } from "./types";

export type InviteRole = Extract<UserRole, "Collaborator" | "Viewer" | "Owner">;

// Token format: base64url(JSON(payload)).base64url(HMAC-SHA256(payload, INVITE_SECRET))
// Expiry: 7 days

export function createTenantInviteToken(tenantId: string, role: InviteRole, invitedBy: string): string
export function createVendorInviteToken(vendorId: string, invitedBy: string): string
export function verifyInviteToken(token: string): TenantInvitePayload | VendorInvitePayload | null
```

---

### Step 13: `lib/square.ts`

Raw fetch against Square REST API v2. No SDK.

```typescript
// squareFetch(path, options): sets Authorization Bearer, Square-Version: 2026-01-22
// findAllSquareItemsBySku(sku), upsertSquareCatalogItem(item), deleteSquareCatalogItem(id)
// validateSquareWebhook(body, signature, webhookKey): HMAC-SHA256 verification
```

---

### Step 14: `lib/qbo.ts` — QuickBooks Online

```typescript
// buildQBOAuthUrl(), exchangeQBOCode(code, realmId), refreshQBOToken()
// qboFetch(path, options): authenticated fetch with auto-refresh
// createQBOInvoice(invoice, tenant, settings), getQBOStatus()
```

---

### Step 15: `lib/googleCalendar.ts`

```typescript
// Uses OAuth2 with refresh token stored in Airtable (CalendarTokens) or env var
// createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getCalendarAvailability
```

---

### Step 16: `lib/gmail.ts`

```typescript
// getGmailAuthUrl(state?), exchangeGmailCode(code, clerkUserId)
// syncGmailForUser(clerkUserId): matches emails against CRM contacts → CRMActivity records
// parseZellePayments(clerkUserId): returns ZellePayment[]
```

---

### Step 17: `lib/email.ts` — Email Templates (Resend)

```typescript
// buildContractSentEmail, buildContractSignedEmail, buildInvoiceEmail
// buildClientWelcomeEmail, buildVendorFileEmail, buildVendorAssignmentEmail
// buildPayoutEmail, buildStaffWelcomeEmail, buildDripEmail, buildTimeOffEmail
// substituteVars(template, vars): replaces {{key}} placeholders
```

---

### Step 18: `lib/remove-bg.ts`

```typescript
export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  // POST to https://api.remove.bg/v1.0/removebg
  // Header: X-Api-Key: process.env.REMOVE_BG_API_KEY
  // Returns PNG buffer
}
```

---

### Step 19: PDF Documents

All use `@react-pdf/renderer`. Create:
- **`lib/contract-pdf.tsx`** — `ContractDocument`: header, services table, total, body, signature
- **`lib/invoice-pdf.tsx`** — `InvoiceDocument`: logo/header, line items, credits, QR codes
- **`lib/movers-pdf.tsx`** — `MoversPdfDocument`: grouped item counts
- **`lib/payout-pdf.tsx`** — `PayoutDocument`: consignment payout summary per project
- **`lib/vendor-pdf.tsx`** — `VendorDocument`: vendor item list with thumbnails
- **`lib/label-pdf.tsx`** — `LabelDocument`: barcode labels via `bwip-js`

---

### Step 20: App Directory Structure

```
app/
  layout.tsx
  page.tsx
  globals.css
  (auth)/
    sign-in/[[...sign-in]]/
    sign-up/[[...sign-up]]/
  (protected)/
    layout.tsx
    home/
    catalog/
      new/
    rooms/
    plan/
      page.tsx                      # Fetches Clerk user profile for all TTTStaff renders
      InternalNotesSection.tsx      # NEW: TTT-staff-only note/comment board (client component)
    vendors/
    vendor/
      not-found/
    sales/
      SalesClient.tsx               # ProofOfPaymentSection uses viewOnly PDF regeneration
      PayoutModal.tsx               # buildPaidLineItems exported for reprint mode
    quoting/
    invoices/
    expenses/
    staff/
    crm/
      drips/
    onboarding/
    help/
  admin/
    page.tsx
    components/
      AdminHeader.tsx
      RoleBreakdown.tsx             # User guide role/feature table
    pay/
    users/
    local-vendors/
    routing-rules/
    contract-services/
    invoicing/
    expenses/
    drips/
    pfinventory/
    fb/
    ebay/
    crm/
    ops/
    estates/
    items/
    integrations/
      circle-hand/
    impersonate/
    migrate/
  api/
  calculator/
  invite/
  sign/[token]/
  pay/[invoiceId]/
```

---

### Step 21: API Routes

All protected API routes check `auth()` first; return 401 if no userId.

**Items:** `GET/POST /api/items`, `PATCH/DELETE /api/items/[id]`, `POST /api/items/movers-pdf`

**Rooms:** `GET/POST /api/rooms`, `PATCH/DELETE /api/rooms/[id]`

**Tenants:** `GET/POST /api/tenants`, `PATCH/DELETE /api/tenants/[id]`, `POST /api/tenants/delete-request`

**Plan:** `GET/POST /api/plan`, `PATCH/DELETE /api/plan/[id]`, `POST /api/plan/calendar`, `GET /api/plan/ttt-users`

**Internal Notes (NEW — TTT staff only):**
- `GET /api/plan/notes?tenantId=` — returns `{notes: ProjectNote[]}`. Requires TTT role.
- `POST /api/plan/notes` — body: `{tenantId, content, authorName, authorPhotoUrl}`. Requires TTT role.
- `DELETE /api/plan/notes/[noteId]` — deletes note and all comments. Requires TTT role.
- `POST /api/plan/notes/[noteId]/comments` — body: `{content, authorName, authorPhotoUrl}`. Requires TTT role.

All four notes routes gate on `TTT_ROLES = ["TTTStaff","TTTManager","TTTAdmin","TTTSales"]` and call `getSystemRole(userId)`.

**Vendors:** `GET/POST /api/vendors`, `PATCH/DELETE /api/vendors/[id]`; `GET/POST/PATCH /api/vendor/decisions`; `GET/PATCH /api/vendor/preferences`; `POST /api/vendor-file`

**Local Vendors:** `GET/POST /api/local-vendors`, `PATCH/DELETE /api/local-vendors/[id]`

**Time Entries:** `GET/POST /api/time-entries`, `PATCH/DELETE /api/time-entries/[id]`

**Expenses:** `GET/POST /api/expenses`, `PATCH/DELETE /api/expenses/[id]`

**Files:** `GET/POST /api/files`, `PATCH/DELETE /api/files/[id]`

**Analyze:** `POST /api/analyze`

**Upload:** `POST /api/upload`

**Remove Background:** `POST /api/remove-background`

**Contracts:** `GET/POST /api/contracts`, `PATCH /api/contracts/[id]`, `GET /api/contracts/[id]/pdf`, `POST /api/contracts/sign`

**Contract Templates:** `GET/POST /api/contract-templates`, `PATCH /api/contract-templates/[id]`

**Contract Settings:** `GET/PATCH /api/contract-settings`

**Invoices:** `GET/POST /api/invoices`, `PATCH /api/invoices/[id]`, `GET /api/invoices/[id]/pdf`

**Invoice Settings:** `GET/PATCH /api/invoice-settings`

**Pay summary:** `GET /api/pay/summary?from=&to=&clerkUserId=`

**Admin Pay:** `GET /api/admin/pay/hours|commission|mileage|expenses`, `POST /api/admin/pay/hours|commission|mileage|expenses` (bulk mark paid)

**PF Inventory:** `GET /api/pfinventory`, `POST /api/pfinventory/labels`

**Sales/Payout:**
- `GET /api/sales` — item sale events for a project
- `POST /api/sales/payout` — mark payouts paid
- `POST /api/sales/payout-pdf` — generate payout PDF. Accepts `viewOnly?: boolean`. When `viewOnly=true`, generates PDF, returns `{pdfBase64}` only (no Cloudinary upload, no Airtable record creation). Normal mode returns `{file, pdfBase64}`. Client uses blob URL (`URL.createObjectURL`) from `pdfBase64` to open PDF in new tab.

**PDF Proxy:** `GET /api/pdf-proxy?url=&publicId=&resourceType=` — fallback proxy for non-payout PDFs. Attempts Cloudinary `private_download_url` when `publicId` provided. NOTE: Basic Auth on CDN URLs (`res.cloudinary.com`) does NOT work — that only works on `api.cloudinary.com`. For proof-of-payment PDFs, use the `viewOnly` regeneration approach instead.

**Sold Items:** `GET /api/sold-items`

**Square:** `GET /api/square/status`, `POST /api/square/sync|sync-sales|cleanup-duplicates|full-reset`, `POST /api/square/webhook`

**QBO:** `GET /api/qbo/status|auth|items`, `GET /api/qbo/callback`, `POST /api/qbo/disconnect|invoice`, `GET/PATCH /api/qbo/service-mapping`

**Availability:** `GET /api/availability?date=&emails=`

**Staff:** `GET /api/staff`, `POST /api/staff/calendar`

**Invites:** `POST /api/invites`, `GET/POST /api/invites/[token]`

**Item Sale Events:** `GET/POST /api/item-sale-events`, `PATCH /api/item-sale-events/[id]`

**CRM:** Full CRUD for companies, contacts, client-contacts, opportunities, activities

**Drip:** Full CRUD + send + unsubscribe

**Supply:** `GET/POST/PATCH /api/supply/crates|inventory`

**Subcontractors:** `GET/POST /api/subcontractors`, `PATCH /api/subcontractors/[id]`

**Intake:** `GET/PATCH /api/intake`

**Zelle:** `POST /api/zelle`

**Help:** `POST /api/help`

**MCP:** `GET /api/mcp`

**Webhooks:** `POST /api/webhooks/clerk`

**Admin special:** `GET/POST /api/admin/staff`, `POST /api/admin/staff/invite`; `GET/POST/PATCH /api/admin/services`; `GET/PATCH /api/admin/users`; `POST /api/admin/memberships`; `GET/POST /api/admin/estates`, `PATCH /api/admin/estates/[id]`; `POST /api/admin/routing-rules/apply`; `POST /api/admin/calendar-auth`, `GET /api/admin/calendar-auth/callback`

**Storefront (public — x-storefront-api-key auth):**
- `GET /api/storefront/items`
- `GET /api/storefront/items/[id]`
- `POST /api/storefront/items/[id]/reserve`
- `POST /api/storefront/items/[id]/unreserve`
- `GET /api/storefront/items/reserved`
- `POST /api/storefront/sale` — 3 retry attempts; on failure writes to FailedSaleSync
- `GET /api/storefront/estates`
- `GET /api/storefront/estates/[slug]`
- `POST /api/storefront/webhook/item-updated`

---

### Step 22: Key Page Patterns

**Protected pages (server components):**
```tsx
export default async function PageName({ searchParams }: { searchParams: Promise<{tenantId?: string}> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { tenantId } = await searchParams;
  return <PageClient data={data} />;
}
```

**Client components:** `"use client"` directive. Handle state, filters, modals, interactions.

**Home page routing:**
- `TTTSales` → redirect to `/crm`
- TTTStaff/Manager/Admin without `?tenantId=` → time tracker + project list
- Client users → their project with plan, catalog summary, vendors

**Admin pages:** dark theme, `isTTTAdmin(userId)` check.

---

### Step 23: Admin Header Component

```tsx
// app/admin/components/AdminHeader.tsx
"use client";
const NAV_LINKS = [
  { tab: "projects", label: "Home", href: "/admin" },
  { tab: "users", label: "Users", href: "/admin/users" },
  // ...all tabs as in original
  { tab: "pay", label: "Pay", href: "/admin/pay" },
];
// Dark header: bg-gray-900 border-b border-gray-800
// Active: bg-gray-800 text-white; inactive: text-gray-400 hover:text-white
// "TTT Admin" badge + UserButton on right
```

---

### Step 24: Internal Notes Section (NEW)

```tsx
// app/(protected)/plan/InternalNotesSection.tsx
// "use client" — rendered only inside isTTTStaffOrAbove guard in plan/page.tsx
//
// Props: { tenantId, currentUserId, currentUserName, currentUserPhoto? }
//
// Sub-components:
//   Avatar({ name, photoUrl, size }) — shows <img> if photoUrl, else initials div
//     (bg-forest-100 text-forest-700, rounded-full)
//   CommentRow({ comment }) — avatar + gray-50 bubble with author, CT timestamp, content
//   NoteCard({ note, currentUserName, currentUserPhoto, onCommentAdded, onNoteDeleted, currentUserId })
//     - isOwn = note.authorClerkId === currentUserId → show hover Delete button
//     - Inline reply: "Add comment" button reveals input + Post/Cancel
//     - Enter key posts; Escape cancels
//     - Comments shown with border-l-2 border-gray-100 thread line
//
// CT timestamp helper:
//   new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago",
//     month:"short", day:"numeric", year:"numeric",
//     hour:"numeric", minute:"2-digit", hour12:true }) + " CT"
//
// Data flow:
//   useEffect → GET /api/plan/notes?tenantId={tenantId} → setNotes
//   handleAddNote → POST /api/plan/notes → prepend to notes list
//   handleCommentAdded(noteId, comment) → map notes, append comment to matching note
//   handleNoteDeleted(noteId) → filter out deleted note
//
// Section header: amber-50 icon, "Internal Notes", "Private — visible to TTT staff only"
// Compose area: textarea (Cmd+Enter to post) + "Post Note" button
// Feed: newest notes first; no notes = dashed border empty state
```

---

### Step 25: Admin Inventory Pages

Dark-theme data table pattern for PF, FB, eBay admin views:

```tsx
// Dark theme: bg-gray-900 text-gray-100
// Summary chips, filters (Status/Route/Category/Search/Sort)
// Multi-quantity cell: shows sold/total progress bar for partial-sold items
// "Partially Sold" = quantitySold > 0 && quantity > 0
// Inline cell editing for price, notes, quantity, status
```

---

### Step 26: Admin Pay Page

Four tabs: Hours | Commission | Mileage | Travel | Expenses. Each: date range, staff dropdown, paid/unpaid toggle, sortable table, bulk Mark as Paid, 25-per-page pagination.

---

### Step 27: My Pay Section

```tsx
// app/(protected)/home/MyPaySection.tsx — client component
// Stat cards: Hours Worked | Hourly Pay | Commission | Reimbursable Miles | Expenses | Total Pre-Tax
// GET /api/pay/summary?from=&to=&clerkUserId=
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
  subsets: ["latin"], weight: ["300","400","500","600","700"],
  variable: "--font-cormorant", display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

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

### Step 5: `vercel.json` — Daily Cron

```json
{
  "crons": [{ "path": "/api/cron/cleanup-reservations", "schedule": "0 9 * * *" }]
}
```

---

### Step 6: `lib/types.ts`

```typescript
export interface StorefrontItem {
  id: string; itemName: string; slug: string; category: string;
  condition: "Excellent" | "Good" | "Fair" | "Poor" | "For Parts";
  conditionNotes: string; description: string; listingPrice: number;
  photos: { url: string; publicId: string }[];
  status: "Listed" | "Reserved" | "Sold";
  clientCity?: string; pickupLocation?: string;
  storefrontActive: boolean; createdAt: string; estateSaleSlug?: string;
}

export interface StorefrontEstate {
  id: string; name: string; slug: string; description: string;
  status: "Upcoming" | "Active" | "Closed"; saleType: "Online" | "In-Person";
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

export interface CartItem { item: StorefrontItem; sessionId: string; reservedUntil: string; }
export interface CheckoutFormData { name: string; email: string; phone: string; }
export interface ReservationRecord { itemId: string; sessionId: string; reservedUntil: string; }
```

---

### Step 7: `lib/dutch-auction.ts`

Dutch price formula: `currentPrice = startingPrice × (1 - dropPercent/100)^n` where `n = floor((now - saleStart) / intervalMs)`. Floor = `startingPrice × (floorPercent/100)`. See original for full implementation.

---

### Step 8: `lib/kv.ts` — Upstash Redis Reservations

```typescript
// TTL = 900 (15 minutes)
// createReservation(itemId, sessionId): set `reservation:${itemId}` with TTL
// getReservation(itemId): get record or null
// deleteReservation(itemId): del key
```

---

### Step 9: `lib/rightsize.ts` — Rightsize API Integration

```typescript
// All fetches: headers: { "x-storefront-api-key": API_KEY }, next: { tags: [...], revalidate: 300 }
// fetchStorefrontItems(), fetchStorefrontItemById(idOrSlug)
// fetchEstates(type?), fetchEstateBySlug(slug), fetchEstateWithItems(slug)
// reserveItem(itemId), unreserveItem(itemId), recordSale(data)
```

---

### Step 10: `lib/stripe.ts`

```typescript
// Webhook verification via SDK constructEvent (no network call)
// createPaymentIntent via raw fetch (NOT new Stripe()) — Stripe Node SDK has issues in Next.js 15
// Stripe-Version: "2025-02-24.acacia"
```

---

### Step 11: `lib/utils.ts`

```typescript
export const CHICAGO_TAX_RATE = 0.1025;  // IL 6.25% + Cook 1.75% + Chicago 1.25% + RTA 1%
export function calcTax(subtotal: number): number
export function cn(...inputs: ClassValue[]): string  // clsx + twMerge
export function formatPrice(n: number): string       // Intl.NumberFormat USD no decimals
export function slugify(s: string): string
```

---

### Step 12: `context/CartContext.tsx`

```tsx
// MAX_CART_ITEMS = 3
// Auto-remove expired reservations every 10 seconds (calls unreserveItem)
// addItem, removeItem, clearCart, isInCart, isOpen, openCart, closeCart
```

---

### Step 13: App Directory Structure

```
app/
  layout.tsx
  page.tsx                        # Hero, FeaturedItems, BrandStory
  globals.css
  about/
  contact/
  shop/
    [slug]/
  estate-sales/
    [slug]/
  onlineestatesales/
    [slug]/
  checkout/
  api/
    contact/
    storefront/
      items/[id]/reserve/
      stripe/
        create-intent/            # Verifies price server-side; Dutch auction price check
        webhook/                  # payment_intent.succeeded → recordSale + email
      webhook/item-updated/       # ISR cache invalidation
    cron/cleanup-reservations/
```

---

### Step 14–18: API Routes

See original March 26 document for detailed implementations of:
- `app/api/storefront/items/[id]/reserve/route.ts`
- `app/api/storefront/stripe/create-intent/route.ts` (Dutch price server-side validation)
- `app/api/storefront/stripe/webhook/route.ts`
- `app/api/cron/cleanup-reservations/route.ts`
- `app/api/storefront/webhook/item-updated/route.ts`

---

### Step 19: Dutch Auction Timer Component

Client component with countdown that pulses when < 2 hours to next drop. Refresh interval: 1s when < 1h, 30s otherwise.

---

### Step 20: Checkout Flow

Steps: info → payment → done. Price-change handling: if server Dutch price differs from submitted by > $0.01, returns HTTP 409 `{priceChanged: true, newPrice}` — client shows confirmation modal before retrying.

---

### Step 21: Layout Components

Header (wordmark, nav, cart badge), CartDrawer (15-min countdown, reserve/remove), Footer, Hero, FeaturedItems, BrandStory, EstateCard, EstateItemCard, UI primitives (Button, Badge, PriceTag, SectionHeading).

---

### Step 22: Key Pages

shop, shop/[slug], onlineestatesales (Dutch auction), estate-sales (in-person), checkout. See original for patterns.

---

---

## CRITICAL BUSINESS RULES & NOTES

### Airtable Base
- **Base ID**: `app5pCCePZGJarcWc`
- **Auth**: Personal Access Token (PAT)
- **Scopes**: `data.records:read`, `data.records:write`, `schema.bases:read`

### Data Model Rules
1. Storefront items: `StorefrontActive = true` AND `PrimaryRoute = "ProFoundFinds Consignment"`
2. Estate Sale items: `EstateSaleId` set; Dutch prices computed at request time from `valueMid` + estate settings
3. Item quantity: `quantity` = remaining; `quantitySold` = cumulative sold; Partially Sold = both > 0
4. Item photos: `Photos` field JSON text blob: `[{url, publicId}]`, index 0 = primary
5. AI analysis: `primary_route` never "Estate Sale" — that route is TTT-assigned only
6. Internal Notes: only visible to TTTStaff, TTTManager, TTTAdmin, TTTSales roles. Never to client users or Viewers.

### Payroll Rules
7. Mileage: 20-mile daily deduction before reimbursement (`calcReimbursableMiles`)
8. Travel time: first 30 min per entry = commute (unpaid); beyond = payable (`calcPayableTravelTime`)
9. Commission: Sold items with `StaffSellerId`, `PrimaryRoute` in FB/Marketplace or Online Marketplace
10. Consignor payout: `SalePrice × (ClientSharePercent / 100)`

### Dutch Auction Rules
11. Price formula: `startingPrice × (1 - dropPercent/100)^n`; floor = `startingPrice × (floorPercent/100)`
12. Server-side validation at checkout — always recompute; never trust client-submitted price
13. Price change: HTTP 409 `{priceChanged: true, newPrice}` → client confirms before retry

### Reservation Rules
14. TTL: 15 minutes in both Airtable (Reserved status) and Upstash Redis KV
15. CartContext polls every 10 seconds; cron runs daily at 9 AM UTC

### PDF Generation Notes
16. `@react-pdf/renderer` MUST be in `serverExternalPackages` in `next.config.ts`
17. Proof-of-payment PDFs: use `viewOnly: true` on `/api/sales/payout-pdf` for on-demand regeneration — do NOT try to re-serve from Cloudinary (type mismatch causes 404 on `private_download_url`)
18. Normal PDF serving: use `/api/pdf-proxy` as fallback for other file types

### Multi-tenant Access Control
19. Client access: Memberships table controls visibility
20. TTTSales: CRM only; redirected from home
21. LocalVendor users: vendor portal only

### Square Integration
22. Items synced by barcode (SKU); upsert via `/v2/catalog/object`
23. Webhook: `x-square-hmacsha256-signature` HMAC-SHA256 verification

### Sale Recording
24. `/api/storefront/sale` retries 3× on failure → writes to FailedSaleSync on all-retry failure
25. Post-sale: pings ProFound Finds webhook to invalidate ISR cache

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
AIRTABLE_PROJECT_NOTES_TABLE=tbl...   # NEW: TTT internal notes board
AIRTABLE_NOTE_COMMENTS_TABLE=tbl...   # NEW: Comments on internal notes

# ── Clerk Auth ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
CLERK_WEBHOOK_SECRET=whsec_...

# ── TTT Access Control ────────────────────────────────────────────────────────
TTT_ADMIN_USER_IDS=user_abc,user_def
TTT_STAFF_USER_IDS=user_ghi,user_jkl

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
SQUARE_ENVIRONMENT=production
SQUARE_WEBHOOK_SIGNATURE_KEY=...
SQUARE_LOCATION_ID=...

# ── QuickBooks Online ─────────────────────────────────────────────────────────
QBO_CLIENT_ID=...
QBO_CLIENT_SECRET=...
QBO_REDIRECT_URI=https://app.toptiertransitions.com/api/qbo/callback
QBO_ENVIRONMENT=production

# ── Google (Calendar + Gmail CRM) ─────────────────────────────────────────────
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_REFRESH_TOKEN=...
GOOGLE_REDIRECT_URI=https://app.toptiertransitions.com/api/admin/calendar-auth/callback
GOOGLE_CRM_CLIENT_ID=...
GOOGLE_CRM_CLIENT_SECRET=...

# ── Remove.bg ─────────────────────────────────────────────────────────────────
REMOVE_BG_API_KEY=...

# ── Invite System ─────────────────────────────────────────────────────────────
INVITE_SECRET=...

# ── Storefront (ProFound Finds integration) ───────────────────────────────────
STOREFRONT_API_KEY=...
STOREFRONT_WEBHOOK_SECRET=...
STOREFRONT_URL=https://www.profoundfinds.com

# ── App URL ───────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://app.toptiertransitions.com
```

### ProFound Finds (`.env.local`)

```bash
# ── Rightsize API ─────────────────────────────────────────────────────────────
RIGHTSIZE_API_URL=https://app.toptiertransitions.com
RIGHTSIZE_API_KEY=...

# ── Stripe ────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── Upstash Redis ─────────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# ── Resend Email ──────────────────────────────────────────────────────────────
RESEND_API_KEY=re_...

# ── Cron Security ─────────────────────────────────────────────────────────────
CRON_SECRET=...

# ── Storefront Webhook ────────────────────────────────────────────────────────
STOREFRONT_WEBHOOK_SECRET=...
```

---

## FINAL BUILD & DEPLOY CHECKLIST

### Rightsize
```bash
cd /Users/mattkamhi/rightsize
NODE_OPTIONS="--max-old-space-size=4096" npx next build
# Fix any TypeScript errors before deploying
```

### ProFound Finds
```bash
cd /Users/mattkamhi/profoundfinds
NODE_OPTIONS="--max-old-space-size=4096" npx next build
```

### Post-Deploy Steps
1. Set all environment variables in Vercel dashboard for each project
2. Configure Stripe webhook: `https://www.profoundfinds.com/api/storefront/stripe/webhook` — events: `payment_intent.succeeded`
3. Configure Square webhook: `https://app.toptiertransitions.com/api/square/webhook` — events: `payment.created`
4. Configure Clerk webhook: `https://app.toptiertransitions.com/api/webhooks/clerk` — events: `user.created`, `user.updated`, `user.deleted`
5. Verify Vercel Cron enabled for ProFound Finds (daily at 9 AM UTC)
6. Create `ProjectNotes` and `NoteComments` tables in Airtable with fields listed in Step 7 above
7. Test end-to-end: add item → cart → checkout → verify Airtable + Stripe + email

---

*Generated April 29, 2026. Both apps build successfully with `NODE_OPTIONS="--max-old-space-size=4096" npx next build`. Airtable base `app5pCCePZGJarcWc` contains live data.*
