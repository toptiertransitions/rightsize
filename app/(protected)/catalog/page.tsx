import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getItemsForTenant,
  getUserRoleForTenant,
  getTenantById,
  getTenants,
  getRoomsForTenant,
  getMembershipsForUser,
  getSystemRole,
  getAllLocalVendors,
  getStaffMembers,
} from "@/lib/airtable";
import { Button } from "@/components/ui/Button";
import { ItemGrid } from "@/components/catalog/ItemGrid";
import type { Tenant } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"];

export default async function CatalogPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;

  // ── All-projects sentinel mode (TTT staff only) ───────────────────────────────
  const SENTINEL_VIEWS = ["__all_active__", "__all_archived__", "__all_time__"];
  if (tenantId && SENTINEL_VIEWS.includes(tenantId)) {
    const sysRole = await getSystemRole(userId!).catch(() => null);
    if (!["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? "")) redirect("/home");

    const allTenants = await getTenants().catch(() => []);
    const selectedTenants =
      tenantId === "__all_active__" ? allTenants.filter((t) => !t.isArchived) :
      tenantId === "__all_archived__" ? allTenants.filter((t) => t.isArchived) :
      allTenants;

    const [itemArrays, roomArrays, localVendors, staffMembers] = await Promise.all([
      Promise.all(selectedTenants.map((t) => getItemsForTenant(t.id).catch(() => []))),
      Promise.all(selectedTenants.map((t) => getRoomsForTenant(t.id).catch(() => []))),
      getAllLocalVendors().catch(() => []),
      getStaffMembers().catch(() => []),
    ]);

    const items = itemArrays.flat().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const rooms = roomArrays.flat();
    const canAutoRoute = ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? "");
    const viewLabel =
      tenantId === "__all_active__" ? "All Active Projects" :
      tenantId === "__all_archived__" ? "All Archived Projects" :
      "All-Time Projects";

    const canReassign = ["TTTManager", "TTTAdmin"].includes(sysRole ?? "");
    const isTTTUser = !!sysRole && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole);

    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Item Catalog</h1>
          </div>
        </div>
        <ItemGrid
          items={items}
          canEdit={false}
          rooms={rooms}
          tenants={selectedTenants}
          localVendors={localVendors}
          canAutoRoute={canAutoRoute}
          canReassign={canReassign}
          allTenants={canReassign ? allTenants : undefined}
          staffMembers={staffMembers}
          isTTTUser={isTTTUser}
        />
      </div>
    );
  }

  // ── Single-tenant mode ───────────────────────────────────────────────────────
  if (tenantId) {
    const [tenant, role, items, rooms, sysRole, localVendors, allTenants, staffMembers] = await Promise.all([
      getTenantById(tenantId).catch(() => null),
      getUserRoleForTenant(userId, tenantId).catch(() => null),
      getItemsForTenant(tenantId).catch(() => []),
      getRoomsForTenant(tenantId).catch(() => []),
      getSystemRole(userId!).catch(() => null),
      getAllLocalVendors().catch(() => []),
      getTenants().catch(() => []),
      getStaffMembers().catch(() => []),
    ]);

    if (!tenant) redirect("/home");
    const resolvedRole = role ?? sysRole;
    if (!resolvedRole) redirect("/home");

    const canEdit = EDIT_ROLES.includes(resolvedRole);
    const canReassign = sysRole === "TTTManager" || sysRole === "TTTAdmin";
    const isTTTUser = !!sysRole && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole);

    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Item Catalog</h1>
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

        <ItemGrid
          items={items}
          tenantId={tenantId}
          canEdit={canEdit}
          rooms={rooms}
          localVendors={localVendors}
          canAutoRoute={resolvedRole ? ["TTTStaff", "TTTManager", "TTTAdmin"].includes(resolvedRole) : false}
          canReassign={canReassign}
          allTenants={canReassign ? allTenants : undefined}
          isTTT={tenant.isTTT ?? true}
          staffMembers={staffMembers}
          isTTTUser={isTTTUser}
        />
      </div>
    );
  }

  // ── All-items mode ───────────────────────────────────────────────────────────
  const memberships = await getMembershipsForUser(userId).catch(() => []);
  if (memberships.length === 0) redirect("/home");

  // Single-project users always go to their project catalog (shows Add Item button)
  if (memberships.length === 1) redirect(`/catalog?tenantId=${memberships[0].tenantId}`);

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
  const editableMembership = memberships.find((m) => EDIT_ROLES.includes(m.role));
  const canEdit = !!editableMembership;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Item Catalog</h1>
        </div>
        {canEdit && editableMembership && (
          <Link href={`/catalog/new?tenantId=${editableMembership.tenantId}`}>
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

      <ItemGrid items={items} canEdit={canEdit} rooms={rooms} tenants={tenants} />
    </div>
  );
}
