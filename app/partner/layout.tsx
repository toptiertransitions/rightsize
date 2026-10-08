import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPartnerContact } from "@/lib/partner";
import { PartnerHeader } from "./PartnerHeader";
import { findMarketplacePartnerForContact } from "@/lib/marketplace/partnerAccount";

export const metadata = { title: "Partner Portal — Top Tier Transitions" };

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const contact = await getPartnerContact(userId);
  if (!contact) redirect("/home");
  const marketplacePartner = await findMarketplacePartnerForContact(contact).catch(() => null);

  return (
    <div className="min-h-screen bg-cream-50">
      <PartnerHeader contactName={contact.name} hasListing={!!marketplacePartner} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
