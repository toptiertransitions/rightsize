import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMembershipsForUser, getTenantById } from "@/lib/airtable";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const memberships = await getMembershipsForUser(userId).catch(() => []);

  // Get tenant details for each membership
  const tenants = await Promise.all(
    memberships.map(async (m) => {
      const tenant = await getTenantById(m.tenantId).catch(() => null);
      return { membership: m, tenant };
    })
  );

  const validTenants = tenants.filter((t) => t.tenant !== null);
  const firstName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "there";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {firstName} 👋
        </h1>
        <p className="text-gray-500 mt-1">
          Manage your downsizing projects from here.
        </p>
      </div>

      {validTenants.length === 0 ? (
        /* Onboarding state */
        <Card className="max-w-lg">
          <CardContent className="text-center py-12">
            <div className="w-16 h-16 bg-forest-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Set up your first project
            </h2>
            <p className="text-gray-500 mb-6 leading-relaxed">
              Create a project to start cataloging items, estimating timelines, and organizing your move.
            </p>
            <Link href="/onboarding">
              <Button size="lg" className="w-full">
                Create Your First Project
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        /* Tenant list */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {validTenants.map(({ membership, tenant }) => (
            <Link
              key={tenant!.id}
              href={`/rooms?tenantId=${tenant!.id}`}
              className="block"
            >
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

          {/* New project card */}
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
      )}
    </div>
  );
}
