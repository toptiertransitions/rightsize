import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getTenantById,
  getTenants,
  getUserRoleForTenant,
  getRoomsForTenant,
  getPlanEntriesForTenant,
  getPlanEntriesForTenants,
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
import { IntakeFormSection } from "./IntakeFormSection";
import { ClientContactBar } from "./ClientContactBar";
import { ProjectAddressBar } from "./ProjectAddressBar";
import { AddClientUserButton } from "@/components/AddClientUserButton";
import { WeeklyEmailButton } from "./WeeklyEmailButton";
import type { Tenant } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ tenantId?: string; view?: string }>;
}

const EDIT_ROLES = ["Owner", "Collaborator", "TTTManager", "TTTAdmin"];

export default async function PlanPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId, view } = await searchParams;

  // ── Sentinel tenantId mode (all/archived/all-time for managers) ────────────────
  if (tenantId === "__all_active__" || tenantId === "__all_archived__" || tenantId === "__all_time__") {
    const sysRole = await getSystemRole(userId!).catch(() => null);
    const isManagerOrAdmin = sysRole === "TTTManager" || sysRole === "TTTAdmin";
    if (!isManagerOrAdmin) {
      // Staff users hitting a manager-only sentinel → send them to their personal view
      if (sysRole === "TTTStaff") redirect("/plan");
      redirect("/home");
    }

    const allTenants = await getTenants().catch(() => []);
    const isAdminCaller = sysRole === "TTTAdmin";
    // Non-admin staff can only see TTT projects
    const visibleTenants = isAdminCaller ? allTenants : allTenants.filter(t => t.isTTT ?? true);
    const selectedTenants =
      tenantId === "__all_active__" ? visibleTenants.filter((t) => !t.isArchived) :
      tenantId === "__all_archived__" ? visibleTenants.filter((t) => t.isArchived) :
      visibleTenants;

    const tenantOptions = visibleTenants.map((t) => ({ id: t.id, name: t.name, isArchived: t.isArchived ?? false, isConsignmentOnly: t.isConsignmentOnly ?? false, address: t.address, city: t.city, state: t.state, zip: t.zip, destAddress: t.destAddress, destCity: t.destCity, destState: t.destState, destZip: t.destZip }));

    const [allEntries, allTimeEntries, allProjectFiles, serviceList] = await Promise.all([
      getPlanEntriesForTenants(selectedTenants.map(t => t.id)).catch(() => []),
      Promise.all(selectedTenants.map((t) => getTimeEntries({ tenantId: t.id }).catch(() => []))).then((r) => r.flat()),
      Promise.all(selectedTenants.map((t) => getProjectFiles(t.id).catch(() => []))).then((r) => r.flat()),
      getServices().catch(() => []),
    ]);

    const serviceNames = serviceList.map((s) => s.name);
    const viewLabel =
      tenantId === "__all_active__" ? "All active projects" :
      tenantId === "__all_archived__" ? "Archived projects" :
      "All-time projects";

    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plan</h1>
            <p className="text-gray-500 mt-0.5">{viewLabel} — daily focus calendar</p>
          </div>
        </div>
        <PlanClient
          entries={allEntries}
          rooms={[]}
          tenantId=""
          canEdit={tenantId === "__all_active__" && isManagerOrAdmin}
          projectFiles={allProjectFiles}
          timeEntries={allTimeEntries}
          isAdmin={sysRole === "TTTAdmin"}
          tenantOptions={tenantOptions}
          currentTenantId={tenantId}
          services={serviceNames}
          isManager={isManagerOrAdmin}
        />
      </div>
    );
  }

  // ── No tenantId: check for manager/admin first, then fall back to membership logic ──
  if (!tenantId) {
    const sysRole = await getSystemRole(userId!).catch(() => null);
    const isManagerOrAdmin = sysRole === "TTTManager" || sysRole === "TTTAdmin";

    if (isManagerOrAdmin) {
      const allTenants = await getTenants().catch(() => []);
      const isAdminCaller2 = sysRole === "TTTAdmin";
      const visibleTenants2 = isAdminCaller2 ? allTenants : allTenants.filter(t => t.isTTT ?? true);
      const showArchived = view === "archived";
      const selectedTenants = showArchived
        ? visibleTenants2.filter(t => t.isArchived)
        : visibleTenants2.filter(t => !t.isArchived);
      const currentTenantId = showArchived ? "__all_archived__" : "__all_active__";
      const tenantOptions = visibleTenants2.map(t => ({ id: t.id, name: t.name, isArchived: t.isArchived ?? false, isConsignmentOnly: t.isConsignmentOnly ?? false, address: t.address, city: t.city, state: t.state, zip: t.zip, destAddress: t.destAddress, destCity: t.destCity, destState: t.destState, destZip: t.destZip }));

      // Fetch plan entries, time entries, project files, and services for all tenants in selected group
      const [allEntries, allTimeEntries, allProjectFiles, serviceList] = await Promise.all([
        getPlanEntriesForTenants(selectedTenants.map(t => t.id)).catch(() => []),
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
            canEdit={!showArchived && isManagerOrAdmin}
            projectFiles={allProjectFiles}
            timeEntries={allTimeEntries}
            isAdmin={sysRole === "TTTAdmin"}
            tenantOptions={tenantOptions}
            currentTenantId={currentTenantId}
            services={serviceNames}
            isManager={isManagerOrAdmin}
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

      const [allTenantsRaw, serviceList] = await Promise.all([
        getTenants().catch(() => []),
        getServices().catch(() => []),
      ]);

      // TTTStaff only see TTT-managed projects
      const allTenants = allTenantsRaw.filter(t => t.isTTT ?? true);

      // Load all TTT tenants (active + archived) for full shift history
      const allEntries = await Promise.all(
        allTenants.map(t => getPlanEntriesForTenant(t.id).catch(() => []))
      ).then(r => r.flat());

      const staffEntries = userEmail
        ? allEntries.filter(entry => entry.helpers?.some(h => h.email === userEmail))
        : [];

      // Fetch time entries only for tenants where the staff member has shifts
      const tenantIdsWithEntries = [...new Set(staffEntries.map(e => e.tenantId).filter(Boolean))];
      const staffTimeEntries = await Promise.all(
        tenantIdsWithEntries.map(id => getTimeEntries({ tenantId: id }).catch(() => []))
      ).then(r => r.flat());

      const tenantOptions = allTenants.map(t => ({ id: t.id, name: t.name, isArchived: t.isArchived ?? false, isConsignmentOnly: t.isConsignmentOnly ?? false, address: t.address, city: t.city, state: t.state, zip: t.zip, destAddress: t.destAddress, destCity: t.destCity, destState: t.destState, destZip: t.destZip }));
      const serviceNames = serviceList.map(s => s.name);

      return (
        <div>
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Plan</h1>
            <p className="text-gray-500 mt-0.5">Your scheduled shifts across all projects</p>
          </div>
          <PlanClient
            entries={staffEntries}
            rooms={[]}
            tenantId=""
            canEdit={false}
            projectFiles={[]}
            timeEntries={staffTimeEntries}
            isAdmin={false}
            tenantOptions={tenantOptions}
            currentTenantId="__my_projects__"
            services={serviceNames}
            isStaff={true}
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

  const isManagerOrAdmin = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const isTTTStaff = sysRole === "TTTStaff";

  // TTTStaff can add/edit shifts (non-TTT-helper shifts) just like a client user
  const canEdit = EDIT_ROLES.includes(resolvedRole) || isTTTStaff;

  // TTTStaff should only see shifts they are personally invited to
  let filteredEntries = entries;
  if (isTTTStaff) {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId!).catch(() => null);
    const userEmail = clerkUser?.emailAddresses.find(
      e => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress;
    filteredEntries = userEmail
      ? entries.filter(entry => entry.helpers?.some(h => h.email === userEmail))
      : [];
  }
  const tenantOptions = (isManagerOrAdmin || isTTTStaff)
    ? allTenants.map(t => ({ id: t.id, name: t.name, isArchived: t.isArchived ?? false, isConsignmentOnly: t.isConsignmentOnly ?? false, address: t.address, city: t.city, state: t.state, zip: t.zip, destAddress: t.destAddress, destCity: t.destCity, destState: t.destState, destZip: t.destZip }))
    : [{ id: tenantId, name: tenant.name, isArchived: tenant.isArchived ?? false, address: tenant.address, city: tenant.city, state: tenant.state, zip: tenant.zip, destAddress: tenant.destAddress, destCity: tenant.destCity, destState: tenant.destState, destZip: tenant.destZip }];
  const serviceNames = serviceList.map(s => s.name);

  const isTTTStaffOrAbove = sysRole !== null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plan</h1>
          <p className="text-gray-500 mt-0.5">Schedule daily focus areas for your project</p>
          <ProjectAddressBar
            tenantId={tenantId}
            initialAddress={tenant.address}
            initialCity={tenant.city}
            initialState={tenant.state}
            initialZip={tenant.zip}
            initialDestAddress={tenant.destAddress}
            initialDestCity={tenant.destCity}
            initialDestState={tenant.destState}
            initialDestZip={tenant.destZip}
          />
          {isTTTStaffOrAbove && (
            <ClientContactBar
              tenantId={tenantId}
              initialEmail={tenant.clientEmail}
              initialPhone={tenant.clientPhone}
            />
          )}
        </div>
        {isTTTStaffOrAbove && tenant && (
          <div className="flex flex-col gap-2 items-end">
            <AddClientUserButton tenantId={tenantId} projectName={tenant.name} />
            {isManagerOrAdmin && (
              <WeeklyEmailButton tenantId={tenantId} />
            )}
          </div>
        )}
      </div>

      <PlanClient
        entries={filteredEntries}
        rooms={rooms}
        tenantId={tenantId}
        tenantName={tenant.name}
        canEdit={canEdit}
        projectFiles={projectFiles}
        timeEntries={timeEntries}
        isAdmin={isAdmin}
        estimatedHours={tenant.estimatedHours}
        estimatedServiceHours={tenant.estimatedServiceHours}
        tenantOptions={tenantOptions}
        currentTenantId={tenantId}
        services={serviceNames}
        primaryContract={primaryContract}
        isManager={isManagerOrAdmin}
        isStaff={isTTTStaff}
        isTTT={tenant.isTTT === true}
      />

      {/* First Visit Intake — visible to TTTStaff, TTTManager, TTTAdmin only */}
      {isTTTStaffOrAbove && <IntakeFormSection tenantId={tenantId} />}
    </div>
  );
}
