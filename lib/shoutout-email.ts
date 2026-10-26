// Branded shoutout email: To the recipient, CC leadership. The message is
// shown verbatim (escaped, line breaks kept).
import { BRAND, esc } from "./plan-emails/render";

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export function buildShoutoutEmail(p: {
  recipientName: string;
  authorName: string;
  message: string;
  appUrl: string;
  logoUrl?: string;
}): { subject: string; html: string; text: string } {
  const first = p.recipientName.split(" ")[0] || p.recipientName;
  const subject = `A shoutout for ${p.recipientName} from ${p.authorName}`;
  const homeUrl = `${p.appUrl.replace(/\/$/, "")}/home`;
  const logo = p.logoUrl && /^https:\/\//.test(p.logoUrl)
    ? `<img src="${esc(p.logoUrl)}" alt="Top Tier Transitions" height="56" style="height:56px;width:auto;display:block;border:0;margin:0 auto 18px;">`
    : "";
  const message = esc(p.message.trim()).replace(/\r?\n/g, "<br>");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;border-top:6px solid ${BRAND.green};">
<tr><td style="padding:34px 36px 8px;text-align:center;">
${logo}<p style="margin:0;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;color:${BRAND.greenBright};">Team Shoutout</p>
<h1 style="margin:12px 0 0;font-family:${SERIF};font-size:34px;line-height:1.2;font-weight:normal;color:${BRAND.green};">Way to go, ${esc(first)}!</h1>
<p style="margin:10px 0 0;font-family:${SANS};font-size:14px;color:${BRAND.muted};">${esc(p.authorName)} gave you a shoutout</p>
</td></tr>
<tr><td style="padding:24px 36px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
<td style="background:#F0F7F4;border-left:4px solid ${BRAND.greenBright};border-radius:8px;padding:22px 24px;">
<p style="margin:0;font-family:${SERIF};font-size:18px;line-height:1.6;color:${BRAND.ink};">&ldquo;${message}&rdquo;</p>
<p style="margin:14px 0 0;font-family:${SANS};font-size:13px;font-weight:600;color:${BRAND.green};">${esc(p.authorName)}</p>
</td></tr></table>
</td></tr>
<tr><td style="padding:22px 36px 34px;text-align:center;">
<p style="margin:0 0 20px;font-family:${SANS};font-size:14px;line-height:1.6;color:${BRAND.ink};">Thank you for everything you do for our clients and our team. This shoutout is now pinned on your Rightsize home page.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="background:${BRAND.greenBright};border-radius:10px;">
<a href="${esc(homeUrl)}" style="display:inline-block;padding:13px 30px;font-family:${SANS};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">See it in Rightsize</a>
</td></tr></table>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${SANS};font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:${BRAND.faint};">Top Tier Transitions · Team Shoutouts</p>
</td></tr></table>
</body></html>`;

  const text = [
    "TEAM SHOUTOUT",
    `Way to go, ${first}!`,
    `${p.authorName} gave you a shoutout:`,
    "",
    `"${p.message.trim()}"`,
    `- ${p.authorName}`,
    "",
    "Thank you for everything you do for our clients and our team. This shoutout is now pinned on your Rightsize home page.",
    homeUrl,
  ].join("\n");

  return { subject, html, text };
}
