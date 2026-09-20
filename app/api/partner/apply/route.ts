import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  findReferralContactByEmail,
  setReferralContactClerkUserId,
  createReferralCompany,
  createReferralContact,
} from "@/lib/airtable";
import { sendNewPartnerAccountNotification } from "@/lib/admin-notifications";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
const VALID_TYPES = new Set(["Senior Living", "Realtor", "Moving Company", "Other"]);

// Self-serve Referral Partner signup. Hit as the post-signup redirect from
// /sign-up/partner (via Clerk's forceRedirectUrl) — creates the ReferralCompany
// + ReferralContact CRM records from scratch (unlike /api/partner/activate,
// which only links an already-staff-created contact). New companies are left
// unassigned so sendNewPartnerAccountNotification's admin fallback picks them up
// until a Sales rep claims ownership in the CRM.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    const redirectBack = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(`${APP_URL}/sign-in?redirect_url=${redirectBack}`);
  }

  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const primaryEmailId = user.primaryEmailAddressId;
  const email = user.emailAddresses.find(e => e.id === primaryEmailId)?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress ?? null;

  if (!email) {
    return NextResponse.redirect(`${APP_URL}/partner/home`);
  }

  const rawType = req.nextUrl.searchParams.get("type") || "Other";
  const companyType = VALID_TYPES.has(rawType) ? rawType : "Other";
  const companyName = (req.nextUrl.searchParams.get("company") || "").trim();
  const phone = (req.nextUrl.searchParams.get("phone") || "").trim();
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || email;

  // Staff may have already created this contact in the CRM before the partner
  // ever signed up — in that case, just link (same behavior as /api/partner/activate).
  let contact = await findReferralContactByEmail(email).catch(() => null);

  if (!contact) {
    const company = await createReferralCompany({
      name: companyName || fullName,
      type: companyType,
    });
    contact = await createReferralContact({
      name: fullName,
      email,
      phone: phone || undefined,
      referralCompanyId: company.id,
      stage: "Identified",
    });
  }

  if (!contact.clerkUserId) {
    await setReferralContactClerkUserId(contact.id, userId).catch(() => {});
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: { userType: "partner" },
    }).catch(() => {});

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
