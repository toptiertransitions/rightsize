import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { getInvoiceSettings, getSalesGoals } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { InvoicingSettingsClient } from "./InvoicingSettingsClient";
import { WeeklySalesReportButton } from "./WeeklySalesReportButton";
import { SalesGoalsClient } from "./SalesGoalsClient";

export default async function InvoicingSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [settings, salesGoals] = await Promise.all([
    getInvoiceSettings().catch(() => null),
    getSalesGoals().catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="invoicing" />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Invoicing Settings</h1>
          <p className="text-gray-400 text-sm mt-1">
            Configure company branding, contact info, payment link, and invoice footer.
          </p>
        </div>
        <WeeklySalesReportButton />
        <InvoicingSettingsClient initialSettings={settings} />

        {/* Sales Goals */}
        <div className="mt-12">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Sales Goals</h2>
            <p className="text-gray-400 text-sm mt-1">
              Monthly revenue targets used for pacing in the Weekly Sales Report email.
              Signed = signed contracts &middot; Earned = sum of paid invoices.
            </p>
          </div>
          <SalesGoalsClient initialGoals={salesGoals} />
        </div>
      </main>
    </div>
  );
}
