import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

interface GeoComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { address, city, state, zip } = await req.json();
  if (!address) return NextResponse.json({ status: "not_found" });

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ status: "match" }); // graceful degradation

  const query = [address, city, state, zip].filter(Boolean).join(", ");
  let geoData: { status: string; results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } }; address_components: GeoComponent[] }[] };
  try {
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
    );
    geoData = await geoRes.json();
  } catch {
    return NextResponse.json({ status: "match" }); // skip validation on network error
  }

  if (geoData.status !== "OK" || !geoData.results?.length) {
    return NextResponse.json({ status: "not_found" });
  }

  const result = geoData.results[0];
  const comps = result.address_components;
  const get = (type: string) => comps.find((c) => c.types.includes(type));

  const streetNumber = get("street_number")?.long_name ?? "";
  const route = get("route")?.long_name ?? "";
  const suggestedAddress = [streetNumber, route].filter(Boolean).join(" ");
  const suggestedCity =
    get("locality")?.long_name ??
    get("sublocality_level_1")?.long_name ??
    get("administrative_area_level_3")?.long_name ?? "";
  const suggestedState = get("administrative_area_level_1")?.short_name ?? "";
  const suggestedZip = get("postal_code")?.long_name ?? "";
  const { lat, lng } = result.geometry.location;

  const norm = (s: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const same =
    (!suggestedAddress || norm(suggestedAddress) === norm(address ?? "")) &&
    (!suggestedCity || norm(suggestedCity) === norm(city ?? "")) &&
    (!suggestedState || norm(suggestedState) === norm(state ?? "")) &&
    (!suggestedZip || norm(suggestedZip) === norm(zip ?? ""));

  if (same) {
    return NextResponse.json({ status: "match", lat, lng });
  }

  return NextResponse.json({
    status: "suggestion",
    suggestedAddress,
    suggestedCity,
    suggestedState,
    suggestedZip,
    suggestedFormatted: result.formatted_address,
    lat,
    lng,
  });
}
