export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getSubcontractors, getTenants } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { OpsClient } from "./OpsClient";

const ALLOWED_ROLES = ["TTTManager", "TTTAdmin"];

export default async function OpsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) redirect("/home");

  const [subcontractors, allTenants] = await Promise.all([
    getSubcontractors().catch(() => []),
    getTenants().catch(() => []),
  ]);

  const tenants = allTenants.filter((t) => !t.isArchived);

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="ops" />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Ops</h1>
          <p className="text-gray-400 text-sm mt-1">Operations management for TTT Managers and Admins.</p>
        </div>
        <OpsClient initialSubcontractors={subcontractors} tenants={tenants} />
      </main>
    </div>
  );
}
