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
