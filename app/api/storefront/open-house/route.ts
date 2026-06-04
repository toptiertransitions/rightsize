import { NextRequest, NextResponse } from "next/server";
import { getOpenHouseDates } from "@/lib/airtable";

export const revalidate = 3600;

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-storefront-api-key");
  return key === process.env.STOREFRONT_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dates = await getOpenHouseDates(true).catch(() => []);
  return NextResponse.json({ dates });
}
