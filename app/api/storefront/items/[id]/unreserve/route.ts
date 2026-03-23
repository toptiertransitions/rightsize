import { NextRequest, NextResponse } from "next/server";
import { getItemById, updateItem } from "@/lib/airtable";

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-storefront-api-key");
  return key === process.env.STOREFRONT_API_KEY;
}

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
    if (item.primaryRoute !== "ProFoundFinds Consignment") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Only revert if still Reserved (don't clobber Sold)
    if (item.status === "Reserved") {
      await updateItem(id, { status: "Listed" });
    }
    return NextResponse.json({ status: item.status === "Reserved" ? "Listed" : item.status });
  } catch (e) {
    console.error("[storefront/items/[id]/unreserve] POST error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
