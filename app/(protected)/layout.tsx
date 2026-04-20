export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSystemRole, getMembershipsForUser, getTenantById } from "@/lib/airtable";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId).catch(() => null);
  const isAdmin = sysRole === "TTTAdmin";
  const isSales = sysRole === "TTTSales";
  const isManager = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const isStaff = ["TTTStaff", "TTTManager", "TTTSales", "TTTAdmin"].includes(sysRole ?? "");

  // For non-staff users, build a tenantId→isTTT map server-side so the Header
  // can show/hide the Invoices link without a client-side fetch (avoids timing bugs).
  let tttTenantIds: string[] | undefined;
  if (!isStaff) {
    const memberships = await getMembershipsForUser(userId).catch(() => []);
    if (memberships.length > 0) {
      const tenants = await Promise.all(
        memberships.map(m => getTenantById(m.tenantId).catch(() => null))
      );
      tttTenantIds = tenants
        .filter(t => t && t.isTTT === true)
        .map(t => t!.id);
    }
  }

  return (
    <div className="min-h-screen bg-cream-50">
      <Header isManager={isManager} isStaff={isStaff} isAdmin={isAdmin} isSales={isSales} tttTenantIds={tttTenantIds} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
