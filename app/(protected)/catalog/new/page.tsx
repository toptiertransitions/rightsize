import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getRoomsForTenant, getUserRoleForTenant, getTenantById, getSystemRole } from "@/lib/airtable";
import { NewItemClient } from "./NewItemClient";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function NewItemPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;
  if (!tenantId) redirect("/home");

  const [tenant, role, rooms, sysRole] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getRoomsForTenant(tenantId).catch(() => []),
    getSystemRole(userId).catch(() => null),
  ]);

  if (!tenant) redirect("/home");
  const resolvedRole = role ?? sysRole;
  if (!resolvedRole) redirect("/home");

  const canEdit = ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"].includes(resolvedRole);
  if (!canEdit) redirect(`/catalog?tenantId=${tenantId}`);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
          <Link href="/home" className="hover:text-forest-600">Home</Link>
          <span>/</span>
          <Link href={`/catalog?tenantId=${tenantId}`} className="hover:text-forest-600">Catalog</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">New Item</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Add Item</h1>
        <p className="text-gray-500 mt-0.5">
          Upload a photo — Claude AI will analyze the item and pre-fill the details.
        </p>
      </div>

      <NewItemClient tenantId={tenantId} rooms={rooms} isTTT={tenant.isTTT === true} />
    </div>
  );
}
