import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { getGmailToken, getAllGmailTokens, getCalendarToken } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { CRMSettingsClient } from "./CRMSettingsClient";

export default async function AdminCRMPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [token, calendarToken, allTokens] = await Promise.all([
    getGmailToken(userId).catch(() => null),
    getCalendarToken().catch(() => null),
    getAllGmailTokens().catch(() => []),
  ]);

  // Look up Clerk display names for each connected account
  const clerk = await clerkClient();
  const connectedAccounts = await Promise.all(
    allTokens.map(async (t) => {
      const user = await clerk.users.getUser(t.clerkUserId).catch(() => null);
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || t.email;
      const expired = new Date(t.expiresAt) < new Date();
      return { email: t.email, name, expired, hasSendScope: t.hasSendScope };
    })
  );

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="crm" />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">CRM Settings</h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage Gmail integration and email activity syncing for the CRM.
          </p>
        </div>
        <CRMSettingsClient
          gmailConnected={!!token}
          gmailEmail={token?.email}
          calendarConnected={!!calendarToken}
          calendarEmail={calendarToken?.email}
          connectedAccounts={connectedAccounts}
        />
      </main>
    </div>
  );
}
