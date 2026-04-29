import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Proxy a Cloudinary raw PDF so browsers receive it with the correct
// Content-Type (application/pdf) and Content-Disposition (inline),
// allowing it to open directly in a new browser tab instead of downloading
// as an unknown file.
//
// Uses a Cloudinary-signed URL for the server-to-server fetch so it works
// even when the account has authenticated delivery enabled for raw resources.
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
    // Extract the resource_type and public_id from the URL.
    // URL format: https://res.cloudinary.com/{cloud}/raw/upload/v{version}/{public_id}
    const rawMatch = url.match(/\/raw\/upload\/v\d+\/(.+)$/);
    const imageMatch = url.match(/\/image\/upload\/(?:v\d+\/)?(.+)$/);

    let fetchUrl = url;

    if (rawMatch) {
      const publicId = rawMatch[1];
      // private_download_url uses the Cloudinary API endpoint with API key
      // authentication, bypassing CDN delivery restrictions on raw resources.
      fetchUrl = cloudinary.utils.private_download_url(publicId, "", {
        resource_type: "raw",
        attachment: false,
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });
    } else if (imageMatch) {
      const publicId = imageMatch[1];
      fetchUrl = cloudinary.utils.private_download_url(publicId, "", {
        resource_type: "image",
        attachment: false,
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });
    }

    const upstream = await fetch(fetchUrl);
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
