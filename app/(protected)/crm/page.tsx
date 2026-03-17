import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getOpportunities, getClientContacts, getReferralCompanies, getReferralContacts, getGmailToken, getStaffMembers, getTenants } from "@/lib/airtable";
import { CRMClient } from "./CRMClient";

export default async function CRMPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin" && sysRole !== "TTTSales") {
    redirect("/home");
  }

  const [opportunities, clientContacts, companies, referralContacts, staffMembers, token, tenants] = await Promise.all([
    getOpportunities(),
    getClientContacts(),
    getReferralCompanies(),
    getReferralContacts(),
    getStaffMembers().catch(() => []),
    getGmailToken(userId).catch(() => null),
    getTenants().catch(() => []),
  ]);

  return (
    <CRMClient
      opportunities={opportunities}
      clientContacts={clientContacts}
      companies={companies}
      referralContacts={referralContacts}
      staffMembers={staffMembers}
      gmailConnected={!!token}
      gmailEmail={token?.email}
      tenants={tenants}
    />
  );
}
