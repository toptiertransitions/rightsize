import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { analyzeItemPhoto } from "@/lib/anthropic";
import { uploadImage } from "@/lib/cloudinary";
import sharp from "sharp";

// Allow up to 60s for Cloudinary upload + Claude analysis
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const tenantId = formData.get("tenantId") as string | null;

  if (!file || !tenantId) {
    return NextResponse.json({ error: "Missing file or tenantId" }, { status: 400 });
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // Resize and convert to JPEG — handles HEIC/HEIF from iOS, oversized mobile photos,
  // and ensures Claude always receives a supported format at a manageable size.
  let processedBuffer: Buffer;
  try {
    processedBuffer = await sharp(rawBuffer)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    // If sharp can't handle the format, fall back to the raw buffer
    processedBuffer = rawBuffer;
  }

  // Run Cloudinary upload and Claude analysis in parallel to save time.
  // Claude always receives base64 JPEG (more reliable than depending on a Cloudinary URL).
  const [uploadResult, analysisResult] = await Promise.allSettled([
    uploadImage(rawBuffer, { tenantId, mimeType: file.type }),
    analyzeItemPhoto(processedBuffer.toString("base64")),
  ]);

  if (analysisResult.status === "rejected") {
    const reason = analysisResult.reason;
    console.error("Claude analysis failed:", reason);
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : "Analysis failed" },
      { status: 500 }
    );
  }

  if (uploadResult.status === "rejected") {
    console.error("Cloudinary upload failed (non-fatal):", uploadResult.reason);
  }

  const photoUrl = uploadResult.status === "fulfilled" ? uploadResult.value.secureUrl : "";
  const photoPublicId = uploadResult.status === "fulfilled" ? uploadResult.value.publicId : "";

  return NextResponse.json({
    analysis: {
      ...analysisResult.value,
      _photoUrl: photoUrl,
      _photoPublicId: photoPublicId,
    },
  });
}
