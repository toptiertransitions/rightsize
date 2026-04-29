import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// Proxy a Cloudinary raw PDF so browsers receive it with the correct
// Content-Type (application/pdf) and Content-Disposition (inline),
// allowing it to open directly in a new browser tab instead of downloading
// as an unknown file.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Missing url param", { status: 400 });

  // Only proxy Cloudinary URLs — reject anything else
  if (!url.startsWith("https://res.cloudinary.com/")) {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  try {
    // Use HTTP Basic Auth to fetch from Cloudinary — this works regardless of
    // whether the account has authenticated delivery enabled on raw resources.
    const cloudinaryAuth = Buffer.from(
      `${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`
    ).toString("base64");

    const upstream = await fetch(url, {
      headers: { Authorization: `Basic ${cloudinaryAuth}` },
    });
    if (!upstream.ok) {
      return new NextResponse(`Failed to fetch file (${upstream.status})`, { status: 502 });
    }
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[pdf-proxy] error:", e);
    return new NextResponse("Proxy error", { status: 500 });
  }
}
