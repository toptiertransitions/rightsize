import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getTenantById, updateTenant } from "@/lib/airtable";

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId, isEstateSale } = await req.json().catch(() => ({})) as { tenantId?: string; isEstateSale?: boolean };
  if (!tenantId || typeof isEstateSale !== "boolean") {
    return NextResponse.json({ error: "tenantId and isEstateSale required" }, { status: 400 });
  }

  const tenant = await getTenantById(tenantId).catch(() => null);
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await updateTenant(tenantId, { isEstateSale });
  return NextResponse.json({ success: true });
}
