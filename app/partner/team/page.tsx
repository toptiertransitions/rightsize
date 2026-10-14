import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPartnerAccount, needsSetup } from "@/lib/marketplace/partnerAccount";
import { getPartnerUsersForPartner, toPartnerUserView } from "@/lib/marketplace/partnerUsersData";
import { TeamClient } from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function PartnerTeamPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getPartnerAccount(userId);
  if (!account) redirect("/partner/home");
  if (needsSetup(account.partner)) redirect("/partner/setup");

  const rows = await getPartnerUsersForPartner(account.partner.id);
  const members = rows
    .filter((r) => r.status === "Active" || r.status === "Invited")
    .map(toPartnerUserView);

  return (
    <TeamClient
      companyName={account.partner.companyName}
      meId={account.membership.id}
      meClerkId={account.membership.clerkUserId}
      isOwner={account.membership.role === "Primary"}
      members={members}
      leadRouting={account.partner.leadRouting}
      includeBusinessEmail={!account.partner.leadSkipBusinessEmail}
      businessEmail={account.partner.email || undefined}
    />
  );
}
