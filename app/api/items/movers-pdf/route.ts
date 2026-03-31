export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getUserRoleForTenant, getItemById, getInvoiceSettings, getTenantById } from "@/lib/airtable";
import { renderMoversPDF } from "@/lib/movers-pdf";
import { groupItemsForMovers } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const itemIds: string[] = body?.itemIds ?? [];
  const tenantId: string | undefined = body?.tenantId;

  if (!itemIds.length) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  // Auth: must be a system role user OR a member of the tenant
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole && tenantId) {
    const tenantRole = await getUserRoleForTenant(userId, tenantId).catch(() => null);
    if (!tenantRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (!sysRole && !tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch items, settings, and tenant in parallel
  const [itemResults, settings, tenant] = await Promise.all([
    Promise.all(itemIds.map((id) => getItemById(id).catch(() => null))),
    getInvoiceSettings().catch(() => null),
    tenantId ? getTenantById(tenantId).catch(() => null) : Promise.resolve(null),
  ]);

  const originAddress = [tenant?.address, tenant?.city, tenant?.state, tenant?.zip].filter(Boolean).join(", ") || undefined;
  const destinationAddress = [tenant?.destAddress, tenant?.destCity, tenant?.destState, tenant?.destZip].filter(Boolean).join(", ") || undefined;

  const items = itemResults
    .filter(Boolean)
    .map((item) => ({
      id: item!.id,
      itemName: item!.itemName,
      photoUrl: item!.photoUrl,
      category: item!.category,
      condition: item!.condition,
      sizeClass: item!.sizeClass,
    }));

  if (!items.length) {
    return NextResponse.json({ error: "No valid items found" }, { status: 404 });
  }

  // AI grouping for summary page — fire-and-forget with graceful fallback
  const aiGroups = await groupItemsForMovers(items.map(i => i.itemName)).catch(() => null);

  const pdfBuffer = await renderMoversPDF({ items, settings, aiGroups: aiGroups ?? undefined, originAddress, destinationAddress });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="movers-list-${date}.pdf"`,
    },
  });
}
