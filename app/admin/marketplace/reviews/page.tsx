import { auth } from "@clerk/nextjs/server";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../MarketplaceNav";
import { getAllPartnerReviews, getTenants, getSystemRole } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { getAllPartners } from "@/lib/marketplace/data";
import { partnerIdResolver, summarizeReviewsByPartner } from "@/lib/partners/reviews";
import { ReviewsClient, type AdminReviewRow } from "./ReviewsClient";

export const dynamic = "force-dynamic";

// Admin > Marketplace > Reviews: every client review of a partner, left from
// the "Your Partners" tray on /partners. TTTAdmin edits; TTTManager (also
// allowed into /admin/marketplace by the layout) sees it read-only.
export default async function MarketplaceReviewsPage({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const { userId } = await auth();
  const [{ partner: partnerFilter }, reviews, partners, tenants, role] = await Promise.all([
    searchParams,
    getAllPartnerReviews(),
    getAllPartners(),
    getTenants().catch(() => []),
    userId ? getSystemRole(userId).catch(() => null) : null,
  ]);
  const canEdit = role === "TTTAdmin" || (!!userId && isTTTAdmin(userId));

  const resolve = partnerIdResolver(partners);
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  const summaries = summarizeReviewsByPartner(reviews, resolve);

  const rows: AdminReviewRow[] = reviews
    .filter((r) => r.score)
    .map((r) => {
      const partnerId = resolve(r.partnerId) ?? "";
      const partner = partnerById.get(partnerId);
      return {
        id: r.id,
        partnerId,
        partnerName: partner?.companyName ?? "Unknown partner",
        displayReviewScore: partner?.displayReviewScore ?? false,
        category: r.category ?? "",
        tenantId: r.tenantId,
        projectName: tenantName.get(r.tenantId) ?? "",
        reviewerName: r.reviewerName,
        score: r.score,
        tags: r.tags,
        comment: r.comment,
        date: r.date,
        updatedAt: r.updatedAt ?? "",
        editedBy: r.editedBy ?? "",
        status: r.status,
      };
    })
    .sort((a, b) => (b.updatedAt || b.date).localeCompare(a.updatedAt || a.date));

  const partnerOptions = [...new Set(rows.map((r) => r.partnerId).filter(Boolean))]
    .map((id) => ({ id, name: partnerById.get(id)?.companyName ?? id, summary: summaries.get(id)! }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-6 pb-12">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Reviews</h1>
          <p className="text-sm text-gray-500 mt-1">
            Client ratings of their partners. Hidden reviews don&apos;t count toward a partner&apos;s score. Whether a partner&apos;s score is shown at all is set per partner on the Partners tab.
          </p>
        </div>
        <ReviewsClient rows={rows} partners={partnerOptions} canEdit={canEdit} initialPartner={partnerFilter ?? ""} />
      </main>
    </div>
  );
}
