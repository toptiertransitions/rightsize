import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getExpensesForUser, getTenants, getStaffMember } from "@/lib/airtable";
import { ExpensesClient } from "./ExpensesClient";

const ALLOWED_ROLES = ["TTTStaff", "TTTManager", "TTTSales", "TTTAdmin"];

export default async function ExpensesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) redirect("/home");

  // currentUser() makes a live Clerk API call that can intermittently fail.
  // Fall back to the StaffMembers Airtable record if it does.
  let staffName = "Unknown";
  try {
    const user = await currentUser();
    staffName =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ||
      "";
  } catch { /* ignore */ }
  if (!staffName) {
    const staff = await getStaffMember(userId).catch(() => null);
    staffName = staff?.displayName || "Unknown";
  }

  const isManagerOrAdmin = sysRole === "TTTManager" || sysRole === "TTTAdmin";

  const [expenses, allTenants] = await Promise.all([
    getExpensesForUser(userId).catch(() => []),
    getTenants().catch(() => []),
  ]);

  const activeTenants = allTenants.filter(t => !t.isArchived);

  return (
    <ExpensesClient
      initialExpenses={expenses}
      staffName={staffName}
      tenants={activeTenants}
      isManagerOrAdmin={isManagerOrAdmin}
      sysRole={sysRole}
    />
  );
}
