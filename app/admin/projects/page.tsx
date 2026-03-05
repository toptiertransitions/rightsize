import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenants, getAllMemberships } from "@/lib/airtable";
import { CopyId } from "../CopyId";
import { isTTTAdmin } from "@/lib/config";
import { AdminHeader } from "../components/AdminHeader";

export default async function AdminProjectsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [tenants, memberships] = await Promise.all([
    getTenants().catch(() => []),
    getAllMemberships().catch(() => []),
  ]);

  const memberCountByTenant = new Map<string, number>();
  for (const m of memberships) {
    memberCountByTenant.set(m.tenantId, (memberCountByTenant.get(m.tenantId) ?? 0) + 1);
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="projects" />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">All Projects</h1>
          <p className="text-gray-400 mt-1">
            {tenants.length} project{tenants.length !== 1 ? "s" : ""} in the system.
            Click any project to enter as TTT Staff.
          </p>
        </div>

        {tenants.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p>No projects yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenants.map((tenant) => (
              <Link
                key={tenant.id}
                href={`/admin/impersonate?tenantId=${tenant.id}`}
                className="group block"
              >
                <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 hover:border-forest-500 hover:bg-gray-750 transition-all duration-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full capitalize">
                      {tenant.plan}
                    </span>
                  </div>
                  <h3 className="font-bold text-white group-hover:text-forest-400 transition-colors">
                    {tenant.name}
                  </h3>
                  <div className="mt-0.5"><CopyId id={tenant.id} /></div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {memberCountByTenant.get(tenant.id) ?? 0} member{(memberCountByTenant.get(tenant.id) ?? 0) !== 1 ? "s" : ""} ·{" "}
                      {new Date(tenant.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                    <span className="text-xs text-forest-400 group-hover:text-forest-300 font-medium flex items-center gap-1">
                      Enter as Staff
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
