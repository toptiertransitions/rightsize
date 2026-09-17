import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { getAllLoyaltyRecords } from "@/lib/airtable-loyalty";
import { getCurrentProgramYear, getProgramYearLabel } from "@/lib/loyalty";
import { getReferralCompanies } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { PartnersAdminClient } from "@/components/admin/PartnersAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPartnersPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/admin");

  const [partners, companies] = await Promise.all([
    getAllLoyaltyRecords().catch(() => []),
    getReferralCompanies().catch(() => []),
  ]);
  const year = getCurrentProgramYear();
  const { start, end } = getProgramYearLabel(year);
  const programYearLabel = `Program Year: ${start} – ${end}`;
  // Loyalty records are keyed by either a real ReferralCompany id (points
  // shared across every contact at that company) or a solo contact's id —
  // this tells the client which rows can expand into a per-contact breakdown.
  const companyIds = companies.map(c => c.id);

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="partners" />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Partner Management</h1>
          <p className="text-gray-400 text-sm mt-1">
            Premier Partner loyalty program — tier tracking, point history, and account actions.
          </p>
        </div>
        <PartnersAdminClient initialPartners={partners} programYearLabel={programYearLabel} companyIds={companyIds} />
      </main>
    </div>
  );
}
