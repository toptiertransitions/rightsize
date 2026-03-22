import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const subject = formData.get("subject")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim() ?? "";
  const message = formData.get("message")?.toString().trim() ?? "";
  const userType = formData.get("userType")?.toString() ?? "";

  if (!subject || !email || !message) {
    return NextResponse.json({ error: "Subject, email, and message are required" }, { status: 400 });
  }

  // Get sender's name from Clerk
  const clerk = await clerkClient();
  const sender = await clerk.users.getUser(userId).catch(() => null);
  const senderName = sender
    ? [sender.firstName, sender.lastName].filter(Boolean).join(" ") || email
    : email;

  // Collect all TTTAdmin emails from env
  const adminIds = (process.env.TTT_ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const adminEmails: string[] = [];
  for (const adminId of adminIds) {
    try {
      const u = await clerk.users.getUser(adminId);
      const e = u.emailAddresses.find(ea => ea.id === u.primaryEmailAddressId)?.emailAddress;
      if (e) adminEmails.push(e);
    } catch { /* skip */ }
  }

  if (adminEmails.length === 0) {
    // Fallback to a known address if env is misconfigured
    adminEmails.push("hello@toptiertransitions.com");
  }

  // Collect file attachments
  const attachments: { filename: string; content: Buffer }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file_") && value instanceof Blob) {
      const file = value as File;
      const buf = Buffer.from(await file.arrayBuffer());
      attachments.push({ filename: file.name, content: buf });
    }
  }

  const roleLabel = userType ? ` (${userType})` : "";
  const html = buildHelpTicketEmail({ senderName, email, subject, message, roleLabel });

  const { error } = await resend.emails.send({
    from: "hello@toptiertransitions.com",
    to: adminEmails,
    replyTo: email,
    subject: `[Help Ticket] ${subject}`,
    html,
    attachments: attachments.map(a => ({ filename: a.filename, content: a.content })),
  });

  if (error) {
    console.error("[help] Resend error:", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}

function buildHelpTicketEmail({
  senderName,
  email,
  subject,
  message,
  roleLabel,
}: {
  senderName: string;
  email: string;
  subject: string;
  message: string;
  roleLabel: string;
}): string {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Help Ticket</title></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="background:#1a3d2b;padding:28px 32px;border-radius:14px 14px 0 0;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.5);">Top Tier Transitions</p>
            <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#fff;">New Help Ticket</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:32px;border-radius:0 0 14px 14px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#F9FAFB;">
                <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;">Sender</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:500;">${senderName}${roleLabel}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #E5E7EB;">Email</td>
                <td style="padding:10px 16px;font-size:14px;border-top:1px solid #E5E7EB;"><a href="mailto:${email}" style="color:#2E6B4F;">${email}</a></td>
              </tr>
              <tr style="background:#F9FAFB;">
                <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;border-top:1px solid #E5E7EB;">Subject</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;border-top:1px solid #E5E7EB;">${subject}</td>
              </tr>
            </table>
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;">Message</p>
            <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px 20px;font-size:14px;color:#374151;line-height:1.7;">${escaped}</div>
          </td>
        </tr>
        <tr><td style="padding:16px 0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;">Top Tier Transitions &mdash; Help Ticket System</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
