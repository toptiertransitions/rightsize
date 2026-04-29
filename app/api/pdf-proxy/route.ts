import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Proxy a Cloudinary raw PDF so browsers receive it with the correct
// Content-Type (application/pdf) and Content-Disposition (inline).
// Accepts an optional `publicId` query param (the stored Cloudinary public_id).
// When present, uses private_download_url (api.cloudinary.com) which bypasses
// CDN authenticated-delivery restrictions entirely.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  const publicId = req.nextUrl.searchParams.get("publicId");
  const resourceType = (req.nextUrl.searchParams.get("resourceType") ?? "raw") as "raw" | "image";

  if (!url) return new NextResponse("Missing url param", { status: 400 });

  // Only proxy Cloudinary URLs — reject anything else
  if (!url.startsWith("https://res.cloudinary.com/")) {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  try {
    let fetchUrl: string;

    if (publicId) {
      // Use api.cloudinary.com download URL (HMAC-signed) — works regardless of
      // CDN authenticated-delivery settings on the account.
      fetchUrl = cloudinary.utils.private_download_url(publicId, "", {
        resource_type: resourceType,
        attachment: false,
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });
    } else {
      // Fallback: attempt Basic Auth fetch directly against the CDN URL.
      // This works for accounts that don't enforce signed CDN delivery.
      const cloudinaryAuth = Buffer.from(
        `${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`
      ).toString("base64");
      const upstream = await fetch(url, { headers: { Authorization: `Basic ${cloudinaryAuth}` } });
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
