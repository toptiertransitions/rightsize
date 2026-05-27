import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { partnerId } = await req.json() as { partnerId: string };
  if (!partnerId) return NextResponse.json({ error: "Missing partnerId" }, { status: 400 });

  const clerk = await clerkClient();
  const user = await clerk.users.getUser(partnerId).catch(() => null);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email on file" }, { status: 400 });

  // Create a sign-in token (acts as a magic link for account access / password reset)
  const tokenRes = await clerk.signInTokens.createSignInToken({
    userId: partnerId,
    expiresInSeconds: 86400,
  }).catch(() => null);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  const resetUrl = tokenRes
    ? `${appUrl}/sign-in#__clerk_ticket=${tokenRes.token}`
    : `${appUrl}/sign-in`;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const resend = new Resend(resendKey);
    const from = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
    await resend.emails.send({
      from: `Top Tier Transitions <${from}>`,
      to: email,
      subject: "Access your Top Tier Transitions Partner Portal",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #2d4a3e; margin-bottom: 8px;">Partner Portal Access</h2>
          <p style="color: #444; margin-bottom: 24px;">
            An admin has sent you a sign-in link for the TTT Partner Portal.
            Click the button below to access your account. This link expires in 24 hours.
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:#2d4a3e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
            Sign In to Partner Portal
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            If you did not request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });
  }

  return NextResponse.json({ success: true, email });
}
