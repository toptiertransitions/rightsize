import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getOpportunities, getClientContacts, getReferralCompanies, getGmailToken } from "@/lib/airtable";
import { CRMClient } from "./CRMClient";

export default async function CRMPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin") {
    redirect("/home");
  }

  const [opportunities, clientContacts, companies, token] = await Promise.all([
    getOpportunities(),
    getClientContacts(),
    getReferralCompanies(),
    getGmailToken(userId).catch(() => null),
  ]);

  return (
    <CRMClient
      opportunities={opportunities}
      clientContacts={clientContacts}
      companies={companies}
      gmailConnected={!!token}
      gmailEmail={token?.email}
    />
  );
}
