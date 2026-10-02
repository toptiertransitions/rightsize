import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";
import { getItemPriceHistory, getItemRouteHistory, getItemStatusHistory, getFlaggedDonateItems, getTenants } from "@/lib/airtable";
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

  const [history, routeHistory, statusHistory, flaggedItems, tenants] = await Promise.all([
    getItemPriceHistory({ tenantId: tenantId || undefined, limit: 500 }),
    getItemRouteHistory({ tenantId: tenantId || undefined, limit: 1000 }),
    getItemStatusHistory({ tenantId: tenantId || undefined, limit: 1000 }),
    getFlaggedDonateItems(),
    getTenants().catch(() => []),
  ]);

  const activeProjects = tenants
    .filter(t => !t.isArchived && !t.isLostDeal)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AdminHeader active="items" />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <ItemsAdmin history={history} routeHistory={routeHistory} statusHistory={statusHistory} flaggedItems={flaggedItems} projects={activeProjects} selectedTenantId={tenantId || ""} />
      </main>
    </div>
  );
}
