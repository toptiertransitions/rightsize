import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPartnerAccount } from "@/lib/marketplace/partnerAccount";
import { areaFormFor } from "@/lib/marketplace/serviceRadius";
import { SetupWizard } from "./SetupWizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your partner profile | Top Tier Transitions" };

export default async function PartnerSetupPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await getPartnerAccount(userId);
  if (!account) redirect("/partner/home");

  const { partner, contact, listings } = account;
  const user = await currentUser().catch(() => null);
  const firstName = user?.firstName || (contact.name || partner.pocName).split(" ")[0] || "";


  return (
    <SetupWizard
      firstName={firstName}
      business={{
        companyName: partner.companyName,
        pocName: partner.pocName || contact.name,
        phone: partner.phone || contact.phone,
        website: partner.website,
        city: partner.city,
        state: partner.state || "IL",
        zip: partner.zip,
      }}
      about={{ logo: partner.logo, shortBio: partner.shortBio, aboutUs: partner.aboutUs }}
      area={areaFormFor(partner)}
      listings={listings.map((l) => ({ id: l.id, label: l.category.label, fieldSchema: l.category.fieldSchema, attributes: l.attributes }))}
    />
  );
}
