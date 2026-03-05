import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import {
  getUserRoleForTenant,
  getTenantById,
  getInvoicesForTenant,
  getContractsForTenant,
  getServices,
  getInvoiceSettings,
  getTimeEntries,
} from "@/lib/airtable";
import { InvoicesClient } from "./InvoicesClient";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;
  if (!tenantId) redirect("/home");

  const role = await getUserRoleForTenant(userId, tenantId).catch(() => null);
  if (!role) redirect("/home");

  const isManager = role === "TTTManager" || role === "TTTAdmin";

  const [tenant, invoices, services, invoiceSettings, allContracts, timeEntries] =
    await Promise.all([
      getTenantById(tenantId).catch(() => null),
      getInvoicesForTenant(tenantId).catch(() => []),
      getServices().catch(() => []),
      getInvoiceSettings().catch(() => null),
      getContractsForTenant(tenantId).catch(() => []),
      isManager ? getTimeEntries({ tenantId }).catch(() => []) : Promise.resolve([]),
    ]);

  if (!tenant) redirect("/home");

  // agreements: Sent (pending signature) + Signed — visible to all project members
  const agreements = allContracts.filter(
    (c) => c.status === "Sent" || c.status === "Signed"
  );
  // contracts: Signed only — used by manager invoice creation modal
  const contracts = allContracts.filter((c) => c.status === "Signed");

  // Get owner email
  let ownerEmail = "";
  try {
    const clerk = await clerkClient();
    const ownerUser = await clerk.users.getUser(tenant.ownerUserId).catch(() => null);
    ownerEmail = ownerUser?.emailAddresses?.[0]?.emailAddress ?? "";
  } catch { /* ignore */ }

  // Get current user email
  let currentUserEmail = "";
  try {
    const clerk = await clerkClient();
    const currentUser = await clerk.users.getUser(userId).catch(() => null);
    currentUserEmail = currentUser?.emailAddresses?.[0]?.emailAddress ?? "";
  } catch { /* ignore */ }

  return (
    <InvoicesClient
      tenant={tenant}
      initialInvoices={invoices}
      isManager={isManager}
      services={services}
      invoiceSettings={invoiceSettings}
      contracts={contracts}
      agreements={agreements}
      timeEntries={timeEntries}
      ownerEmail={ownerEmail}
      currentUserEmail={currentUserEmail}
    />
  );
}
