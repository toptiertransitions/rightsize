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

    // When address fields are updated, sync them to the linked project.
    const addressChanged = ["address", "city", "state", "zip"].some(f => f in data);
    if (addressChanged && opportunity.tenantId) {
      try {
        await updateTenant(opportunity.tenantId, {
          address: opportunity.address,
          city: opportunity.city,
          state: opportunity.state,
          zip: opportunity.zip,
        });
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
