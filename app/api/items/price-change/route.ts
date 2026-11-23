import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getItemById, getSystemRole, logItemPriceChange, updateItem } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { upsertSquareCatalogItem } from "@/lib/square";
import { AUTO_DROP_ROUTE } from "@/lib/pricing/autoDrop";
import type { Item } from "@/lib/types";

// Bulk "% Change" from the catalog table view (TTT Admins only). Raises or
// lowers each selected item's price by a percentage, rounded to whole
// dollars (never below $1). Deliberately narrow, like drop-to-zero: it calls
// updateItem directly so none of PATCH /api/items' side effects run, and it
// never writes Delivery Date, so the 30/60-day automated drops keep their
// original dates. The automated drop base (PriceDropOriginalValue) moves by
// the same percentage, so the daily drop job doesn't undo a raise on an item
// that has already dropped. Listed ProFoundFinds items are re-synced to
// Square so the in-store price matches.
export const maxDuration = 300;

const MAX_ITEMS = 300;
const CONCURRENCY = 3; // a few Airtable calls per item; stays near the 5 requests/second limit

const scalePrice = (price: number, pct: number) => Math.max(1, Math.round(price * (1 + pct / 100)));

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin" && !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { ids?: unknown; percent?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && /^rec[A-Za-z0-9]{14}$/.test(id)))]
    : [];
  const pct = typeof body?.percent === "number" ? body.percent : NaN;
  if (ids.length === 0) return NextResponse.json({ error: "No items selected" }, { status: 400 });
  if (ids.length > MAX_ITEMS) return NextResponse.json({ error: `Select ${MAX_ITEMS} items or fewer` }, { status: 400 });
  if (!Number.isFinite(pct) || pct === 0 || pct <= -100 || pct > 1000) {
    return NextResponse.json({ error: "Enter a percentage above -100 and at most 1000, not 0" }, { status: 400 });
  }

  const user = await (await clerkClient()).users.getUser(userId).catch(() => null);
  const changedBy = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "TTT Admin";
  const locationId = process.env.SQUARE_LOCATION_ID;

  const updated: Item[] = [];
  const failed: string[] = [];
  let unchanged = 0; // no price, or rounding left it the same
  let squareFailed = 0;

  const changeOne = async (id: string): Promise<void> => {
    const existing = await getItemById(id);
    if (!existing) throw new Error("Item not found");
    const oldPrice = existing.valueMid ?? 0;
    const newPrice = oldPrice > 0 ? scalePrice(oldPrice, pct) : 0;
    if (!newPrice || newPrice === oldPrice) { unchanged++; return; }

    const item = await updateItem(id, {
      valueMid: newPrice,
      ...(existing.priceDropOriginalValue ? { priceDropOriginalValue: scalePrice(existing.priceDropOriginalValue, pct) } : {}),
    });
    updated.push(item);

    logItemPriceChange({
      itemId: item.id, itemName: item.itemName, tenantId: item.tenantId,
      oldValue: oldPrice, newValue: newPrice, changedBy, changeType: "Manual Edit",
    }).catch(() => {});

    if (locationId && item.status === "Listed" && item.primaryRoute === AUTO_DROP_ROUTE && item.barcodeNumber) {
      try {
        const { catalogItemId, catalogVariationId } = await upsertSquareCatalogItem({
          existingItemId: item.squareCatalogItemId,
          existingVariationId: item.squareCatalogVariationId,
          name: item.itemName,
          priceCents: Math.round(newPrice * 100),
          sku: item.barcodeNumber,
          locationId,
        });
        await updateItem(item.id, { squareCatalogItemId: catalogItemId, squareCatalogVariationId: catalogVariationId, squareSyncedAt: new Date().toISOString() });
      } catch (e) {
        squareFailed++;
        console.error(`[price-change] Square sync failed for ${item.id}:`, e);
      }
    }
  };

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(changeOne));
    results.forEach((r, j) => {
      if (r.status === "rejected") {
        failed.push(batch[j]);
        console.error(`[price-change] ${batch[j]} failed:`, r.reason);
      }
    });
    if (i + CONCURRENCY < ids.length) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[price-change] user=${userId} pct=${pct} updated=${updated.length} unchanged=${unchanged} failed=${failed.length} squareFailed=${squareFailed}`);
  return NextResponse.json({ items: updated, failed, unchanged, squareFailed });
}
