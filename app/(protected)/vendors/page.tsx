import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getTenantById,
  getUserRoleForTenant,
  getVendorsForTenant,
  getMembershipsForUser,
} from "@/lib/airtable";
import { Card, CardContent } from "@/components/ui/Card";
import { VendorsClient } from "./VendorsClient";
import type { Tenant } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"];

export default async function VendorsPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;

  // ── No tenantId: resolve via memberships ─────────────────────────────────────
  if (!tenantId) {
    const memberships = await getMembershipsForUser(userId).catch(() => []);

    if (memberships.length === 0) redirect("/onboarding");

    if (memberships.length === 1) {
      redirect(`/vendors?tenantId=${memberships[0].tenantId}`);
    }

    const tenants = await Promise.all(
      memberships.map((m) => getTenantById(m.tenantId).catch(() => null))
    );
    const valid = tenants
      .map((t, i) => ({ tenant: t, membership: memberships[i] }))
      .filter((x): x is { tenant: Tenant; membership: typeof memberships[0] } => x.tenant !== null);

    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          <p className="text-gray-500 mt-1">Select a project to view its vendors.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {valid.map(({ tenant }) => (
            <Link key={tenant.id} href={`/vendors?tenantId=${tenant.id}`}>
              <Card hover>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 bg-forest-50 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-gray-900 mt-3">{tenant.name}</h3>
                  <p className="text-sm text-gray-400 mt-0.5">View vendors</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // ── Single-tenant mode ────────────────────────────────────────────────────────
  const [tenant, role, vendors] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getVendorsForTenant(tenantId).catch(() => []),
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
              Home
            </Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{tenant.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          <p className="text-gray-500 mt-0.5">Service providers for your project</p>
        </div>
      </div>

      <VendorsClient vendors={vendors} tenantId={tenantId} canEdit={canEdit} />
    </div>
  );
}
