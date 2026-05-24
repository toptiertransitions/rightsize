import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, createPartnerPoint, getTenantById } from "@/lib/airtable";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { referralContactId, tenantId, opportunityId } = body as {
    referralContactId?: string;
    tenantId?: string;
    opportunityId?: string;
  };
  if (!referralContactId || !tenantId) {
    return NextResponse.json({ error: "referralContactId and tenantId required" }, { status: 400 });
  }

  const tenant = await getTenantById(tenantId).catch(() => null);
  const point = await createPartnerPoint({
    referralContactId,
    tenantId,
    tenantName: tenant?.name,
    opportunityId,
  });
  return NextResponse.json({ point }, { status: 201 });
}
