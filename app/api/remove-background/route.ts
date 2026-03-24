import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { removeBackground } from "@/lib/remove-bg";
import { uploadPng } from "@/lib/cloudinary";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { url?: string; tenantId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, tenantId } = body;
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  try {
    // Fetch the image from Cloudinary
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
    const imageBuffer = Buffer.from(await imgRes.arrayBuffer());

    // Remove background
    const pngBuffer = await removeBackground(imageBuffer);

    // Upload PNG to Cloudinary
    const uploaded = await uploadPng(pngBuffer, { tenantId });

    return NextResponse.json({
      photoUrl: uploaded.secureUrl,
      photoPublicId: uploaded.publicId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Background removal failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
