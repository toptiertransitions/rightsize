export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getEstateById,
  getStorefrontBuyersByEstate,
  getItemsForEstateSale,
} from "@/lib/airtable";
import { renderPickupSheetPDF } from "@/lib/estate-pickup-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTManager", "TTTAdmin"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [estate, buyers, items] = await Promise.all([
    getEstateById(id).catch(() => null),
    getStorefrontBuyersByEstate(id).catch(() => []),
    getItemsForEstateSale(id).catch(() => []),
  ]);

  if (!estate) return NextResponse.json({ error: "Estate not found" }, { status: 404 });

  // Build item name → photo URL + barcode map from Items table
  const itemData = items.map(item => ({
    itemName: item.itemName,
    photoUrl: item.photos?.[0]?.url || undefined,
    barcodeNumber: item.barcodeNumber,
  }));

  const pdfBuffer = await renderPickupSheetPDF({ estate, buyers, items: itemData });

  const slug = estate.slug || id;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pickup-sheet-${slug}.pdf"`,
    },
  });
}
