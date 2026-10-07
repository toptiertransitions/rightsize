import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getEstateById, getItemsForEstateSale, getStorefrontBuyersByEstate } from "@/lib/airtable";

// Home Pickup sale detail for pickup day: the items on the sale (sold vs
// available) and every online order with the buyer's contact info.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId).catch(() => null);
  if (role !== "TTTAdmin" && role !== "TTTManager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [estate, items, buyers] = await Promise.all([
    getEstateById(id),
    getItemsForEstateSale(id).catch(() => []),
    getStorefrontBuyersByEstate(id).catch(() => []),
  ]);
  if (!estate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // One order row per buyer, listing everything they bought
  const byBuyer = new Map<string, { name: string; email: string; phone?: string; items: string[]; total: number; firstAt: string }>();
  for (const b of buyers) {
    const key = b.buyerEmail.toLowerCase().trim();
    const row = byBuyer.get(key) ?? { name: b.buyerName, email: b.buyerEmail, phone: b.buyerPhone, items: [], total: 0, firstAt: b.createdAt };
    row.items.push(b.quantityPurchased && b.quantityPurchased > 1 ? `${b.itemName} ×${b.quantityPurchased}` : b.itemName);
    row.total += b.purchaseAmount || 0;
    if (!row.phone && b.buyerPhone) row.phone = b.buyerPhone;
    if (b.createdAt < row.firstAt) row.firstAt = b.createdAt;
    byBuyer.set(key, row);
  }

  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      itemName: i.itemName,
      status: i.status,
      price: i.salePrice || i.valueMid || 0,
      barcodeNumber: i.barcodeNumber,
      photoUrl: i.photoUrl,
    })),
    orders: [...byBuyer.values()].sort((a, b) => a.firstAt.localeCompare(b.firstAt)),
  });
}
