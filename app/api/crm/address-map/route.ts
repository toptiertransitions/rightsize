import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  if (!lat || !lng) return new NextResponse("Bad Request", { status: 400 });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return new NextResponse("Not configured", { status: 503 });

  const mapUrl =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}&zoom=15&size=400x180&scale=2` +
    `&markers=color:red%7C${lat},${lng}&key=${apiKey}`;

  try {
    const imgRes = await fetch(mapUrl);
    if (!imgRes.ok) return new NextResponse("Map fetch failed", { status: 502 });
    const buffer = await imgRes.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": imgRes.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Map fetch failed", { status: 502 });
  }
}
