import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole } from "@/lib/airtable";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTManager", "TTTAdmin", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { email, name } = body as { email?: string; name?: string };
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
    subject: `${inviterName} invited you to the TTT Partner Portal`,
    html: buildPartnerInviteEmail({ inviterName, partnerName: name || email, portalUrl }),
  });

  if (sendError) {
    console.error("Partner invite email error:", sendError);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}

function buildPartnerInviteEmail({
  inviterName,
  partnerName,
  portalUrl,
}: {
  inviterName: string;
  partnerName: string;
  portalUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr><td style="background:#2d4a3e;padding:28px 32px;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Top Tier Transitions</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px;">Partner Portal</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You&rsquo;re a TTT Partner!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4B5563;line-height:1.6;">
            Hi ${partnerName},<br><br>
            <strong>${inviterName}</strong> has set you up with access to the TTT Partner Portal.
            You can log in to track referred clients, view project progress, see Google reviews, and check your referral points.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#2d4a3e;border-radius:10px;">
              <a href="${portalUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                Create Your Account &rarr;
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 4px;font-size:13px;color:#9CA3AF;">Or copy this link into Safari or Chrome:</p>
          <p style="margin:0 0 20px;font-size:12px;color:#6B7280;word-break:break-all;">${portalUrl}</p>
          <div style="background:#FFF9EC;border:1px solid #FDE68A;border-radius:10px;padding:12px 16px;">
            <p style="margin:0;font-size:12px;color:#92400E;line-height:1.6;">
              <strong>On your phone?</strong> If the button above doesn&rsquo;t work, it may have opened inside your email app&rsquo;s browser. Copy the link above and paste it directly into <strong>Safari</strong> or <strong>Chrome</strong> instead.
            </p>
          </div>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #F3F4F6;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            If you have questions, reply to this email or contact your Top Tier Transitions representative.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
