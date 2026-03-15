import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getTenantById, getUserRoleForTenant } from "@/lib/airtable";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { tenantId, reason } = body as { tenantId?: string; reason?: string };

  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  // Only project Owners can request deletion
  const role = await getUserRoleForTenant(userId, tenantId).catch(() => null);
  if (role !== "Owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clerk = await clerkClient();
  const [tenant, requester] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    clerk.users.getUser(userId).catch(() => null),
  ]);

  if (!tenant) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const requesterName = requester
    ? [requester.firstName, requester.lastName].filter(Boolean).join(" ") ||
      requester.emailAddresses[0]?.emailAddress ||
      "A client user"
    : "A client user";
  const requesterEmail =
    requester?.emailAddresses.find(e => e.id === requester.primaryEmailAddressId)
      ?.emailAddress ?? "";

  // Collect TTT Admin emails from Clerk
  const adminIds = (process.env.TTT_ADMIN_USER_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const adminEmails: string[] = [];
  for (const adminId of adminIds) {
    try {
      const adminUser = await clerk.users.getUser(adminId);
      const email = adminUser.emailAddresses.find(
        e => e.id === adminUser.primaryEmailAddressId
      )?.emailAddress;
      if (email) adminEmails.push(email);
    } catch {
      // skip unreachable admin
    }
  }

  if (!adminEmails.length) {
    console.error("No admin emails found — check TTT_ADMIN_USER_IDS env var");
    return NextResponse.json(
      { error: "Could not locate admin contacts. Please reach out directly." },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: sendError } = await resend.emails.send({
    from: `Rightsize by Top Tier <${fromEmail}>`,
    to: adminEmails,
    subject: `Project Deletion Request: ${tenant.name}`,
    html: buildDeletionRequestEmail({
      requesterName,
      requesterEmail,
      projectName: tenant.name,
      reason: reason?.trim() || undefined,
      appUrl,
    }),
  });

  if (sendError) {
    console.error("Resend error:", sendError);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}

function buildDeletionRequestEmail({
  requesterName,
  requesterEmail,
  projectName,
  reason,
  appUrl,
}: {
  requesterName: string;
  requesterEmail: string;
  projectName: string;
  reason?: string;
  appUrl: string;
}): string {
  const reasonRow = reason
    ? `<tr><td style="padding:0 0 16px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">Reason provided:</p>
        <p style="margin:0;font-size:14px;color:#4B5563;font-style:italic;">&ldquo;${reason}&rdquo;</p>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <tr><td style="background:#991B1B;padding:28px 32px;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Rightsize</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;">Project Deletion Request</p>
        </td></tr>

        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111827;">Action Required</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4B5563;line-height:1.6;">
            A client has requested that their project be deleted from Rightsize.
            Please review and take action in the admin panel.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:20px;margin:0 0 24px;">
            <tr><td>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:0 0 12px;">
                  <p style="margin:0 0 2px;font-size:12px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.05em;">Project</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">${projectName}</p>
                </td></tr>
                <tr><td style="padding:0 0 12px;">
                  <p style="margin:0 0 2px;font-size:12px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.05em;">Requested by</p>
                  <p style="margin:0;font-size:15px;color:#111827;">${requesterName}</p>
                  ${requesterEmail ? `<p style="margin:2px 0 0;font-size:13px;color:#6B7280;">${requesterEmail}</p>` : ""}
                </td></tr>
                ${reasonRow}
              </table>
            </td></tr>
          </table>

          <table cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
            <tr><td style="background:#1D4ED8;border-radius:10px;">
              <a href="${appUrl}/admin/users" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                Review in Admin Panel &rarr;
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            Do not delete the project without first confirming with the client.
          </p>
        </td></tr>

        <tr><td style="padding:16px 32px;border-top:1px solid #F3F4F6;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            This notification was sent because a client requested project deletion on Rightsize.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
