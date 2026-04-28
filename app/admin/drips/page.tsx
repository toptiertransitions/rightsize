import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { getDripSettings, getDripCampaigns } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { AdminDripsClient } from "./AdminDripsClient";

export default async function AdminDripsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [settings, campaigns] = await Promise.all([
    getDripSettings().catch(() => null),
    getDripCampaigns().catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="projects" />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Drip Campaign Settings</h1>
          <p className="text-gray-400 text-sm mt-1">
            Configure email branding, sender identity, and manage campaign templates.
          </p>
        </div>
        <AdminDripsClient initialSettings={settings} initialCampaigns={campaigns} />
      </main>
    </div>
  );
}
