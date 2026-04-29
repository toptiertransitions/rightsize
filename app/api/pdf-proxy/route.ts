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
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  const publicId = req.nextUrl.searchParams.get("publicId");
  const resourceType = (req.nextUrl.searchParams.get("resourceType") ?? "raw") as "raw" | "image";

  if (!url) return new NextResponse("Missing url param", { status: 400 });
  if (!url.startsWith("https://res.cloudinary.com/")) {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  try {
    let fetchUrl: string;

    if (publicId) {
      // Cloudinary stores raw resources with the extension as a separate "format"
      // field, NOT as part of the public_id — even though result.public_id includes
      // it. Strip the extension and pass it as the format argument so the API
      // endpoint can locate the resource correctly.
      const extMatch = publicId.match(/\.([^./]+)$/);
      const fmt = extMatch ? extMatch[1] : "";
      const pid = extMatch ? publicId.slice(0, -fmt.length - 1) : publicId;

      fetchUrl = cloudinary.utils.private_download_url(pid, fmt, {
        resource_type: resourceType,
      });
      console.log("[pdf-proxy] private_download_url →", fetchUrl.replace(/signature=[^&]+/, "signature=REDACTED").replace(/api_key=[^&]+/, "api_key=REDACTED"));
    } else {
      // No publicId — attempt Basic Auth fetch directly (works if CDN auth not enforced)
      const cloudinaryAuth = Buffer.from(
        `${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`
      ).toString("base64");
      const upstream = await fetch(url, { headers: { Authorization: `Basic ${cloudinaryAuth}` } });
      if (!upstream.ok) {
        console.error("[pdf-proxy] basic-auth fetch status:", upstream.status);
        return new NextResponse(`Failed to fetch file (${upstream.status})`, { status: 502 });
      }
      const buffer = await upstream.arrayBuffer();
      return new NextResponse(buffer, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600" },
      });
    }

    const upstream = await fetch(fetchUrl);
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      console.error("[pdf-proxy] upstream status:", upstream.status, "body:", body.slice(0, 200));
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
