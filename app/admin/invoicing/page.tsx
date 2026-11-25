import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { getInvoiceSettings, getSalesGoals } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { InvoicingSettingsClient } from "./InvoicingSettingsClient";
import { WeeklySalesReportButton } from "./WeeklySalesReportButton";
import { WeeklyActiveProjectsButton } from "./WeeklyActiveProjectsButton";
import { ClientPipelineReportButton } from "./ClientPipelineReportButton";
import { SendQPlanningReportButton } from "./SendQPlanningReportButton";
import { WarRoomForMeButton } from "./WarRoomForMeButton";
import { WeeklyWinsForMeButton } from "./WeeklyWinsForMeButton";
import { ReferralFunnelForMeButton } from "./ReferralFunnelForMeButton";
import { ActivityAnalysisForMeButton } from "./ActivityAnalysisForMeButton";
import { ConsignmentStatusForMeButton } from "./ConsignmentStatusForMeButton";
import { getSalesReps } from "@/lib/sales-coaching-report";
import { SalesGoalsClient } from "./SalesGoalsClient";

export default async function InvoicingSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [settings, salesGoals, salesReps] = await Promise.all([
    getInvoiceSettings().catch(() => null),
    getSalesGoals().catch(() => []),
    getSalesReps().catch(() => []),
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
        <div className="flex flex-col gap-0">
          <WeeklySalesReportButton />
          <WeeklyActiveProjectsButton />
          <ClientPipelineReportButton />
          <SendQPlanningReportButton />
          <WarRoomForMeButton />
          <ReferralFunnelForMeButton />
          <ActivityAnalysisForMeButton reps={salesReps} />
          <ConsignmentStatusForMeButton />
          <WeeklyWinsForMeButton />
          <div className="mb-8 flex items-center gap-3 flex-wrap">
            <Link href="/admin/resale-emails" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors bg-[#2d4a3e] hover:bg-[#1e3329] text-white">
              Resale Update Emails
            </Link>
            <p className="text-xs text-gray-500">Hands-on complete and Day 30, 60 and 90 drafts for each consignment project: preview, pause, anchor date, send and resend.</p>
          </div>
        </div>
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
