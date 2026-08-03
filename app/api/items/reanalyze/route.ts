import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { analyzeItemPhoto } from "@/lib/anthropic";
import {
  getItemById,
  getTenantById,
  getRoutingRules,
  getAllLocalVendors,
  applyRoutingRules,
} from "@/lib/airtable";
import type { Item } from "@/lib/types";

export const maxDuration = 60;

// Partial re-analysis using existing primary photo.
// Returns only the fields we allow AI to update on an existing item:
//   itemName, category, conditionNotes, listingTitleEbay,
//   listingDescriptionEbay, staffTips
// Also applies routing rules (using AI values + existing item properties)
// to determine primaryRoute — routing rules always override AI's raw suggestion.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { photoUrl, itemId } = body as { photoUrl?: string; itemId?: string };

  if (!photoUrl) {
    return NextResponse.json({ error: "photoUrl is required" }, { status: 400 });
  }

  let analysis;
  try {
    const { data, mimeType } = await fetchImageAsBase64(photoUrl);
    analysis = await analyzeItemPhoto(data, mimeType);
  } catch (e) {
    console.error("[reanalyze] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 500 }
    );
  }

  // Apply routing rules using AI values + existing item properties.
  // Rules are always authoritative — they override AI's raw route suggestion.
  let primaryRoute: string | null = analysis.primary_route ?? null;
  if (primaryRoute === "Estate Sale") primaryRoute = "FB/Marketplace";

  if (itemId) {
    try {
      const [existingItem, routingRules, localVendors] = await Promise.all([
        getItemById(itemId),
        getRoutingRules().catch(() => []),
        getAllLocalVendors().catch(() => []),
      ]);

      if (existingItem && routingRules.some(r => r.isActive)) {
        const tenant = existingItem.tenantId
          ? await getTenantById(existingItem.tenantId).catch(() => null)
          : null;
        const projectZip = tenant?.zip ?? "";

        // Use AI values for category/value where available; keep existing item
        // properties for condition/sizeClass/fragility which AI doesn't return.
        const effectiveValueMid =
          analysis.value_mid != null
            ? Math.round(analysis.value_mid * 0.6)
            : (existingItem.valueMid ?? 0);
        const effectiveCategory = analysis.category || existingItem.category;

        const mockItem = {
          id: itemId,
          status: existingItem.status ?? "Pending Review",
          sizeClass: existingItem.sizeClass,
          condition: existingItem.condition,
          valueMid: effectiveValueMid,
          category: effectiveCategory,
          fragility: existingItem.fragility,
          assignedVendorId: undefined,
          primaryRoute: undefined, // clear so rules engine considers this item
        } as unknown as Item;

        const assignments = applyRoutingRules([mockItem], localVendors, routingRules, projectZip, tenant?.isEstateSale ?? false);
        if (assignments[0]?.primaryRoute) {
          primaryRoute = assignments[0].primaryRoute;
        }
      }
    } catch (e) {
      // Non-fatal — routing failure falls back to AI suggestion
      console.warn("[reanalyze] routing rules failed:", e);
    }
  }

  return NextResponse.json({
    itemName: analysis.item_name,
    category: analysis.category,
    isAntique: analysis.is_antique ?? false,
    conditionNotes: analysis.condition_notes,
    listingTitleEbay: analysis.listing_title_ebay,
    listingDescriptionEbay: analysis.listing_description_ebay,
    staffTips: analysis.staff_tips,
    valueLow: analysis.value_low ?? null,
    valueMid: analysis.value_mid ?? null,
    valueHigh: analysis.value_high ?? null,
    primaryRoute,
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
