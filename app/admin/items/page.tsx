import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";
import {
  getItemPriceHistory,
  getItemRouteHistory,
  getItemStatusHistory,
  getFlaggedDonateItems,
  getTenants,
  getLocalVendors,
  getItemsByPrimaryRoute,
  getTenantById,
  getMembershipsForTenant,
  getUserByClerkId,
} from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { ItemsAdmin } from "./ItemsAdmin";

export default async function AdminItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) redirect("/admin");

  const { tenantId } = await searchParams;

  const [history, routeHistory, statusHistory, flaggedItems, tenants, vendors, consignmentItems] = await Promise.all([
    getItemPriceHistory({ tenantId: tenantId || undefined, limit: 500 }),
    getItemRouteHistory({ tenantId: tenantId || undefined, limit: 1000 }),
    getItemStatusHistory({ tenantId: tenantId || undefined, limit: 1000 }),
    getFlaggedDonateItems(),
    getTenants().catch(() => []),
    getLocalVendors().catch(() => []),
    getItemsByPrimaryRoute("Other Consignment").catch(() => []),
  ]);

  const activeProjects = tenants
    .filter(t => !t.isArchived && !t.isLostDeal)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Resolve tenant name + owner email for each unique tenant referenced by
  // an Other Consignment item — see OtherConsignmentClient for how these feed the table.
  const uniqueTenantIds = [...new Set(consignmentItems.map(i => i.tenantId).filter(Boolean))];
  const tenantInfoMap: Record<string, { name: string; ownerEmail: string; isTTT: boolean }> = {};

  await Promise.all(
    uniqueTenantIds.map(async (tid) => {
      try {
        const tenant = await getTenantById(tid).catch(() => null);
        if (!tenant) return;
        let ownerEmail = "";
        try {
          const memberships = await getMembershipsForTenant(tid).catch(() => []);
          const ownerMembers = memberships.filter(m => m.role === "Owner");
          for (const m of ownerMembers) {
            if (isTTTAdmin(m.userId)) continue;
            const user = await getUserByClerkId(m.userId).catch(() => null);
            if (user?.email) { ownerEmail = user.email; break; }
          }
        } catch { /* ignore */ }
        tenantInfoMap[tid] = { name: tenant.name, ownerEmail, isTTT: tenant.isTTT ?? true };
      } catch { /* ignore */ }
    })
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AdminHeader active="items" />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <ItemsAdmin
          history={history}
          routeHistory={routeHistory}
          statusHistory={statusHistory}
          flaggedItems={flaggedItems}
          projects={activeProjects}
          selectedTenantId={tenantId || ""}
          consignmentItems={consignmentItems}
          tenantInfoMap={tenantInfoMap}
          vendors={vendors}
        />
      </main>
    </div>
  );
}
