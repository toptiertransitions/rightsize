import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { findReferralContactByEmail, setReferralContactClerkUserId } from "@/lib/airtable";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";

async function getAdminEmails(): Promise<string[]> {
  let emails: string[] = (process.env.ADMIN_NOTIFICATION_EMAIL ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);

  if (emails.length === 0) {
    const ids = (process.env.TTT_ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    for (const id of ids) {
      const r = await fetch(`https://api.clerk.com/v1/users/${id}`, {
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      });
      if (!r.ok) continue;
      const u = await r.json();
      const primaryId = u.primary_email_address_id as string | null;
      const email = (u.email_addresses as Array<{ id: string; email_address: string }>)
        ?.find(e => e.id === primaryId)?.email_address
        ?? (u.email_addresses as Array<{ email_address: string }>)?.[0]?.email_address;
      if (email) emails.push(email);
    }
  }
  return emails;
}

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

    // Notify admins
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length > 0) {
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || email;
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: "Top Tier Transitions <noreply@toptiertransitions.com>",
          to: adminEmails,
          subject: `New Partner Portal Account: ${fullName}`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
              <h2 style="margin:0 0 8px;color:#111827;">New Partner Account Created</h2>
              <p style="color:#4B5563;margin:0 0 16px;">
                <strong>${fullName}</strong> (${email}) just created their partner portal account.
              </p>
              <table style="border-collapse:collapse;width:100%;font-size:14px;">
                <tr><td style="padding:6px 0;color:#6B7280;">Contact record</td><td style="padding:6px 0;color:#111827;">${contact.name}</td></tr>
                <tr><td style="padding:6px 0;color:#6B7280;">Title</td><td style="padding:6px 0;color:#111827;">${contact.title || "&#8212;"}</td></tr>
              </table>
              <p style="margin:16px 0 0;">
                <a href="${APP_URL}/admin/crm" style="color:#2d4a3e;font-weight:600;">View in CRM →</a>
              </p>
            </div>
          `,
        }).catch(() => {});
      }
    }
  }

  return NextResponse.redirect(`${APP_URL}/partner/home`);
}
