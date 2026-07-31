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
    // Detect newly added key people before saving so we can create notes for them
    let addedKeyPeople: KeyPerson[] = [];
    if (Array.isArray(data.keyPeople) && data.keyPeople.length > 0) {
      const current = await getOpportunityById(id).catch(() => null);
      const existingNames = new Set((current?.keyPeople ?? []).map((p: KeyPerson) => p.name.toLowerCase().trim()));
      addedKeyPeople = (data.keyPeople as KeyPerson[]).filter(p => !existingNames.has(p.name.toLowerCase().trim()));
    }

    const opportunity = await updateOpportunity(id, data);

    // Create an internal Plan note for each newly added key person
    if (addedKeyPeople.length > 0 && opportunity.tenantId) {
      try {
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(userId).catch(() => null);
        const authorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "TTT Staff";
        const authorPhotoUrl = user?.imageUrl || undefined;

        await Promise.all(addedKeyPeople.map(person => {
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

    // Sync origin/destination address fields to the linked project when changed.
    const originChanged = ["address", "addressUnitNumber", "city", "state", "zip"].some(f => f in data);
    const destChanged = ["destAddress", "destAddressUnitNumber", "destCity", "destState", "destZip"].some(f => f in data);
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
        }
        await updateTenant(opportunity.tenantId, patch);
      } catch { /* non-fatal */ }
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
  await deleteOpportunity(id);
  return NextResponse.json({ ok: true });
}
