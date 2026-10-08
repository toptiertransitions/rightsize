import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, updateReferralContact } from "@/lib/airtable";
import { buildPartnerInviteEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTManager", "TTTAdmin", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { email, name, contactId } = body as { email?: string; name?: string; contactId?: string };
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  // After sign-up, hit /api/partner/activate which links the Clerk account to the
  // referral contact record, sends admin notification, then redirects to /partner/home
  const portalUrl = `${appUrl}/sign-up?redirect_url=%2Fapi%2Fpartner%2Factivate`;

  // Send invite email via Resend (no Clerk invitation — partner uses standard sign-up)
  const resend = new Resend(process.env.RESEND_API_KEY);
  const clerkUser = await clerkClient().then((c) => c.users.getUser(userId)).catch(() => null);
  const inviterName = clerkUser
    ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || "The Team"
    : "The Team";
  const inviterEmail = clerkUser?.emailAddresses?.[0]?.emailAddress;
  const ccEmail = inviterEmail && inviterEmail.toLowerCase() !== email.toLowerCase() ? inviterEmail : undefined;

  const { error: sendError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@toptiertransitions.com",
    to: email,
    ...(ccEmail ? { cc: [ccEmail] } : {}),
    subject: `${inviterName} invited you to the Top Tier Partner Portal`,
    html: buildPartnerInviteEmail({ inviterName, partnerName: name || email, portalUrl }),
  });

  if (sendError) {
    console.error("Partner invite email error:", sendError);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  // Persist invite flag so all users see "Pending" across sessions
  if (contactId) {
    await updateReferralContact(contactId, { portalInviteSent: true }).catch(() => {});
  }

  return NextResponse.json({ sent: true });
}
