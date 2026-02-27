import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { analyzeItemPhoto } from "@/lib/anthropic";
import { uploadImage } from "@/lib/cloudinary";

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

  // Convert file to buffer
  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload to Cloudinary first (so we have a URL for Claude)
  let photoUrl = "";
  let photoPublicId = "";
  try {
    const upload = await uploadImage(buffer, { tenantId });
    photoUrl = upload.secureUrl;
    photoPublicId = upload.publicId;
  } catch (err) {
    console.error("Cloudinary upload failed:", err);
    // Fall back to base64 analysis
  }

  // Analyze with Claude
  let analysis;
  try {
    if (photoUrl) {
      analysis = await analyzeItemPhoto({ url: photoUrl });
    } else {
      analysis = await analyzeItemPhoto(buffer.toString("base64"));
    }
  } catch (err) {
    console.error("Claude analysis failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }

  // Attach photo info to analysis for the client to use
  return NextResponse.json({
    analysis: {
      ...analysis,
      _photoUrl: photoUrl,
      _photoPublicId: photoPublicId,
    },
  });
}
