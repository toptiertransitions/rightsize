import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMembershipsForUser, getTenants, getTenantById, getItemsForTenant, getRoomsForTenant, getTimeEntries, getSystemRole, getStaffMembers, getLocalVendorByClerkId, getContractsForTenant, getServices, getInvoicesForTenant, getPlanEntriesForTodayByEmail } from "@/lib/airtable";
import { TimeTrackerClient } from "@/app/admin/TimeTrackerClient";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ProjectActions } from "./ProjectActions";
import { AdminProjectsClient } from "./AdminProjectsClient";
import { FreeEstimatorCard } from "./FreeEstimatorCard";
import { AddClientUserButton } from "@/components/AddClientUserButton";
import { AvailabilitySection } from "./AvailabilitySection";
import { TodaysPlan } from "./TodaysPlan";
import type { TodayShift } from "./TodaysPlan";
import { MyPaySection } from "./MyPaySection";

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"];
const OWNER_ROLES = ["Owner", "TTTAdmin"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId: tenantIdParam } = await searchParams;

  const user = await currentUser();
  const [systemRole, memberships] = await Promise.all([
    getSystemRole(userId),
    getMembershipsForUser(userId).catch(() => []),
  ]);
  const isStaff = systemRole !== null;
  const isAdmin = systemRole === "TTTAdmin";
  const isManager = systemRole === "TTTManager";
  const isSales = systemRole === "TTTSales";
  const firstName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "there";

  // ── TTTSales users land on CRM ────────────────────────────────────────────────
  if (isSales) redirect("/crm");

  // ── TTTStaff/Manager/Admin: time tracker + all-tenant picker ─────────────────
  if (isStaff && !tenantIdParam) {
    const canViewAll = isAdmin || isManager;
    const userEmail = user?.emailAddresses?.[0]?.emailAddress ?? "";
    const todayStr = new Date().toISOString().slice(0, 10);
    const showTodaysPlan = systemRole === "TTTStaff" || systemRole === "TTTManager";

    const [allTenants, timeEntries, allStaff, serviceList] = await Promise.all([
      getTenants().catch(() => []),
      getTimeEntries(canViewAll ? undefined : { clerkUserId: userId }).catch(() => []),
      getStaffMembers().catch(() => []),
      getServices().catch(() => []),
    ]);

    // Use the Airtable-stored email (what's actually saved in plan helpers JSON)
    // rather than the Clerk primary email, which may differ
    const currentStaff = allStaff.find(s => s.clerkUserId === userId);
    const planQueryEmail = currentStaff?.email?.toLowerCase() || userEmail;

    const todayPlanEntries = showTodaysPlan && planQueryEmail
      ? await getPlanEntriesForTodayByEmail(planQueryEmail, todayStr).catch(() => [])
      : [];

    // ── Build Today's Plan data ──────────────────────────────────────────────
    let todayShifts: TodayShift[] = [];
    if (showTodaysPlan && todayPlanEntries.length > 0) {
      const tenantMap = new Map(allTenants.map((t) => [t.id, t]));
      const staffByEmail = new Map(allStaff.map((s) => [s.email.toLowerCase(), s]));

      // Batch-fetch Clerk photos for all helpers
      const helperEmails = new Set(
        todayPlanEntries.flatMap((e) => (e.helpers ?? []).map((h) => h.email.toLowerCase()))
      );
      const helperClerkIds = [...helperEmails]
        .map((email) => staffByEmail.get(email)?.clerkUserId)
        .filter((id): id is string => !!id);

      const clerkPhotoMap = new Map<string, string>();
      if (helperClerkIds.length > 0) {
        try {
          const client = await clerkClient();
          const { data: clerkUsers } = await client.users.getUserList({ userId: helperClerkIds, limit: 100 });
          for (const cu of clerkUsers) clerkPhotoMap.set(cu.id, cu.imageUrl);
        } catch { /* photos are best-effort */ }
      }

      todayShifts = todayPlanEntries.map((entry) => {
        const tenant = tenantMap.get(entry.tenantId);
        const teammates = (entry.helpers ?? [])
          .filter((h) => h.email.toLowerCase() !== userEmail.toLowerCase())
          .map((h) => {
            const staff = staffByEmail.get(h.email.toLowerCase());
            return {
              displayName: staff?.displayName ?? h.email,
              phone: staff?.phone,
              imageUrl: staff?.clerkUserId ? clerkPhotoMap.get(staff.clerkUserId) : undefined,
              initials: (staff?.displayName ?? h.email).charAt(0).toUpperCase(),
            };
          });

        let mapUrl: string | undefined;
        let fullAddress: string | undefined;
        if (tenant?.address) {
          fullAddress = [tenant.address, tenant.city, tenant.state, tenant.zip].filter(Boolean).join(", ");
          mapUrl = `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`;
        }

        return {
          id: entry.id,
          activity: entry.activity,
          notes: entry.notes,
          startTime: entry.startTime,
          endTime: entry.endTime,
          projectName: tenant?.name ?? "Unknown Project",
          fullAddress,
          mapUrl,
          clientPhone: tenant?.clientPhone,
          clientEmail: tenant?.clientEmail,
          teammates,
        };
      });
    }

    const serviceNames = serviceList.map(s => s.name);

    const staffMembers = canViewAll
      ? allStaff.filter((s) => s.isActive).map((s) => ({ id: s.clerkUserId, name: s.displayName }))
      : undefined;

    // Filter tenants for staff views: admin sees all, staff/manager sees only TTT
    const filteredTenants = allTenants.filter(t => !t.isArchived && (isAdmin || (t.isTTT ?? true)));

    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}</h1>
        </div>

        {/* Today's Plan — TTTStaff and TTTManager */}
        {showTodaysPlan && (
          <TodaysPlan shifts={todayShifts} today={todayStr} />
        )}

        {/* Time Tracker */}
        <section className="mb-10">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Time Tracking</h2>
          <div className="bg-gray-950 rounded-2xl p-6">
            <TimeTrackerClient
              initialEntries={timeEntries}
              tenants={filteredTenants.map(t => ({ id: t.id, name: t.name }))}
              isAdmin={isAdmin}
              isManager={isManager}
              currentUserId={userId}
              currentUserName={firstName}
              staffMembers={staffMembers}
              services={serviceNames}
              todayShift={todayPlanEntries[0]}
            />
          </div>
        </section>

        {/* Client Projects */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Client Projects</h2>
          <AdminProjectsClient initialTenants={isAdmin ? allTenants : filteredTenants} isManager={isAdmin || isManager} isAdmin={isAdmin} />
        </section>

        {/* Availability — TTTStaff and TTTManager only (not admin-only accounts) */}
        {(systemRole === "TTTStaff" || systemRole === "TTTManager") && (
          <AvailabilitySection />
        )}

        {/* My Pay — TTTStaff and TTTManager */}
        {(systemRole === "TTTStaff" || systemRole === "TTTManager") && (
          <MyPaySection clerkUserId={userId} />
        )}
      </div>
    );
  }

  // ── Vendor-only user ─────────────────────────────────────────────────────────
  if (!systemRole && memberships.length === 0) {
    const vendor = await getLocalVendorByClerkId(userId).catch(() => null);
    if (vendor) redirect("/vendor");
  }

  // ── No projects ──────────────────────────────────────────────────────────────
  if (memberships.length === 0) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {firstName}</h1>
          <p className="text-gray-500 mt-1">Let&apos;s get your first project set up.</p>
        </div>
        <Card className="max-w-lg">
          <CardContent className="text-center py-12">
            <div className="w-16 h-16 bg-forest-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Set up your first project</h2>
            <p className="text-gray-500 mb-6 leading-relaxed">
              Create a project to start cataloging items, estimating timelines, and organizing your move.
            </p>
            <Link href="/onboarding">
              <Button size="lg" className="w-full">Create Your First Project</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Single project or specific project selected ──────────────────────────────
  const staffSyntheticMembership = isStaff && tenantIdParam
    ? { id: "", airtableId: "", tenantId: tenantIdParam, userId: userId, role: "TTTStaff" as const, createdAt: "" }
    : null;
  const selectedMembership = tenantIdParam
    ? (memberships.find(m => m.tenantId === tenantIdParam) ?? staffSyntheticMembership)
    : memberships.length === 1 ? memberships[0] : null;

  if (selectedMembership) {
    const membership = selectedMembership;
    const isStaffOnly = systemRole === "TTTStaff";
    const isOwnerOrCollab = membership.role === "Owner" || membership.role === "Collaborator";

    const [tenant, items, rooms, contracts, invoices, services] = await Promise.all([
      getTenantById(membership.tenantId).catch(() => null),
      getItemsForTenant(membership.tenantId).catch(() => []),
      getRoomsForTenant(membership.tenantId).catch(() => []),
      (isOwnerOrCollab || isStaffOnly) ? getContractsForTenant(membership.tenantId).catch(() => []) : Promise.resolve([]),
      isOwnerOrCollab ? getInvoicesForTenant(membership.tenantId).catch(() => []) : Promise.resolve([]),
      isOwnerOrCollab ? getServices().catch(() => []) : Promise.resolve([]),
    ]);

    if (!tenant) redirect("/onboarding");

    const canEdit = EDIT_ROLES.includes(membership.role);
    const isOwner = OWNER_ROLES.includes(membership.role);
    const totalSqFt = rooms.reduce((s, r) => s + r.squareFeet, 0);
    const itemsByStatus = items.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const recentItems = items.slice(0, 4);

    // Invoice balance due (sum of unpaid/partially-paid amounts)
    const invoiceAmountDue = invoices
      .filter((inv) => inv.status !== "Paid")
      .reduce((sum, inv) => sum + Math.max(0, inv.amount - (inv.paidAmount ?? 0)), 0);

    // Consignment running total — sold items routed to marketplace channels
    const CONSIGNMENT_ROUTES = ["FB/Marketplace", "Online Marketplace", "ProFoundFinds Consignment", "Other Consignment"];
    const soldConsignment = items.filter(
      (i) => CONSIGNMENT_ROUTES.includes(i.primaryRoute) && i.status === "Sold"
    );
    const consignmentPayout = soldConsignment.reduce(
      (sum, i) => sum + (i.consignorPayout ?? i.salePrice ?? i.valueMid),
      0
    );
    const pendingConsignment = items.filter(
      (i) => CONSIGNMENT_ROUTES.includes(i.primaryRoute) && i.status !== "Sold" && i.status !== "Discarded" && i.status !== "Donated"
    ).length;

    const fmtCurrency = (n: number) =>
      `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
      <div>
        {/* Back link for multi-project users */}
        {(memberships.length > 1 || isStaff) && (
          <Link href="/home" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All projects
          </Link>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
            <p className="text-gray-500 mt-0.5 capitalize">{membership.role}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isStaff && (
              <AddClientUserButton tenantId={tenant.id} projectName={tenant.name} />
            )}
            {isOwner && (
              <ProjectActions
                tenantId={tenant.id}
                tenantName={tenant.name}
                tenantAddress={tenant.address}
                tenantCity={tenant.city}
                tenantState={tenant.state}
                tenantZip={tenant.zip}
              />
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <Link href={`/catalog?tenantId=${tenant.id}`} className="block h-full">
            <Card hover className="h-full">
              <CardContent className="py-5">
                <p className="text-3xl font-bold text-gray-900">{items.length}</p>
                <p className="text-sm text-gray-500 mt-0.5">Items cataloged</p>
                <p className="text-xs text-forest-600 mt-2 font-medium">View catalog →</p>
              </CardContent>
            </Card>
          </Link>
          <Link href={`/rooms?tenantId=${tenant.id}`} className="block h-full">
            <Card hover className="h-full">
              <CardContent className="py-5">
                <p className="text-3xl font-bold text-gray-900">{rooms.length}</p>
                <p className="text-sm text-gray-500 mt-0.5">Rooms · {totalSqFt.toLocaleString()} SF</p>
                <p className="text-xs text-forest-600 mt-2 font-medium">View rooms →</p>
              </CardContent>
            </Card>
          </Link>
          <Link href={`/plan?tenantId=${tenant.id}`} className="col-span-2 sm:col-span-1 block h-full">
            <Card hover className="h-full">
              <CardContent className="py-5">
                <div className="w-8 h-8 bg-forest-50 rounded-lg flex items-center justify-center mb-2">
                  <svg className="w-4 h-4 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-900">Project Plan</p>
                <p className="text-xs text-gray-500 mt-0.5">View timeline and plans</p>
                <p className="text-xs text-forest-600 mt-2 font-medium">View plan →</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Free Estimator — for Non-TTT owners/collaborators */}
        {!(tenant.isTTT ?? true) && isOwnerOrCollab && (
          <div className="mb-8">
            <FreeEstimatorCard
              tenantId={tenant.id}
              rooms={rooms}
              services={services}
              currentEstimatedHours={tenant.estimatedHours}
              savedDestinationSqFt={tenant.destinationSqFt}
              estimatedServiceHours={tenant.estimatedServiceHours}
            />
          </div>
        )}

        {/* Financial snapshot — invoice balance + consignment */}
        {isOwnerOrCollab && (invoiceAmountDue > 0 || consignmentPayout > 0 || pendingConsignment > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {invoiceAmountDue > 0 && (
              <Link href={`/invoices?tenantId=${tenant.id}`}>
                <Card hover>
                  <CardContent className="py-5">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Balance Due</p>
                    <p className="text-2xl font-bold text-amber-600">{fmtCurrency(invoiceAmountDue)}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {invoices.filter((i) => i.status !== "Paid").length} unpaid invoice{invoices.filter((i) => i.status !== "Paid").length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-amber-600 mt-2 font-medium">View invoices →</p>
                  </CardContent>
                </Card>
              </Link>
            )}
            {(consignmentPayout > 0 || pendingConsignment > 0) && (
              <Card>
                <CardContent className="py-5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Consignment</p>
                  <p className="text-2xl font-bold text-forest-700">{fmtCurrency(consignmentPayout)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {soldConsignment.length} sold · {pendingConsignment} pending
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Status breakdown */}
        {items.length > 0 && (
          <div className="mb-8">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Item Status</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(itemsByStatus).map(([status, count]) => (
                <span key={status} className="text-sm bg-white border border-cream-200 rounded-xl px-3 py-1.5 text-gray-700">
                  <span className="font-semibold">{count}</span> {status}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent items */}
        {recentItems.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900">Recently Added</h2>
              <Link href={`/catalog?tenantId=${tenant.id}`} className="text-sm text-forest-600 hover:text-forest-700 font-medium">
                View all
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {recentItems.map(item => (
                <Card key={item.id}>
                  <CardContent className="p-3">
                    {item.photoUrl ? (
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 mb-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.photoUrl} alt={item.itemName} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-square rounded-lg bg-gray-100 mb-2 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <p className="text-xs font-medium text-gray-900 truncate">{item.itemName}</p>
                    <p className="text-[10px] text-gray-400 truncate">{item.category}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && canEdit && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center">
              <p className="text-gray-500 mb-4">No items cataloged yet. Start by photographing an item.</p>
              <Link href={`/catalog/new?tenantId=${tenant.id}`}>
                <Button>Add Your First Item</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Contract section — Owner/Collaborator view */}
        {isOwnerOrCollab && contracts.length > 0 && (
          <div className="mt-8">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Service Agreement</h2>
            <div className="space-y-4">
              {contracts.map((contract) => {
                const statusColors: Record<string, string> = {
                  Draft: "bg-yellow-100 text-yellow-800",
                  Sent: "bg-blue-100 text-blue-800",
                  Signed: "bg-green-100 text-green-800",
                };
                const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const phases = [
                  { label: "Rightsizing", hours: contract.rightsizingHours, rate: contract.rightsizingRate },
                  { label: "Packing", hours: contract.packingHours, rate: contract.packingRate },
                  { label: "Unpacking", hours: contract.unpackingHours, rate: contract.unpackingRate },
                ];
                return (
                  <Card key={contract.id}>
                    <CardContent className="py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusColors[contract.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {contract.status}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(contract.createdAt).toLocaleDateString()}</span>
                      </div>
                      <table className="w-full text-sm mb-3">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Phase</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Hours</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Rate</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {phases.map(({ label, hours, rate }) => (
                            <tr key={label} className="border-t border-gray-100">
                              <td className="px-3 py-2 text-gray-700">{label}</td>
                              <td className="px-3 py-2 text-right text-gray-900">{hours}</td>
                              <td className="px-3 py-2 text-right text-gray-500">{fmt(rate)}/hr</td>
                              <td className="px-3 py-2 text-right text-gray-900">{fmt(hours * rate)}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-forest-200 bg-forest-50">
                            <td className="px-3 py-2 font-bold text-forest-700" colSpan={3}>Total</td>
                            <td className="px-3 py-2 text-right font-bold text-forest-700">{fmt(contract.totalCost)}</td>
                          </tr>
                        </tbody>
                      </table>
                      {contract.status === "Signed" && contract.contractBody && (
                        <div className="mb-3">
                          <div className="max-h-64 overflow-y-auto text-xs text-gray-600 whitespace-pre-wrap leading-relaxed border border-gray-100 rounded-lg p-3 bg-gray-50"
                            style={{ fontFamily: "Georgia, serif" }}>
                            {contract.contractBody}
                          </div>
                        </div>
                      )}
                      {contract.status === "Signed" && (
                        <div className="border-t border-gray-100 pt-3">
                          <p className="text-xs text-gray-500 mb-2">Signed by <strong className="text-gray-700">{contract.signedByName}</strong></p>
                          {contract.signatureMethod === "draw" && contract.signatureData && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={contract.signatureData} alt="Signature" className="h-16 border border-gray-200 rounded-lg p-1 bg-white" />
                          )}
                          {contract.signatureMethod === "type" && contract.signatureData && (
                            <div style={{ fontFamily: "'Dancing Script', cursive", fontSize: "28px", color: "#1a1a1a" }}>
                              {contract.signatureData}
                            </div>
                          )}
                          {contract.signedAt && (
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(contract.signedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Hours section — TTTStaff only */}
        {isStaffOnly && contracts.length > 0 && (
          <div className="mt-8">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Estimated Hours</h2>
            <div className="space-y-3">
              {contracts.map((contract) => {
                const phases = [
                  { label: "Rightsizing", hours: contract.rightsizingHours },
                  { label: "Packing", hours: contract.packingHours },
                  { label: "Unpacking", hours: contract.unpackingHours },
                ];
                return (
                  <Card key={contract.id}>
                    <CardContent className="py-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Phase</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {phases.map(({ label, hours }) => (
                            <tr key={label} className="border-t border-gray-100">
                              <td className="px-3 py-2 text-gray-700">{label}</td>
                              <td className="px-3 py-2 text-right text-gray-900">{hours}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Multiple projects: show project cards ────────────────────────────────────
  const tenants = await Promise.all(
    memberships.map(async m => ({
      membership: m,
      tenant: await getTenantById(m.tenantId).catch(() => null),
    }))
  );
  const valid = tenants.filter(t => t.tenant !== null);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}</h1>
        <p className="text-gray-500 mt-1">Select a project to continue.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {valid.map(({ membership, tenant }) => {
          const cardIsOwner = OWNER_ROLES.includes(membership.role);
          return (
            <Card key={tenant!.id}>
              <CardContent>
                <Link href={`/rooms?tenantId=${tenant!.id}`} className="block group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 bg-forest-50 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                    </div>
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-forest-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-gray-900 group-hover:text-forest-700 transition-colors">{tenant!.name}</h3>
                  <p className="text-sm text-gray-400 mt-0.5 capitalize">{membership.role}</p>
                </Link>
                {cardIsOwner && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <ProjectActions
                    tenantId={tenant!.id}
                    tenantName={tenant!.name}
                    tenantAddress={tenant!.address}
                    tenantCity={tenant!.city}
                    tenantState={tenant!.state}
                    tenantZip={tenant!.zip}
                  />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Link href="/onboarding">
          <Card hover className="border-dashed border-gray-300 bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-500">New Project</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
