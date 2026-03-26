export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getEstates, getTenants } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { EstatesClient } from "./EstatesClient";

export default async function AdminEstatesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") redirect("/home");

  const [estates, tenants] = await Promise.all([
    getEstates().catch(() => []),
    getTenants().catch(() => []),
  ]);

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="estates" />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <EstatesClient estates={estates} tenants={tenants} />
      </main>
    </div>
  );
}
