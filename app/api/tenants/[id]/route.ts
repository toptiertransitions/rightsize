import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTenantById, getUserRoleForTenant, getSystemRole } from "@/lib/airtable";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [sysRole, role] = await Promise.all([
    getSystemRole(userId).catch(() => null),
    getUserRoleForTenant(userId, id).catch(() => null),
  ]);

  const isTTTStaff = ["TTTStaff", "TTTManager", "TTTAdmin", "TTTSales"].includes(sysRole ?? "");
  if (!isTTTStaff && !role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenant = await getTenantById(id).catch(() => null);
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ isTTT: tenant.isTTT ?? true });
}
