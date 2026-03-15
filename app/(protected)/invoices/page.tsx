import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getUserRoleForTenant,
  getTenantById,
  getInvoicesForTenant,
  getContractsForTenant,
  getServices,
  getInvoiceSettings,
  getTimeEntries,
  getTenants,
} from "@/lib/airtable";
import { InvoicesClient } from "./InvoicesClient";
import { QuotingProjectPicker } from "../quoting/QuotingProjectPicker";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId } = await searchParams;

  const [sysRole, tenantRole] = await Promise.all([
    getSystemRole(userId).catch(() => null),
    tenantId ? getUserRoleForTenant(userId, tenantId).catch(() => null) : Promise.resolve(null),
  ]);

  const isTTTInternal = ["TTTAdmin", "TTTManager", "TTTSales", "TTTStaff"].includes(sysRole ?? "");

  if (!tenantId) {
    if (isTTTInternal) {
      const allTenants = await getTenants().catch(() => []);
      const active = allTenants.filter(t => !t.isArchived).sort((a, b) => a.name.localeCompare(b.name));
      return (
        <QuotingProjectPicker
          tenants={active}
          basePath="/invoices"
          title="Invoices"
          description="Select a client project to view or create invoices."
        />
      );
    }
    redirect("/home");
  }

  const isTTTStaff = sysRole === "TTTAdmin" || sysRole === "TTTManager" || sysRole === "TTTStaff" || sysRole === "TTTSales";

  // Allow TTT staff (who may not have a membership row in every project) or tenant members
  if (!isTTTStaff && !tenantRole) redirect("/home");

  const isManager = sysRole === "TTTAdmin" || sysRole === "TTTManager" || sysRole === "TTTSales" ||
    tenantRole === "TTTAdmin" || tenantRole === "TTTManager";

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
