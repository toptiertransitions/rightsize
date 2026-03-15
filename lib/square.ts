/**
 * Square API helpers — Catalog sync + webhook signature validation.
 * Uses raw fetch (no SDK dependency) against Square REST API v2.
 */

import crypto from "crypto";

const SQUARE_BASE =
  process.env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

function squareFetch(path: string, options?: RequestInit) {
  return fetch(`${SQUARE_BASE}/v2${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": "2026-01-22",
      ...(options?.headers ?? {}),
    },
  });
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface SquareCatalogResult {
  catalogItemId: string;
  catalogVariationId: string;
}

/**
 * Upsert a single item into Square catalog.
 * Uses the barcode as the SKU on the item variation.
 * Returns the stable Square IDs to store back in Airtable.
 */
export async function upsertSquareCatalogItem(opts: {
  existingItemId?: string;       // If already synced, pass the Square item ID
  existingVariationId?: string;
  name: string;
  priceCents: number;            // Price in cents (valueMid * 100)
  sku: string;                   // barcode number
  locationId: string;
}): Promise<SquareCatalogResult> {
  const itemId = opts.existingItemId ?? `#item-${opts.sku}`;
  const variationId = opts.existingVariationId ?? `#variation-${opts.sku}`;

  const body = {
    idempotency_key: `upsert-${opts.sku}-${Date.now()}`,
    object: {
      type: "ITEM",
      id: itemId,
      item_data: {
        name: opts.name,
        variations: [
          {
            type: "ITEM_VARIATION",
            id: variationId,
            item_variation_data: {
              item_id: itemId,
              name: "Default",
              pricing_type: "FIXED_PRICING",
              price_money: {
                amount: opts.priceCents,
                currency: "USD",
              },
              sku: opts.sku,
              track_inventory: false,
            },
          },
        ],
      },
    },
  };

  const res = await squareFetch("/catalog/object", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Square catalog upsert failed: ${err}`);
  }

  const data = await res.json();
  const obj = data.catalog_object;
  const variation = obj.item_data?.variations?.[0];

  return {
    catalogItemId: obj.id,
    catalogVariationId: variation?.id ?? "",
  };
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface SquareOrderLineItem {
  catalogObjectId: string;   // variation ID
  quantity: number;
  basePriceMoney: { amount: number; currency: string };
  name: string;
}

export async function getSquareOrder(orderId: string): Promise<SquareOrderLineItem[]> {
  const res = await squareFetch(`/orders/${orderId}`);
  if (!res.ok) return [];
  const data = await res.json();
  const lineItems: SquareOrderLineItem[] = (data.order?.line_items ?? [])
    .filter((li: Record<string, unknown>) => li.catalog_object_id)
    .map((li: Record<string, unknown>) => ({
      catalogObjectId: li.catalog_object_id as string,
      quantity: parseInt(String(li.quantity ?? "1"), 10),
      basePriceMoney: (li.base_price_money as { amount: number; currency: string }) ?? { amount: 0, currency: "USD" },
      name: String(li.name ?? ""),
    }));
  return lineItems;
}

// ─── Payments list (manual sales pull) ───────────────────────────────────────

export interface SquarePaymentSummary {
  paymentId: string;
  orderId: string;
  createdAt: string;
}

/**
 * List recent completed Square payments, newest first.
 * Used by the manual "pull sales" admin endpoint as a webhook fallback.
 */
export async function listSquareCompletedPayments(limitDays = 14): Promise<SquarePaymentSummary[]> {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) return [];

  const beginTime = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    location_id: locationId,
    sort_order: "DESC",
    limit: "100",
    begin_time: beginTime,
  });

  const res = await squareFetch(`/payments?${params}`);
  if (!res.ok) return [];
  const data = await res.json();

  return ((data.payments ?? []) as Record<string, unknown>[])
    .filter((p) => p.status === "COMPLETED" && p.order_id)
    .map((p) => ({
      paymentId: String(p.id),
      orderId: String(p.order_id),
      createdAt: String(p.created_at ?? ""),
    }));
}

/** Fetch a Square catalog object and extract its SKU (for fallback barcode matching). */
export async function getSquareCatalogObjectSku(objectId: string): Promise<string | null> {
  const res = await squareFetch(`/catalog/object/${objectId}`);
  if (!res.ok) return null;
  const data = await res.json();
  const obj = data.object;
  // Could be an ITEM_VARIATION directly
  if (obj?.type === "ITEM_VARIATION") {
    return (obj.item_variation_data?.sku as string) || null;
  }
  return null;
}

// ─── Webhook signature validation ─────────────────────────────────────────────

/**
 * Square signs webhook payloads with HMAC-SHA256.
 * The signature is over: webhookUrl + requestBody (raw bytes).
 */
export function validateSquareWebhookSignature(opts: {
  signatureKey: string;
  webhookUrl: string;
  body: string;           // raw request body string
  signature: string;      // x-square-hmacsha256-signature header value
}): boolean {
  const hmac = crypto.createHmac("sha256", opts.signatureKey);
  hmac.update(opts.webhookUrl + opts.body);
  const expected = hmac.digest("base64");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(opts.signature)
    );
  } catch {
    return false;
  }
}

// ─── Connection check ─────────────────────────────────────────────────────────

export async function getSquareLocationName(): Promise<string | null> {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) return null;
  try {
    const res = await squareFetch(`/locations/${locationId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.location?.name ?? null;
  } catch {
    return null;
  }
}
