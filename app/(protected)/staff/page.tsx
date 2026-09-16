import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getStaffMembers, getCrateLocations, getInventoryContainers, getTenants, getSubcontractors, getStorageUnits } from "@/lib/airtable";
import { getSuspendedOrDeletedClerkUserIds } from "@/lib/staff-visibility";
import { StaffClient } from "./StaffClient";

export default async function StaffPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const role = await getSystemRole(userId);
  if (role !== "TTTSales" && role !== "TTTManager" && role !== "TTTAdmin") redirect("/home");

  const [members, crateLocations, inventoryContainers, allTenants, subcontractors, storageUnits] = await Promise.all([
    getStaffMembers().catch(() => []),
    getCrateLocations().catch(() => []),
    getInventoryContainers().catch(() => []),
    getTenants().catch(() => []),
    getSubcontractors().catch(() => []),
    getStorageUnits().catch(() => []),
  ]);

  // Hide staff whose Clerk account is suspended or deleted — Airtable's
  // IsActive flag doesn't track this, so it's checked separately.
  const allActiveRaw = members.filter((m) => m.isActive); // includes TTTSales for location map
  const excludedIds = await getSuspendedOrDeletedClerkUserIds(allActiveRaw.map((m) => m.clerkUserId));
  const allActive = allActiveRaw.filter((m) => !excludedIds.has(m.clerkUserId));
  const active = allActive.filter((m) => m.role !== "TTTSales");

  // Enrich both lists with Clerk profile images
  try {
    const clerk = await clerkClient();
    const clerkUserIds = allActive.map((m) => m.clerkUserId).filter(Boolean);
    if (clerkUserIds.length > 0) {
      const { data: clerkUsers } = await clerk.users.getUserList({ userId: clerkUserIds, limit: 100 });
      const imageMap = new Map(clerkUsers.map((u) => [u.id, u.imageUrl]));
      allActive.forEach((m) => { m.profileImageUrl = imageMap.get(m.clerkUserId) || undefined; });
    }
  } catch { /* non-fatal — fall back to initials */ }
  const activeTenants = allTenants
    .filter((t) => !t.isArchived)
    .filter((t) => role === "TTTAdmin" || (t.isTTT ?? true))
    .map((t) => ({ id: t.id, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const canEdit = role === "TTTManager" || role === "TTTAdmin";
  // Communication Hub Open Issues tab — same access as Manager/Admin,
  // plus TTTSales (confirmed explicitly; separate from canEdit so Sales
  // doesn't also pick up crate/inventory/staff-editing rights).
  const canAccessOpenIssues = canEdit || role === "TTTSales";

  return (
    <StaffClient
      members={active}
      locationMembers={allActive}
      crateLocations={crateLocations}
      inventoryContainers={inventoryContainers}
      storageUnits={storageUnits}
      tenants={activeTenants}
      subcontractors={subcontractors}
      canEdit={canEdit}
      canAccessOpenIssues={canAccessOpenIssues}
    />
  );
}
