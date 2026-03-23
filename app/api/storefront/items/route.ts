import { NextRequest, NextResponse } from "next/server";
import { getProFoundFindsStorefrontItems } from "@/lib/airtable";

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-storefront-api-key");
  return key === process.env.STOREFRONT_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const items = await getProFoundFindsStorefrontItems();
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[storefront/items] GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
