import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateItem } from "@/lib/airtable";
import { upsertSquareCatalogItem } from "@/lib/square";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (!["TTTManager", "TTTAdmin"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    return NextResponse.json({ error: "Square not configured" }, { status: 503 });
  }

  const { items } = await req.json() as {
    items: Array<{
      id: string;
      itemName: string;
      valueMid: number;
      barcodeNumber: string;
      squareCatalogItemId?: string;
      squareCatalogVariationId?: string;
    }>;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  const results: Array<{ id: string; name: string; success: boolean; error?: string }> = [];

  for (const item of items) {
    if (!item.barcodeNumber) {
      results.push({ id: item.id, name: item.itemName, success: false, error: "No barcode number" });
      continue;
    }

    try {
      const { catalogItemId, catalogVariationId } = await upsertSquareCatalogItem({
        existingItemId: item.squareCatalogItemId,
        existingVariationId: item.squareCatalogVariationId,
        name: item.itemName,
        priceCents: Math.round(item.valueMid * 100),
        sku: item.barcodeNumber,
        locationId,
      });

      await updateItem(item.id, {
        squareCatalogItemId: catalogItemId,
        squareCatalogVariationId: catalogVariationId,
        squareSyncedAt: new Date().toISOString(),
      });

      results.push({ id: item.id, name: item.itemName, success: true });
    } catch (e) {
      results.push({ id: item.id, name: item.itemName, success: false, error: String(e) });
    }

    // Small delay to avoid hitting Square's catalog API rate limit (~100 req/min)
    await new Promise(r => setTimeout(r, 120));
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  return NextResponse.json({ succeeded, failed, results });
}
