import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { CircleHandClient } from "./CircleHandClient";
import { CRMImportClient } from "./CRMImportClient";
import { AdminHeader } from "../../components/AdminHeader";

export default async function CircleHandPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="bulk-upload" />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Bulk Upload</h1>
          <p className="text-gray-400 mt-1">
            Upload CSV files to import data into Rightsize records.
          </p>
        </div>

        {/* ── Circle Hand / Consignment ── */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-white mb-1">Circle Hand Consignment</h2>
          <p className="text-gray-500 text-sm mb-5">Match Circle Hand sold consignment items to Rightsize records.</p>
          <CircleHandClient />
        </section>

        {/* ── CRM Imports ── */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-1">CRM Imports</h2>
          <p className="text-gray-500 text-sm mb-5">Import Referral Companies, Referral Contacts, or Client Contacts from CSV.</p>
          <CRMImportClient />
        </section>
      </main>
    </div>
  );
}
