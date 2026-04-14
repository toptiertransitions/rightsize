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
    analysis = await analyzeItemPhoto({ url: photoUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    itemName: analysis.item_name,
    category: analysis.category,
    conditionNotes: analysis.condition_notes,
    listingTitleEbay: analysis.listing_title_ebay,
    listingDescriptionEbay: analysis.listing_description_ebay,
    staffTips: analysis.staff_tips,
  });
}
