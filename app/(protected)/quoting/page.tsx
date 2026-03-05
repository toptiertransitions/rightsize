import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getTenantById,
  getRoomsForTenant,
  getMembershipsForTenant,
  getContractSettings,
  getContractTemplates,
  getContractsForTenant,
  getServices,
} from "@/lib/airtable";
import { QuotingClient } from "./QuotingClient";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function QuotingPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin") redirect("/home");

  const { tenantId } = await searchParams;
  if (!tenantId) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Quoting</h1>
        <p className="text-gray-500 text-sm">
          Navigate to a project first — the Quoting tab will load that project&apos;s data automatically.
        </p>
      </div>
    );
  }

  const [tenant, rooms, contractSettings, contractTemplates, existingContracts, memberships, services] =
    await Promise.all([
      getTenantById(tenantId).catch(() => null),
      getRoomsForTenant(tenantId).catch(() => []),
      getContractSettings().catch(() => null),
      getContractTemplates(true).catch(() => []),
      getContractsForTenant(tenantId).catch(() => []),
      getMembershipsForTenant(tenantId).catch(() => []),
      getServices().catch(() => []),
    ]);

  if (!tenant) redirect("/home");

  // Resolve member emails for contract sending
  let recipients: { name: string; email: string; role: string }[] = [];
  if (memberships.length > 0) {
    const clerk = await clerkClient();
    const results = await Promise.all(
      memberships.map(async (m) => {
        const u = await clerk.users.getUser(m.userId).catch(() => null);
        const email = u?.emailAddresses?.[0]?.emailAddress ?? "";
        const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || email;
        return email ? { name, email, role: m.role } : null;
      })
    );
    recipients = results.filter(Boolean) as { name: string; email: string; role: string }[];
  }

  return (
    <QuotingClient
      key={tenantId}
      tenant={tenant}
      rooms={rooms}
      settings={contractSettings}
      templates={contractTemplates}
      existingContracts={existingContracts}
      recipients={recipients}
      services={services}
    />
  );
}
