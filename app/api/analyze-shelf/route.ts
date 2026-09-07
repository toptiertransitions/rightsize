import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { analyzeShelfPhoto } from "@/lib/anthropic";
import { uploadImage } from "@/lib/cloudinary";
import sharp from "sharp";

// Shelf analysis can take longer — many items to identify
export const maxDuration = 90;

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
  if (!file || !tenantId) return NextResponse.json({ error: "Missing file or tenantId" }, { status: 400 });

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // Use higher resolution than single-item analysis — spines need to be readable
  let processedBuffer: Buffer;
  try {
    processedBuffer = await sharp(rawBuffer)
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    processedBuffer = rawBuffer;
  }

  const isJpeg = processedBuffer[0] === 0xff && processedBuffer[1] === 0xd8;
  if (!isJpeg) {
    return NextResponse.json(
      { error: "Could not convert this image. Please use JPEG or PNG." },
      { status: 400 }
    );
  }

  const [uploadResult, analysisResult] = await Promise.allSettled([
    uploadImage(processedBuffer, { tenantId, mimeType: "image/jpeg" }),
    analyzeShelfPhoto(processedBuffer.toString("base64")),
  ]);

  if (analysisResult.status === "rejected") {
    console.error("[analyze-shelf] Claude failed:", analysisResult.reason);
    return NextResponse.json(
      { error: analysisResult.reason instanceof Error ? analysisResult.reason.message : "Shelf analysis failed" },
      { status: 500 }
    );
  }

  if (uploadResult.status === "rejected") {
    console.error("[analyze-shelf] Cloudinary upload failed (non-fatal):", uploadResult.reason);
  }

  const photoUrl = uploadResult.status === "fulfilled" ? uploadResult.value.secureUrl : "";
  const photoPublicId = uploadResult.status === "fulfilled" ? uploadResult.value.publicId : "";

  return NextResponse.json({
    items: analysisResult.value,
    photoUrl,
    photoPublicId,
  });
}
