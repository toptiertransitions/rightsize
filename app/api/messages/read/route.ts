import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { markThreadRead, BROADCAST_TENANT_ID } from "@/lib/airtable-messages";
import { canAccessProjectThread, isCommsHubRole } from "@/lib/thread-access";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantId } = await req.json().catch(() => ({}));
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (tenantId === BROADCAST_TENANT_ID) {
    if (!isCommsHubRole(sysRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    const allowed = await canAccessProjectThread(userId, sysRole, tenantId);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await markThreadRead(userId, tenantId);
  return NextResponse.json({ ok: true });
}
