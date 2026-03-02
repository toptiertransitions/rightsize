import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { uploadImage } from "@/lib/cloudinary";
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

  if (!file || !tenantId) {
    return NextResponse.json({ error: "Missing file or tenantId" }, { status: 400 });
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  let processedBuffer: Buffer;
  try {
    processedBuffer = await sharp(rawBuffer)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    processedBuffer = rawBuffer;
  }

  try {
    const result = await uploadImage(processedBuffer, { tenantId, mimeType: "image/jpeg" });
    return NextResponse.json({ photoUrl: result.secureUrl, photoPublicId: result.publicId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
