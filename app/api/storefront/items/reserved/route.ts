import { NextRequest, NextResponse } from "next/server";
import { getReservedStorefrontItems } from "@/lib/airtable";

function checkAuth(req: NextRequest): boolean {
  return req.headers.get("x-storefront-api-key") === process.env.STOREFRONT_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const items = await getReservedStorefrontItems();
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
