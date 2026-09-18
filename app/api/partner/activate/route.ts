import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { findReferralContactByEmail, setReferralContactClerkUserId } from "@/lib/airtable";
import { sendNewPartnerAccountNotification } from "@/lib/admin-notifications";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(`${APP_URL}/sign-in?redirect_url=%2Fapi%2Fpartner%2Factivate`);
  }

  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const primaryEmailId = user.primaryEmailAddressId;
  const email = user.emailAddresses.find(e => e.id === primaryEmailId)?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress ?? null;

  if (!email) {
    return NextResponse.redirect(`${APP_URL}/partner/home`);
  }

  const contact = await findReferralContactByEmail(email).catch(() => null);

  if (contact && !contact.clerkUserId) {
    // Link the Clerk account to the referral contact
    await setReferralContactClerkUserId(contact.id, userId).catch(() => {});

    // Mark user as partner in Clerk metadata
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: { userType: "partner" },
    }).catch(() => {});

    // Notify the account owner (+ sales team, + admins)
    await sendNewPartnerAccountNotification({
      contactName: contact.name,
      contactTitle: contact.title || undefined,
      contactEmail: email,
      contactPhone: contact.phone || undefined,
      referralCompanyId: contact.referralCompanyId || undefined,
      currentStage: contact.stage,
    }).catch(() => {});
  }

  return NextResponse.redirect(`${APP_URL}/partner/home`);
}
