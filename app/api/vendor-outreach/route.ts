import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getVendorOutreach } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const records = await getVendorOutreach(tenantId);
  const now = Date.now();
  const withAging = records.map(r => ({
    ...r,
    agingDays: r.sentAt ? Math.floor((now - new Date(r.sentAt).getTime()) / 86_400_000) : 0,
  }));

  return NextResponse.json({ records: withAging });
}
