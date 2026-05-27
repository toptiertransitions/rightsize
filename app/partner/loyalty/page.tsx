import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPartnerContact } from "@/lib/partner";
import { PartnerLoyaltyStatus } from "@/components/partner/PartnerLoyaltyStatus";

export default async function PartnerLoyaltyPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const contact = await getPartnerContact(userId);
  if (!contact) redirect("/home");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#2d4a3e]">Premier Partner Rewards</h1>
        <p className="text-sm text-gray-500 mt-1">
          Earn points for every completed project referral. More referrals unlock higher tiers and faster earning.
        </p>
      </div>
      <PartnerLoyaltyStatus partnerId={userId} />
    </div>
  );
}
