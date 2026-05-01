import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getProjectFileById } from "@/lib/airtable";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// auth.protect() in middleware already blocks unauthenticated requests
// before this handler runs, so we don't need a redundant auth() check here.

const MIME_MAP: Record<string, string> = {
  pdf:  "application/pdf",
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  gif:  "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  svg:  "image/svg+xml",
  doc:  "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:  "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function mimeForFile(fileName: string, resourceType: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (MIME_MAP[ext]) return MIME_MAP[ext];
  if (resourceType === "image") return "image/jpeg";
  return "application/octet-stream";
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const file = await getProjectFileById(id).catch(() => null);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generate a server-signed URL so Cloudinary serves the file regardless of
  // delivery restrictions (e.g. image-type PDFs require a paid add-on for public
  // delivery but are always accessible via signed URLs with API credentials).
  const signedUrl = cloudinary.url(file.cloudinaryPublicId, {
    resource_type: file.resourceType as "image" | "raw" | "video",
    sign_url: true,
    secure: true,
    type: "upload",
  });

  const upstream = await fetch(signedUrl);
  if (!upstream.ok) {
    return NextResponse.json({ error: "Failed to fetch file from storage" }, { status: 502 });
  }

  const contentType = mimeForFile(file.fileName, file.resourceType);

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${file.fileName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
