import { auth } from "@clerk/nextjs/server";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../MarketplaceNav";
import { getSystemRole } from "@/lib/airtable";
import { hasCapability, type MarketplaceRole } from "@/lib/marketplace/permissions";
import { getAllPartners } from "@/lib/marketplace/data";
import { getAllPartnerUsers, toPartnerUserView } from "@/lib/marketplace/partnerUsersData";
import { UsersClient } from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function MarketplaceUsersPage({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const { partner: partnerFilter } = await searchParams;
  const { userId } = await auth();
  const role = userId ? await getSystemRole(userId).catch(() => null) : null;
  const canManage = !!role && hasCapability(role as MarketplaceRole, "managePartnerUsers");

  const [partners, users] = await Promise.all([getAllPartners(), getAllPartnerUsers()]);
  const companies = partners
    .filter((p) => p.lifecycleStatus !== "Archived")
    .map((p) => ({ id: p.id, name: p.companyName, lifecycle: p.lifecycleStatus, pocName: p.pocName, email: p.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const partnerName = Object.fromEntries(partners.map((p) => [p.id, p.companyName]));

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-12">
        <UsersClient
          users={users.map(toPartnerUserView)}
          companies={companies}
          partnerName={partnerName}
          canManage={canManage}
          initialPartnerId={partnerFilter && partnerName[partnerFilter] ? partnerFilter : ""}
        />
      </main>
    </div>
  );
}
