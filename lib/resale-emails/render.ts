// Resale update emails: fills a template from email-templates/resale-updates
// (via templates.generated.ts), resolves its IF blocks, and puts the internal
// review banner above it. Pure, so the preview page and the tests use the
// exact code that sends.
import { RESALE_TEMPLATES } from "./templates.generated";

export * from "./constants";
import { RESALE_EMAIL_LABEL, type ResaleEmailType } from "./constants";

export interface ResaleMergeData {
  contact_first_name: string;
  pc_first_name: string;
  listed_count: number;
  sales_channels: string;
  sales_page_link: string;
  day30_date: string;
  day60_date: string;
  window_end_date: string;
  disposition_deadline: string;
  blank_count: number;
  donate_count: number;
  return_count: number;
  sold_since_last: number;
  sold_total_count: number;
  sold_total_amount: string;
  proceeds_to_date: string;
  /** Only used in IF conditions, never printed. */
  payout_method: string;
}

export interface ResaleBanner {
  projectName: string;
  clientName: string;
  clientEmail: string;
  signedAs: string;
  trigger: string;
  anchorDate: string;
  anchorSource: string;
  flags: string[];
  projectUrl: string;
  salesUrl: string;
}

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function condition(cond: string, data: ResaleMergeData): boolean {
  const d = data as unknown as Record<string, string | number>;
  let m: RegExpMatchArray | null;
  if ((m = cond.match(/^(\w+) is blank$/)) && m[1] in d) return !String(d[m[1]] ?? "").trim();
  if ((m = cond.match(/^(\w+) > 0$/)) && m[1] in d) return Number(d[m[1]]) > 0;
  if ((m = cond.match(/^(\w+) = 0$/)) && m[1] in d) return Number(d[m[1]]) === 0;
  throw new Error(`Unknown template condition: ${cond}`);
}

/** The client-facing email: IF blocks resolved, every {{field}} filled. */
export function renderResaleBody(type: ResaleEmailType, data: ResaleMergeData): string {
  const d = data as unknown as Record<string, string | number>;
  let html: string = RESALE_TEMPLATES[type].html;
  html = html.replace(/<!--IF (.+?)-->([\s\S]*?)<!--END IF-->/g, (_, cond: string, inner: string) => (condition(cond, data) ? inner : ""));
  html = html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in d)) throw new Error(`Unknown template field: ${key}`);
    return esc(String(d[key]));
  });
  if (html.includes("{{") || html.includes("<!--")) throw new Error(`Unresolved template content in ${type}`);
  return html;
}

export function resaleSubject(type: ResaleEmailType, clientName: string): string {
  return `[Review & Forward] ${clientName} | ${RESALE_TEMPLATES[type].subject}`;
}

/** Slim internal box above the client email; delete it before forwarding. */
function bannerHtml(type: ResaleEmailType, b: ResaleBanner): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:2px 10px 2px 0;font-weight:bold;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:2px 0;">${value}</td></tr>`;
  const flags = b.flags.length
    ? `<ul style="margin:4px 0 0;padding-left:18px;color:#9A3412;">${b.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
    : `<span style="color:#166534;">None</span>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#F4F1EA;border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:16px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:2px dashed #B45309;background-color:#FFFBEB;border-collapse:separate;">
        <tr>
          <td style="padding:12px 16px;font-family:Arial, Helvetica, sans-serif;font-size:13px;line-height:1.5;color:#1C2620;text-align:left;">
            <div style="font-weight:bold;color:#B45309;margin-bottom:6px;">INTERNAL: review, then delete this box before forwarding to the client</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;font-size:13px;line-height:1.5;color:#1C2620;">
              ${row("Email", esc(RESALE_EMAIL_LABEL[type]))}
              ${row("Project", `${esc(b.projectName)} &middot; <a href="${esc(b.projectUrl)}" style="color:#1B4332;">Open in Rightsize</a>`)}
              ${row("Client", `${esc(b.clientName)}${b.clientEmail ? ` &middot; <a href="mailto:${esc(b.clientEmail)}" style="color:#1B4332;">${esc(b.clientEmail)}</a>` : " &middot; no email on file"}`)}
              ${row("Signed as", esc(b.signedAs))}
              ${row("Trigger", esc(b.trigger))}
              ${row("Anchor date", `${esc(b.anchorDate || "none")}${b.anchorSource ? ` (${esc(b.anchorSource)})` : ""}`)}
              ${row("Flags", flags)}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export function renderResaleEmail(type: ResaleEmailType, data: ResaleMergeData, banner: ResaleBanner): { subject: string; html: string } {
  const body = renderResaleBody(type, data);
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(RESALE_TEMPLATES[type].subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F1EA;">
${bannerHtml(type, banner)}
${body}
</body>
</html>`;
  return { subject: resaleSubject(type, banner.clientName), html };
}
