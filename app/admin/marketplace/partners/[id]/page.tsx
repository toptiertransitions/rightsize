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
import Link from "next/link";
import { getPartnerUsersForPartner } from "@/lib/marketplace/partnerUsersData";

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

  const [categories, listings, introEvents, teamRows] = await Promise.all([
    getAllCategories(),
    getListingsForPartnerAdmin(id),
    getIntroductionEventsForPartner(id),
    getPartnerUsersForPartner(id).catch(() => []),
  ]);
  const team = teamRows.filter((u) => u.status === "Active");
  const pendingInvites = teamRows.filter((u) => u.status === "Invited").length;
  const owner = teamRows.find((u) => u.role === "Primary" && (u.status === "Active" || u.status === "Invited"));

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
        <Link
          href={`/admin/marketplace/users?partner=${partner.id}`}
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 hover:border-gray-700"
        >
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-500">Account users</p>
            <p className="text-sm text-gray-200 mt-0.5">
              {owner ? <>Owner: <span className="text-white font-medium">{owner.name || owner.email}</span>{owner.status === "Invited" ? " (invited)" : ""}</> : <span className="text-red-300">No account owner yet</span>}
              <span className="text-gray-500"> · {team.length} {team.length === 1 ? "user" : "users"}{pendingInvites ? ` · ${pendingInvites} pending` : ""}</span>
            </p>
          </div>
          <span className="text-sm font-medium text-emerald-400">Manage team &rarr;</span>
        </Link>
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
