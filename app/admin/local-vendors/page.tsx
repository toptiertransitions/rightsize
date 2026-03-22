import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import {
  getLocalVendors,
  getItemsByPrimaryRoute,
  getTenantById,
  getMembershipsForTenant,
  getUserByClerkId,
} from "@/lib/airtable";
import { LocalVendorsAdmin } from "./LocalVendorsAdmin";

export default async function LocalVendorsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [vendors, consignmentItems] = await Promise.all([
    getLocalVendors().catch(() => []),
    getItemsByPrimaryRoute("Other Consignment").catch(() => []),
  ]);

  // Resolve tenant name + owner email for each unique tenant
  const uniqueTenantIds = [...new Set(consignmentItems.map(i => i.tenantId).filter(Boolean))];
  const tenantInfoMap: Record<string, { name: string; ownerEmail: string; isTTT: boolean }> = {};

  await Promise.all(
    uniqueTenantIds.map(async (tenantId) => {
      try {
        const tenant = await getTenantById(tenantId).catch(() => null);
        if (!tenant) return;
        let ownerEmail = "";
        try {
          const memberships = await getMembershipsForTenant(tenantId).catch(() => []);
          const ownerMembers = memberships.filter(m => m.role === "Owner");
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
    <LocalVendorsAdmin
      vendors={vendors}
      consignmentItems={consignmentItems}
      tenantInfoMap={tenantInfoMap}
    />
  );
}
