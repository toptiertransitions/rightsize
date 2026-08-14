import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import type { Item } from "@/lib/types";
import { EBAY_CATEGORY_MAP } from "@/lib/ebay-categories";
import { categoryToGroup } from "@/lib/categories";

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
  location: string | null;
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
          const rawLoc = res.headers["location"];
          resolve({
            ok:       status >= 200 && status < 300,
            status,
            location: typeof rawLoc === "string" ? rawLoc : null,
            text:     () => Promise.resolve(raw),
            json:     () => Promise.resolve(JSON.parse(raw)),
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

// eBay Antiques, Art, Pottery, and Apparel categories reject USED_GOOD (5000) and below
// with error 25021. Clamp these to USED_EXCELLENT (3000) to avoid the rejection.
const CONDITION_CLAMP_CATEGORIES = new Set([
  // Apparel
  "Handbags & Accessories", "Clothing & Furs",
  // Furniture — mapped to Antiques > Furniture tree
  "Seating", "Tables & Desks", "Cabinets, Dressers & Shelving", "Beds & Bedroom", "Mirrors",
  // Art
  "Fine Art & Paintings", "Prints & Framed Art", "Sculpture & Figurines",
  // Antiques / Vintage
  "Rugs & Textiles", "Silver & Serveware", "Fine China & Dinnerware", "Glassware & Crystal",
  // Jewelry
  "Jewelry & Watches",
]);

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

// ── EPS image transload (Commerce Media API) ──────────────────────────────────
// Cache survives warm lambda invocations — avoids duplicate EPS copies when the
// same Cloudinary URL is transloaded again on a listing update.
const _epsUrlCache = new Map<string, string>();

async function transloadImageToEPS(sourceUrl: string, token: string): Promise<string | null> {
  const cached = _epsUrlCache.get(sourceUrl);
  if (cached) { console.log("[ebay] EPS cache hit:", sourceUrl); return cached; }
  try {
    // eBay Commerce Media API has no URL-based image upload endpoint.
    // Use the Trading API's UploadSiteHostedPictures with ExternalPictureURL —
    // eBay fetches the source URL and returns an i.ebayimg.com EPS URL.
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">',
      `<ExternalPictureURL>${sourceUrl}</ExternalPictureURL>`,
      '</UploadSiteHostedPicturesRequest>',
    ].join("");

    const res = await ebayFetch("https://api.ebay.com/ws/api.dll", {
      method:  "POST",
      headers: {
        "X-EBAY-API-CALL-NAME":           "UploadSiteHostedPictures",
        "X-EBAY-API-SITEID":              "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-IAF-TOKEN":           token,
        "Content-Type":                   "text/xml",
      },
      body: xml,
    });

    const body = await res.text();

    if (!res.ok || body.includes("<Ack>Failure</Ack>")) {
      const errMsg = body.match(/<LongMessage>([^<]+)<\/LongMessage>/)?.[1] ?? body.slice(0, 200);
      console.warn("[ebay] UploadSiteHostedPictures failed", res.status, errMsg, sourceUrl);
      return null;
    }

    const match = body.match(/<FullURL>([^<]+)<\/FullURL>/);
    if (!match) {
      console.warn("[ebay] UploadSiteHostedPictures: no FullURL in response for", sourceUrl);
      return null;
    }

    const epsUrl = match[1];
    if (!epsUrl.includes("ebayimg.com")) {
      console.warn("[ebay] UploadSiteHostedPictures: URL is not EPS:", epsUrl);
      return null;
    }

    _epsUrlCache.set(sourceUrl, epsUrl);
    console.log("[ebay] transloaded to EPS:", epsUrl);
    return epsUrl;
  } catch (e) {
    console.warn("[ebay] image transload error:", sourceUrl, e instanceof Error ? e.message : e);
    return null;
  }
}

async function resolveEpsImageUrls(item: Item, token: string): Promise<string[]> {
  const sourceUrls = [
    ...(item.photos ?? []).map(p => p.url),
    ...(!item.photos?.length && item.photoUrl ? [item.photoUrl] : []),
  ].filter((u): u is string => typeof u === "string" && u.startsWith("https://")).slice(0, 24);

  const settled = await Promise.allSettled(sourceUrls.map(url => transloadImageToEPS(url, token)));
  return settled
    .map((r, i) => {
      if (r.status === "fulfilled" && r.value) return r.value;
      console.warn("[ebay] skipping image — transload failed:", sourceUrls[i]);
      return null;
    })
    .filter((u): u is string => u !== null);
}

// ── Payload builders ──────────────────────────────────────────────────────────
function buildInventoryItem(item: Item, epsImageUrls?: string[]): object {
  let imageUrls: string[];
  if (epsImageUrls !== undefined) {
    imageUrls = epsImageUrls;
  } else {
    const rawUrls = [
      ...(item.photos ?? []).map(p => p.url),
      ...(!item.photos?.length && item.photoUrl ? [item.photoUrl] : []),
    ].filter(Boolean) as string[];
    imageUrls = rawUrls
      .map(url => {
        if (url.startsWith("https://")) return url;
        if (url.startsWith("http://")) {
          const upgraded = "https://" + url.slice(7);
          console.warn("[ebay] upgraded HTTP image URL to HTTPS:", upgraded);
          return upgraded;
        }
        console.warn("[ebay] skipping image with non-HTTP(S) URL:", url);
        return null;
      })
      .filter((url): url is string => url !== null)
      .slice(0, 24);
  }

  let condition = CONDITION_MAP[item.condition] ?? "USED_EXCELLENT";
  if (CONDITION_CLAMP_CATEGORIES.has(item.category ?? "")) {
    if (condition === "USED_GOOD" || condition === "USED_ACCEPTABLE" || condition === "FOR_PARTS_OR_NOT_WORKING") {
      condition = "USED_EXCELLENT";
    }
  }

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

  // Required item specifics per Rightsize category → eBay Antiques/Art tree.
  // Keys are eBay aspect names; values are the defaults to send.
  // Dimension aspects use actual stored values when available.
  // Required item specifics per Rightsize category → eBay Antiques/Art tree.
  // "Multi-Color" and "Unknown" are broadly accepted fallbacks; sellers can
  // correct values directly on eBay after listing.
  const CATEGORY_ASPECTS: Record<string, Record<string, string>> = {
    "Seating":                       { Type: "Chair",        Style: "Antique", Material: "Wood",    Color: "Brown",       "Country/Region of Manufacture": "Unknown", "Time Period Manufactured": "Unknown" },
    "Tables & Desks":                { Type: "Table",        Style: "Antique", Material: "Wood",    Color: "Brown",       "Country/Region of Manufacture": "Unknown", "Time Period Manufactured": "Unknown" },
    "Cabinets, Dressers & Shelving": { Type: "Cabinet",      Style: "Antique", Material: "Wood",    Color: "Brown",       "Country/Region of Manufacture": "Unknown", "Time Period Manufactured": "Unknown" },
    "Beds & Bedroom":                { Type: "Bed",          Style: "Antique", Material: "Wood",    Color: "Brown",       "Country/Region of Manufacture": "Unknown", "Time Period Manufactured": "Unknown" },
    "Mirrors":                       { Type: "Wall Mirror",  Style: "Antique", Material: "Wood",    Color: "Brown",       "Country/Region of Manufacture": "Unknown", "Time Period Manufactured": "Unknown" },
    "Rugs & Textiles":               { Type: "Area Rug",     Style: "Antique",                      Color: "Multi-Color", "Country/Region of Manufacture": "Unknown", "Time Period Manufactured": "Unknown" },
    "Fine Art & Paintings":          { Type: "Painting",     Style: "Antique",                      Color: "Multi-Color", "Country/Region of Manufacture": "Unknown", "Time Period Created": "Unknown" },
    "Prints & Framed Art":           { Type: "Print",        Style: "Antique",                      Color: "Multi-Color", "Country/Region of Manufacture": "Unknown" },
    "Sculpture & Figurines":         { Type: "Figure",       Style: "Antique", Material: "Unknown", Color: "Multi-Color", "Country/Region of Manufacture": "Unknown", "Time Period Manufactured": "Unknown" },
    "Silver & Serveware":            { Type: "Serving Set",  Style: "Antique", Material: "Sterling Silver", Color: "Silver", "Country/Region of Manufacture": "Unknown", "Time Period Manufactured": "Unknown" },
    "Fine China & Dinnerware":       { Type: "Dinner Set",   Style: "Antique",                      Color: "White",       "Country/Region of Manufacture": "Unknown", "Time Period Manufactured": "Unknown" },
    "Glassware & Crystal":           { Type: "Glassware",    Style: "Antique",                      Color: "Clear",       "Country/Region of Manufacture": "Unknown", "Time Period Manufactured": "Unknown" },
    "Jewelry & Watches":             { Type: "Fashion",      Style: "Antique",                      Color: "Multi-Color", "Country/Region of Manufacture": "Unknown" },
    "Lamps & Lighting":              { Type: "Table Lamp",   Style: "Antique", Material: "Unknown", Color: "Brown",       "Country/Region of Manufacture": "Unknown" },
    "Vases, Bowls & Decorative Objects": { Type: "Vase",    Style: "Antique", Material: "Unknown", Color: "Multi-Color", "Country/Region of Manufacture": "Unknown" },
    "Collectibles & Memorabilia":    { Type: "Unknown",      Style: "Vintage",                      Color: "Multi-Color", "Country/Region of Manufacture": "Unknown" },
  };

  const cat = item.category ?? "";
  const categoryDefaults = CATEGORY_ASPECTS[cat] ?? {};
  const aspects: Record<string, string[]> = {};

  // Apply category-level required aspects
  for (const [k, v] of Object.entries(categoryDefaults)) {
    aspects[k] = [v];
  }

  // Furniture categories require Item Length/Width/Height; other categories
  // include dimension aspects only when dims are actually stored.
  const REQUIRES_DIMENSION_ASPECTS = new Set([
    "Seating", "Tables & Desks", "Cabinets, Dressers & Shelving", "Beds & Bedroom", "Mirrors",
  ]);
  const needsDimAspects = REQUIRES_DIMENSION_ASPECTS.has(cat);
  if (hasDimensions || needsDimAspects) {
    aspects["Item Length"] = [String(item.widthInches  ?? 1)];
    aspects["Item Width"]  = [String(item.depthInches  ?? 1)];
    aspects["Item Height"] = [String(item.heightInches ?? 1)];
  }

  const qty = Math.max(item.quantity ?? 1, 1);

  // For Furniture, Art & Wall, and Home Décor: append dimensions and condition
  // notes to the eBay description so buyers see physical details inline.
  const APPEND_DETAILS_GROUPS = new Set(["Furniture", "Art & Wall", "Home Décor"]);
  let description = item.listingDescriptionEbay?.trim() ?? "";
  if (APPEND_DETAILS_GROUPS.has(categoryToGroup(item.category ?? ""))) {
    const dimParts: string[] = [];
    if (item.heightInches) dimParts.push(`H ${item.heightInches}"`);
    if (item.widthInches)  dimParts.push(`W ${item.widthInches}"`);
    if (item.depthInches)  dimParts.push(`D ${item.depthInches}"`);
    if (dimParts.length > 0) {
      description += (description ? "\n\n" : "") + `Dimensions: ${dimParts.join(", ")}`;
    }
    if (item.conditionNotes?.trim()) {
      description += (description ? "\n\n" : "") + `Condition Notes: ${item.conditionNotes.trim()}`;
    }
  }

  return {
    product: {
      title: (item.itemName || item.listingTitleEbay || "").trim().slice(0, 80),
      ...(description ? { description } : {}),
      ...(imageUrls.length ? { imageUrls } : {}),
      ...(Object.keys(aspects).length ? { aspects } : {}),
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
  if (!item.itemName && !item.listingTitleEbay) {
    throw new Error("Item has no name — fill in the Item Name before publishing.");
  }
  const hasWeight = (item.weightPounds ?? 0) > 0 || (item.weightOunces ?? 0) > 0;
  if (!hasWeight) {
    throw new Error("Weight is required for calculated shipping — fill in Weight (lbs/oz) on the item before publishing.");
  }

  if (!item.barcodeNumber) {
    throw new Error("Barcode / item number is required before publishing to eBay — assign one in Rightsize first.");
  }

  const token        = await getAccessToken();
  const sku          = String(item.barcodeNumber);
  const epsImageUrls = await resolveEpsImageUrls(item, token);

  // Resolve eBay leaf category — staff-assigned Rightsize category takes priority;
  // getCategorySuggestions is only used when category is unmapped/Other (it
  // misclassifies items whose titles contain words like "suite" as clothing).
  const itemTitle      = item.itemName || item.listingTitleEbay || "";
  const staticCategory = item.category !== "Other" ? EBAY_CATEGORY_MAP[item.category] : undefined;
  const categoryId     = staticCategory
    ?? (await suggestCategoryId(itemTitle))
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
      body:    JSON.stringify(buildInventoryItem(item, epsImageUrls.length ? epsImageUrls : undefined)),
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

  const jsonHeaders = {
    "Authorization":    `Bearer ${token}`,
    "Content-Type":     "application/json",
    "Content-Language": "en-US",
    "Accept-Language":  "en-US",
  };

  // Fetch the existing offer to get the SKU it was originally created with.
  // The offer's SKU is the canonical identifier for its linked inventory item —
  // sending a different SKU in the update body causes error 25604.
  const offerGetRes = await ebayFetch(
    `${EBAY_API_BASE}/sell/inventory/v1/offer/${item.ebayOfferId}`,
    { method: "GET", headers: jsonHeaders }
  );
  if (!offerGetRes.ok) {
    const text = await offerGetRes.text();
    throw new Error(`eBay offer fetch error (${offerGetRes.status}): ${text}`);
  }
  const offerData = await offerGetRes.json() as { sku: string };
  const sku = offerData.sku;
  if (!sku) throw new Error("eBay offer returned no SKU — cannot update inventory item.");

  const epsImageUrls = await resolveEpsImageUrls(item, token);

  const itemTitle      = item.itemName || item.listingTitleEbay || "";
  const staticCategory = item.category !== "Other" ? EBAY_CATEGORY_MAP[item.category] : undefined;
  const categoryId     = staticCategory
    ?? (await suggestCategoryId(itemTitle))
    ?? "29223";

  // Update inventory item (title, description, condition, photos, dimensions)
  const invRes = await ebayFetch(
    `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    {
      method:  "PUT",
      headers: jsonHeaders,
      body:    JSON.stringify(buildInventoryItem(item, epsImageUrls.length ? epsImageUrls : undefined)),
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

// ── Health check (used by daily cron) ────────────────────────────────────────
const EBAY_REQUIRED_VARS = [
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_REFRESH_TOKEN",
  "EBAY_FULFILLMENT_POLICY_ID",
  "EBAY_PAYMENT_POLICY_ID",
  "EBAY_RETURN_POLICY_ID",
];

export async function checkEbayConnection(): Promise<{
  ok: boolean;
  missingVars?: string[];
  error?: string;
}> {
  const missing = EBAY_REQUIRED_VARS.filter(k => !process.env[k]);
  if (missing.length > 0) {
    return { ok: false, missingVars: missing, error: `Missing env vars: ${missing.join(", ")}` };
  }
  try {
    await getAccessToken();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
