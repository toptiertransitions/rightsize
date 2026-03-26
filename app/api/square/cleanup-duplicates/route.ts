import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getItemsByPrimaryRoute, updateItem } from "@/lib/airtable";
import { findAllSquareItemsBySku, deleteSquareCatalogObject } from "@/lib/square";

export interface CleanupResult {
  barcode: string;
  itemName: string;
  found: number;        // total Square entries for this SKU
  kept: string;         // Square item ID we kept
  deleted: string[];    // Square item IDs we deleted
  airtableUpdated: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (!["TTTManager", "TTTAdmin"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun === true;

  // Fetch all PFInventory items that have a barcode
  const allItems = await getItemsByPrimaryRoute("ProFoundFinds Consignment");
  const itemsWithBarcode = allItems.filter((i) => i.barcodeNumber);

  const results: CleanupResult[] = [];
  let totalDeleted = 0;

  for (const item of itemsWithBarcode) {
    const sku = String(item.barcodeNumber).trim();

    try {
      const matches = await findAllSquareItemsBySku(sku);

      if (matches.length <= 1) {
        // No duplicates — nothing to do
        continue;
      }

      // Decide which to keep: prefer the one matching the stored squareCatalogItemId
      const preferredIdx = item.squareCatalogItemId
        ? matches.findIndex((m) => m.itemId === item.squareCatalogItemId)
        : -1;

      const keepIdx = preferredIdx >= 0 ? preferredIdx : 0;
      const keep = matches[keepIdx];
      const toDelete = matches.filter((_, i) => i !== keepIdx);

      const deleted: string[] = [];
      if (!dryRun) {
        for (const dup of toDelete) {
          const ok = await deleteSquareCatalogObject(dup.itemId);
          if (ok) deleted.push(dup.itemId);
        }
      } else {
        toDelete.forEach((d) => deleted.push(d.itemId));
      }

      // Update Airtable if we're keeping a different ID than what's stored
      let airtableUpdated = false;
      if (
        !dryRun &&
        (keep.itemId !== item.squareCatalogItemId || keep.variationId !== item.squareCatalogVariationId)
      ) {
        await updateItem(item.id, {
          squareCatalogItemId: keep.itemId,
          squareCatalogVariationId: keep.variationId,
        }).catch(() => null);
        airtableUpdated = true;
      }

      totalDeleted += deleted.length;
      results.push({
        barcode: sku,
        itemName: item.itemName,
        found: matches.length,
        kept: keep.itemId,
        deleted,
        airtableUpdated,
      });
    } catch (e) {
      results.push({
        barcode: sku,
        itemName: item.itemName,
        found: 0,
        kept: "",
        deleted: [],
        airtableUpdated: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Respect Square's rate limit (~100 req/min; each item = 1–2 calls)
    await new Promise((r) => setTimeout(r, 150));
  }

  return NextResponse.json({
    dryRun,
    scanned: itemsWithBarcode.length,
    duplicatesFound: results.filter((r) => !r.error).length,
    totalDeleted,
    results,
  });
}
