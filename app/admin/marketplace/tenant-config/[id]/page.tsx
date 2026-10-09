import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../../MarketplaceNav";
import { getBrandById, getPickableContacts, getAuditForEntity } from "@/lib/brands/data";
import { getPartnerById } from "@/lib/marketplace/data";
import { BrandEditor } from "./BrandEditor";

export const dynamic = "force-dynamic";

export default async function TenantEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await getBrandById(id);
  if (!brand) notFound();

  const [partner, pickable, audit] = await Promise.all([
    getPartnerById(brand.marketplacePartnerId).catch(() => null),
    getPickableContacts(brand),
    getAuditForEntity(brand.id, 15).catch(() => []),
  ]);
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
      </main>
    </div>
  );
}
