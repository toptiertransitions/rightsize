import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getItemsForTenant,
  getUserRoleForTenant,
  getTenantById,
  getRoomsForTenant,
  getMembershipsForUser,
} from "@/lib/airtable";
import { Button } from "@/components/ui/Button";
import { ItemGrid } from "@/components/catalog/ItemGrid";
import type { Tenant } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"];

export default async function CatalogPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;

  // ── Single-tenant mode ───────────────────────────────────────────────────────
  if (tenantId) {
    const [tenant, role, items, rooms] = await Promise.all([
      getTenantById(tenantId).catch(() => null),
      getUserRoleForTenant(userId, tenantId).catch(() => null),
      getItemsForTenant(tenantId).catch(() => []),
      getRoomsForTenant(tenantId).catch(() => []),
    ]);

    if (!tenant) redirect("/dashboard");
    if (!role) redirect("/dashboard");

    const canEdit = EDIT_ROLES.includes(role);

    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
              <Link href="/dashboard" className="hover:text-forest-600 transition-colors">Home</Link>
              <span>/</span>
              <Link href={`/rooms?tenantId=${tenantId}`} className="hover:text-forest-600 transition-colors">{tenant.name}</Link>
              <span>/</span>
              <span className="text-gray-700 font-medium">Catalog</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Item Catalog</h1>
            <p className="text-gray-500 mt-0.5">
              {items.length} item{items.length !== 1 ? "s" : ""} cataloged
            </p>
          </div>
          {canEdit && (
            <Link href={`/catalog/new?tenantId=${tenantId}`}>
              <Button>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Add Item
              </Button>
            </Link>
          )}
        </div>

        <ItemGrid items={items} tenantId={tenantId} canEdit={canEdit} rooms={rooms} />
      </div>
    );
  }

  // ── All-items mode ───────────────────────────────────────────────────────────
  const memberships = await getMembershipsForUser(userId).catch(() => []);
  if (memberships.length === 0) redirect("/dashboard");

  const tenantIds = memberships.map((m) => m.tenantId);

  const [itemArrays, tenantObjects, roomArrays] = await Promise.all([
    Promise.all(tenantIds.map((tid) => getItemsForTenant(tid).catch(() => []))),
    Promise.all(tenantIds.map((tid) => getTenantById(tid).catch(() => null))),
    Promise.all(tenantIds.map((tid) => getRoomsForTenant(tid).catch(() => []))),
  ]);

  const items = itemArrays.flat().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const rooms = roomArrays.flat();
  const tenants = tenantObjects.filter(Boolean) as Tenant[];
  const canEdit = memberships.some((m) => EDIT_ROLES.includes(m.role));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/dashboard" className="hover:text-forest-600 transition-colors">Home</Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">All Items</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Item Catalog</h1>
          <p className="text-gray-500 mt-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""} across {tenants.length} project{tenants.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <ItemGrid items={items} canEdit={canEdit} rooms={rooms} tenants={tenants} />
    </div>
  );
}
