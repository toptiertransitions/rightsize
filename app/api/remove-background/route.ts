import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { removeBackgroundFromUrl } from "@/lib/cloudinary";

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
    // Cloudinary AI Background Removal add-on — re-uploads the photo as a transparent PNG
    const uploaded = await removeBackgroundFromUrl(url, { tenantId });

    return NextResponse.json({
      photoUrl: uploaded.secureUrl,
      photoPublicId: uploaded.publicId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Background removal failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
