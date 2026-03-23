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

  // Validate sharp produced a real JPEG before uploading.
  const isJpeg = processedBuffer[0] === 0xff && processedBuffer[1] === 0xd8;
  if (!isJpeg) {
    return NextResponse.json(
      { error: "Could not convert this image format. Please convert your photo to JPEG or PNG before uploading. On iPhone: share the photo → Save to Files → choose JPEG format." },
      { status: 400 }
    );
  }

  try {
    const result = await uploadImage(processedBuffer, { tenantId: tenantId ?? "admin", mimeType: "image/jpeg" });
    return NextResponse.json({ photoUrl: result.secureUrl, photoPublicId: result.publicId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
