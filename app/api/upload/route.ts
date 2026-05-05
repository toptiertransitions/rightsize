import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { uploadImage, uploadFile } from "@/lib/cloudinary";
import sharp from "sharp";

export const maxDuration = 30;

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

  // HEIC files from Chrome arrive with an empty MIME type — detect by extension.
  const isHeicByExtension = /\.(heic|heif)$/i.test(file.name);
  const rawMime = file.type || "application/octet-stream";
  const mimeType = (rawMime === "application/octet-stream" && isHeicByExtension)
    ? "image/heic"
    : rawMime;
  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // PDFs and other non-image files — upload as raw files, skip image processing
  if (!mimeType.startsWith("image/")) {
    try {
      const result = await uploadFile(rawBuffer, {
        tenantId: tenantId ?? "admin",
        mimeType,
        resourceType: "raw",
      });
      return NextResponse.json({ photoUrl: result.secureUrl, photoPublicId: result.publicId });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  // Images — resize and convert to JPEG via sharp
  let processedBuffer: Buffer;
  try {
    processedBuffer = await sharp(rawBuffer)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    processedBuffer = rawBuffer;
  }

  // Check if sharp produced a valid JPEG.
  const isJpeg = processedBuffer[0] === 0xff && processedBuffer[1] === 0xd8;

  // Detect HEIC by magic bytes (ISO BMFF ftyp box at offset 4) so we catch the
  // case where iOS labels a HEIC file as image/jpeg or sends it with a .jpg extension.
  const isHeicMagicBytes =
    rawBuffer.length >= 12 &&
    rawBuffer.slice(4, 8).toString("ascii") === "ftyp" &&
    /^(heic|heix|hevc|hevx|mif1|msf1|miaf|MiHE|MiHB)/i.test(rawBuffer.slice(8, 12).toString("ascii"));
  const isHeic = isHeicByExtension || mimeType === "image/heic" || mimeType === "image/heif" || isHeicMagicBytes;

  try {
    if (isJpeg) {
      // Sharp converted successfully — upload as JPEG.
      const result = await uploadImage(processedBuffer, { tenantId: tenantId ?? "admin", mimeType: "image/jpeg" });
      return NextResponse.json({ photoUrl: result.secureUrl, photoPublicId: result.publicId });
    } else if (isHeic) {
      // Sharp couldn't convert HEIC (no libheif on Vercel) — Cloudinary handles HEIC natively.
      const result = await uploadImage(rawBuffer, { tenantId: tenantId ?? "admin", mimeType: "image/heic" });
      return NextResponse.json({ photoUrl: result.secureUrl, photoPublicId: result.publicId });
    } else {
      // Sharp failed on a non-HEIC image — upload raw and let Cloudinary handle it.
      // This covers edge cases like malformed JPEGs or formats sharp doesn't support.
      const result = await uploadImage(rawBuffer, { tenantId: tenantId ?? "admin", mimeType });
      return NextResponse.json({ photoUrl: result.secureUrl, photoPublicId: result.publicId });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
