import { NextRequest, NextResponse } from "next/server";
import { getProFoundFindsStorefrontItems, getTenants } from "@/lib/airtable";
import { autoDiscountPct, chicagoToday, dropSettings } from "@/lib/pricing/autoDrop";

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-storefront-api-key");
  return key === process.env.STOREFRONT_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [rawItems, tenants] = await Promise.all([getProFoundFindsStorefrontItems(), getTenants().catch(() => [])]);
    // Shop catalog's "% Off" ribbon: only for a price set by automated pricing
    const tenantById = new Map(tenants.map((t) => [t.id, t]));
    const today = chicagoToday();
    const items = rawItems.map((item) => ({
      ...item,
      autoDiscountPct: autoDiscountPct(item, dropSettings(tenantById.get(item.tenantId)), today),
    }));
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[storefront/items] GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
