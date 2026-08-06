import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import type { Item } from "@/lib/types";

const EBAY_API_BASE = "https://api.ebay.com";
const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
].join(" ");

// ── Raw HTTPS helper (bypasses Next.js patched fetch) ─────────────────────────
interface EbayResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

function ebayFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
): Promise<EbayResponse> {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(url);
    const bodyBuf  = init.body ? Buffer.from(init.body, "utf8") : undefined;
    const headers  = { ...init.headers };
    if (bodyBuf) headers["content-length"] = String(bodyBuf.length);

    console.log("[ebayFetch]", init.method, parsed.pathname, "headers:", Object.keys(headers).join(", "));
    if (init.body) console.log("[ebayFetch] body preview:", init.body.slice(0, 300));

    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   init.method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw    = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            console.log("[ebayFetch] error", status, parsed.pathname, raw.slice(0, 500));
          }
          resolve({
            ok:     status >= 200 && status < 300,
            status,
            text:   () => Promise.resolve(raw),
            json:   () => Promise.resolve(JSON.parse(raw)),
          });
        });
        res.on("error", reject);
      }
    );

    req.on("error", reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ── Application token (client credentials — for public APIs like Taxonomy) ────
let _cachedAppToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string | null> {
  if (_cachedAppToken && Date.now() < _cachedAppToken.expiresAt - 60_000) {
    return _cachedAppToken.token;
  }
  const clientId     = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await ebayFetch(EBAY_TOKEN_URL, {
    method:  "POST",
    headers: { "Authorization": `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "client_credentials",
      scope:      "https://api.ebay.com/oauth/api_scope",
    }).toString(),
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; expires_in: number };
  _cachedAppToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return _cachedAppToken.token;
}

// ── Category suggestion (uses App token — Taxonomy API requires base scope) ───
async function suggestCategoryId(title: string): Promise<string | null> {
  const appToken = await getAppToken();
  if (!appToken) return null;
  const q = encodeURIComponent(title.trim().slice(0, 80));
  const res = await ebayFetch(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${q}`,
    { method: "GET", headers: { "Authorization": `Bearer ${appToken}` } }
  );
  if (!res.ok) return null;
  const data = await res.json() as {
    categorySuggestions?: { category: { categoryId: string; categoryName: string } }[]
  };
  const id = data.categorySuggestions?.[0]?.category?.categoryId ?? null;
  if (id) console.log("[ebay] category suggestion:", data.categorySuggestions?.[0]?.category?.categoryName, id);
  return id;
}

// ── Category map (leaf-node fallbacks when Taxonomy suggestion API fails) ─────
// All IDs must be eBay leaf categories (getCategorySuggestions is the preferred path).
export const EBAY_CATEGORY_MAP: Record<string, string> = {
  "Seating":                           "3138",    // Antiques > Furniture > Chairs
  "Tables & Desks":                    "261991",  // Home & Garden > Furniture > Tables
  "Cabinets, Dressers & Shelving":     "103480",  // Home & Garden > Furniture > Cabinets & Cupboards
  "Beds & Bedroom":                    "175748",  // Home & Garden > Furniture > Beds & Bed Frames
  "Fine Art & Paintings":              "551",     // Art > Paintings
  "Prints & Framed Art":               "10786",   // Art > Prints
  "Sculpture & Figurines":             "4707",    // Art > Sculpture
  "Mirrors":                           "20580",   // Home & Garden > Home Décor > Mirrors
  "Lamps & Lighting":                  "112581",  // Home & Garden > Lamps, Lighting > Table Lamps
  "Rugs & Textiles":                   "160736",  // Home & Garden > Rugs & Carpets
  "Vases, Bowls & Decorative Objects": "3744",    // Pottery & Glass > Pottery & China > Vases
  "Fine China & Dinnerware":           "870",     // Pottery & Glass > Pottery & China > Dinnerware
  "Glassware & Crystal":               "10723",   // Pottery & Glass > Glass > Glassware
  "Silver & Serveware":                "20096",   // Antiques > Silver > Flatware & Silverware
  "Kitchenware & Cookware":            "20625",   // Home & Garden > Kitchen > Cookware
  "Jewelry & Watches":                 "10968",   // Jewelry & Watches > Fashion Jewelry > Necklaces
  "Handbags & Accessories":            "169291",  // Clothing > Women > Bags & Handbags
  "Clothing & Furs":                   "15724",   // Clothing > Women > Coats & Jackets
  "Books & Media":                     "29792",   // Books > Antiquarian & Collectible
  "Collectibles & Memorabilia":        "29223",   // Antiques > Other
  "Toys, Games & Dolls":               "19009",   // Toys & Hobbies > Vintage & Antique Toys
  "Musical Instruments":               "619",     // Musical Instruments > Other
  "Electronics":                       "293",     // Consumer Electronics > Other
  "Tools, Outdoor & Garage":           "631",     // Home & Garden > Tools & Workshop > Other
  "Holiday & Seasonal":                "34",      // Collectibles > Holiday > Other
  "Other":                             "29223",   // Antiques > Other (leaf)
};

// ── Condition map ─────────────────────────────────────────────────────────────
// Keys cover all known Airtable values (case-sensitive). Default is USED_EXCELLENT
// because it's broadly accepted across eBay categories; USED_GOOD is rejected by
// some categories (Fine Art, Antiques) and causes eBay to silently list as NEW.
const CONDITION_MAP: Record<string, string> = {
  "Excellent":      "USED_EXCELLENT",
  "Good":           "USED_GOOD",
  "Fair":           "USED_ACCEPTABLE",
  "Poor":           "USED_ACCEPTABLE",
  "For Parts":      "FOR_PARTS_OR_NOT_WORKING",
  // Additional values that may exist in Airtable
  "Like New":       "USED_EXCELLENT",
  "Very Good":      "USED_GOOD",
  "Acceptable":     "USED_ACCEPTABLE",
  "Parts Only":     "FOR_PARTS_OR_NOT_WORKING",
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
  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    refresh_token: refreshToken,
    scope:         EBAY_SCOPES,
  }).toString();

  const res = await ebayFetch(EBAY_TOKEN_URL, {
    method:  "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  _cachedToken = {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
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

  const condition = CONDITION_MAP[item.condition] ?? "USED_EXCELLENT";

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

  const qty = Math.max(item.quantity ?? 1, 1);

  return {
    product: {
      title: (item.listingTitleEbay || item.itemName).trim().slice(0, 80),
      ...(item.listingDescriptionEbay ? { description: item.listingDescriptionEbay } : {}),
      ...(imageUrls.length ? { imageUrls } : {}),
    },
    condition,
    ...(item.conditionNotes?.trim()
      ? { conditionDescription: item.conditionNotes.trim().slice(0, 1000) }
      : {}),
    availability: {
      shipToLocationAvailability: { quantity: qty },
    },
    ...(Object.keys(pkg).length ? { packageWeightAndSize: pkg } : {}),
  };
}

function buildOffer(item: Item, sku: string, categoryId: string): object {
  return {
    sku,
    marketplaceId:      "EBAY_US",
    format:             "FIXED_PRICE",
    availableQuantity:  Math.max(item.quantity ?? 1, 1),
    categoryId,
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
  const hasWeight = (item.weightPounds ?? 0) > 0 || (item.weightOunces ?? 0) > 0;
  if (!hasWeight) {
    throw new Error("Weight is required for calculated shipping — fill in Weight (lbs/oz) on the item before publishing.");
  }

  const token = await getAccessToken();
  const sku   = `ttt-${item.id}`;

  // Resolve the best eBay leaf category for this item
  const itemTitle  = item.listingTitleEbay || item.itemName;
  const categoryId = (await suggestCategoryId(itemTitle))
    ?? EBAY_CATEGORY_MAP[item.category]
    ?? "29223"; // Antiques > Other (leaf fallback)

  const jsonHeaders = {
    "Authorization":    `Bearer ${token}`,
    "Content-Type":     "application/json",
    "Content-Language": "en-US",
    "Accept-Language":  "en-US",
  };

  // 1. Create / overwrite inventory item
  const invRes = await ebayFetch(
    `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    {
      method:  "PUT",
      headers: jsonHeaders,
      body:    JSON.stringify(buildInventoryItem(item)),
    }
  );
  if (!invRes.ok && invRes.status !== 204) {
    const text = await invRes.text();
    throw new Error(`eBay inventory item error (${invRes.status}): ${text}`);
  }

  // 2. Create offer (recover gracefully if one already exists for this SKU)
  const offerRes = await ebayFetch(`${EBAY_API_BASE}/sell/inventory/v1/offer`, {
    method:  "POST",
    headers: jsonHeaders,
    body:    JSON.stringify(buildOffer(item, sku, categoryId)),
  });

  let offerId: string;
  if (offerRes.ok) {
    const data = await offerRes.json() as { offerId: string };
    offerId = data.offerId;
  } else {
    // 25002 = offer already exists — eBay returns the existing offerId in the error
    const errData = await offerRes.json() as {
      errors?: { errorId: number; parameters?: { name: string; value: string }[] }[]
    };
    const existing = errData.errors?.[0];
    if (existing?.errorId === 25002) {
      offerId = existing.parameters?.find(p => p.name === "offerId")?.value ?? "";
      if (!offerId) throw new Error("eBay offer already exists but returned no offerId");
      // Update the existing offer so it gets the current category / price
      const updateRes = await ebayFetch(`${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}`, {
        method:  "PUT",
        headers: jsonHeaders,
        body:    JSON.stringify(buildOffer(item, sku, categoryId)),
      });
      if (!updateRes.ok) {
        const t = await updateRes.text();
        console.log("[ebay] offer update warning (continuing):", updateRes.status, t.slice(0, 300));
      }
    } else {
      throw new Error(`eBay offer creation error (${offerRes.status}): ${JSON.stringify(errData)}`);
    }
  }

  // 3. Publish offer → gets listing ID
  const pubRes = await ebayFetch(
    `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}/publish`,
    {
      method:  "POST",
      headers: jsonHeaders,
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

  const itemTitle  = item.listingTitleEbay || item.itemName;
  const categoryId = (await suggestCategoryId(itemTitle))
    ?? EBAY_CATEGORY_MAP[item.category]
    ?? "29223"; // Antiques > Other (leaf fallback)

  const jsonHeaders = {
    "Authorization":    `Bearer ${token}`,
    "Content-Type":     "application/json",
    "Content-Language": "en-US",
    "Accept-Language":  "en-US",
  };

  // Update inventory item (title, description, condition, photos, dimensions)
  const invRes = await ebayFetch(
    `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    {
      method:  "PUT",
      headers: jsonHeaders,
      body:    JSON.stringify(buildInventoryItem(item)),
    }
  );
  if (!invRes.ok && invRes.status !== 204) {
    const text = await invRes.text();
    throw new Error(`eBay inventory update error (${invRes.status}): ${text}`);
  }

  // Update offer (price, quantity, category)
  const offerRes = await ebayFetch(
    `${EBAY_API_BASE}/sell/inventory/v1/offer/${item.ebayOfferId}`,
    {
      method:  "PUT",
      headers: jsonHeaders,
      body:    JSON.stringify(buildOffer(item, sku, categoryId)),
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
  const res = await ebayFetch(EBAY_TOKEN_URL, {
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

  const data = await res.json() as { access_token: string; refresh_token: string };
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
  };
}
