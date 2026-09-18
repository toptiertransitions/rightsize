import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPartnerContact, partnerHasAccessToTenant } from "@/lib/partner";
import {
  getPlanEntriesForTenant,
  getTenantById,
  getProjectFiles,
  createPlanEntry,
  updatePlanEntry,
  deletePlanEntry,
  getPlanEntryById,
} from "@/lib/airtable";

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

// Partners may add Key Dates to any of their company's active (non-archived)
// referred projects. Created entries are tagged with the partner's Clerk user
// ID so they can later be scoped to edit/delete only what they themselves added.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const { tenantId } = await params;
  const hasAccess = await partnerHasAccessToTenant(contact, tenantId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenant = await getTenantById(tenantId).catch(() => null);
  if (!tenant) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (tenant.isArchived) {
    return NextResponse.json({ error: "Key dates can only be added to active projects" }, { status: 403 });
  }

  let body: { date?: string; activity?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const date = body.date;
  const activity = body.activity?.trim();
  if (!date || !activity) {
    return NextResponse.json({ error: "Date and type are required" }, { status: 400 });
  }

  try {
    const entry = await createPlanEntry({
      tenantId,
      date,
      activity,
      notes: body.notes?.trim() || undefined,
      entryType: "keydate",
      createdByUserId: userId,
    });
    return NextResponse.json({ entry });
  } catch (e) {
    console.error("partner createPlanEntry error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Partners may only edit Key Dates they themselves added — never ones added
// by TTT staff or client users, even on projects they otherwise have access to.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const { tenantId } = await params;
  const hasAccess = await partnerHasAccessToTenant(contact, tenantId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; date?: string; activity?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getPlanEntryById(id);
  if (!existing || existing.tenantId !== tenantId || existing.entryType !== "keydate") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.createdByUserId !== userId) {
    return NextResponse.json({ error: "You can only edit key dates you added" }, { status: 403 });
  }

  try {
    const entry = await updatePlanEntry(id, {
      date: body.date,
      activity: body.activity?.trim(),
      notes: body.notes !== undefined ? body.notes.trim() : undefined,
    });
    return NextResponse.json({ entry });
  } catch (e) {
    console.error("partner updatePlanEntry error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Partners may only delete Key Dates they themselves added.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const { tenantId } = await params;
  const hasAccess = await partnerHasAccessToTenant(contact, tenantId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getPlanEntryById(id);
  if (!existing || existing.tenantId !== tenantId || existing.entryType !== "keydate") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.createdByUserId !== userId) {
    return NextResponse.json({ error: "You can only delete key dates you added" }, { status: 403 });
  }

  try {
    await deletePlanEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("partner deletePlanEntry error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
