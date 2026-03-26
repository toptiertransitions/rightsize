import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getItemsByPrimaryRoute, updateItem } from "@/lib/airtable";
import { listAllSquareCatalogVariationsWithSku, batchDeleteSquareCatalogObjects } from "@/lib/square";

/**
 * POST /api/square/full-reset
 *
 * Full nuclear reset of Square catalog for PFInventory:
 * 1. Fetches all PFInventory items from Airtable to build a barcode set.
 * 2. Lists ALL Square ITEM_VARIATIONs (paginated) and finds every entry whose
 *    SKU matches a PFInventory barcode — this catches duplicates even if they
 *    lack a proper SKU (those won't match and are left alone).
 * 3. Also collects any squareCatalogItemId stored in Airtable as a fallback
 *    so stale IDs pointing to deleted/renamed items are also removed.
 * 4. Batch-deletes all collected Square item IDs.
 * 5. Clears squareCatalogItemId, squareCatalogVariationId, squareSyncedAt
 *    in Airtable for every PFInventory item (so next sync starts fresh).
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (!["TTTManager", "TTTAdmin"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun === true;

  // ── Step 1: Load all PFInventory items ──────────────────────────────────────
  const allItems = await getItemsByPrimaryRoute("ProFoundFinds Consignment");
  const barcodeSet = new Set<string>();
  for (const item of allItems) {
    if (item.barcodeNumber) barcodeSet.add(String(item.barcodeNumber).trim());
  }

  // ── Step 2: List ALL Square ITEM_VARIATIONs and match by SKU ───────────────
  const allVariations = await listAllSquareCatalogVariationsWithSku();
  const squareItemIdsToDelete = new Set<string>();

  for (const v of allVariations) {
    if (barcodeSet.has(v.sku)) {
      squareItemIdsToDelete.add(v.itemId);
    }
  }

  // ── Step 3: Also include stale stored Square IDs from Airtable ──────────────
  for (const item of allItems) {
    if (item.squareCatalogItemId) {
      squareItemIdsToDelete.add(item.squareCatalogItemId);
    }
  }

  const idsArray = Array.from(squareItemIdsToDelete);

  // ── Step 4: Batch-delete from Square ────────────────────────────────────────
  let squareDeleted = 0;
  let squareFailed = 0;
  if (!dryRun && idsArray.length > 0) {
    const result = await batchDeleteSquareCatalogObjects(idsArray);
    squareDeleted = result.deleted;
    squareFailed = result.failed;
  } else {
    squareDeleted = idsArray.length; // dry run: report what would be deleted
  }

  // ── Step 5: Clear Airtable Square IDs for all PFInventory items ─────────────
  let airtableCleared = 0;
  let airtableFailed = 0;
  if (!dryRun) {
    const itemsWithSquareData = allItems.filter(
      (i) => i.squareCatalogItemId || i.squareCatalogVariationId || i.squareSyncedAt
    );
    for (const item of itemsWithSquareData) {
      try {
        await updateItem(item.id, {
          squareCatalogItemId: "",
          squareCatalogVariationId: "",
          squareSyncedAt: "",
        });
        airtableCleared++;
      } catch {
        airtableFailed++;
      }
      // Respect Airtable rate limits (5 req/s)
      await new Promise((r) => setTimeout(r, 210));
    }
  } else {
    airtableCleared = allItems.filter((i) => i.squareCatalogItemId || i.squareSyncedAt).length;
  }

  return NextResponse.json({
    dryRun,
    scanned: allItems.length,
    barcodesFound: barcodeSet.size,
    squareVariationsScanned: allVariations.length,
    squareItemsFound: idsArray.length,
    squareDeleted,
    squareFailed,
    airtableCleared,
    airtableFailed,
  });
}
