import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getOpportunities, createOpportunity, updateOpportunity, deleteOpportunity, getClientContactById, getTenantById, updateTenant, getOpportunityById } from "@/lib/airtable";
import { createProjectNote } from "@/lib/airtable-notes";
import type { KeyPerson } from "@/lib/types";

async function requireCRMAccess(userId: string) {
  const sysRole = await getSystemRole(userId);
  return sysRole === "TTTSales" || sysRole === "TTTManager" || sysRole === "TTTAdmin";
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stage = req.nextUrl.searchParams.get("stage") || undefined;
  const opportunities = await getOpportunities({ stage });
  return NextResponse.json({ opportunities });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  try {
    const opportunity = await createOpportunity(body);

    // When a project (tenantId) is linked at creation time, auto-populate the
    // tenant's clientEmail and clientPhone from the linked ClientContact.
    if (opportunity.tenantId && opportunity.clientContactId) {
      try {
        const [contact, tenant] = await Promise.all([
          getClientContactById(opportunity.clientContactId),
          getTenantById(opportunity.tenantId),
        ]);
        if (contact && tenant && !tenant.clientEmail && !tenant.clientPhone) {
          await updateTenant(opportunity.tenantId, {
            clientEmail: contact.email || null,
            clientPhone: contact.phone || null,
          });
        }
      } catch { /* non-fatal */ }
    }

    // If notes were provided and a project is linked, post to Internal Notes
    if (opportunity.tenantId && body.notes?.trim()) {
      try {
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(userId).catch(() => null);
        const authorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "TTT Staff";
        const authorPhotoUrl = user?.imageUrl || undefined;
        await createProjectNote({
          tenantId: opportunity.tenantId,
          authorClerkId: userId,
          authorName,
          authorPhotoUrl,
          content: `Client Notes (from CRM):\n${body.notes.trim()}`,
        });
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ opportunity });
  } catch (err) {
    console.error("[opportunities POST] create failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    // Fetch current opportunity once if we need to diff key people, detect first project link, Lost transition, or notes change
    const needsPrefetch = (Array.isArray(data.keyPeople) && data.keyPeople.length > 0) || !!data.tenantId || data.stage === "Lost" || "notes" in data;
    const current = needsPrefetch ? await getOpportunityById(id).catch(() => null) : null;

    // Case A: New key people added while a project is already linked
    let addedKeyPeople: KeyPerson[] = [];
    if (Array.isArray(data.keyPeople) && data.keyPeople.length > 0) {
      const existingNames = new Set((current?.keyPeople ?? []).map((p: KeyPerson) => p.name.toLowerCase().trim()));
      addedKeyPeople = (data.keyPeople as KeyPerson[]).filter(p => !existingNames.has(p.name.toLowerCase().trim()));
    }

    // Case B: tenantId being set for the first time → backfill all existing key people as notes
    const isFirstProjectLink = !!data.tenantId && !!current && !current.tenantId;
    const firstLinkKeyPeople: KeyPerson[] = isFirstProjectLink ? (current!.keyPeople ?? []) : [];

    const opportunity = await updateOpportunity(id, data);

    // Sync notes changes to Internal Notes on the linked Plan page (staff-only, never visible to clients)
    const notesChanged = "notes" in data && (data.notes ?? "").trim() !== (current?.notes ?? "").trim();
    if (notesChanged && (data.notes ?? "").trim() && opportunity.tenantId) {
      try {
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(userId).catch(() => null);
        const authorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "TTT Staff";
        const authorPhotoUrl = user?.imageUrl || undefined;
        await createProjectNote({
          tenantId: opportunity.tenantId,
          authorClerkId: userId,
          authorName,
          authorPhotoUrl,
          content: `Client Notes (from CRM):\n${(data.notes as string).trim()}`,
        });
      } catch { /* non-fatal */ }
    }

    // Create internal Plan notes for key people (Case A: new additions; Case B: first project link backfill)
    const peopleToNote = firstLinkKeyPeople.length > 0 ? firstLinkKeyPeople : addedKeyPeople;
    if (peopleToNote.length > 0 && opportunity.tenantId) {
      try {
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(userId).catch(() => null);
        const authorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "TTT Staff";
        const authorPhotoUrl = user?.imageUrl || undefined;

        await Promise.all(peopleToNote.map(person => {
          const lines = [`Key Person Added: ${person.name} (${person.relationship})`];
          if (person.email) lines.push(`Email: ${person.email}`);
          if (person.phone) lines.push(`Phone: ${person.phone}`);
          return createProjectNote({
            tenantId: opportunity.tenantId!,
            authorClerkId: userId,
            authorName,
            authorPhotoUrl,
            content: lines.join("\n"),
          });
        }));
      } catch { /* non-fatal — note creation shouldn't block the save */ }
    }

    // Sync origin/destination address fields (and community name) to the linked project when changed.
    const originChanged = ["address", "addressUnitNumber", "city", "state", "zip"].some(f => f in data);
    const destChanged = ["destAddress", "destAddressUnitNumber", "destCity", "destState", "destZip", "seniorCommunityName"].some(f => f in data);
    if ((originChanged || destChanged) && opportunity.tenantId) {
      try {
        const patch: Record<string, unknown> = {};
        if (originChanged) {
          patch.address = opportunity.address;
          patch.addressUnitNumber = opportunity.addressUnitNumber ?? null;
          patch.city = opportunity.city;
          patch.state = opportunity.state;
          patch.zip = opportunity.zip;
        }
        if (destChanged) {
          patch.destAddress = opportunity.destAddress;
          patch.destAddressUnitNumber = opportunity.destAddressUnitNumber ?? null;
          patch.destCity = opportunity.destCity;
          patch.destState = opportunity.destState;
          patch.destZip = opportunity.destZip;
          if ("seniorCommunityName" in data) patch.seniorCommunityName = opportunity.seniorCommunityName ?? null;
        }
        await updateTenant(opportunity.tenantId, patch);
      } catch { /* non-fatal */ }
    }

    // When an opportunity transitions to Lost, auto-mark the linked project as a Lost Deal
    // so it moves off the Plan page without manual cleanup.
    const stagingToLost = data.stage === "Lost" && current?.stage !== "Lost";
    if (stagingToLost && opportunity.tenantId) {
      try {
        const tenant = await getTenantById(opportunity.tenantId);
        if (tenant && !tenant.isLostDeal) {
          await updateTenant(opportunity.tenantId, { isLostDeal: true, isArchived: true });
        }
      } catch { /* non-fatal — opportunity save already succeeded */ }
    }

    return NextResponse.json({ opportunity });
  } catch (err) {
    console.error("[opportunities PATCH] update failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    await deleteOpportunity(id);
  } catch (e) {
    console.error("[deleteOpportunity] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
