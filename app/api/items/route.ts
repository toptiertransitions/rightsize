import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createItem, getItemsForTenant, getUserRoleForTenant } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  const role = await getUserRoleForTenant(userId, tenantId);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await getItemsForTenant(tenantId);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = body.tenantId as string;
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  const role = await getUserRoleForTenant(userId, tenantId);
  if (!role || !["Owner", "Collaborator", "TTTStaff", "TTTAdmin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await createItem({
    tenantId,
    itemName: (body.itemName as string) || (body.item_name as string) || "Unknown Item",
    roomId: body.roomId as string | undefined,
    photoUrl: body.photoUrl as string | undefined,
    photoPublicId: body.photoPublicId as string | undefined,
    category: body.category as string,
    condition: body.condition as never,
    conditionNotes: body.conditionNotes as string,
    sizeClass: body.sizeClass as never,
    fragility: body.fragility as never,
    itemType: body.itemType as never,
    valueLow: Number(body.valueLow) || 0,
    valueMid: Number(body.valueMid) || 0,
    valueHigh: Number(body.valueHigh) || 0,
    primaryRoute: body.primaryRoute as never,
    routeReasoning: body.routeReasoning as string,
    consignmentCategory: body.consignmentCategory as string,
    listingTitleEbay: body.listingTitleEbay as string,
    listingDescriptionEbay: body.listingDescriptionEbay as string,
    listingFb: body.listingFb as string,
    listingOfferup: body.listingOfferup as string,
    staffTips: body.staffTips as string,
    status: "Pending Review",
  });

  return NextResponse.json({ item });
}
