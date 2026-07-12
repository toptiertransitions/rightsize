import { NextRequest, NextResponse } from "next/server";
import { getStorefrontBuyersByEmail } from "@/lib/airtable";

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-storefront-api-key");
  return key === process.env.STOREFRONT_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email");
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email query param required" }, { status: 400 });
  }

  try {
    const buyers = await getStorefrontBuyersByEmail(email);
    return NextResponse.json({ buyers });
  } catch (e) {
    console.error("[storefront/buyers] GET error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
