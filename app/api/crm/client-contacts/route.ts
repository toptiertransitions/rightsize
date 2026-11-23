import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getClientContacts, createClientContact, updateClientContact, deleteClientContact, findClientContactByName, getOpportunitiesForContact, updateOpportunity, getClientContactById, getTenantById, updateTenant } from "@/lib/airtable";

async function requireCRMAccess(userId: string) {
  const sysRole = await getSystemRole(userId);
  return sysRole === "TTTSales" || sysRole === "TTTManager" || sysRole === "TTTAdmin";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contacts = await getClientContacts();
  return NextResponse.json({ contacts });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const upsert = req.nextUrl.searchParams.get("upsert") === "true";
  if (upsert && body.name) {
    const existing = await findClientContactByName(body.name);
    if (existing) {
      // Strip empty strings so CSV import never overwrites existing email/phone with blanks
      const updateData = Object.fromEntries(
        Object.entries(body).filter(([, v]) => v !== "" && v !== null && v !== undefined)
      );
      const contact = await updateClientContact(existing.id, updateData);
      return NextResponse.json({ contact });
    }
  }
  const contact = await createClientContact(body);
  return NextResponse.json({ contact });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // Never overwrite email/phone with empty string — blank values are ignored
  if (data.email === "") delete data.email;
  if (data.phone === "") delete data.phone;
  const before = "email" in data || "phone" in data ? await getClientContactById(id).catch(() => null) : null;
  const contact = await updateClientContact(id, data);

  // Projects keep their own copy of the client's phone/email (shown on the
  // Plan page). Carry a CRM change onto every linked project whose copy was
  // blank or still the old value, so a deliberate project-only edit stays.
  if (before) {
    try {
      const lower = (s?: string) => (s ?? "").trim().toLowerCase();
      const digits = (s?: string) => (s ?? "").replace(/\D/g, "");
      const emailChanged = typeof data.email === "string" && lower(data.email) !== lower(before.email);
      const phoneChanged = typeof data.phone === "string" && digits(data.phone) !== digits(before.phone);
      if (emailChanged || phoneChanged) {
        const tenantIds = [...new Set((await getOpportunitiesForContact(id)).map((o) => o.tenantId).filter(Boolean))] as string[];
        await Promise.all(tenantIds.map(async (tenantId) => {
          const tenant = await getTenantById(tenantId);
          if (!tenant) return;
          const patch: { clientEmail?: string; clientPhone?: string } = {};
          if (emailChanged && (!tenant.clientEmail || lower(tenant.clientEmail) === lower(before.email))) patch.clientEmail = data.email.trim();
          if (phoneChanged && (!tenant.clientPhone || digits(tenant.clientPhone) === digits(before.phone))) patch.clientPhone = data.phone.trim();
          if (Object.keys(patch).length > 0) await updateTenant(tenantId, patch);
        }));
      }
    } catch (e) { console.error("[client-contacts] contact sync to project failed:", e); }
  }

  // An opportunity's owner is copied from its client when the opportunity is
  // saved, so a new Sales Owner on the client has to move every one of their
  // opportunities too — otherwise the Opportunities table, owner filters and
  // dashboard keep showing the previous owner.
  let opportunitiesReassigned = 0;
  if (typeof data.assignedToClerkId === "string") {
    const opps = await getOpportunitiesForContact(id);
    const stale = opps.filter((o) => o.assignedToClerkId !== data.assignedToClerkId);
    await Promise.all(stale.map((o) => updateOpportunity(o.id, { assignedToClerkId: data.assignedToClerkId })));
    opportunitiesReassigned = stale.length;
  }
  return NextResponse.json({ contact, opportunitiesReassigned });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteClientContact(id);
  return NextResponse.json({ ok: true });
}
