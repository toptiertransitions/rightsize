import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  getSystemRole, getGmailToken, getOutreachTemplates,
  getReferralCompanies, getStaffMembers,
} from "@/lib/airtable";
import OutreachClient from "./OutreachClient";

export default async function OutreachPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (!["TTTManager", "TTTAdmin", "TTTSales"].includes(sysRole ?? "")) {
    redirect("/home");
  }

  const [gmailToken, templates, companies, staffMembers] = await Promise.all([
    getGmailToken(userId).catch(() => null),
    getOutreachTemplates(userId).catch(() => []),
    getReferralCompanies().catch(() => []),
    getStaffMembers().catch(() => []),
  ]);

  return (
    <OutreachClient
      currentUserId={userId}
      gmailConnected={!!gmailToken}
      hasSendScope={gmailToken?.hasSendScope ?? false}
      gmailEmail={gmailToken?.email}
      initialTemplates={templates}
      companies={companies}
      staffMembers={staffMembers}
    />
  );
}
