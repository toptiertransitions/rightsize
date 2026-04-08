import { NextRequest, NextResponse } from "next/server";
import { getEstateWithItems, computeDutchPrice } from "@/lib/estate-utils";

export const revalidate = 60;

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-storefront-api-key");
  return key === process.env.STOREFRONT_API_KEY;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { slug } = await params;
  try {
    const result = await getEstateWithItems(slug);
    if (!result) {
      return NextResponse.json({ error: "Estate not found" }, { status: 404 });
    }
    const { estate, items } = result;
    const now = Date.now();
    console.log(`[estates/${slug}] id=${estate.id} items_found=${items.length} item_ids=${items.map(i => i.id).join(",")}`);
    const itemsWithPrice = items.map((item) => {
      const pricing = computeDutchPrice(item.valueMid, estate, now);
      return { ...item, ...pricing };
    });
    return NextResponse.json({ estate, items: itemsWithPrice });
  } catch (e) {
    console.error(`[storefront/estates/${slug}] GET error:`, e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
