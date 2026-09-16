import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getProjectMessageById, createMessageComment } from "@/lib/airtable-messages";
import { canAccessTenantChannel } from "@/lib/thread-access";

export async function POST(
  req: NextRequest,
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

  const { body } = await req.json().catch(() => ({ body: "" }));
  if (!body?.trim()) return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 });

  const comment = await createMessageComment({
    messageId: id,
    authorClerkId: userId,
    body: body.trim(),
  });

  const clerk = await clerkClient();
  const authorUser = await clerk.users.getUser(userId).catch(() => null);
  const authorName = [authorUser?.firstName, authorUser?.lastName].filter(Boolean).join(" ") || "A staff member";

  return NextResponse.json({
    comment: { ...comment, authorName, authorPhotoUrl: authorUser?.imageUrl || undefined },
  });
}
