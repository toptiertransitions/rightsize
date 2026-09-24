import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import zipcodes from "zipcodes";
import { isTTTAdmin } from "@/lib/config";

// Read-only reference data for the admin Zip Coverage tool — the full
// `zipcodes` package (a ~5MB flat file) stays server-side; the client only
// ever gets the small per-state slice it asked for.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const state = (req.nextUrl.searchParams.get("state") || "").toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(state)) return NextResponse.json({ error: "A 2-letter state code is required" }, { status: 400 });

  const records = zipcodes.lookupByState(state) ?? [];
  const zips = records
    .filter((r) => r.zip && r.latitude != null && r.longitude != null)
    .map((r) => ({ zip: r.zip, city: r.city, lat: r.latitude, lng: r.longitude }))
    .sort((a, b) => a.zip.localeCompare(b.zip));

  return NextResponse.json({ state, zips });
}
