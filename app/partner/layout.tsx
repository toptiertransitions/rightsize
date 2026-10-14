import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { getPartnerContact } from "@/lib/partner";
import { PartnerHeader } from "./PartnerHeader";
import { getPartnerAccount } from "@/lib/marketplace/partnerAccount";
import { getBrandsForPartner } from "@/lib/checklists/service";

export const metadata = { title: "Partner Portal — Top Tier Transitions" };

// Two kinds of access share this portal: a CRM referral partner (Home,
// Project Plans, Rewards, Documents) and a marketplace company's team
// (Leads, Listing, Team). Most marketplace partners have both; a teammate
// added through the Team page has only the second.
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [contact, account] = await Promise.all([
    getPartnerContact(userId),
    getPartnerAccount(userId).catch(() => null),
  ]);

  if (!contact && !account) {
    // Not redirected: partner users are always routed back here, so a
    // redirect would loop. Happens after someone is removed from a team.
    return (
      <div className="min-h-[100dvh] bg-cream-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-cream-200 max-w-md w-full p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">No partner account access</h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            This sign-in isn&rsquo;t connected to a partner account anymore. If you think that&rsquo;s a mistake, ask your account owner to invite you again, or contact Top Tier Transitions.
          </p>
          <SignOutButton redirectUrl="/sign-in">
            <button className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700">
              Sign out
            </button>
          </SignOutButton>
        </div>
      </div>
    );
  }

  // Senior communities get "Resident Plans" (their residents' checklists)
  const isCommunity = account ? (await getBrandsForPartner(account.partner.id).catch(() => [])).length > 0 : false;

  return (
    <div className="min-h-screen bg-cream-50">
      <PartnerHeader
        contactName={contact?.name || account?.membership.name || account?.partner.companyName || ""}
        hasListing={!!account}
        hasCrm={!!contact}
        isCommunity={isCommunity}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
