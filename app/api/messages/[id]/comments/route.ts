import { NextRequest, NextResponse, after } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getStaffMembers, getTenantById } from "@/lib/airtable";
import { getProjectMessageById, createMessageComment, getCommentsForMessages, BROADCAST_TENANT_ID, isDmTenant } from "@/lib/airtable-messages";
import { canAccessTenantChannel } from "@/lib/thread-access";
import { notifyThreadReply } from "@/lib/message-notify";
import { mentionedIds } from "@/lib/mentions";

// A thread reply on a message. Notifies whoever posted the message or
// already replied, plus anyone @mentioned (see lib/message-notify.ts).
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

  const priorComments = (await getCommentsForMessages([id]).catch(() => new Map())).get(id) ?? [];

  const comment = await createMessageComment({
    messageId: id,
    authorClerkId: userId,
    body: body.trim(),
  });

  const clerk = await clerkClient();
  const authorUser = await clerk.users.getUser(userId).catch(() => null);
  const authorName = [authorUser?.firstName, authorUser?.lastName].filter(Boolean).join(" ") || "A staff member";

  after(async () => {
    const tenant = existing.tenantId === BROADCAST_TENANT_ID || isDmTenant(existing.tenantId)
      ? null
      : await getTenantById(existing.tenantId).catch(() => null);
    await notifyThreadReply({
      tenantId: existing.tenantId,
      tenant,
      authorId: userId,
      authorName,
      body: comment.body,
      parentAuthorId: existing.authorClerkId,
      priorRepliers: priorComments.map((c: { authorClerkId: string }) => c.authorClerkId),
    });
  });

  const ids = mentionedIds(comment.body);
  const roster = ids.length ? await getStaffMembers().catch(() => []) : [];
  return NextResponse.json({
    comment: {
      ...comment,
      authorName,
      authorPhotoUrl: authorUser?.imageUrl || undefined,
      mentions: ids.map((m) => ({ id: m, name: roster.find((s) => s.clerkUserId === m)?.displayName ?? "someone" })),
    },
  });
}
