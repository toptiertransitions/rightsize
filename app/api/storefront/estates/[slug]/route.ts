import { NextRequest, NextResponse } from "next/server";
import { getEstateWithItems, computeDutchPrice } from "@/lib/estate-utils";

export const dynamic = "force-dynamic";

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
    const saleStartMs = estate.saleStartDate
      ? (() => {
          const [y, mo, d] = estate.saleStartDate.slice(0, 10).split("-").map(Number);
          let h = 0, min = 0;
          if (estate.saleStartTime) {
            const m = estate.saleStartTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (m) { h = parseInt(m[1]); min = parseInt(m[2]); if (m[3].toUpperCase() === "PM" && h !== 12) h += 12; if (m[3].toUpperCase() === "AM" && h === 12) h = 0; }
          }
          const off = mo >= 4 && mo <= 10 ? 5 : 6;
          return Date.UTC(y, mo - 1, d, h + off, min, 0);
        })()
      : 0;
    const elapsedH = saleStartMs ? Math.round((now - saleStartMs) / 3_600_000 * 10) / 10 : null;
    const nDrops = (saleStartMs && estate.dropIntervalHours) ? Math.floor((now - saleStartMs) / (estate.dropIntervalHours * 3_600_000)) : null;
    console.log(`[estates/${slug}] id=${estate.id} items=${items.length} saleStart=${estate.saleStartDate} ${estate.saleStartTime || ""} dropPct=${estate.dropPercent} dropEvery=${estate.dropIntervalHours}h floor=${estate.floorPercent}% elapsedH=${elapsedH} nDrops=${nDrops}`);
    const itemsWithPrice = items.map((item) => {
      const pricing = computeDutchPrice(item.valueMid, estate, now);
      return { ...item, ...pricing, estateSaleSlug: estate.slug };
    });
    return NextResponse.json({ estate, items: itemsWithPrice });
  } catch (e) {
    console.error(`[storefront/estates/${slug}] GET error:`, e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
