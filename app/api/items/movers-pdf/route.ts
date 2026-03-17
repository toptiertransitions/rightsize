export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getUserRoleForTenant, getItemById, getInvoiceSettings } from "@/lib/airtable";
import { renderMoversPDF } from "@/lib/movers-pdf";

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

  // Fetch items and settings in parallel
  const [itemResults, settings] = await Promise.all([
    Promise.all(itemIds.map((id) => getItemById(id).catch(() => null))),
    getInvoiceSettings().catch(() => null),
  ]);

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

  const pdfBuffer = await renderMoversPDF({ items, settings });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="movers-list-${date}.pdf"`,
    },
  });
}
