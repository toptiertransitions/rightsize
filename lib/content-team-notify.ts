import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { clerkClient } from "@clerk/nextjs/server";
import { getStaffMembers } from "./airtable";
import { isTTTAdmin } from "./config";
import type { ContentItem } from "./types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
const FROM = `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`;

async function generateSummary(item: ContentItem): Promise<string> {
  const anthropic = new Anthropic();
  const isReadable = item.contentType === "PDF" && !!item.fileUrl;

  const textPrompt = `You are writing a 2–3 sentence internal summary for TTT sales staff about a new piece of marketing collateral just added to the content library.

Title: "${item.title}"
Type: ${item.contentType}
Audience: ${item.audience}
${item.description ? `Description: ${item.description}` : ""}

Write exactly 2–3 concise sentences describing what this piece covers and why it's useful for the sales team. Be specific and concrete. Do not start with "This" or repeat the title. No bullet points, no headers — plain prose only.`;

  try {
    if (isReadable) {
      const blocks: Anthropic.Messages.ContentBlockParam[] = [
        { type: "document", source: { type: "url", url: item.fileUrl! } },
        { type: "text", text: textPrompt },
      ];
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        messages: [{ role: "user", content: blocks }],
      });
      return (resp.content[0] as { type: string; text: string }).text.trim();
    }
  } catch { /* fall through to text-only */ }

  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{ role: "user", content: textPrompt }],
  });
  return (resp.content[0] as { type: string; text: string }).text.trim();
}

function buildEmail(item: ContentItem, summary: string): string {
  const deepLink = `${APP_URL}/crm/outreach?tab=repository&item=${item.id}`;
  const typeLabel = item.contentType === "PDF" ? "PDF Document"
    : item.contentType === "Image" ? "Image"
    : item.contentType === "PartnerLogo" ? "Partner Logo"
    : item.contentType === "URL" ? "Link"
    : item.contentType === "LinkedIn" ? "LinkedIn Post"
    : item.contentType;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f4f0;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:#2d4a3e;border-radius:12px 12px 0 0;padding:28px 36px">
            <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:-0.3px">Top Tier Transitions</p>
            <p style="margin:6px 0 0;font-family:Georgia,serif;font-size:13px;font-style:italic;color:#a7c4b5">White Glove Senior Move Management. Done Right.</p>
          </td>
        </tr>

        <!-- Alert badge -->
        <tr>
          <td style="background:#ffffff;padding:28px 36px 0">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#eaf2ee;border:1px solid #c3ddd0;border-radius:20px;padding:5px 14px">
                  <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:#2d4a3e;letter-spacing:0.5px;text-transform:uppercase">New Marketing Content</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Title -->
        <tr>
          <td style="background:#ffffff;padding:16px 36px 0">
            <h1 style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#1a2e26;line-height:1.2">${item.title}</h1>
          </td>
        </tr>

        <!-- Type pill -->
        <tr>
          <td style="background:#ffffff;padding:10px 36px 0">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#6b7280">${typeLabel} &nbsp;·&nbsp; ${item.audience === "ReferralPartners" ? "Referral Partners" : item.audience === "InternalTraining" ? "Internal Training" : item.audience}</p>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="background:#ffffff;padding:20px 36px 0">
            <div style="height:1px;background:#e5e7eb"></div>
          </td>
        </tr>

        <!-- AI Summary -->
        <tr>
          <td style="background:#ffffff;padding:20px 36px 0">
            <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;color:#9ca3af;letter-spacing:0.8px;text-transform:uppercase">What's Inside</p>
            <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#374151;line-height:1.7">${summary}</p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="background:#ffffff;padding:28px 36px">
            <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
              <tr>
                <td align="center" bgcolor="#2d4a3e" style="border-radius:6px">
                  <a href="${deepLink}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-family:Georgia,serif;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px">View in Content Repository</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f5f4f0;border-radius:0 0 12px 12px;padding:18px 36px;text-align:center">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af">Top Tier Transitions &nbsp;·&nbsp; Internal team notification</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function notifyTeamNewContent(item: ContentItem): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const staff = await getStaffMembers();

  // Determine recipients based on visibility
  // sharedWith=[] → public → all active admins/managers/sales
  // sharedWith=["__private__"] → truly private → uploader only
  // sharedWith=[id,...] → private with selected reps → those reps + uploader
  const isPrivate = item.sharedWith.length > 0;
  const isTrulyPrivate = isPrivate && item.sharedWith[0] === "__private__";

  // Resolve uploader email: staff table first, Clerk API as fallback (covers
  // TTTAdmin users who exist only via TTT_ADMIN_USER_IDS env var, not in StaffMembers)
  async function resolveUploaderEmail(): Promise<string | undefined> {
    const fromStaff = staff.find(s => s.clerkUserId === item.authorClerkId)?.email;
    if (fromStaff) return fromStaff;
    try {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(item.authorClerkId);
      return user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress
        ?? user.emailAddresses[0]?.emailAddress;
    } catch { return undefined; }
  }

  let recipients: string[];

  if (isTrulyPrivate) {
    const uploaderEmail = await resolveUploaderEmail();
    recipients = uploaderEmail ? [uploaderEmail] : [];
  } else if (isPrivate) {
    const selectedIds = new Set(item.sharedWith);
    const selectedEmails = staff
      .filter(s => s.isActive && s.email && selectedIds.has(s.clerkUserId))
      .map(s => s.email as string);
    const uploaderEmail = await resolveUploaderEmail();
    recipients = [...new Set([...selectedEmails, ...(uploaderEmail ? [uploaderEmail] : [])])];
  } else {
    recipients = staff
      .filter(s => s.isActive && s.email && (
        ["TTTAdmin", "TTTManager", "TTTSales"].includes(s.role ?? "") || isTTTAdmin(s.clerkUserId)
      ))
      .map(s => s.email as string);
  }

  if (recipients.length === 0) return;

  const fallbackSummary = item.description?.trim() || `A new ${item.contentType} has been added to the content library.`;
  const [summary, pdfBuffer] = await Promise.all([
    generateSummary(item).catch(e => {
      console.error("[content-team-notify] generateSummary failed, using fallback:", e);
      return fallbackSummary;
    }),
    item.contentType === "PDF" && item.fileUrl
      ? fetch(item.fileUrl).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null)
      : Promise.resolve(null),
  ]);

  const html = buildEmail(item, summary);
  const resend = new Resend(resendKey);

  const attachments = pdfBuffer
    ? [{ filename: `${item.title.replace(/[^a-z0-9]/gi, "_")}.pdf`, content: Buffer.from(pdfBuffer) }]
    : [];

  await resend.emails.send({
    from: FROM,
    to: recipients,
    subject: `New Marketing Content Alert - ${item.title}`,
    html,
    attachments,
  });

  console.log(`[content-team-notify] sent to ${recipients.length} recipient(s) for "${item.title}"`);
}
