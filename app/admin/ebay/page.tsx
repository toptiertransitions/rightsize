import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { getItemsByPrimaryRoute, getTenantById, getMembershipsForTenant, getUserByClerkId, getStaffMembers } from "@/lib/airtable";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { EbayInventoryClient } from "./EbayInventoryClient";

export default async function EbayPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [items, staffMembers] = await Promise.all([
    getItemsByPrimaryRoute("Online Marketplace").catch(() => []),
    getStaffMembers().catch(() => []),
  ]);

  // Get unique tenant IDs and resolve tenant name + client email
  const uniqueTenantIds = [...new Set(items.map((i) => i.tenantId).filter(Boolean))];

  const tenantInfoMap: Record<string, { name: string; ownerEmail: string; isTTT: boolean }> = {};

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

        tenantInfoMap[tenantId] = { name: tenant.name, ownerEmail, isTTT: tenant.isTTT ?? true };
      } catch { /* ignore */ }
    })
  );

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="ebay" />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">eBay</h1>
          <p className="text-gray-400 text-sm mt-1">
            All client items routed to Online Marketplace. Edit inline — changes sync back to the item catalog and sales page.
          </p>
        </div>
        <EbayInventoryClient
          items={items}
          tenantInfoMap={tenantInfoMap}
          staffMembers={staffMembers.filter(s => s.isActive).map(s => ({ id: s.clerkUserId, name: s.displayName }))}
        />
      </main>
    </div>
  );
}
