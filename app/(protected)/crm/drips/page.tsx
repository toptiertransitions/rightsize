import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  getSystemRole,
  getDripCampaigns,
  getDripEnrollments,
  getDripSettings,
  getReferralContacts,
  getReferralCompanies,
  getClientContacts,
} from "@/lib/airtable";
import { DripClient } from "./DripClient";

export default async function CRMDripsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin" && sysRole !== "TTTSales") {
    redirect("/home");
  }

  const user = await currentUser();
  const userEmail = user?.emailAddresses?.[0]?.emailAddress || "";
  const userFullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  const [campaigns, enrollments, settings, referralContacts, referralCompanies, clientContacts] = await Promise.all([
    getDripCampaigns().catch(() => []),
    getDripEnrollments().catch(() => []),
    getDripSettings().catch(() => null),
    getReferralContacts().catch(() => []),
    getReferralCompanies().catch(() => []),
    getClientContacts().catch(() => []),
  ]);

  return (
    <DripClient
      campaigns={campaigns}
      initialEnrollments={enrollments}
      settings={settings}
      referralContacts={referralContacts}
      referralCompanies={referralCompanies}
      clientContacts={clientContacts}
      userEmail={userEmail}
      userFullName={userFullName}
    />
  );
}
