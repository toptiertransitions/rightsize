import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getProjectFileById } from "@/lib/airtable";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// auth.protect() in middleware already blocks unauthenticated requests.

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const file = await getProjectFileById(id).catch(() => null);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // cloudinary.url() with sign_url hits the CDN, which still enforces the
  // "PDF via image delivery" add-on restriction even for signed URLs.
  // private_download_url() generates an API-layer download URL (hits
  // api.cloudinary.com, not res.cloudinary.com) which is authenticated via
  // timestamp+signature and bypasses all CDN delivery restrictions.
  const ext = file.fileName.split(".").pop()?.toLowerCase() ?? "";
  const downloadUrl = cloudinary.utils.private_download_url(
    file.cloudinaryPublicId,
    ext,
    {
      resource_type: file.resourceType as "image" | "raw" | "video",
      type: "upload",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }
  );

  // Redirect the browser to the time-limited authenticated URL.
  // Cloudinary serves the original file bytes at this endpoint.
  return NextResponse.redirect(downloadUrl);
}
