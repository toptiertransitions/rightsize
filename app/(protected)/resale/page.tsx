import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  getSystemRole,
  getTenants,
  getStaffMembers,
  getPlanEntriesForDateRange,
  getItemsByPrimaryRoute,
  getLocalVendors,
  getSignedTenantIds,
} from "@/lib/airtable";
import { ResaleClient } from "./ResaleClient";
import type { Tenant, StaffMember, Item, LocalVendor, PlanEntry } from "@/lib/types";

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ResalePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTAdmin", "TTTManager", "TTTStaff", "TTTSales"].includes(sysRole ?? "")) {
    redirect("/home");
  }

  const today = new Date();
  const from = toISO(new Date(today.getFullYear(), today.getMonth() - 3, 1));
  const to = toISO(new Date(today.getFullYear(), today.getMonth() + 7, 0));

  const [allTenantsRaw, staffMembers, planEntries, pfItems, localVendors, signedIds] = await Promise.all([
    getTenants().catch(() => [] as Tenant[]),
    getStaffMembers().catch(() => [] as StaffMember[]),
    getPlanEntriesForDateRange(from, to).catch(() => [] as PlanEntry[]),
    getItemsByPrimaryRoute("ProFoundFinds Consignment").catch(() => [] as Item[]),
    getLocalVendors().catch(() => [] as LocalVendor[]),
    getSignedTenantIds().catch(() => new Set<string>()),
  ]);

  // Mirror home page: compute isContractSigned from signed contract IDs
  const allTenants = allTenantsRaw.map(t => ({ ...t, isContractSigned: signedIds.has(t.id) }));

  const staffMap = new Map(staffMembers.map(s => [s.clerkUserId, s]));
  const activeTenants = allTenants.filter(t => !t.isArchived && !t.isLostDeal);
  const activeTenantIdSet = new Set(activeTenants.map(t => t.id));

  // Exclude "Not Signed Yet" (not consignment + not signed). Include Active + Post-Move.
  const activeProjectsList = activeTenants
    .filter(t => t.isConsignmentOnly || t.isContractSigned)
    .map(t => {
      const lead = t.teamLeadClerkId ? staffMap.get(t.teamLeadClerkId) : undefined;
      return {
        id: t.id,
        name: t.name,
        address: [t.city, t.state].filter(Boolean).join(", "),
        status: (t.isConsignmentOnly ? "Post-Move" : "Active") as "Active" | "Post-Move",
        teamLeadName: lead?.displayName,
        teamLeadPhone: lead?.phone,
        teamLeadEmail: lead?.email,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const tenantInfoMap: Record<string, {
    name: string;
    priceDrop1Days: number;
    priceDrop1Percent: number;
    priceDrop2Days: number;
    priceDrop2Percent: number;
  }> = {};
  for (const t of allTenants) {
    tenantInfoMap[t.id] = {
      name: t.name,
      priceDrop1Days: t.priceDrop1Days ?? 30,
      priceDrop1Percent: t.priceDrop1Percent ?? 33,
      priceDrop2Days: t.priceDrop2Days ?? 60,
      priceDrop2Percent: t.priceDrop2Percent ?? 66,
    };
  }

  // All plan entries for active tenants (both focus shifts and key dates)
  const allPlanEntries = planEntries.filter(e => activeTenantIdSet.has(e.tenantId));

  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <ResaleClient
        activeProjectsList={activeProjectsList}
        tenantInfoMap={tenantInfoMap}
        planEntries={allPlanEntries}
        pfItems={pfItems}
        localVendors={localVendors}
        staffMembers={staffMembers}
      />
    </Suspense>
  );
}
