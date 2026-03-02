import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getUserRoleForTenant, getTenantById } from "@/lib/airtable";
import { createInviteToken } from "@/lib/invites";
import type { InviteRole } from "@/lib/invites";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenantId: string; role: InviteRole; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenantId, role, email } = body;
  if (!tenantId || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["Collaborator", "Viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Only Owners and Collaborators (+ TTT staff) may generate invites
  const userRole = await getUserRoleForTenant(userId, tenantId);
  if (!userRole || !["Owner", "Collaborator", "TTTStaff", "TTTAdmin"].includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = createInviteToken({ tenantId, role, invitedBy: userId });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/invite?token=${token}`;

  // ── Email path ──────────────────────────────────────────────────────────────
  if (email) {
    const [tenant, clerk] = await Promise.all([
      getTenantById(tenantId).catch(() => null),
      clerkClient().then((c) => c.users.getUser(userId)).catch(() => null),
    ]);

    const projectName = tenant?.name ?? "a project";
    const inviterName = clerk
      ? [clerk.firstName, clerk.lastName].filter(Boolean).join(" ") || clerk.emailAddresses[0]?.emailAddress || "Someone"
      : "Someone";
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from: `Rightsize by Top Tier <${fromEmail}>`,
      to: email,
      subject: `${inviterName} invited you to ${projectName} on Rightsize`,
      html: buildInviteEmail({ inviterName, projectName, role, inviteUrl }),
    });

    if (sendError) {
      console.error("Resend error:", sendError);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ sent: true });
  }

  // ── Copy-link path (existing behavior) ─────────────────────────────────────
  return NextResponse.json({ inviteUrl });
}

function buildInviteEmail({
  inviterName,
  projectName,
  role,
  inviteUrl,
}: {
  inviterName: string;
  projectName: string;
  role: string;
  inviteUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#2E6B4F;padding:28px 32px;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Rightsize</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px;">by Top Tier Transitions</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You&rsquo;re invited!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4B5563;line-height:1.6;">
            <strong>${inviterName}</strong> has invited you to join
            <strong>${projectName}</strong> on Rightsize as a <strong>${role}</strong>.
          </p>

          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#2E6B4F;border-radius:10px;">
              <a href="${inviteUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                Accept Invitation &rarr;
              </a>
            </td></tr>
          </table>

          <p style="margin:0 0 4px;font-size:13px;color:#9CA3AF;">Or copy this link into your browser:</p>
          <p style="margin:0;font-size:12px;color:#6B7280;word-break:break-all;">${inviteUrl}</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #F3F4F6;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            This invite expires in 7 days. If you weren&rsquo;t expecting this, you can safely ignore it.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
