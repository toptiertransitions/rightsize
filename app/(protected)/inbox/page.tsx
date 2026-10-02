import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole } from "@/lib/airtable";
import { InboxClient } from "./InboxClient";

// Communication Hub Phase A — unified inbox. Linked from the main nav for
// TTTAdmin only (see components/layout/Header.tsx) while we pilot this as
// the surface for push notifications; still enforces the full role check
// below independent of the nav link.
export default async function InboxPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId).catch(() => null);
  const allowed = sysRole === "TTTStaff" || sysRole === "TTTTeamLead" || sysRole === "TTTManager" || sysRole === "TTTAdmin" || sysRole === "TTTSales";
  if (!allowed) redirect("/home");

  const canBroadcast = sysRole === "TTTManager" || sysRole === "TTTAdmin" || sysRole === "TTTSales";

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const currentUserName =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    clerkUser?.emailAddresses?.[0]?.emailAddress ||
    "Staff";
  const currentUserPhoto = clerkUser?.imageUrl || undefined;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
        <p className="text-gray-500 mt-1 text-sm">Messages for you and across every project you're working on</p>
      </div>
      <InboxClient canBroadcast={canBroadcast} currentUserId={userId} currentUserName={currentUserName} currentUserPhoto={currentUserPhoto} />
    </div>
  );
}
