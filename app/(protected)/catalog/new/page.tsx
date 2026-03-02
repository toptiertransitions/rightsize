import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getRoomsForTenant, getUserRoleForTenant, getTenantById } from "@/lib/airtable";
import { NewItemClient } from "./NewItemClient";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function NewItemPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;
  if (!tenantId) redirect("/dashboard");

  const [tenant, role, rooms] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getRoomsForTenant(tenantId).catch(() => []),
  ]);

  if (!tenant) redirect("/dashboard");
  if (!role) redirect("/dashboard");

  const canEdit = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"].includes(role);
  if (!canEdit) redirect(`/catalog?tenantId=${tenantId}`);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
          <Link href="/dashboard" className="hover:text-forest-600">Home</Link>
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

      <NewItemClient tenantId={tenantId} rooms={rooms} />
    </div>
  );
}
