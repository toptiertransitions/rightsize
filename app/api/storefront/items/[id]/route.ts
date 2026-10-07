import { NextRequest, NextResponse } from "next/server";
import { getItemById, getItemByOnlineSlug } from "@/lib/airtable";
import { checkStorefrontItem } from "@/lib/storefront-gate";

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-storefront-api-key");
  return key === process.env.STOREFRONT_API_KEY;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    // Try by Airtable ID first, then by slug
    let item = await getItemById(id).catch(() => null);
    if (!item) {
      item = await getItemByOnlineSlug(id);
    }
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Gate: Consignment / Estate Sale route, or an FB/Marketplace item on a
    // live Home Pickup sale
    const gate = await checkStorefrontItem(item, { requireLive: true });
    if (!gate.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // For estate sale items, append the sale slug (client-side price
    // validation) and type (Home Pickup items route to their own pages)
    const estateSaleSlug = gate.estate?.slug || undefined;
    const estateSaleType = gate.estate?.saleType || undefined;

    return NextResponse.json({ item: { ...item, estateSaleSlug, estateSaleType } });
  } catch (e) {
    console.error("[storefront/items/[id]] GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
