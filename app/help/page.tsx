import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSystemRole, getMembershipsForUser } from "@/lib/airtable";
import { HelpClient } from "./HelpClient";

// Standalone page — intentionally outside the (protected) layout's Header,
// so it renders with no top/bottom nav. Reached only via the user menu
// ("Get Help", under Manage Account). Still auth-gated: not in middleware's
// public route list, so Clerk protects it the same as everything else.
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
  const isStaff = sysRole !== null && ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"].includes(sysRole);
  const isSales = sysRole === "TTTSales";
  const isClient = !isStaff && !isSales;

  // Determine display role label for the ticket
  const userTypeLabel = isAdmin ? "TTT Admin"
    : isManager ? "TTT Manager"
    : sysRole === "TTTTeamLead" ? "TTT Team Lead"
    : sysRole === "TTTStaff" ? "TTT Staff"
    : isSales ? "TTT Sales"
    : memberships[0]?.role === "Owner" ? "Project Owner"
    : memberships[0]?.role === "Collaborator" ? "Collaborator"
    : "Client";

  return (
    <div className="min-h-screen bg-cream-50" style={{ paddingTop: "max(20px, env(safe-area-inset-top))", paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700 mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Rightsize
        </Link>
        <HelpClient
          userEmail={userEmail}
          userName={userName}
          userTypeLabel={userTypeLabel}
          isStaff={isStaff || isSales}
          isClient={isClient}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}
