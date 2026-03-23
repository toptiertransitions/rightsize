import { NextRequest, NextResponse } from "next/server";
import { getItemById, getItemByOnlineSlug } from "@/lib/airtable";

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
    // Gate: must be ProFoundFinds Consignment route
    if (item.primaryRoute !== "ProFoundFinds Consignment") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (e) {
    console.error("[storefront/items/[id]] GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
