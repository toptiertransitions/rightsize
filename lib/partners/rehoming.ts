// Staff-only "Rehoming Resources" on the Partners page: the LocalVendors
// directory's Donation Orgs, Consignment Stores and Collectors/Resellers,
// searchable by what they accept and how far they are from the project.
//
// Client-safe — no us-zips import here. Distances are computed server-side
// (page.tsx and rehomingDistancesAction) and handed to the client as a map.

import { categoryToGroup } from "@/lib/categories";
import type { LocalVendor, SystemRole } from "@/lib/types";

/** System roles that see Rehoming Resources. Clients (TTT and NonTTT) never do. */
export const REHOMING_ROLES: readonly SystemRole[] = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"];

export function canSeeRehoming(sysRole: string | null | undefined): boolean {
  return !!sysRole && (REHOMING_ROLES as readonly string[]).includes(sysRole);
}

export const REHOMING_TYPES = ["Collector/Reseller", "Consignment Store", "Donation Org"] as const;
export type RehomingType = (typeof REHOMING_TYPES)[number];

export const REHOMING_TYPE_LABELS: Record<RehomingType, string> = {
  "Collector/Reseller": "Resellers & Collectors",
  "Consignment Store": "Consignment Stores",
  "Donation Org": "Donation Orgs",
};

export const RADIUS_OPTIONS = [5, 10, 15, 25, 50, 100] as const;
export const DEFAULT_RADIUS_MILES = 15;

// Fixed "Accepts" buckets. LocalVendors.ItemCategories is free text
// ("Housewares", "Home Goods", "Household Items"…), so each comma-separated
// token is mapped onto one bucket here; collectors' PrefCategory slots use
// the item taxonomy and are mapped through its groups. Order matters —
// first match wins (e.g. "Home Décor" is Décor, not Housewares).
export const ACCEPT_BUCKETS = [
  "Furniture",
  "Home Décor & Art",
  "Kitchen & Housewares",
  "Clothing & Shoes",
  "Jewelry & Accessories",
  "Books & Media",
  "Antiques, Vintage & Collectibles",
  "Appliances & Electronics",
  "Building Materials & Fixtures",
  "Baby, Kids & Toys",
  "Tools & Outdoor",
  "Musical Instruments",
  "Medical & Mobility",
] as const;
export type AcceptBucket = (typeof ACCEPT_BUCKETS)[number];

const TOKEN_RULES: [RegExp, AcceptBucket][] = [
  [/antique|vintage|collect|memorabilia|coin|stamp/i, "Antiques, Vintage & Collectibles"],
  [/d[ée]cor|\bart\b|artwork|painting|lamp|lighting|rug|mirror|frame/i, "Home Décor & Art"],
  [/furniture|sofa|couch|chair|table|dresser|bed\b|mattress/i, "Furniture"],
  [/house ?wares|household|home goods|kitchen|cook|dish|china|glass|linen|bedding|towel/i, "Kitchen & Housewares"],
  [/cloth|fashion|apparel|shoe|coat|fur\b|wardrobe/i, "Clothing & Shoes"],
  [/jewel|accessor|handbag|purse|watch/i, "Jewelry & Accessories"],
  [/book|media|record|vinyl|dvd|cd\b/i, "Books & Media"],
  [/appliance|electronic|\btv\b|computer|stereo/i, "Appliances & Electronics"],
  [/building|cabinet|fixture|lumber|door|window|tile|hardware/i, "Building Materials & Fixtures"],
  [/baby|kid|child|toy|game/i, "Baby, Kids & Toys"],
  [/tool|garden|outdoor|patio|lawn|garage/i, "Tools & Outdoor"],
  [/music|piano|instrument|guitar/i, "Musical Instruments"],
  [/medical|wheelchair|walker|mobility|cane|hospital|lift chair/i, "Medical & Mobility"],
];

export function tokenToBucket(token: string): AcceptBucket | null {
  for (const [re, bucket] of TOKEN_RULES) if (re.test(token)) return bucket;
  return null;
}

const GROUP_TO_BUCKET: Record<string, AcceptBucket> = {
  "Furniture": "Furniture",
  "Art & Wall": "Home Décor & Art",
  "Home Décor": "Home Décor & Art",
  "Tabletop & Kitchen": "Kitchen & Housewares",
};

