import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getTenantById,
  getUserRoleForTenant,
  getRoomsForTenant,
  getPlanEntriesForTenant,
} from "@/lib/airtable";
import { PlanClient } from "./PlanClient";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"];

export default async function PlanPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;
  if (!tenantId) redirect("/dashboard");

  const [tenant, role, rooms, entries] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getRoomsForTenant(tenantId).catch(() => []),
    getPlanEntriesForTenant(tenantId).catch(() => []),
  ]);

  if (!tenant) redirect("/dashboard");
  if (!role) redirect("/dashboard");

  const canEdit = EDIT_ROLES.includes(role);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/dashboard" className="hover:text-forest-600 transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{tenant.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Plan</h1>
          <p className="text-gray-500 mt-0.5">Schedule daily focus areas for your project</p>
        </div>
      </div>

      <PlanClient entries={entries} rooms={rooms} tenantId={tenantId} canEdit={canEdit} />
    </div>
  );
}
