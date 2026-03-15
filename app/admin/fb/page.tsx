import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { getItemsByPrimaryRoute, getTenantById, getMembershipsForTenant, getUserByClerkId, getStaffMembers, getInvoiceSettings } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { FBInventoryClient } from "./FBInventoryClient";
import { PaymentHandlesPanel } from "./PaymentHandlesPanel";

export default async function FBPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [items, staffMembers, paymentSettings] = await Promise.all([
    getItemsByPrimaryRoute("FB/Marketplace").catch(() => []),
    getStaffMembers().catch(() => []),
    getInvoiceSettings().catch(() => null),
  ]);

  // Get unique tenant IDs and resolve tenant name + client email
  const uniqueTenantIds = [...new Set(items.map((i) => i.tenantId).filter(Boolean))];

  const tenantInfoMap: Record<string, { name: string; ownerEmail: string }> = {};

  await Promise.all(
    uniqueTenantIds.map(async (tenantId) => {
      try {
        const tenant = await getTenantById(tenantId).catch(() => null);
        if (!tenant) return;

        let ownerEmail = "";
        try {
          const memberships = await getMembershipsForTenant(tenantId).catch(() => []);
          const ownerMembers = memberships.filter((m) => m.role === "Owner");
          for (const m of ownerMembers) {
            if (isTTTAdmin(m.userId)) continue;
            const user = await getUserByClerkId(m.userId).catch(() => null);
            if (user?.email) { ownerEmail = user.email; break; }
          }
        } catch { /* ignore */ }

        tenantInfoMap[tenantId] = { name: tenant.name, ownerEmail };
      } catch { /* ignore */ }
    })
  );

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="fb" />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">FB Marketplace</h1>
          <p className="text-gray-400 text-sm mt-1">
            All client items routed to FB/Marketplace. Edit inline — changes sync back to the item catalog and sales page.
          </p>
        </div>
        <PaymentHandlesPanel initialSettings={paymentSettings} />
        <FBInventoryClient
          items={items}
          tenantInfoMap={tenantInfoMap}
          staffMembers={staffMembers.filter(s => s.isActive).map(s => ({ id: s.clerkUserId, name: s.displayName }))}
        />
      </main>
    </div>
  );
}