const ITEM_CATEGORY_TO_BUCKET: Record<string, AcceptBucket> = {
  "Jewelry & Watches": "Jewelry & Accessories",
  "Handbags & Accessories": "Jewelry & Accessories",
  "Clothing & Furs": "Clothing & Shoes",
  "Books & Media": "Books & Media",
  "Collectibles & Memorabilia": "Antiques, Vintage & Collectibles",
  "Toys, Games & Dolls": "Baby, Kids & Toys",
  "Musical Instruments": "Musical Instruments",
  "Electronics": "Appliances & Electronics",
  "Tools, Outdoor & Garage": "Tools & Outdoor",
};

/** Item-taxonomy category (e.g. "Seating") → Accepts bucket. */
export function itemCategoryToBucket(category: string): AcceptBucket | null {
  return ITEM_CATEGORY_TO_BUCKET[category] ?? GROUP_TO_BUCKET[categoryToGroup(category)] ?? tokenToBucket(category);
}

export interface RehomingWant {
  category: string;
  minPrice: number;
  maxPrice: number;
}

export interface RehomingResource {
  id: string;
  name: string;
  type: RehomingType;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  /** Raw accepted-item tokens, as entered in Local Vendors. */
  acceptsRaw: string[];
  buckets: AcceptBucket[];
  /** Collector/reseller preferences with price ranges (PrefCategory1–5). */
  wants: RehomingWant[];
  consignmentTake: number;
  zipCodesServed: string[];
  notes: string;
  /** False when the zip is missing or unknown — online or no fixed location. */
  hasLocation: boolean;
}

export function toRehomingResource(v: LocalVendor, hasLocation: boolean): RehomingResource {
  const acceptsRaw = v.itemCategories.split(",").map((s) => s.trim()).filter(Boolean);
  const wants = v.prefCategories.map((p) => ({ category: p.category, minPrice: p.minPrice, maxPrice: p.maxPrice }));
  const buckets = new Set<AcceptBucket>();
  for (const t of acceptsRaw) {
    const b = tokenToBucket(t);
    if (b) buckets.add(b);
  }
  for (const w of wants) {
    const b = itemCategoryToBucket(w.category);
    if (b) buckets.add(b);
  }
  return {
    id: v.id,
    name: v.vendorName.trim(),
    type: v.vendorType as RehomingType,
    contactName: v.pocName,
    phone: v.phone,
    email: v.email,
    website: v.website,
    address: v.address,
    city: v.city,
    state: v.state,
    zip: v.zip.trim(),
    acceptsRaw,
    buckets: ACCEPT_BUCKETS.filter((b) => buckets.has(b)),
    wants,
    consignmentTake: v.consignmentTake,
    zipCodesServed: v.zipCodesServed.split(",").map((s) => s.trim()).filter(Boolean),
    notes: v.notes,
    hasLocation,
  };
}

export interface RehomingFilters {
  query: string;
  types: RehomingType[];      // empty = all
  buckets: AcceptBucket[];    // empty = any; otherwise must accept at least one
  radiusMiles: number | null; // null = any distance
  originZip: string;
  includeOnline: boolean;
}

/** True when the resource lists the origin zip in its ZipCodesServed (e.g.
 * offers pickup there) — shown even if it's outside the radius. */
export function servesZip(r: RehomingResource, originZip: string): boolean {
  return !!originZip && r.zipCodesServed.includes(originZip);
}

function matchesQuery(r: RehomingResource, q: string): boolean {
  if (!q) return true;
  const hay = [r.name, r.contactName, r.city, r.state, r.zip, r.type, r.notes, ...r.acceptsRaw, ...r.buckets, ...r.wants.map((w) => w.category)]
    .join(" ")
    .toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

/** Applies every filter; distances is null until an origin zip resolves. */
export function filterRehomingResources(
  resources: RehomingResource[],
  f: RehomingFilters,
  distances: Record<string, number> | null
): RehomingResource[] {
  return resources.filter((r) => {
    if (f.types.length > 0 && !f.types.includes(r.type)) return false;
    if (f.buckets.length > 0 && !f.buckets.some((b) => r.buckets.includes(b))) return false;
    if (!matchesQuery(r, f.query)) return false;
    if (!r.hasLocation) return f.includeOnline;
    if (f.radiusMiles == null || !distances) return true;
    if (servesZip(r, f.originZip)) return true;
    const miles = distances[r.id];
    return miles != null && miles <= f.radiusMiles;
  });
}

/** A–Z by name, ignoring a leading "The " and case. */
export function sortKey(name: string): string {
  return name.replace(/^the\s+/i, "").toLowerCase();
}

export function letterFor(name: string): string {
  const c = sortKey(name).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}
