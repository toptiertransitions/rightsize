import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getTenantById,
  getTenants,
  getRoomsForTenant,
  getMembershipsForTenant,
  getContractSettings,
  getContractTemplates,
  getContractsForTenant,
  getServices,
  getInvoiceSettings,
  getTimeEntries,
  getOpportunitiesForTenant,
  getClientContacts,
  getInvoicesForTenant,
} from "@/lib/airtable";
import { QuotingClient } from "./QuotingClient";
import { QuotingProjectPicker } from "./QuotingProjectPicker";

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function QuotingPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) redirect("/home");

  const { tenantId } = await searchParams;
  if (!tenantId) {
    const allTenants = await getTenants().catch(() => []);
    const active = allTenants.filter(t => !t.isArchived).sort((a, b) => a.name.localeCompare(b.name));
    return <QuotingProjectPicker tenants={active} />;
  }

  const [tenant, rooms, contractSettings, contractTemplates, existingContracts, memberships, services, invoiceSettings, timeEntries, opportunities, clientContacts, invoices] =
    await Promise.all([
      getTenantById(tenantId).catch(() => null),
      getRoomsForTenant(tenantId).catch(() => []),
      getContractSettings().catch(() => null),
      getContractTemplates(true).catch(() => []),
      getContractsForTenant(tenantId).catch(() => []),
      getMembershipsForTenant(tenantId).catch(() => []),
      getServices().catch(() => []),
      getInvoiceSettings().catch(() => null),
      getTimeEntries({ tenantId }).catch(() => []),
      getOpportunitiesForTenant(tenantId).catch(() => []),
      getClientContacts().catch(() => []),
      getInvoicesForTenant(tenantId).catch(() => []),
    ]);

  if (!tenant) redirect("/home");

  // Resolve member emails for contract sending + get owner/current-user emails
  let recipients: { name: string; email: string; role: string }[] = [];
  let ownerEmail = "";
  let currentUserEmail = "";
  if (memberships.length > 0) {
    const clerk = await clerkClient();
    const results = await Promise.all(
      memberships.map(async (m) => {
        const u = await clerk.users.getUser(m.userId).catch(() => null);
        const email = u?.emailAddresses?.[0]?.emailAddress ?? "";
        const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || email;
        if (u?.id === tenant.ownerUserId) ownerEmail = email;
        if (u?.id === userId) currentUserEmail = email;
        return email ? { name, email, role: m.role } : null;
      })
    );
    recipients = results.filter(Boolean) as { name: string; email: string; role: string }[];
  }
  // If not found via memberships, look up directly
  if (!ownerEmail || !currentUserEmail) {
    try {
      const clerk = await clerkClient();
      if (!ownerEmail) {
        const ownerUser = await clerk.users.getUser(tenant.ownerUserId).catch(() => null);
        ownerEmail = ownerUser?.emailAddresses?.[0]?.emailAddress ?? "";
      }
      if (!currentUserEmail) {
        const currentUser = await clerk.users.getUser(userId).catch(() => null);
        currentUserEmail = currentUser?.emailAddresses?.[0]?.emailAddress ?? "";
      }
    } catch { /* ignore */ }
  }

  const signedContracts = existingContracts.filter((c) => c.status === "Signed");

  // Prepend opportunity contact + key people emails to the recipient list
  const contactMap = new Map(clientContacts.map((c) => [c.id, c]));
  const opportunityRecipients: { name: string; email: string; role: string }[] = [];
  for (const opp of opportunities) {
    const contact = contactMap.get(opp.clientContactId);
    if (contact?.email && !opportunityRecipients.find((r) => r.email === contact.email)) {
      opportunityRecipients.push({ name: contact.name, email: contact.email, role: "Contact" });
    }
    for (const kp of opp.keyPeople) {
      if (kp.email && !opportunityRecipients.find((r) => r.email === kp.email)) {
        opportunityRecipients.push({ name: kp.name, email: kp.email, role: kp.relationship || "Key Person" });
      }
    }
  }
  // Deduplicate against membership recipients, then prepend
  const memberEmails = new Set(recipients.map((r) => r.email));
  const uniqueOpportunityRecipients = opportunityRecipients.filter((r) => !memberEmails.has(r.email));
  const allRecipients = [...uniqueOpportunityRecipients, ...recipients];

  return (
    <QuotingClient
      key={tenantId}
      tenant={tenant}
      rooms={rooms}
      settings={contractSettings}
      templates={contractTemplates}
      existingContracts={existingContracts}
      recipients={allRecipients}
      services={services}
      invoiceSettings={invoiceSettings}
      signedContracts={signedContracts}
      timeEntries={timeEntries}
      ownerEmail={ownerEmail}
      currentUserEmail={currentUserEmail}
      invoices={invoices}
    />
  );
}
