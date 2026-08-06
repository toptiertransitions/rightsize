import type { Item } from "@/lib/types";

const EBAY_API_BASE = "https://api.ebay.com";
const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
].join(" ");

// ── Category map ──────────────────────────────────────────────────────────────
export const EBAY_CATEGORY_MAP: Record<string, string> = {
  "Seating":                           "261990",
  "Tables & Desks":                    "261991",
  "Cabinets, Dressers & Shelving":     "183321",
  "Beds & Bedroom":                    "175748",
  "Fine Art & Paintings":              "360",
  "Prints & Framed Art":               "10786",
  "Sculpture & Figurines":             "4707",
  "Mirrors":                           "20580",
  "Lamps & Lighting":                  "20697",
  "Rugs & Textiles":                   "160736",
  "Vases, Bowls & Decorative Objects": "49019",
  "Fine China & Dinnerware":           "870",
  "Glassware & Crystal":               "898",
  "Silver & Serveware":                "20096",
  "Kitchenware & Cookware":            "20625",
  "Jewelry & Watches":                 "281",
  "Handbags & Accessories":            "169291",
  "Clothing & Furs":                   "15724",
  "Books & Media":                     "267",
  "Collectibles & Memorabilia":        "1",
  "Toys, Games & Dolls":               "220",
  "Musical Instruments":               "619",
  "Electronics":                       "293",
  "Tools, Outdoor & Garage":           "631",
  "Holiday & Seasonal":                "34",
  "Other":                             "99",
};

// ── Condition map ─────────────────────────────────────────────────────────────
const CONDITION_MAP: Record<string, string> = {
  "Excellent":  "USED_EXCELLENT",
  "Good":       "USED_GOOD",
  "Fair":       "USED_ACCEPTABLE",
  "Poor":       "USED_ACCEPTABLE",
  "For Parts":  "FOR_PARTS_OR_NOT_WORKING",
};

// ── Access token cache (per serverless instance) ──────────────────────────────
let _cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - 60_000) {
    return _cachedToken.token;
  }

  const clientId     = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "eBay credentials not configured. Complete OAuth setup at /admin/ebay-setup."
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
      scope:         EBAY_SCOPES,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  _cachedToken = {
    token:     data.access_token as string,
    expiresAt: Date.now() + (data.expires_in as number) * 1000,
  };
  return _cachedToken.token;
}

// ── Payload builders ──────────────────────────────────────────────────────────
function buildInventoryItem(item: Item): object {
  const imageUrls = (item.photos ?? [])
    .map(p => p.url)
    .filter(Boolean)
    .slice(0, 24);
  if (!imageUrls.length && item.photoUrl) imageUrls.push(item.photoUrl);

  const condition = CONDITION_MAP[item.condition] ?? "USED_GOOD";

  const hasWeight     = (item.weightPounds ?? 0) > 0 || (item.weightOunces ?? 0) > 0;
  const hasDimensions = (item.widthInches ?? 0) > 0 || (item.heightInches ?? 0) > 0 || (item.depthInches ?? 0) > 0;
  const weightLbs     = (item.weightPounds ?? 0) + (item.weightOunces ?? 0) / 16;

  const pkg: Record<string, unknown> = {};
  if (hasWeight) {
    pkg.weight = { value: Math.round(weightLbs * 100) / 100, unit: "POUND" };
  }
  if (hasDimensions) {
    pkg.dimensions = {
      length: item.heightInches ?? 1,
      width:  item.widthInches  ?? 1,
      height: item.depthInches  ?? 1,
      unit:   "INCH",
    };
  }

  return {
    product: {
      title:       (item.listingTitleEbay || item.itemName).slice(0, 80),
      description: item.listingDescriptionEbay || "",
      ...(imageUrls.length ? { imageUrls } : {}),
    },
    condition,
    ...(item.conditionNotes
      ? { conditionDescription: item.conditionNotes.slice(0, 1000) }
      : {}),
    availability: {
      shipToLocationAvailability: { quantity: item.quantity ?? 1 },
    },
    ...(Object.keys(pkg).length ? { packageWeightAndSize: pkg } : {}),
  };
}

