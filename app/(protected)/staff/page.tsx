import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getStaffMembers, getCrateLocations, getInventoryContainers, getTenants, getSubcontractors } from "@/lib/airtable";
import { StaffClient } from "./StaffClient";

export default async function StaffPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const role = await getSystemRole(userId);
  if (role !== "TTTManager" && role !== "TTTAdmin") redirect("/home");

  const [members, crateLocations, inventoryContainers, allTenants, subcontractors] = await Promise.all([
    getStaffMembers().catch(() => []),
    getCrateLocations().catch(() => []),
    getInventoryContainers().catch(() => []),
    getTenants().catch(() => []),
    getSubcontractors().catch(() => []),
  ]);

  const active = members.filter((m) => m.isActive && m.role !== "TTTSales");

  // Enrich with Clerk profile images
  try {
    const clerk = await clerkClient();
    const clerkUserIds = active.map((m) => m.clerkUserId).filter(Boolean);
    if (clerkUserIds.length > 0) {
      const { data: clerkUsers } = await clerk.users.getUserList({ userId: clerkUserIds, limit: 100 });
      const imageMap = new Map(clerkUsers.map((u) => [u.id, u.imageUrl]));
      active.forEach((m) => { m.profileImageUrl = imageMap.get(m.clerkUserId) || undefined; });
    }
  } catch { /* non-fatal — fall back to initials */ }
  const activeTenants = allTenants
    .filter((t) => !t.isArchived)
    .filter((t) => role === "TTTAdmin" || (t.isTTT ?? true))
    .map((t) => ({ id: t.id, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <StaffClient
      members={active}
      crateLocations={crateLocations}
      inventoryContainers={inventoryContainers}
      tenants={activeTenants}
      subcontractors={subcontractors}
    />
  );
}
