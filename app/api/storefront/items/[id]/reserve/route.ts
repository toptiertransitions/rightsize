import { NextRequest, NextResponse } from "next/server";
import { getItemById, updateItem } from "@/lib/airtable";

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-storefront-api-key");
  return key === process.env.STOREFRONT_API_KEY;
}

const RESERVATION_TTL_SECONDS = 900; // 15 minutes

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const item = await getItemById(id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (item.primaryRoute !== "ProFoundFinds Consignment" && item.primaryRoute !== "Estate Sale") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (item.status !== "Listed") {
      return NextResponse.json(
        { error: "Item is not available for reservation", status: item.status },
        { status: 409 }
      );
    }
    await updateItem(id, { status: "In Cart" });
    const reservedUntil = new Date(Date.now() + RESERVATION_TTL_SECONDS * 1000).toISOString();
    return NextResponse.json({ reservedUntil });
  } catch (e) {
    console.error("[storefront/items/[id]/reserve] POST error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
