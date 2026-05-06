import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { uploadImage, uploadFile } from "@/lib/cloudinary";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const tenantId = formData.get("tenantId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  // Chrome sends HEIC files with an empty MIME type — detect by extension.
  const isHeicByExtension = /\.(heic|heif)$/i.test(file.name);
  const rawMime = file.type || "application/octet-stream";
  const mimeType = rawMime === "application/octet-stream" && isHeicByExtension
    ? "image/heic"
    : rawMime;

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // iOS camera roll sends HEIC files labeled as image/jpeg.
  // Detect the real format via ISO BMFF magic bytes (offset 4 = "ftyp") so
  // Cloudinary receives the correct MIME type and can decode the file.
  const isHeicMagicBytes =
    rawBuffer.length >= 12 &&
    rawBuffer.slice(4, 8).toString("ascii") === "ftyp" &&
    /^(heic|heix|hevc|hevx|mif1|msf1|miaf|MiHE|MiHB)/i.test(rawBuffer.slice(8, 12).toString("ascii"));
  const effectiveMimeType = isHeicMagicBytes ? "image/heic" : mimeType;

  // PDFs and other non-image files — upload as raw, skip image processing.
  if (!effectiveMimeType.startsWith("image/")) {
    try {
      const result = await uploadFile(rawBuffer, {
        tenantId: tenantId ?? "admin",
        mimeType: effectiveMimeType,
        resourceType: "raw",
      });
      return NextResponse.json({ photoUrl: result.secureUrl, photoPublicId: result.publicId });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  // All image types (JPEG, PNG, HEIC, HEIF, WebP, etc.) — upload directly to Cloudinary.
  // Cloudinary handles all formats natively and applies resize/quality transformations
  // server-side, so we don't need to pre-process with sharp.
  try {
    const result = await uploadImage(rawBuffer, {
      tenantId: tenantId ?? "admin",
      mimeType: effectiveMimeType,
    });
    return NextResponse.json({ photoUrl: result.secureUrl, photoPublicId: result.publicId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
