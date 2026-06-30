import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getOpportunities, createOpportunity, updateOpportunity, deleteOpportunity, getClientContactById, getTenantById, updateTenant } from "@/lib/airtable";

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
    const opportunity = await updateOpportunity(id, data);

    // Sync origin/destination address fields to the linked project when changed.
    const originChanged = ["address", "city", "state", "zip"].some(f => f in data);
    const destChanged = ["destAddress", "destCity", "destState", "destZip"].some(f => f in data);
    if ((originChanged || destChanged) && opportunity.tenantId) {
      try {
        const patch: Record<string, unknown> = {};
        if (originChanged) {
          patch.address = opportunity.address;
          patch.city = opportunity.city;
          patch.state = opportunity.state;
          patch.zip = opportunity.zip;
        }
        if (destChanged) {
          patch.destAddress = opportunity.destAddress;
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
