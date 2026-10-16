import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole } from "@/lib/airtable";
import { Suspense } from "react";
import { InboxHub } from "@/components/messaging/hub/InboxHub";

// Inbox — the internal communications hub, Slack-style: Announcements, 1:1
// Direct Messages, and one channel per project (never user-created). On a
// phone a conversation opens full screen; on desktop it's a two-pane view.
// ?c=<key> selects a conversation ("announcements", "dm:<clerkUserId>",
// "p:<tenantId>") — push notifications deep-link straight to one.
// Linked from the main nav for Staff/TeamLead/Manager/Admin/Sales only (see
// components/layout/Header.tsx); still enforces the role check below.
export default async function InboxPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId).catch(() => null);
  const allowed = sysRole === "TTTStaff" || sysRole === "TTTTeamLead" || sysRole === "TTTManager" || sysRole === "TTTAdmin" || sysRole === "TTTSales";
  if (!allowed) redirect("/home");

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const currentUserName =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    clerkUser?.emailAddresses?.[0]?.emailAddress ||
    "Staff";

  return (
    <Suspense>
      <InboxHub me={{ id: userId, name: currentUserName, photoUrl: clerkUser?.imageUrl || undefined }} />
    </Suspense>
  );
}
