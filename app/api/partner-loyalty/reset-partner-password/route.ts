import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // partnerEmail: primary email for the company's portal contact
  const { partnerEmail } = await req.json() as { partnerEmail: string };
  if (!partnerEmail) return NextResponse.json({ error: "Missing partnerEmail" }, { status: 400 });

  const clerk = await clerkClient();
  const result = await clerk.users.getUserList({ emailAddress: [partnerEmail] }).catch(() => null);
  const user = result?.data?.[0] ?? null;

  if (!user) {
    // No Clerk account found — still send a helpful onboarding email
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);
      const from = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
      await resend.emails.send({
        from: `Top Tier Transitions <${from}>`,
        to: partnerEmail,
        subject: "Access your TTT Partner Portal",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="color:#2d4a3e;">Partner Portal Invitation</h2>
          <p style="color:#444;">You've been invited to the TTT Partner Portal. Click below to create your account.</p>
          <a href="${appUrl}/sign-up" style="display:inline-block;background:#2d4a3e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Create Account</a>
        </div>`,
      });
    }
    return NextResponse.json({ success: true, email: partnerEmail, noAccount: true });
  }

  const tokenRes = await clerk.signInTokens.createSignInToken({
    userId: user.id,
    expiresInSeconds: 86400,
  }).catch(() => null);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  const signInUrl = tokenRes
    ? `${appUrl}/sign-in#__clerk_ticket=${tokenRes.token}`
    : `${appUrl}/sign-in`;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const resend = new Resend(resendKey);
    const from = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
    await resend.emails.send({
      from: `Top Tier Transitions <${from}>`,
      to: partnerEmail,
      subject: "Access your TTT Partner Portal",
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
        <h2 style="color:#2d4a3e;margin-bottom:8px;">Partner Portal Access</h2>
        <p style="color:#444;margin-bottom:24px;">
          An admin has sent you a sign-in link. This link expires in 24 hours.
        </p>
        <a href="${signInUrl}" style="display:inline-block;background:#2d4a3e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
          Sign In to Partner Portal
        </a>
        <p style="color:#999;font-size:12px;margin-top:24px;">If you did not request this, ignore this email.</p>
      </div>`,
    });
  }

  return NextResponse.json({ success: true, email: partnerEmail });
}
