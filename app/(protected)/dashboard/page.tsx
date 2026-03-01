import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMembershipsForUser, getTenantById, getItemsForTenant, getRoomsForTenant } from "@/lib/airtable";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ProjectActions } from "./ProjectActions";

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"];
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
  const memberships = await getMembershipsForUser(userId).catch(() => []);
  const firstName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "there";

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
  const selectedMembership = tenantIdParam
    ? memberships.find(m => m.tenantId === tenantIdParam)
    : memberships.length === 1 ? memberships[0] : null;

  if (selectedMembership) {
    const membership = selectedMembership;
    const [tenant, items, rooms] = await Promise.all([
      getTenantById(membership.tenantId).catch(() => null),
      getItemsForTenant(membership.tenantId).catch(() => []),
      getRoomsForTenant(membership.tenantId).catch(() => []),
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

    return (
      <div>
        {/* Back link for multi-project users */}
        {memberships.length > 1 && (
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
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
          {isOwner && (
            <ProjectActions tenantId={tenant.id} tenantName={tenant.name} />
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <Link href={`/catalog?tenantId=${tenant.id}`}>
            <Card hover>
              <CardContent className="py-5">
                <p className="text-3xl font-bold text-gray-900">{items.length}</p>
                <p className="text-sm text-gray-500 mt-0.5">Items cataloged</p>
                <p className="text-xs text-forest-600 mt-2 font-medium">View catalog →</p>
              </CardContent>
            </Card>
          </Link>
          <Link href={`/rooms?tenantId=${tenant.id}`}>
            <Card hover>
              <CardContent className="py-5">
                <p className="text-3xl font-bold text-gray-900">{rooms.length}</p>
                <p className="text-sm text-gray-500 mt-0.5">Rooms · {totalSqFt.toLocaleString()} SF</p>
                <p className="text-xs text-forest-600 mt-2 font-medium">View rooms →</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/calculator" className="col-span-2 sm:col-span-1">
            <Card hover>
              <CardContent className="py-5">
                <div className="w-8 h-8 bg-forest-50 rounded-lg flex items-center justify-center mb-2">
                  <svg className="w-4 h-4 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-900">Project Plan</p>
                <p className="text-xs text-gray-500 mt-0.5">Estimate timeline &amp; cost</p>
                <p className="text-xs text-forest-600 mt-2 font-medium">Open calculator →</p>
              </CardContent>
            </Card>
          </Link>
        </div>

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
        {valid.map(({ membership, tenant }) => (
          <Link key={tenant!.id} href={`/dashboard?tenantId=${tenant!.id}`} className="block">
            <Card hover>
              <CardContent>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="w-10 h-10 bg-forest-50 rounded-xl flex items-center justify-center mb-3">
                      <svg className="w-5 h-5 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-gray-900">{tenant!.name}</h3>
                    <p className="text-sm text-gray-400 mt-0.5 capitalize">{membership.role}</p>
                  </div>
                  <svg className="w-5 h-5 text-gray-300 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

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
