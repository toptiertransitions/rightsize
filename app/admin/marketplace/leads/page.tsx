import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../MarketplaceNav";
import { getAllIntroductionEvents, getAllPartners } from "@/lib/marketplace/data";
import { formatLeadAnswers, getListingCategoryLabels } from "@/lib/marketplace/leads";
import { LeadsClient, type AdminLeadRow } from "./LeadsClient";

export const dynamic = "force-dynamic";

// Admin > Marketplace > Leads: every client introduction request. Leads on
// listings routed to TTT admins wait here until someone presses "Release
// to partner". Access gated by the marketplace layout (Admin/Manager).
export default async function MarketplaceLeadsPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const [{ lead }, events, partners, categories] = await Promise.all([
    searchParams,
    getAllIntroductionEvents(),
    getAllPartners(),
    getListingCategoryLabels(),
  ]);
  const partnerById = new Map(partners.map((p) => [p.id, p]));

  const rows: AdminLeadRow[] = events.map((e) => {
    const category = categories.get(e.listingId) ?? "";
    const partner = partnerById.get(e.partnerId);
    return {
      id: e.id,
      clientName: e.clientName,
      clientEmail: e.clientEmail,
      clientPhone: e.clientPhone,
      tenantId: e.tenantId,
      category,
      partnerId: e.partnerId,
      partnerName: partner?.companyName ?? "Unknown partner",
      partnerHasEmail: !!partner?.email,
      answers: formatLeadAnswers(category, e.categoryAnswersSnapshot),
      requestedAt: e.requestedAt,
      status: e.status,
      statusUpdatedAt: e.statusUpdatedAt ?? "",
      releasedAt: e.releasedAt ?? "",
      releasedBy: e.releasedBy ?? "",
      fee: e.referralTermsSnapshot.feeType === "none" ? "No fee" : `${e.referralTermsSnapshot.feeType} ${e.referralTermsSnapshot.feeValue}`,
    };
  });

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-6 pb-12">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Leads</h1>
          <p className="text-sm text-gray-400 mt-1">
            Client introduction requests. Held leads stay with TTT until you release them; then the partner sees the client&apos;s name, contact info, category and answers in their portal, and gets an email.
          </p>
        </div>
        <LeadsClient rows={rows} focusId={lead ?? null} />
      </main>
    </div>
  );
}
