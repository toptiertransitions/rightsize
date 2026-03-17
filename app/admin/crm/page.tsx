import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { getGmailToken } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { CRMSettingsClient } from "./CRMSettingsClient";

export default async function AdminCRMPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const token = await getGmailToken(userId).catch(() => null);

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
        <CRMSettingsClient gmailConnected={!!token} gmailEmail={token?.email} />
      </main>
    </div>
  );
}