function buildOffer(item: Item, sku: string): object {
  return {
    sku,
    marketplaceId:      "EBAY_US",
    format:             "FIXED_PRICE",
    availableQuantity:  item.quantity ?? 1,
    categoryId:         EBAY_CATEGORY_MAP[item.category] ?? "99",
    pricingSummary: {
      price: { value: (item.valueMid ?? 0).toFixed(2), currency: "USD" },
    },
    listingDuration:      "GTC",
    merchantLocationKey:  process.env.EBAY_MERCHANT_LOCATION_KEY ?? "TTT_CHICAGO",
    listingPolicies: {
      fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID!,
      paymentPolicyId:     process.env.EBAY_PAYMENT_POLICY_ID!,
      returnPolicyId:      process.env.EBAY_RETURN_POLICY_ID!,
    },
  };
}

// ── Publish new listing ───────────────────────────────────────────────────────
export async function publishEbayListing(
  item: Item
): Promise<{ listingId: string; offerId: string }> {
  if (!item.valueMid || item.valueMid <= 0) {
    throw new Error("Set a target price before publishing to eBay.");
  }
  if (!item.listingTitleEbay && !item.itemName) {
    throw new Error("Item has no title — set an eBay listing title before publishing.");
  }

  const token = await getAccessToken();
  const sku   = `ttt-${item.id}`;

  // 1. Create / overwrite inventory item
  const invRes = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    {
      method:  "PUT",
      headers: {
        "Authorization":   `Bearer ${token}`,
        "Content-Type":    "application/json",
        "Accept-Language": "en-US",
      },
      body: JSON.stringify(buildInventoryItem(item)),
    }
  );
  if (!invRes.ok && invRes.status !== 204) {
    const text = await invRes.text();
    throw new Error(`eBay inventory item error (${invRes.status}): ${text}`);
  }

  // 2. Create offer
  const offerRes = await fetch(`${EBAY_API_BASE}/sell/inventory/v1/offer`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(buildOffer(item, sku)),
  });
  if (!offerRes.ok) {
    const text = await offerRes.text();
    throw new Error(`eBay offer creation error (${offerRes.status}): ${text}`);
  }
  const { offerId } = await offerRes.json() as { offerId: string };

  // 3. Publish offer → gets listing ID
  const pubRes = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/publish`,
    {
      method:  "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept-Language": "en-US" },
    }
  );
  if (!pubRes.ok) {
    const text = await pubRes.text();
    throw new Error(`eBay publish error (${pubRes.status}): ${text}`);
  }
  const { listingId } = await pubRes.json() as { listingId: string };

  return { listingId, offerId };
}

// ── Update existing listing ───────────────────────────────────────────────────
export async function updateEbayListing(item: Item): Promise<void> {
  if (!item.ebayOfferId) {
    throw new Error("No eBay offer ID on record — cannot update.");
  }

  const token = await getAccessToken();
  const sku   = `ttt-${item.id}`;

  // Update inventory item (title, description, condition, photos, dimensions)
  const invRes = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    {
      method:  "PUT",
      headers: {
        "Authorization":   `Bearer ${token}`,
        "Content-Type":    "application/json",
        "Accept-Language": "en-US",
      },
      body: JSON.stringify(buildInventoryItem(item)),
    }
  );
  if (!invRes.ok && invRes.status !== 204) {
    const text = await invRes.text();
    throw new Error(`eBay inventory update error (${invRes.status}): ${text}`);
  }

  // Update offer (price, quantity, category)
  const offerRes = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/offer/${item.ebayOfferId}`,
    {
      method:  "PUT",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept-Language": "en-US" },
      body: JSON.stringify(buildOffer(item, sku)),
    }
  );
  if (!offerRes.ok) {
    const text = await offerRes.text();
    throw new Error(`eBay offer update error (${offerRes.status}): ${text}`);
  }
}

// ── OAuth helpers (used by setup routes) ─────────────────────────────────────
export function getEbayAuthUrl(): string {
  const clientId = process.env.EBAY_CLIENT_ID;
  const ruName   = process.env.EBAY_RUNAME;
  if (!clientId || !ruName) {
    throw new Error("EBAY_CLIENT_ID and EBAY_RUNAME must be set before initiating OAuth.");
  }
  const scopes = encodeURIComponent(EBAY_SCOPES);
  return `https://auth.ebay.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(ruName)}&scope=${scopes}`;
}

export async function exchangeEbayCode(
  code: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const clientId     = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const ruName       = process.env.EBAY_RUNAME!;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(EBAY_TOKEN_URL, {
    method:  "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      code,
      redirect_uri: ruName,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay code exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    accessToken:  data.access_token  as string,
    refreshToken: data.refresh_token as string,
  };
}
