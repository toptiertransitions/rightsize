import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateItem } from "@/lib/airtable";
import { upsertSquareCatalogItem } from "@/lib/square";

const TERMINAL_STATUSES = ["Sold", "Donated", "Discarded", "Rejected / Revisit"];
const ALLOWED_ROLES = ["TTTStaff", "TTTManager", "TTTAdmin"];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { items } = await req.json() as {
    items: Array<{
      id: string;
      itemName: string;
      status: string;
      primaryRoute: string;
      valueMid?: number;
      barcodeNumber?: string;
      squareCatalogItemId?: string;
      squareCatalogVariationId?: string;
    }>;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  const locationId = process.env.SQUARE_LOCATION_ID;
  const errors: Array<{ id: string; name: string; reason: string }> = [];
  const squareErrors: Array<{ id: string; name: string; error: string }> = [];
  let listed = 0;
  let skipped = 0;

  for (const item of items) {
    if (TERMINAL_STATUSES.includes(item.status)) {
      errors.push({ id: item.id, name: item.itemName, reason: item.status });
      continue;
    }
    if (item.status === "Listed") {
      skipped++;
      continue;
    }

    await updateItem(item.id, { status: "Listed", storefrontActive: true });
    listed++;

    if (item.primaryRoute === "ProFoundFinds Consignment" && locationId && item.barcodeNumber) {
      try {
        const { catalogItemId, catalogVariationId } = await upsertSquareCatalogItem({
          existingItemId: item.squareCatalogItemId,
          existingVariationId: item.squareCatalogVariationId,
          name: item.itemName,
          priceCents: Math.round((item.valueMid ?? 0) * 100),
          sku: item.barcodeNumber,
          locationId,
        });
        await updateItem(item.id, {
          squareCatalogItemId: catalogItemId,
          squareCatalogVariationId: catalogVariationId,
          squareSyncedAt: new Date().toISOString(),
        });
      } catch (e) {
        squareErrors.push({ id: item.id, name: item.itemName, error: String(e) });
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }

  return NextResponse.json({ listed, skipped, errors, squareErrors });
}
