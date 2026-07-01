import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getItemById, createItem, updateItem, getNextBarcodeNumber } from "@/lib/airtable";
import { upsertSquareCatalogItem } from "@/lib/square";

function slugify(name: string, barcode: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${barcode}`;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin") {
    return NextResponse.json({ error: "Forbidden: only TTTManager/TTTAdmin can send items to ProFound Finds" }, { status: 403 });
  }

  const pfTenantId = process.env.PROFOUND_FINDS_TENANT_ID;
  if (!pfTenantId) {
    return NextResponse.json({ error: "ProFound Finds tenant not configured" }, { status: 500 });
  }

  const { itemId } = await req.json();
  if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

  const item = await getItemById(itemId).catch(() => null);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (!item.salePrice || item.salePrice <= 0) {
    return NextResponse.json({ error: "Price Needed to Move to ProFound Finds" }, { status: 422 });
  }

  const alreadyInPF = item.tenantId === pfTenantId;
  let movedItem = item;
  let donatedClone = null;

  if (!alreadyInPF) {
    // 1. Create a $0/Donated clone in the original project
    const cloneBarcode = await getNextBarcodeNumber();
    donatedClone = await createItem({
      tenantId: item.tenantId,
      itemName: item.itemName,
      category: item.category,
      condition: item.condition,
      conditionNotes: item.conditionNotes,
      sizeClass: item.sizeClass,
      fragility: item.fragility,
      itemType: item.itemType,
      valueLow: 0,
      valueMid: 0,
      valueHigh: 0,
      photos: item.photos,
      brand: item.brand,
      roomId: item.roomId,
      primaryRoute: "Donate",
      status: "Donated",
      completedDate: new Date().toISOString().split("T")[0],
      salePrice: 0,
      barcodeNumber: cloneBarcode,
      clientSharePercent: 0,
      quantity: item.quantity,
    });

    // 2. Move original to ProFound Finds project
    const pfBarcode = item.barcodeNumber || (await getNextBarcodeNumber());
    const slug = slugify(item.itemName, pfBarcode);

    movedItem = await updateItem(item.id, {
      tenantId: pfTenantId,
      primaryRoute: "ProFoundFinds Consignment",
      status: "Listed",
      storefrontActive: true,
      clientSharePercent: 67,
      barcodeNumber: pfBarcode,
      onlineListingSlug: slug,
      completedDate: "",
    });
  }

  // 3. Square sync — idempotent, deduplicates via SKU
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (locationId && movedItem.barcodeNumber) {
    try {
      const { catalogItemId, catalogVariationId } = await upsertSquareCatalogItem({
        existingItemId: movedItem.squareCatalogItemId,
        existingVariationId: movedItem.squareCatalogVariationId,
        name: movedItem.itemName,
        priceCents: Math.round((movedItem.valueMid ?? 0) * 100),
        sku: movedItem.barcodeNumber,
        locationId,
      });
      await updateItem(movedItem.id, {
        squareCatalogItemId: catalogItemId,
        squareCatalogVariationId: catalogVariationId,
        squareSyncedAt: new Date().toISOString(),
      });
      movedItem = { ...movedItem, squareCatalogItemId: catalogItemId, squareCatalogVariationId: catalogVariationId };
    } catch (e) {
      console.error("[send-to-profound] Square sync failed:", e);
    }
  }

  return NextResponse.json({ item: movedItem, clone: donatedClone, alreadyInPF });
}
