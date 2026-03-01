import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getTenantById,
  getUserRoleForTenant,
  getRoomsForTenant,
  getPlanEntriesForTenant,
  getMembershipsForUser,
} from "@/lib/airtable";
import { Card, CardContent } from "@/components/ui/Card";
import { PlanClient } from "./PlanClient";
import type { Tenant } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"];

export default async function PlanPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;

  // ── No tenantId: resolve via memberships ─────────────────────────────────────
  if (!tenantId) {
    const memberships = await getMembershipsForUser(userId).catch(() => []);

    if (memberships.length === 0) redirect("/onboarding");

    // Single project → redirect directly
    if (memberships.length === 1) {
      redirect(`/plan?tenantId=${memberships[0].tenantId}`);
    }

    // Multiple projects → show picker
    const tenants = await Promise.all(
      memberships.map((m) => getTenantById(m.tenantId).catch(() => null))
    );
    const valid = tenants
      .map((t, i) => ({ tenant: t, membership: memberships[i] }))
      .filter((x): x is { tenant: Tenant; membership: typeof memberships[0] } => x.tenant !== null);

    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Plan</h1>
          <p className="text-gray-500 mt-1">Select a project to view its plan.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {valid.map(({ tenant }) => (
            <Link key={tenant.id} href={`/plan?tenantId=${tenant.id}`}>
              <Card hover>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 bg-forest-50 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-gray-900 mt-3">{tenant.name}</h3>
                  <p className="text-sm text-gray-400 mt-0.5">View plan</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // ── Single-tenant mode ────────────────────────────────────────────────────────
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
