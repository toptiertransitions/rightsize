import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPartnerAccount, needsSetup } from "@/lib/marketplace/partnerAccount";
import { getIntroductionEventsForPartner, updateIntroductionEventStatus } from "@/lib/marketplace/data";
import { getListingCategoryLabels, toLeadView } from "@/lib/marketplace/leads";
import { LeadsClient } from "./LeadsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads | Top Tier Transitions" };

// Marketplace partners' Leads: only introductions TTT has released to them.
export default async function PartnerLeadsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getPartnerAccount(userId);
  if (!account) redirect("/partner/home");
  if (needsSetup(account.partner)) redirect("/partner/setup");

  const [events, categories] = await Promise.all([
    getIntroductionEventsForPartner(account.partner.id),
    getListingCategoryLabels(),
  ]);
  const released = events.filter((e) => e.releasedAt).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  // Opening the Leads page counts as seeing the newly released leads
  const unseen = released.filter((e) => e.status === "Requested" || e.status === "Delivered");
  await Promise.all(unseen.map((e) => updateIntroductionEventStatus(e.id, "Viewed", { viewedAt: new Date().toISOString() }).catch(() => {})));
  const unseenIds = new Set(unseen.map((e) => e.id));

  const leads = released.map((e) => ({
    ...toLeadView(e, categories.get(e.listingId) ?? ""),
    status: unseenIds.has(e.id) ? ("Viewed" as const) : e.status,
    isNew: unseenIds.has(e.id),
  }));

  return <LeadsClient leads={leads} />;
}
