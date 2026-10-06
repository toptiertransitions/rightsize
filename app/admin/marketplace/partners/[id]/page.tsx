import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../../MarketplaceNav";
import {
  getPartnerById,
  getAllCategories,
  getListingsForPartnerAdmin,
  getAuditLogForListing,
  getIntroductionEventsForPartner,
} from "@/lib/marketplace/data";
import { getLocalVendorById, getAllPartnerReviews, getSystemRole } from "@/lib/airtable";
import { hasCapability, type MarketplaceRole } from "@/lib/marketplace/permissions";
import { syncPartnerFromCrmIfLinked } from "../../actions";
import { PartnerDetailClient } from "./PartnerDetailClient";

export const dynamic = "force-dynamic";

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // CRM is the source of truth for a linked partner's business details —
  // refresh from it before rendering so this page (and the Partners record
  // itself, which public pages also read from) never shows stale data.
  await syncPartnerFromCrmIfLinked(id);

  const partner = await getPartnerById(id);
  if (!partner) notFound();

  const { userId } = await auth();
  const role = (userId ? await getSystemRole(userId) : null) as MarketplaceRole | null;
  const canEditReferralTerms = hasCapability(role ?? "public", "editReferralTerms");
  const canViewReferralAuditLog = hasCapability(role ?? "public", "viewReferralAuditLog");

  const [categories, listings, introEvents] = await Promise.all([
    getAllCategories(),
    getListingsForPartnerAdmin(id),
    getIntroductionEventsForPartner(id),
  ]);

  const auditLogs = (
    await Promise.all(listings.map((l) => getAuditLogForListing(l.id)))
  ).flat();

  // Legacy, read-only: reviews and the disposition-side portal login both
  // live on the old LocalVendor record this partner was backfilled from (if
  // any) — the new model doesn't have its own review-submission flow yet
  // (see Phase 0 finding: PartnerReviews has no write path anywhere today).
  let legacyVendor = null;
  let legacyReviews: Awaited<ReturnType<typeof getAllPartnerReviews>> = [];
  if (partner.localVendorId) {
    legacyVendor = await getLocalVendorById(partner.localVendorId).catch(() => null);
    const allReviews = await getAllPartnerReviews().catch(() => []);
    legacyReviews = allReviews.filter((r) => r.partnerId === partner.localVendorId);
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-6 pb-12">
        <PartnerDetailClient
          partner={partner}
          categories={categories}
          listings={listings}
          auditLogs={auditLogs}
          introEvents={introEvents}
          legacyPortalLinked={Boolean(legacyVendor?.clerkUserId)}
          legacyReviews={legacyReviews.map((r) => ({ score: r.score, comment: r.comment, date: r.date }))}
          canEditReferralTerms={canEditReferralTerms}
          canViewReferralAuditLog={canViewReferralAuditLog}
        />
      </main>
    </div>
  );
}
