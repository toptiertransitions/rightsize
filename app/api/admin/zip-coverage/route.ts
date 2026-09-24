import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import zipcodes from "zipcodes";
import { isTTTAdmin } from "@/lib/config";

// Read-only reference data for the admin Zip Coverage tool — the full
// `zipcodes` package (a ~5MB flat file) stays server-side; the client only
// ever gets the small slice it asked for (a state, or a radius around a
// zip code).
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const originZip = req.nextUrl.searchParams.get("zip")?.trim();
  const radiusMilesParam = req.nextUrl.searchParams.get("radiusMiles");

  if (originZip || radiusMilesParam) {
    if (!originZip || !/^\d{5}$/.test(originZip)) {
      return NextResponse.json({ error: "Enter a valid 5-digit home zip code" }, { status: 400 });
    }
    const miles = Number(radiusMilesParam);
    if (!Number.isFinite(miles) || miles <= 0 || miles > 500) {
      return NextResponse.json({ error: "Enter a radius between 1 and 500 miles" }, { status: 400 });
    }
    if (!zipcodes.lookup(originZip)) {
      return NextResponse.json({ error: `Zip code ${originZip} wasn't found` }, { status: 404 });
    }

    const nearbyZips = (zipcodes.radius(originZip, miles) ?? []) as string[];
    const zips = nearbyZips
      .map((z) => zipcodes.lookup(z))
      .filter((r): r is NonNullable<typeof r> => !!r && r.latitude != null && r.longitude != null)
      .map((r) => ({ zip: r.zip, city: r.city, lat: r.latitude, lng: r.longitude }))
      .sort((a, b) => a.zip.localeCompare(b.zip));

    return NextResponse.json({ mode: "radius", originZip, radiusMiles: miles, zips });
  }

  const state = (req.nextUrl.searchParams.get("state") || "").toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(state)) return NextResponse.json({ error: "A 2-letter state code is required" }, { status: 400 });

  const records = zipcodes.lookupByState(state) ?? [];
  const zips = records
    .filter((r) => r.zip && r.latitude != null && r.longitude != null)
    .map((r) => ({ zip: r.zip, city: r.city, lat: r.latitude, lng: r.longitude }))
    .sort((a, b) => a.zip.localeCompare(b.zip));

  return NextResponse.json({ mode: "state", state, zips });
}
