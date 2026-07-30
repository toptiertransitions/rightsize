import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { analyzeItemPhoto } from "@/lib/anthropic";

export const maxDuration = 60;

// Partial re-analysis using existing primary photo.
// Returns only the fields we allow AI to update on an existing item:
//   itemName, category, conditionNotes, listingTitleEbay,
//   listingDescriptionEbay, staffTips
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { photoUrl } = body as { photoUrl?: string };

  if (!photoUrl) {
    return NextResponse.json({ error: "photoUrl is required" }, { status: 400 });
  }

  let analysis;
  try {
    // Fetch image server-side and pass as base64 — more reliable than having
    // Anthropic fetch the URL directly (avoids HEIC and CDN-restriction issues).
    const { data, mimeType } = await fetchImageAsBase64(photoUrl);
    analysis = await analyzeItemPhoto(data, mimeType);
  } catch (e) {
    console.error("[reanalyze] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    itemName: analysis.item_name,
    category: analysis.category,
    isAntique: analysis.is_antique ?? false,
    conditionNotes: analysis.condition_notes,
    listingTitleEbay: analysis.listing_title_ebay,
    listingDescriptionEbay: analysis.listing_description_ebay,
    staffTips: analysis.staff_tips,
  });
}

async function fetchImageAsBase64(url: string): Promise<{
  data: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}> {
  // Cloudinary HEIC/HEIF URLs: swap the extension so Cloudinary auto-converts to JPEG
  const fetchUrl = /res\.cloudinary\.com/.test(url)
    ? url.replace(/\.(heic|heif)$/i, ".jpg")
    : url;

  const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${res.statusText}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/jpeg";

  const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
  const mimeType = supported.find(t => contentType.startsWith(t)) ?? "image/jpeg";

  return { data: buffer.toString("base64"), mimeType };
}
