import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import sharp from "sharp";
import { getSystemRole, getItemsByPrimaryRoute } from "@/lib/airtable";
import { identifyItemForLookup, findBestPhotoMatch, type PhotoMatchCandidate, type PhotoMatchResult } from "@/lib/anthropic";
import type { Item } from "@/lib/types";

// Allow enough time for the classify call plus several parallel
// batch-comparison calls against the candidate pool.
export const maxDuration = 60;

const BATCH_SIZE = 20;
const MAX_CANDIDATES = 150;
const CONFIDENCE_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

function photoUrlFor(item: Item): string {
  return item.photoUrl || item.photos?.[0]?.url || "";
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!sysRole || !["TTTAdmin", "TTTManager", "TTTStaff", "TTTSales"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // Resize + convert to JPEG — same defense-in-depth as /api/analyze: the
  // client already converts HEIC/HEIF via prepareImageForUpload, but this
  // re-validates server-side regardless of upload path.
  let processedBuffer: Buffer;
  try {
    processedBuffer = await sharp(rawBuffer)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    processedBuffer = rawBuffer;
  }
  const isJpeg = processedBuffer[0] === 0xff && processedBuffer[1] === 0xd8;
  if (!isJpeg) {
    return NextResponse.json(
      { error: "Could not process this image format. Please convert your photo to JPEG or PNG and try again." },
      { status: 400 }
    );
  }
  const base64 = processedBuffer.toString("base64");

  // Stage 1 — classify the query photo to narrow the candidate pool.
  let identified: { category: string; description: string };
  try {
    identified = await identifyItemForLookup(base64);
  } catch (e) {
    console.error("[item-lookup] identify error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't analyze the photo" }, { status: 500 });
  }

  // Candidate pool: ProFound Finds consignment inventory — the resale
  // channel this tool lives on. Prioritize the predicted category, plus
  // never-categorized items (a real, sizable bucket in this inventory) so
  // a miscategorized match isn't silently missed. Capped for latency/cost;
  // items already come back newest-first, so a cap favors recent stock.
  const allItems = await getItemsByPrimaryRoute("ProFoundFinds Consignment").catch(() => [] as Item[]);
  const withPhotos = allItems.filter((i) => !!photoUrlFor(i));
  const sameCategory = withPhotos.filter((i) => i.category === identified.category);
  const uncategorized = withPhotos.filter(
    (i) => i.category !== identified.category && (!i.category || i.category.trim() === "" || i.category === "Unknown")
  );
  const candidates = [...sameCategory, ...uncategorized].slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) {
    return NextResponse.json({ identified, searchedCount: 0, match: null });
  }

  const batches: PhotoMatchCandidate[][] = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    batches.push(
      candidates.slice(i, i + BATCH_SIZE).map((item, idx) => ({ index: i + idx + 1, url: photoUrlFor(item) }))
    );
  }

  const results = await Promise.all(
    batches.map((batch) =>
      findBestPhotoMatch(base64, batch).catch(
        (): PhotoMatchResult => ({ matchIndex: null, confidence: null, reasoning: "" })
      )
    )
  );

  let best: PhotoMatchResult | null = null;
  for (const r of results) {
    if (r.matchIndex == null || !r.confidence) continue;
    if (!best || CONFIDENCE_RANK[r.confidence] > CONFIDENCE_RANK[best.confidence!]) best = r;
  }

  const matchedItem = best ? candidates[best.matchIndex! - 1] : undefined;
  if (!best || !matchedItem) {
    return NextResponse.json({ identified, searchedCount: candidates.length, match: null });
  }

  return NextResponse.json({
    identified,
    searchedCount: candidates.length,
    match: {
      itemId: matchedItem.id,
      itemName: matchedItem.itemName,
      category: matchedItem.category,
      photoUrl: photoUrlFor(matchedItem),
      status: matchedItem.status,
      valueMid: matchedItem.valueMid,
      tenantId: matchedItem.tenantId,
      confidence: best.confidence,
      reasoning: best.reasoning,
    },
  });
}
