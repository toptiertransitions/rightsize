import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../../MarketplaceNav";
import { getBrandById, getPickableContacts, getAuditForEntity } from "@/lib/brands/data";
import { getPartnerById, getAllPartners, getAllCategories, getAllListingsAdmin } from "@/lib/marketplace/data";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { hasCapability, type MarketplaceRole } from "@/lib/marketplace/permissions";
import { PreferredPartnersEditor } from "./PreferredPartnersEditor";
import { BrandEditor } from "./BrandEditor";
import { getChecklistItems } from "@/lib/checklists/data";
import { ChecklistEditor } from "@/components/community-checklist/ChecklistEditor";
import { adminRemoveChecklistItemAction, adminReorderChecklistAction, adminSaveChecklistItemAction } from "../checklist-actions";

export const dynamic = "force-dynamic";

export default async function TenantEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await getBrandById(id);
  if (!brand) notFound();

  const { userId } = await auth();
  const [partner, pickable, audit, checklistItems, allPartners, categories, listings, role] = await Promise.all([
    getPartnerById(brand.marketplacePartnerId).catch(() => null),
    getPickableContacts(brand),
    getAuditForEntity(brand.id, 15).catch(() => []),
    getChecklistItems([brand.id]).catch(() => []),
    getAllPartners().catch(() => []),
    getAllCategories().catch(() => []),
    getAllListingsAdmin().catch(() => []),
    userId ? getSystemRole(userId).catch(() => null) : Promise.resolve(null),
  ]);
  const categoryLabel = new Map(categories.map((c) => [c.id, c.label]));
  const pickablePartners = allPartners
    .filter((p) => p.id !== brand.marketplacePartnerId && p.lifecycleStatus !== "Archived")
    .map((p) => ({
      id: p.id,
      name: p.companyName,
      categories: [...new Set(listings.filter((l) => l.partnerId === p.id).map((l) => categoryLabel.get(l.categoryId) ?? "").filter(Boolean))],
      lifecycle: p.lifecycleStatus,
      city: p.city,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-6 pb-16">
        <Link href="/admin/marketplace/tenant-config" className="text-sm text-gray-400 hover:text-white">← All tenants</Link>
        <BrandEditor
          brand={brand}
          partnerName={partner?.companyName ?? "Partner not found"}
          crmCompanyLinked={!!pickable.companyId}
          pickableContacts={pickable.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, phone: c.phone, email: c.email }))}
          joinBaseUrl={`${appUrl}/join/`}
          audit={audit.map((a) => ({ timestamp: a.timestamp, actorName: a.actorName, field: a.field, newValue: a.newValue }))}
        />
        <div id="preferred-partners" className="mt-10 max-w-3xl scroll-mt-24">
          <PreferredPartnersEditor
            brandId={brand.id}
            communityName={brand.displayName || partner?.companyName || "this community"}
            initialIds={brand.preferredPartnerIds}
            partners={pickablePartners}
            canEdit={!!role && hasCapability(role as MarketplaceRole, "managePreferredPartners")}
          />
        </div>
        <div id="checklist" className="mt-10 max-w-3xl scroll-mt-24">
          <ChecklistEditor
            theme="dark"
            communityName={brand.displayName || partner?.companyName || "this community"}
            initialItems={checklistItems}
            onSave={adminSaveChecklistItemAction.bind(null, brand.id)}
            onRemove={adminRemoveChecklistItemAction.bind(null, brand.id)}
            onReorder={adminReorderChecklistAction.bind(null, brand.id)}
          />
          <p className="text-xs text-gray-500 mt-3">
            The community&rsquo;s account owner can also edit this list from their partner portal, and every partner user there can track each resident&rsquo;s progress.
          </p>
        </div>
      </main>
    </div>
  );
}
