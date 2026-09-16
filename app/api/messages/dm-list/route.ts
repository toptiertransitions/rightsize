import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getStaffMembers } from "@/lib/airtable";
import {
  getDmMessagesForUser,
  getThreadReadState,
  readStateKey,
  otherDmParticipant,
  TEAM_CHANNEL,
} from "@/lib/airtable-messages";
import { isCommsHubRole } from "@/lib/thread-access";

export interface DmConversationSummary {
  tenantId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhoto?: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageIsMine: boolean;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!isCommsHubRole(sysRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [messages, readState, staff] = await Promise.all([
    getDmMessagesForUser(userId),
    getThreadReadState(userId),
    getStaffMembers().catch(() => []),
  ]);

  const nameByClerkId = new Map(staff.map(s => [s.clerkUserId, s.displayName]));

  const byOtherUser = new Map<string, typeof messages>();
  for (const m of messages) {
    const other = otherDmParticipant(m.tenantId, userId);
    if (!other) continue;
    if (!byOtherUser.has(other)) byOtherUser.set(other, []);
    byOtherUser.get(other)!.push(m); // already sorted desc
  }

  const otherIds = Array.from(byOtherUser.keys());
  let photoByClerkId = new Map<string, string>();
  let clerkNameByClerkId = new Map<string, string>();
  if (otherIds.length > 0) {
    try {
      const clerk = await clerkClient();
      const { data: clerkUsers } = await clerk.users.getUserList({ userId: otherIds, limit: 100 });
      photoByClerkId = new Map(clerkUsers.map(u => [u.id, u.imageUrl]));
      clerkNameByClerkId = new Map(clerkUsers.map(u => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses[0]?.emailAddress || "Unknown",
      ]));
    } catch { /* non-fatal */ }
  }

  const conversations: DmConversationSummary[] = otherIds.map(otherUserId => {
    const msgs = byOtherUser.get(otherUserId)!;
    const tenantId = msgs[0].tenantId; // same for every message in this group
    const lastReadAt = readState.get(readStateKey(tenantId, TEAM_CHANNEL));
    const unreadCount = msgs.filter(m => !lastReadAt || m.timestamp > lastReadAt).length;
    const last = msgs[0];
    return {
      tenantId,
      otherUserId,
      otherUserName: nameByClerkId.get(otherUserId) ?? clerkNameByClerkId.get(otherUserId) ?? "Unknown",
      otherUserPhoto: photoByClerkId.get(otherUserId) || undefined,
      unreadCount,
      lastMessageAt: last?.timestamp ?? null,
      lastMessagePreview: last?.body ?? null,
      lastMessageIsMine: last?.authorClerkId === userId,
    };
  }).sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

  return NextResponse.json({ conversations });
}
