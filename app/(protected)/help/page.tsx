import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getMembershipsForUser } from "@/lib/airtable";
import { HelpClient } from "./HelpClient";

export default async function HelpPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [sysRole, memberships] = await Promise.all([
    getSystemRole(userId).catch(() => null),
    getMembershipsForUser(userId).catch(() => []),
  ]);

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const userEmail = clerkUser?.emailAddresses.find(
    e => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress ?? "";
  const userName = clerkUser
    ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || userEmail
    : "";

  const isAdmin = sysRole === "TTTAdmin";
  const isManager = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const isStaff = sysRole !== null && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole);
  const isSales = sysRole === "TTTSales";
  const isClient = !isStaff && !isSales;

  // Determine display role label for the ticket
  const userTypeLabel = isAdmin ? "TTT Admin"
    : isManager ? "TTT Manager"
    : sysRole === "TTTStaff" ? "TTT Staff"
    : isSales ? "TTT Sales"
    : memberships[0]?.role === "Owner" ? "Project Owner"
    : memberships[0]?.role === "Collaborator" ? "Collaborator"
    : "Client";

  return (
    <HelpClient
      userEmail={userEmail}
      userName={userName}
      userTypeLabel={userTypeLabel}
      isStaff={isStaff || isSales}
      isClient={isClient}
    />
  );
}
