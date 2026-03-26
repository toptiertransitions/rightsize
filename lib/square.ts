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
 * Search Square catalog for ALL ITEM_VARIATIONs whose SKU exactly matches `sku`.
 * Returns every match (itemId + variationId). More than one = duplicates exist.
 */
export async function findAllSquareItemsBySku(sku: string): Promise<Array<{ itemId: string; variationId: string }>> {
  try {
    const res = await squareFetch("/catalog/search-catalog-objects", {
      method: "POST",
      body: JSON.stringify({
        object_types: ["ITEM_VARIATION"],
        query: { text_query: { keywords: [sku] } },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const variations = (data.objects ?? []) as Array<{
      id: string;
      item_variation_data?: { item_id?: string; sku?: string };
    }>;
    return variations
      .filter((v) => v.item_variation_data?.sku === sku && v.item_variation_data?.item_id)
      .map((v) => ({ variationId: v.id, itemId: v.item_variation_data!.item_id! }));
  } catch {
    return [];
  }
}

/** Internal single-match helper used by upsertSquareCatalogItem. */
async function findSquareItemBySku(sku: string): Promise<{ itemId: string; variationId: string } | null> {
  const all = await findAllSquareItemsBySku(sku);
  return all[0] ?? null;
}

/**
 * Delete a Square catalog ITEM (and all its variations) by Square item ID.
 * Used to remove duplicate catalog entries.
 */
export async function deleteSquareCatalogObject(objectId: string): Promise<boolean> {
  try {
    const res = await squareFetch(`/catalog/object/${objectId}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * List ALL ITEM_VARIATIONs in the Square catalog (paginated).
 * Returns only entries that have a SKU set. Used for full-catalog reset/dedup.
 */
export async function listAllSquareCatalogVariationsWithSku(): Promise<Array<{ itemId: string; variationId: string; sku: string }>> {
  const results: Array<{ itemId: string; variationId: string; sku: string }> = [];
  let cursor: string | undefined;
  do {
    try {
      const params = new URLSearchParams({ types: "ITEM_VARIATION" });
      if (cursor) params.set("cursor", cursor);
      const res = await squareFetch(`/catalog/list?${params}`);
      if (!res.ok) break;
      const data = await res.json();
      const objects = (data.objects ?? []) as Array<{
        id: string;
        type: string;
        item_variation_data?: { item_id?: string; sku?: string };
      }>;
      for (const obj of objects) {
        const sku = obj.item_variation_data?.sku;
        const itemId = obj.item_variation_data?.item_id;
        if (sku && itemId) {
          results.push({ variationId: obj.id, itemId, sku });
        }
      }
      cursor = data.cursor ?? undefined;
    } catch {
      break;
    }
  } while (cursor);
  return results;
}

/**
 * Batch-delete Square catalog objects using the batch-delete endpoint (max 200 per call).
 * Falls back to individual deletes if batch fails.
 */
export async function batchDeleteSquareCatalogObjects(objectIds: string[]): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  const BATCH_SIZE = 200;
  for (let i = 0; i < objectIds.length; i += BATCH_SIZE) {
    const batch = objectIds.slice(i, i + BATCH_SIZE);
    try {
      const res = await squareFetch("/catalog/batch-delete", {
        method: "POST",
        body: JSON.stringify({ object_ids: batch }),
      });
      if (res.ok) {
        deleted += batch.length;
      } else {
        // Fall back to individual deletes
        for (const id of batch) {
          const ok = await deleteSquareCatalogObject(id);
          if (ok) deleted++; else failed++;
        }
      }
    } catch {
      failed += batch.length;
    }
  }
  return { deleted, failed };
}

/**
 * Upsert a single item into Square catalog.
 * Uses the barcode as the SKU on the item variation.
 * Returns the stable Square IDs to store back in Airtable.
 *
 * Dedup strategy: if no stored Square IDs are provided, we first search
 * Square by SKU. If an existing variation with that SKU is found we update
 * it rather than creating a second entry.
 */
export async function upsertSquareCatalogItem(opts: {
  existingItemId?: string;       // If already synced, pass the Square item ID
  existingVariationId?: string;
  name: string;
  priceCents: number;            // Price in cents (valueMid * 100)
  sku: string;                   // barcode number
  locationId: string;
}): Promise<SquareCatalogResult> {
  // If we don't have stored IDs, look up by SKU first to avoid creating a duplicate
  let resolvedItemId = opts.existingItemId;
  let resolvedVariationId = opts.existingVariationId;

  if (!resolvedItemId) {
    const found = await findSquareItemBySku(opts.sku);
    if (found) {
      resolvedItemId = found.itemId;
      resolvedVariationId = found.variationId;
    }
  }

  const itemId = resolvedItemId ?? `#item-${opts.sku}`;
  const variationId = resolvedVariationId ?? `#variation-${opts.sku}`;

  // Square requires a `version` when updating an existing catalog object.
  // Fetch the current object to get the version before upserting.
  let itemVersion: number | undefined;
  let variationVersion: number | undefined;
  const isExisting = !itemId.startsWith("#");
  if (isExisting) {
    try {
      const vRes = await squareFetch(`/catalog/object/${itemId}`);
      if (vRes.ok) {
        const vData = await vRes.json();
        itemVersion = vData.object?.version;
        const vars = (vData.object?.item_data?.variations ?? []) as Array<{ id: string; version?: number }>;
        const matchedVar = vars.find((v) => v.id === variationId);
        variationVersion = matchedVar?.version;
      }
    } catch {
      // Proceed without version — Square will return VERSION_MISMATCH but we surface the real error below
    }
  }

  const body = {
    idempotency_key: `upsert-${opts.sku}-${Date.now()}`,
    object: {
      type: "ITEM",
      id: itemId,
      ...(itemVersion !== undefined ? { version: itemVersion } : {}),
      item_data: {
        name: opts.name,
        variations: [
          {
            type: "ITEM_VARIATION",
            id: variationId,
            ...(variationVersion !== undefined ? { version: variationVersion } : {}),
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
