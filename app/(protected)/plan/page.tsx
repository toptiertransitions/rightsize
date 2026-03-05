import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getTenantById,
  getTenants,
  getUserRoleForTenant,
  getRoomsForTenant,
  getPlanEntriesForTenant,
  getMembershipsForUser,
  getProjectFiles,
  getTimeEntries,
  getSystemRole,
  getServices,
  getContractsForTenant,
} from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { Card, CardContent } from "@/components/ui/Card";
import { PlanClient } from "./PlanClient";
import type { Tenant } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ tenantId?: string; view?: string }>;
}

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"];

export default async function PlanPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId, view } = await searchParams;

  // ── No tenantId: check for manager/admin first, then fall back to membership logic ──
  if (!tenantId) {
    const sysRole = await getSystemRole(userId!).catch(() => null);
    const isManagerOrAdmin = sysRole === "TTTManager" || sysRole === "TTTAdmin";

    if (isManagerOrAdmin) {
      const allTenants = await getTenants().catch(() => []);
      const showArchived = view === "archived";
      const selectedTenants = showArchived
        ? allTenants.filter(t => t.isArchived)
        : allTenants.filter(t => !t.isArchived);
      const currentTenantId = showArchived ? "__all_archived__" : "__all_active__";
      const tenantOptions = allTenants.map(t => ({ id: t.id, name: t.name, isArchived: t.isArchived ?? false }));

      // Fetch plan entries, time entries, project files, and services for all tenants in selected group
      const [allEntries, allTimeEntries, allProjectFiles, serviceList] = await Promise.all([
        Promise.all(selectedTenants.map(t => getPlanEntriesForTenant(t.id).catch(() => []))).then(r => r.flat()),
        Promise.all(selectedTenants.map(t => getTimeEntries({ tenantId: t.id }).catch(() => []))).then(r => r.flat()),
        Promise.all(selectedTenants.map(t => getProjectFiles(t.id).catch(() => []))).then(r => r.flat()),
        getServices().catch(() => []),
      ]);

      const serviceNames = serviceList.map(s => s.name);

      return (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Plan</h1>
              <p className="text-gray-500 mt-0.5">{showArchived ? "Archived projects" : "All active projects"} — daily focus calendar</p>
            </div>
          </div>
          <PlanClient
            entries={allEntries}
            rooms={[]}
            tenantId=""
            canEdit={false}
            projectFiles={allProjectFiles}
            timeEntries={allTimeEntries}
            isAdmin={sysRole === "TTTAdmin"}
            tenantOptions={tenantOptions}
            currentTenantId={currentTenantId}
            services={serviceNames}
          />
        </div>
      );
    }

    // ── TTT Staff: show their helper shifts across all projects ──────────────
    if (sysRole === "TTTStaff") {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(userId!);
      const userEmail = clerkUser.emailAddresses.find(
        e => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress;

      const [allTenants, serviceList] = await Promise.all([
        getTenants().catch(() => []),
        getServices().catch(() => []),
      ]);
      const activeTenants = allTenants.filter(t => !t.isArchived);
      const allEntries = await Promise.all(
        activeTenants.map(t => getPlanEntriesForTenant(t.id).catch(() => []))
      ).then(r => r.flat());

      const staffEntries = userEmail
        ? allEntries.filter(entry => entry.helpers?.some(h => h.email === userEmail))
        : [];

      const tenantOptions = allTenants.map(t => ({ id: t.id, name: t.name, isArchived: t.isArchived ?? false }));
      const serviceNames = serviceList.map(s => s.name);

      return (
        <div>
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Plan</h1>
            <p className="text-gray-500 mt-0.5">Your scheduled daily focus shifts across all active projects</p>
          </div>
          <PlanClient
            entries={staffEntries}
            rooms={[]}
            tenantId=""
            canEdit={false}
            projectFiles={[]}
            timeEntries={[]}
            isAdmin={false}
            tenantOptions={tenantOptions}
            currentTenantId="__all_active__"
            services={serviceNames}
          />
        </div>
      );
    }

    const memberships = await getMembershipsForUser(userId).catch(() => []);

    if (memberships.length === 0) {
      if (sysRole) redirect("/home");
      redirect("/onboarding");
    }

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
  const isAdmin = isTTTAdmin(userId);
  const [tenant, role, rooms, entries, projectFiles, timeEntries, sysRole, allTenants, serviceList, contracts] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getRoomsForTenant(tenantId).catch(() => []),
    getPlanEntriesForTenant(tenantId).catch(() => []),
    getProjectFiles(tenantId).catch(() => []),
    getTimeEntries({ tenantId }).catch(() => []),
    getSystemRole(userId!).catch(() => null),
    getTenants().catch(() => []),
    getServices().catch(() => []),
    getContractsForTenant(tenantId).catch(() => []),
  ]);

  // The current primary quote is the most-recently-signed Signed contract
  const primaryContract = contracts
    .filter((c) => c.status === "Signed")
    .sort((a, b) => (b.signedAt ?? b.createdAt).localeCompare(a.signedAt ?? a.createdAt))[0] ?? null;

  if (!tenant) redirect("/home");
  const resolvedRole = role ?? sysRole;
  if (!resolvedRole) redirect("/home");

  const canEdit = EDIT_ROLES.includes(resolvedRole);

  const isManagerOrAdmin = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const tenantOptions = isManagerOrAdmin
    ? allTenants.map(t => ({ id: t.id, name: t.name, isArchived: t.isArchived ?? false }))
    : undefined;
  const serviceNames = serviceList.map(s => s.name);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/home" className="hover:text-forest-600 transition-colors">
              Home
            </Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{tenant.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Plan</h1>
          <p className="text-gray-500 mt-0.5">Schedule daily focus areas for your project</p>
        </div>
      </div>

      <PlanClient
        entries={entries}
        rooms={rooms}
        tenantId={tenantId}
        canEdit={canEdit}
        projectFiles={projectFiles}
        timeEntries={timeEntries}
        isAdmin={isAdmin}
        estimatedHours={tenant.estimatedHours}
        tenantOptions={tenantOptions}
        currentTenantId={tenantId}
        services={serviceNames}
        primaryContract={primaryContract}
        isManager={isManagerOrAdmin}
      />
    </div>
  );
}
