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
  getOpportunitiesForTenant,
  getClientContactById,
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
      const allTenants = (await getTenants().catch(() => []))
        .filter(t => sysRole === "TTTAdmin" || (t.isTTT ?? true));
      const sorted = [...allTenants].sort((a, b) => a.name.localeCompare(b.name));
      return (
        <QuotingProjectPicker
          tenants={sorted}
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

  // NonTTT client users have no business on the Invoices page
  if (!isTTTStaff && !(tenant.isTTT ?? true)) redirect("/home");

  // agreements: Sent (pending signature) + Signed — visible to all project members
  const agreements = allContracts.filter(
    (c) => c.status === "Sent" || c.status === "Signed"
  );
  // contracts: Signed only — used by manager invoice creation modal
  const contracts = allContracts.filter((c) => c.status === "Signed");

  // Build recipient options from the CRM opportunity linked to this project
  const recipientOptions: { label: string; email: string }[] = [];
  try {
    const opportunities = await getOpportunitiesForTenant(tenantId);
    const seen = new Set<string>();
    // Batch-fetch all primary contacts in parallel (avoids N+1 sequential Airtable calls)
    const contactIds = opportunities.map(o => o.clientContactId).filter((id): id is string => !!id);
    const contacts = await Promise.all(contactIds.map(id => getClientContactById(id).catch(() => null)));
    const contactMap = new Map(contacts.filter(Boolean).map(c => [c!.id, c!]));
    for (const opp of opportunities) {
      // Primary contact
      if (opp.clientContactId) {
        const contact = contactMap.get(opp.clientContactId);
        if (contact?.email && !seen.has(contact.email)) {
          seen.add(contact.email);
          recipientOptions.push({ label: `${contact.name} (Contact)`, email: contact.email });
        }
      }
      // Key people with emails
      for (const kp of opp.keyPeople ?? []) {
        if (kp.email && !seen.has(kp.email)) {
          seen.add(kp.email);
          recipientOptions.push({ label: `${kp.name}${kp.relationship ? ` (${kp.relationship})` : ""}`, email: kp.email });
        }
      }
    }
  } catch { /* ignore — fall back to owner email */ }

  // Get current user email (for CC default)
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
      recipientOptions={recipientOptions}
      currentUserEmail={currentUserEmail}
    />
  );
}
