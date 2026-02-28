import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";
import { getAllItems, updateItem, getItemById } from "@/lib/airtable";

// GET /api/admin/circle-hand — return all items for matching
export async function GET() {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await getAllItems();
  return NextResponse.json({ items });
}

// POST /api/admin/circle-hand — process matched import rows
interface ImportUpdate {
  rightsizeItemId: string;
  salePrice: number;
  consignorPayout: number;
  saleDate: string;
  circleHandItemId: string;
  chDescription: string;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { updates: ImportUpdate[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { updates } = body;
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  let updated = 0;
  let skipped = 0;
  const errors: Array<{ name: string; reason: string }> = [];

  for (const u of updates) {
    if (!u.rightsizeItemId) {
      errors.push({ name: u.chDescription ?? "Unknown", reason: "No Rightsize item selected" });
      continue;
    }

    try {
      const current = await getItemById(u.rightsizeItemId);
      if (!current) {
        errors.push({ name: u.chDescription, reason: "Rightsize item not found" });
        continue;
      }

      // Never overwrite existing sale_price
      if (current.salePrice != null && current.salePrice > 0) {
        skipped++;
        continue;
      }

      await updateItem(u.rightsizeItemId, {
        salePrice: u.salePrice,
        consignorPayout: u.consignorPayout,
        saleDate: u.saleDate,
        circleHandItemId: u.circleHandItemId,
        routingStatus: "Sold - Consignment",
        // TODO: Log RoutingHistory "Sale Logged" event when Sessions 2/3 are built
      });

      updated++;
    } catch (err) {
      errors.push({
        name: u.chDescription,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ updated, skipped, errors });
}
