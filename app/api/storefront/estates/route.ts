import { NextRequest, NextResponse } from "next/server";
import { getEstatesForStorefront, getItemsForEstateSale } from "@/lib/airtable";
import { computeDutchPrice } from "@/lib/estate-utils";

export const revalidate = 60;

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-storefront-api-key");
  return key === process.env.STOREFRONT_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ?type=Online or ?type=In-Person — omit for all
  const saleType = req.nextUrl.searchParams.get("type") ?? undefined;
  try {
    const estates = await getEstatesForStorefront(saleType);
    const now = Date.now();

    const result = await Promise.all(
      estates.map(async (estate) => {
        if (estate.saleType === "Online") {
          const items = await getItemsForEstateSale(estate.id);
          const itemsWithPrice = items.map((item) => {
            const pricing = computeDutchPrice(item.valueMid, estate, now);
            return { ...item, ...pricing };
          });
          return { ...estate, items: itemsWithPrice, itemCount: items.length };
        }
        // In-Person: no items/pricing, just estate data
        return { ...estate, items: [], itemCount: 0 };
      })
    );
    return NextResponse.json({ estates: result });
  } catch (e) {
    console.error("[storefront/estates] GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
