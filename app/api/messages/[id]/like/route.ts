import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getProjectMessageById, toggleMessageLike } from "@/lib/airtable-messages";
import { canAccessTenantChannel } from "@/lib/thread-access";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await getProjectMessageById(id);
  if (!existing) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  const allowed = await canAccessTenantChannel(userId, sysRole, existing.tenantId, existing.channel);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const message = await toggleMessageLike(id, userId);
  return NextResponse.json({ message });
}
