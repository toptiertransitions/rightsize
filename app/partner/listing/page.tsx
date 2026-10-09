import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPartnerAccount, needsSetup } from "@/lib/marketplace/partnerAccount";
import { areaFormFor } from "@/lib/marketplace/serviceRadius";
import { ListingClient } from "./ListingClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Listing | Top Tier Transitions" };

export default async function PartnerListingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getPartnerAccount(userId);
  if (!account) redirect("/partner/home");
  if (needsSetup(account.partner)) redirect("/partner/setup");

  const { partner, contact, listings } = account;

  return (
    <ListingClient
      status={partner.lifecycleStatus}
      business={{
        companyName: partner.companyName,
        pocName: partner.pocName || contact.name,
        phone: partner.phone || contact.phone,
        website: partner.website,
        city: partner.city,
        state: partner.state,
        zip: partner.zip,
      }}
      about={{ logo: partner.logo, shortBio: partner.shortBio, aboutUs: partner.aboutUs }}
      area={areaFormFor(partner)}
      listings={listings.map((l) => ({ id: l.id, label: l.category.label, status: l.status, fieldSchema: l.category.fieldSchema, attributes: l.attributes }))}
    />
  );
}
