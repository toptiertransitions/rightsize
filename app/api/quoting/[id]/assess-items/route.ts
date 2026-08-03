import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getTenantById,
  getRoutingRules,
  getAllLocalVendors,
  applyRoutingRules,
  createItem,
  updateItem,
  getNextBarcodeNumber,
  updateTenant,
} from "@/lib/airtable";
import { analyzeItemPhoto } from "@/lib/anthropic";
import type { Item, ItemPhoto, PrimaryRoute } from "@/lib/types";

export const maxDuration = 120;

const ROUTE_CLIENT_SHARE: Record<string, number> = {
  "ProFoundFinds Consignment": 67,
  "FB/Marketplace": 59,
  "Online Marketplace": 59,
  "Estate Sale": 67,
};
const NON_TTT_SHARE: Record<string, number> = {
  "FB/Marketplace": 100,
  "Online Marketplace": 100,
  "Other Consignment": 50,
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tenantId } = await params;
  const { photos }: { photos: ItemPhoto[] } = await req.json();

  if (!photos?.length) return NextResponse.json({ items: [] });

  const [tenant, routingRules, localVendors] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getRoutingRules().catch(() => []),
    getAllLocalVendors().catch(() => []),
  ]);

  if (!tenant) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const isNonTTT = !tenant.isTTT;
  const activeRules = routingRules.filter(r => r.isActive);
  const projectZip = tenant.zip ?? "";

  // Run all AI analyses in parallel — Cloudinary URLs work directly with Claude
  const analyses = await Promise.allSettled(
    photos.map(photo => analyzeItemPhoto({ url: photo.url }))
  );

  const createdItems: Item[] = [];

  // Create items sequentially so barcode numbers stay unique
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const result = analyses[i];
    if (result.status === "rejected") {
      console.error("AI analysis failed for photo:", photo.url, result.reason);
      continue;
    }
    const ai = result.value;

    // Apply 0.6x multiplier (same as catalog new-item flow)
    const valueLow  = ai.value_low  != null ? Math.round(ai.value_low  * 0.6) : 0;
    const valueMid  = ai.value_mid  != null ? Math.round(ai.value_mid  * 0.6) : 0;
    const valueHigh = ai.value_high != null ? Math.round(ai.value_high * 0.6) : 0;

    let primaryRoute = (ai.primary_route || "Donate") as PrimaryRoute;
    if (isNonTTT && primaryRoute === "ProFoundFinds Consignment") {
      primaryRoute = "Other Consignment";
    }

    const barcodeNumber = await getNextBarcodeNumber();

    let item = await createItem({
      tenantId,
      itemName: ai.item_name || "Unnamed Item",
      category: ai.category || "",
      condition: ai.condition || "Good",
      conditionNotes: ai.condition_notes || "",
      sizeClass: (ai.size_class || "Fits in Car-SUV") as Item["sizeClass"],
      fragility: (ai.fragility || "Not Fragile") as Item["fragility"],
      itemType: (ai.item_type || "Daily Use") as Item["itemType"],
      valueLow,
      valueMid,
      valueHigh,
      primaryRoute,
      routeReasoning: ai.route_reasoning || "",
      consignmentCategory: ai.consignment_category || "",
      listingTitleEbay: ai.listing_title_ebay || "",
      listingDescriptionEbay: ai.listing_description_ebay || "",
      listingFb: ai.listing_fb || "",
      listingOfferup: ai.listing_offerup || "",
      staffTips: ai.staff_tips || "",
      photos: [photo],
      barcodeNumber,
      status: "Pending Review",
    });

    // Apply routing rules (same logic as POST /api/items)
    if (activeRules.length > 0) {
      try {
        const assignments = applyRoutingRules([item], localVendors, activeRules, projectZip, tenant.isEstateSale ?? false);
        if (assignments.length > 0) {
          const { primaryRoute: ruleRoute, vendorId } = assignments[0];
          const ruleShare = isNonTTT && NON_TTT_SHARE[ruleRoute] !== undefined
            ? NON_TTT_SHARE[ruleRoute]
            : ROUTE_CLIENT_SHARE[ruleRoute];
          const routeUpdates: Record<string, unknown> = { primaryRoute: ruleRoute };
          if (vendorId) { routeUpdates.assignedVendorId = vendorId; routeUpdates.vendorDecision = "Pending"; }
          if (ruleShare !== undefined) routeUpdates.clientSharePercent = ruleShare;
          await updateItem(item.id, routeUpdates as never);
          item = {
            ...item,
            primaryRoute: ruleRoute,
            ...(vendorId ? { assignedVendorId: vendorId, vendorDecision: "Pending" as const } : {}),
            ...(ruleShare !== undefined ? { clientSharePercent: ruleShare } : {}),
          };
        }
      } catch (e) {
        console.error("Routing failed for quote assessment item:", e instanceof Error ? e.message : e);
      }
    }

    createdItems.push(item);
  }

  // Persist item IDs on the tenant so Quoting page can reload them
  if (createdItems.length > 0) {
    const existingIds = tenant.quoteAssessmentItemIds ?? [];
    const merged = [...new Set([...existingIds, ...createdItems.map(i => i.id)])];
    await updateTenant(tenantId, { quoteAssessmentItemIds: merged }).catch(() => {});
  }

  return NextResponse.json({ items: createdItems });
}
