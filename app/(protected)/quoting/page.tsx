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
    const allTenants = (await getTenants().catch(() => []))
      .filter(t => sysRole === "TTTAdmin" || (t.isTTT ?? true));
    const sorted = [...allTenants].sort((a, b) => a.name.localeCompare(b.name));
    return <QuotingProjectPicker tenants={sorted} />;
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

  // Resolve the project Owner's email only (not all members)
  let ownerEmail = "";
  let currentUserEmail = "";
  let ownerRecipient: { name: string; email: string; role: string } | null = null;
  try {
    const clerk = await clerkClient();
    const ownerMembership = memberships.find((m) => m.role === "Owner");
    if (ownerMembership || tenant.ownerUserId) {
      const ownerUserId = ownerMembership?.userId ?? tenant.ownerUserId;
      const ownerUser = await clerk.users.getUser(ownerUserId).catch(() => null);
      ownerEmail = ownerUser?.emailAddresses?.[0]?.emailAddress ?? "";
      const ownerName = [ownerUser?.firstName, ownerUser?.lastName].filter(Boolean).join(" ") || ownerEmail;
      if (ownerEmail) ownerRecipient = { name: ownerName, email: ownerEmail, role: "Owner" };
    }
    if (!currentUserEmail) {
      const currentUser = await clerk.users.getUser(userId).catch(() => null);
      currentUserEmail = currentUser?.emailAddresses?.[0]?.emailAddress ?? "";
    }
  } catch { /* ignore */ }

  const signedContracts = existingContracts.filter((c) => c.status === "Signed");

  // Collect emails from this project's linked opportunities only
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

  // Final list: Owner first, then opp contacts (deduplicated), no global CRM contacts
  const seenEmails = new Set(ownerRecipient ? [ownerEmail] : []);
  const uniqueOppRecipients = opportunityRecipients.filter((r) => !seenEmails.has(r.email));
  const allRecipients = [...(ownerRecipient ? [ownerRecipient] : []), ...uniqueOppRecipients];

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
