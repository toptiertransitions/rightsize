import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPartnerContact, partnerHasAccessToTenant } from "@/lib/partner";
import { getPlanEntriesForTenant, getTenantById, getProjectFiles } from "@/lib/airtable";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const { tenantId } = await params;
  const hasAccess = await partnerHasAccessToTenant(contact, tenantId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [tenant, entries, files] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getPlanEntriesForTenant(tenantId).catch(() => []),
    getProjectFiles(tenantId).catch(() => []),
  ]);

  const floorplans = files.filter((f) => f.fileTag === "Floorplan");

  return NextResponse.json({ tenant, entries, floorplans });
}
