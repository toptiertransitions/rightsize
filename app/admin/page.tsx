export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getTenants, getAllMemberships, getStaffMembers, getSystemRole } from "@/lib/airtable";
import { StaffClient } from "./StaffClient";
import { RoleBreakdown } from "./RoleBreakdown";
import { AdminHeader } from "./components/AdminHeader";
import { AdminProjectsClient } from "./AdminProjectsClient";
import { CompanyEmailButton } from "./CompanyEmailButton";

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const systemRole = await getSystemRole(userId);
  const isAdmin = systemRole === "TTTAdmin";
  if (!isAdmin) redirect("/home");

  const [tenants, memberships, staffMembers] = await Promise.all([
    getTenants().catch(() => []),
    getAllMemberships().catch(() => []),
    getStaffMembers().catch(() => []),
  ]);

  const memberCountByTenant: Record<string, number> = {};
  for (const m of memberships) {
    memberCountByTenant[m.tenantId] = (memberCountByTenant[m.tenantId] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="projects" />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">All Projects</h1>
            <p className="text-gray-400 mt-1">
              {tenants.filter(t => !t.isArchived).length} active · {tenants.filter(t => t.isArchived).length} archived
            </p>
          </div>
          <CompanyEmailButton />
        </div>

        <AdminProjectsClient tenants={tenants} memberCountByTenant={memberCountByTenant} isAdmin={isAdmin} />

        {/* Staff Management — TTTAdmin only */}
        <section className="mt-10">
          <h2 className="text-base font-semibold text-white mb-4">Staff Management</h2>
          <StaffClient initialStaff={staffMembers} />
          <RoleBreakdown />
        </section>
      </main>
    </div>
  );
}
