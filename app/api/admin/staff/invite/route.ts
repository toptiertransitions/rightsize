import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTManager", "TTTAdmin"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { email, role } = body ?? {};
  if (!email || !role) {
    return NextResponse.json({ error: "Missing email or role" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.rightsize.com";
  const signupUrl = `${appUrl}/sign-up`;

  const clerk = await clerkClient();
  const inviter = await clerk.users.getUser(userId).catch(() => null);
  const inviterName = inviter
    ? [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") ||
      inviter.emailAddresses[0]?.emailAddress ||
      "Your administrator"
    : "Your administrator";

  const roleLabel = role === "TTTManager" ? "Manager" : "Staff";

  const html = buildStaffInviteEmail({ inviterName, roleLabel, signupUrl });

  const { error } = await resend.emails.send({
    from: "hello@toptiertransitions.com",
    to: email,
    subject: `You've been invited to join Rightsize by Top Tier Transitions`,
    html,
  });

  if (error) {
    console.error("[staff/invite] Resend error:", error);
    return NextResponse.json({ error: "Failed to send invitation email" }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}

function buildStaffInviteEmail({
  inviterName,
  roleLabel,
  signupUrl,
}: {
  inviterName: string;
  roleLabel: string;
  signupUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <tr><td style="background:#2E6B4F;padding:28px 32px;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Rightsize</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px;">by Top Tier Transitions</p>
        </td></tr>

        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You&rsquo;re invited!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4B5563;line-height:1.6;">
            <strong>${inviterName}</strong> has invited you to join the
            <strong>Rightsize</strong> platform as a <strong>TTT ${roleLabel}</strong>.
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">
            Click the button below to create your account. Use the same email address
            this invitation was sent to &mdash; your access will be activated once you&rsquo;re signed up.
          </p>

          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#2E6B4F;border-radius:10px;">
              <a href="${signupUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                Create Your Account &rarr;
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 4px;font-size:13px;color:#9CA3AF;">Or copy this link:</p>
          <p style="margin:0;font-size:12px;color:#6B7280;word-break:break-all;">${signupUrl}</p>
        </td></tr>

        <tr><td style="padding:16px 32px;border-top:1px solid #F3F4F6;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            If you weren&rsquo;t expecting this invitation, you can safely ignore this email.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
