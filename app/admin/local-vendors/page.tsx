import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import {
  getLocalVendors,
  getItemsByPrimaryRoute,
  getTenantById,
  getMembershipsForTenant,
  getUserByClerkId,
  getTenants,
  getReferralCompanies,
  getAllPartnerCommunityCompletions,
} from "@/lib/airtable";
import { LocalVendorsAdmin } from "./LocalVendorsAdmin";

export default async function LocalVendorsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [vendors, consignmentItems, allTenants, referralCompanies, completions] = await Promise.all([
    getLocalVendors().catch(() => []),
    getItemsByPrimaryRoute("Other Consignment").catch(() => []),
    getTenants().catch(() => []),
    getReferralCompanies().catch(() => []),
    getAllPartnerCommunityCompletions().catch(() => []),
  ]);
  const seniorCommunities = referralCompanies.filter((c) => c.type === "Senior Living");

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
      projects={allTenants.map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city ?? "",
        state: t.state ?? "",
        isArchived: t.isArchived ?? false,
        isTTT: t.isTTT ?? true,
        destinationCommunity: t.destinationCommunity,
        destinationCommunityOther: t.destinationCommunityOther,
        seniorCommunityName: t.seniorCommunityName,
        createdAt: t.createdAt,
        archivedAt: t.archivedAt,
      }))}
      seniorCommunities={seniorCommunities.map((c) => ({ id: c.id, name: c.name, city: c.city }))}
      completions={completions}
    />
  );
}
