export function buildContractSentEmail({
  clientName,
  projectName,
  signingUrl,
  totalCost,
  lineItems,
  includeServiceHours = false,
}: {
  clientName: string;
  projectName: string;
  signingUrl: string;
  totalCost: number;
  lineItems: { serviceName: string; hours: number; description?: string }[];
  includeServiceHours?: boolean;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtHrs = (h: number) => `${Math.round(h * 10) / 10} hrs`;
  const totalHours = lineItems.reduce((s, i) => s + i.hours, 0);

  // When hours per service are hidden: true single-column table — no ghost right column.
  // When hours shown: two-column table (Service | Hrs).
  const serviceRows = lineItems
    .map(
      (item, i) => includeServiceHours
        ? `<tr${i % 2 === 1 ? ' style="background-color:#f9fafb;"' : ""}>
            <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;">
              ${item.serviceName}${item.description ? `<br><span style="font-size:12px;color:#9ca3af;">${item.description}</span>` : ""}
            </td>
            <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;text-align:right;white-space:nowrap;">${item.hours} hrs</td>
          </tr>`
        : `<tr${i % 2 === 1 ? ' style="background-color:#f9fafb;"' : ""}>
            <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;">
              ${item.serviceName}${item.description ? `<br><span style="font-size:12px;color:#9ca3af;">${item.description}</span>` : ""}
            </td>
          </tr>`
    )
    .join("");

  // Totals row: always shows hours + cost in green.
  // When single-column, nest a table inside the td for left/right alignment (email-safe).
  const totalsRow = includeServiceHours
    ? `<tr style="background-color:#f0fdf4;">
        <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:2px solid #2E6B4F;">Estimated Total</td>
        <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:2px solid #2E6B4F;text-align:right;white-space:nowrap;">${fmtHrs(totalHours)} &nbsp;&middot;&nbsp; ${fmt(totalCost)}</td>
      </tr>`
    : `<tr style="background-color:#f0fdf4;">
        <td style="padding:0;border-top:2px solid #2E6B4F;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;">Estimated Total</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;text-align:right;white-space:nowrap;">${fmtHrs(totalHours)} &nbsp;&middot;&nbsp; ${fmt(totalCost)}</td>
            </tr>
          </table>
        </td>
      </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Service Agreement — Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
              <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Service Agreement</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${clientName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                Your service agreement for <strong>${projectName}</strong> is ready for your review and signature.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
                ${includeServiceHours ? `<tr style="background-color:#f9fafb;">
                  <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Service</th>
                  <th style="padding:10px 16px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;white-space:nowrap;">Hours</th>
                </tr>` : ""}
                ${serviceRows}
                ${totalsRow}
              </table>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#2E6B4F;border-radius:8px;padding:12px 24px;">
                    <a href="${signingUrl}" style="color:#F5F0E8;font-size:15px;font-weight:bold;text-decoration:none;">Review &amp; Sign Agreement</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                If you have any questions, reply to this email or contact your Top Tier Transitions coordinator.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions &mdash; Service Agreement</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildContractSignedEmail({
  salesRepName,
  clientName,
  projectName,
  signedAt,
  totalCost,
  lineItems,
  originAddress,
  destAddress,
}: {
  salesRepName?: string;
  clientName: string;
  projectName: string;
  signedAt: string;
  totalCost: number;
  lineItems?: { serviceName: string; hours: number; rate: number }[];
  originAddress?: string;
  destAddress?: string;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtHrs = (h: number) => `${Math.round(h * 10) / 10} hr${Math.round(h * 10) / 10 === 1 ? "" : "s"}`;
  const signedDate = new Date(signedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const totalHours = (lineItems ?? []).reduce((s, li) => s + li.hours, 0);

  const serviceRows = (lineItems ?? []).map((li, i) =>
    `<tr${i % 2 === 1 ? ' style="background-color:#f9fafb;"' : ""}>
      <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;">${li.serviceName}</td>
      <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-top:1px solid #e5e7eb;text-align:right;white-space:nowrap;">${fmtHrs(li.hours)}</td>
      <td style="padding:10px 16px;font-size:14px;color:#374151;font-weight:600;border-top:1px solid #e5e7eb;text-align:right;white-space:nowrap;">${fmt(li.hours * li.rate)}</td>
    </tr>`
  ).join("");

  const addressRows = [
    originAddress ? `<tr><td style="padding:8px 16px;font-size:13px;color:#6b7280;width:90px;">From</td><td style="padding:8px 16px;font-size:13px;color:#374151;">${originAddress}</td></tr>` : "",
    destAddress ? `<tr style="background-color:#f9fafb;"><td style="padding:8px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">To</td><td style="padding:8px 16px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;">${destAddress}</td></tr>` : "",
  ].filter(Boolean).join("");

  const repLine = salesRepName
    ? `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Shoutout to <strong style="color:#2E6B4F;">${salesRepName}</strong> for closing this one!</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Win — Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
              <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">New Signed Agreement</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px 32px 0;border-radius:0;">
              <!-- WIN banner -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1a4731 0%,#2E6B4F 100%);border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:22px 24px;">
                    <p style="margin:0 0 4px;font-size:28px;font-weight:bold;color:#ffffff;letter-spacing:-0.5px;">We got the deal!</p>
                    <p style="margin:0;font-size:15px;color:#a8d4bc;">${projectName} &mdash; signed ${signedDate}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
                <strong>${clientName}</strong> just signed the service agreement for <strong>${projectName}</strong>.
              </p>
              ${repLine}

              <!-- Contract value summary -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
                <tr style="background-color:#f0fdf4;">
                  <td style="padding:14px 16px;font-size:15px;font-weight:bold;color:#2E6B4F;">Contract Value</td>
                  <td style="padding:14px 16px;font-size:20px;font-weight:bold;color:#2E6B4F;text-align:right;">${fmt(totalCost)}</td>
                </tr>
                ${totalHours > 0 ? `<tr><td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Total Estimated Hours</td><td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:600;text-align:right;border-top:1px solid #e5e7eb;">${fmtHrs(totalHours)}</td></tr>` : ""}
              </table>

              ${serviceRows ? `<!-- Hours by service line -->
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Scope of Work</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
                <tr style="background-color:#f9fafb;">
                  <th style="padding:9px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Service</th>
                  <th style="padding:9px 16px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Hours</th>
                  <th style="padding:9px 16px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Value</th>
                </tr>
                ${serviceRows}
              </table>` : ""}

              ${addressRows ? `<!-- Addresses -->
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Locations</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
                ${addressRows}
              </table>` : ""}
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:0 32px 32px;border-radius:0 0 12px 12px;">
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">Log in to the admin console to view the signed contract and take next steps.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions &mdash; Internal Win Notification</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildInvoiceEmail({
  invoiceNumber,
  tenantName,
  type,
  amount,
  serviceName,
  payUrl,
  companyName,
  logoUrl,
  lineItems,
}: {
  invoiceNumber: string;
  tenantName: string;
  type: string;
  amount: number;
  serviceName: string;
  payUrl: string;
  companyName: string;
  logoUrl?: string;
  lineItems?: { serviceName: string; hours: number; rate: number }[];
}): string {
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const logoSection = logoUrl
    ? `<tr><td style="padding:0 0 16px;"><img src="${logoUrl}" alt="${companyName}" style="max-height:60px;max-width:200px;object-fit:contain;" /></td></tr>`
    : "";

  // Build detailed line-item table for Full invoices
  const positiveItems = (lineItems ?? []).filter((li) => li.rate >= 0);
  const creditItems = (lineItems ?? []).filter((li) => li.rate < 0);
  const hasLineItems = positiveItems.length > 0;
  const hasCredits = creditItems.length > 0;
  const subtotal = positiveItems.reduce((s, li) => s + li.hours * li.rate, 0);
  const totalLabel = hasCredits ? "Balance Owed" : "Total Due";

  const lineItemRows = hasLineItems
    ? positiveItems
        .map(
          (li, i) =>
            `<tr${i % 2 === 1 ? ' style="background-color:#f9fafb;"' : ""}>
              <td style="padding:9px 14px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;">${li.serviceName}</td>
              <td style="padding:9px 14px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;text-align:right;">${li.hours % 1 === 0 ? li.hours : li.hours.toFixed(2)}</td>
              <td style="padding:9px 14px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;text-align:right;">${fmt(li.rate)}</td>
              <td style="padding:9px 14px;font-size:13px;color:#374151;font-weight:600;border-top:1px solid #e5e7eb;text-align:right;">${fmt(li.hours * li.rate)}</td>
            </tr>`
        )
        .join("")
    : "";

  const subtotalRow = hasCredits
    ? `<tr style="background-color:#f9fafb;">
        <td colspan="3" style="padding:9px 14px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Subtotal</td>
        <td style="padding:9px 14px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;text-align:right;">${fmt(subtotal)}</td>
      </tr>`
    : "";

  const creditRows = creditItems
    .map(
      (li) =>
        `<tr style="background-color:#eff6ff;">
          <td colspan="3" style="padding:9px 14px;font-size:13px;color:#1d4ed8;font-style:italic;border-top:1px solid #dbeafe;">${li.serviceName}</td>
          <td style="padding:9px 14px;font-size:13px;color:#1d4ed8;font-style:italic;border-top:1px solid #dbeafe;text-align:right;">-${fmt(Math.abs(li.hours * li.rate))}</td>
        </tr>`
    )
    .join("");

  const detailedTable = hasLineItems
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
        <tr style="background-color:#f9fafb;">
          <th style="padding:9px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Service</th>
          <th style="padding:9px 14px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Hrs</th>
          <th style="padding:9px 14px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Rate</th>
          <th style="padding:9px 14px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Amount</th>
        </tr>
        ${lineItemRows}
        ${subtotalRow}
        ${creditRows}
        <tr style="background-color:#f0fdf4;">
          <td colspan="3" style="padding:12px 14px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:2px solid #2E6B4F;">${totalLabel}</td>
          <td style="padding:12px 14px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:2px solid #2E6B4F;text-align:right;">${fmt(amount)}</td>
        </tr>
      </table>`
    : `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
        <tr style="background-color:#f9fafb;">
          <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Service</th>
          <th style="padding:10px 16px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Amount Due</th>
        </tr>
        <tr>
          <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;">${serviceName}</td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;text-align:right;">${invoiceNumber}</td>
        </tr>
        <tr style="background-color:#f0fdf4;">
          <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:2px solid #2E6B4F;">Total Due</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:2px solid #2E6B4F;text-align:right;">${fmt(amount)}</td>
        </tr>
      </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">${companyName}</p>
              <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Invoice ${invoiceNumber}</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              ${logoSection}
              <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${tenantName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                You have a new <strong>${type} Invoice</strong> ready for payment.
              </p>
              ${detailedTable}
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#2E6B4F;border-radius:8px;padding:12px 24px;">
                    <a href="${payUrl}" style="color:#F5F0E8;font-size:15px;font-weight:bold;text-decoration:none;">Pay Now</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                If you have any questions, reply to this email or contact your coordinator.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">${companyName} &mdash; Invoice</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildClientWelcomeEmail({
  projectName,
  inviteUrl,
}: {
  projectName: string;
  inviteUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Project Is Ready — Rightsize by Top Tier</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
            <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Rightsize</p>
            <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">by Top Tier Transitions</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Your project is ready.</p>
            <p style="margin:0 0 24px;font-size:15px;color:#4B5563;line-height:1.6;">
              The Top Tier Transitions team has set up your <strong>${projectName}</strong> project.
              Here&rsquo;s what you&rsquo;ll find inside:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #F3F4F6;">
                  <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">Plan</p>
                  <p style="margin:3px 0 0;font-size:13px;color:#6B7280;">Your daily move schedule and project timeline at a glance</p>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #F3F4F6;">
                  <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">Catalog</p>
                  <p style="margin:3px 0 0;font-size:13px;color:#6B7280;">Browse every item being managed &mdash; photos, values, and destination</p>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #F3F4F6;">
                  <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">Vendors</p>
                  <p style="margin:3px 0 0;font-size:13px;color:#6B7280;">See which local vendors and specialists are working your project</p>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;">
                  <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">Sales &amp; Consignment</p>
                  <p style="margin:3px 0 0;font-size:13px;color:#6B7280;">Track items headed to marketplace and watch your proceeds grow</p>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background-color:#2E6B4F;border-radius:10px;">
                  <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                    Access Your Project &rarr;
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 4px;font-size:13px;color:#9CA3AF;">Or copy this link into your browser:</p>
            <p style="margin:0;font-size:12px;color:#6B7280;word-break:break-all;">${inviteUrl}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">
              This invite expires in 7 days. &mdash; Top Tier Transitions &middot; Rightsize Client Portal
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildVendorFileEmail({
  vendorName,
  itemCount,
  portalUrl,
  companyName = "Top Tier Transitions",
  items,
}: {
  vendorName: string;
  itemCount: number;
  portalUrl: string;
  companyName?: string;
  items: Array<{ itemName: string; valueMid: number; category: string }>;
}): string {
  const itemWord = itemCount === 1 ? "item" : "items";
  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:7px 0;border-bottom:1px solid #F3F4F6;font-size:14px;color:#374151;">${item.itemName}</td>
        <td style="padding:7px 0;border-bottom:1px solid #F3F4F6;font-size:13px;color:#6B7280;text-align:right;">
          ${item.category || ""}${item.valueMid > 0 ? ` &middot; $${item.valueMid.toLocaleString()}` : ""}
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vendor Item File</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">${companyName}</p>
              <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Vendor Item Report</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${vendorName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                Please find attached a PDF report with <strong>${itemCount} ${itemWord}</strong> we'd like you to review.
                You can also review and respond to items directly in your portal.
              </p>
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
                <thead>
                  <tr>
                    <th style="text-align:left;font-size:11px;font-weight:600;color:#9CA3AF;padding-bottom:6px;border-bottom:2px solid #F3F4F6;letter-spacing:0.5px;">ITEM</th>
                    <th style="text-align:right;font-size:11px;font-weight:600;color:#9CA3AF;padding-bottom:6px;border-bottom:2px solid #F3F4F6;letter-spacing:0.5px;">DETAILS</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
              </table>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#2E6B4F;border-radius:8px;padding:12px 24px;">
                    <a href="${portalUrl}" style="color:#F5F0E8;font-size:15px;font-weight:bold;text-decoration:none;">
                      Review Items in Portal &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
                The full item report with photos is attached as a PDF. If you have questions, reply to this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">${companyName} &mdash; Vendor Item Report</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildVendorAssignmentEmail({
  vendorName,
  itemCount,
  portalUrl,
}: {
  vendorName: string;
  itemCount: number;
  portalUrl: string;
}): string {
  const itemWord = itemCount === 1 ? "item" : "items";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Items for Review</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">
                Top Tier Transitions
              </p>
              <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">
                Vendor Portal
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">
                Hi ${vendorName},
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                You have <strong>${itemCount} new ${itemWord}</strong> waiting for your review in the Top Tier Transitions Vendor Portal.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#2E6B4F;border-radius:8px;padding:12px 24px;">
                    <a href="${portalUrl}" style="color:#F5F0E8;font-size:15px;font-weight:bold;text-decoration:none;">
                      Review Items in Portal
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
                If you have any questions, reply to this email or contact your Top Tier Transitions coordinator.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Top Tier Transitions &mdash; Vendor Portal Notification
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildPayoutEmail({
  clientName,
  total,
  itemCount,
  date,
  companyName,
}: {
  clientName: string;
  total: number;
  itemCount: number;
  date: string;
  companyName: string;
}): string {
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const itemWord = itemCount === 1 ? "item" : "items";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Payout Statement</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">${companyName}</p>
              <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Payout Statement</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${clientName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                Please find attached your payout statement dated <strong>${date}</strong>.
                It reflects your share of proceeds from <strong>${itemCount} ${itemWord}</strong> sold on your behalf.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
                <tr style="background-color:#f0fdf4;">
                  <td style="padding:14px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;">Total Payout</td>
                  <td style="padding:14px 16px;font-size:18px;font-weight:bold;color:#2E6B4F;text-align:right;">${fmt(total)}</td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                The full breakdown is attached as a PDF. If you have any questions, reply to this email or contact your ${companyName} coordinator.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">${companyName} &mdash; Payout Statement</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Staff Welcome Email ───────────────────────────────────────────────────────
export function buildStaffWelcomeEmail({
  firstName,
  roleLabel,
  signInUrl,
}: {
  firstName: string;
  roleLabel: string;
  signInUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background-color:#1a3d2b;padding:32px 36px;border-radius:14px 14px 0 0;">
            <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;opacity:0.6;">Top Tier Transitions</p>
            <p style="margin:8px 0 0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;">Welcome to the team.</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:#ffffff;padding:36px;border-radius:0 0 14px 14px;">

            <p style="margin:0 0 20px;font-size:16px;color:#111827;line-height:1.6;">Hi ${firstName},</p>
            <p style="margin:0 0 28px;font-size:15px;color:#4B5563;line-height:1.7;">
              You&rsquo;ve been added to the <strong style="color:#111827;">Top Tier Transitions</strong> internal team
              as a <strong style="color:#111827;">${roleLabel}</strong>. Click below to confirm your account
              and get into your portal &mdash; no password setup required.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
              <tr>
                <td style="background-color:#2E6B4F;border-radius:10px;">
                  <a href="${signInUrl}"
                     style="display:inline-block;padding:15px 36px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:-0.2px;">
                    Get Started &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <!-- What's inside -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;margin-bottom:28px;">
              <tr style="background-color:#F9FAFB;">
                <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;">What you&rsquo;ll find inside</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-top:1px solid #E5E7EB;">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Projects &amp; Plan</p>
                  <p style="margin:3px 0 0;font-size:13px;color:#6B7280;">Browse active client projects, timelines, and daily plans</p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-top:1px solid #E5E7EB;background-color:#FAFAFA;">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Item Catalog</p>
                  <p style="margin:3px 0 0;font-size:13px;color:#6B7280;">Catalog, route, and manage items across all projects</p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-top:1px solid #E5E7EB;">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Time Tracking &amp; Sales</p>
                  <p style="margin:3px 0 0;font-size:13px;color:#6B7280;">Log hours, track consignment sales, and manage payouts</p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 6px;font-size:13px;color:#9CA3AF;">Or copy this link into your browser:</p>
            <p style="margin:0 0 28px;font-size:12px;color:#6B7280;word-break:break-all;font-family:monospace;">${signInUrl}</p>

            <p style="margin:0;font-size:12px;color:#D1D5DB;text-align:center;">This link expires in 7 days and can only be used once.</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">Top Tier Transitions &mdash; Internal Staff Portal</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Drip Campaign Email Builder ───────────────────────────────────────────────
export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

export function buildDripEmail({
  settings,
  bodyHtml,
  subject,
  unsubscribeUrl,
  vars,
}: {
  settings: {
    senderName: string;
    companyName: string;
    companyTagline: string;
    companyAddress: string;
    primaryColor: string;
    logoUrl: string;
    signatureHtml: string;
  };
  bodyHtml: string;
  subject: string;
  unsubscribeUrl: string;
  vars: Record<string, string>;
}): string {
  const color = settings.primaryColor || "#2E6B4F";
  const resolvedBody = substituteVars(bodyHtml, vars);
  // Convert plain-text newlines to HTML paragraphs if no block tags present
  const hasBlockTags = /<(p|div|h[1-6]|ul|ol|table)\b/i.test(resolvedBody);
  const formattedBody = hasBlockTags
    ? resolvedBody
    : resolvedBody
        .split(/\n\n+/)
        .map(para => `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">${para.replace(/\n/g, "<br/>")}</p>`)
        .join("");

  const logoBlock = settings.logoUrl
    ? `<img src="${settings.logoUrl}" alt="${settings.companyName}" style="max-height:48px;max-width:180px;object-fit:contain;display:block;margin-bottom:12px;" />`
    : "";

  const sigBlock = settings.signatureHtml
    ? `<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;line-height:1.6;">${substituteVars(settings.signatureHtml, vars)}</div>`
    : `<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
        <strong style="color:#374151;">${vars.sender_name || settings.senderName}</strong><br/>
        ${settings.companyName}${settings.companyTagline ? `<br/><em>${settings.companyTagline}</em>` : ""}
       </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background-color:${color};padding:24px 32px;border-radius:12px 12px 0 0;">
            ${logoBlock}
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:-0.3px;">${settings.companyName}</p>
            ${settings.companyTagline ? `<p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;">${settings.companyTagline}</p>` : ""}
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
            ${formattedBody}
            ${sigBlock}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 0;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
              ${settings.companyName}${settings.companyAddress ? ` · ${settings.companyAddress}` : ""}<br/>
              <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Time Off Notification Email ──────────────────────────────────────────────
export function buildTimeOffEmail({
  staffName,
  entries,
  opsUrl,
}: {
  staffName: string;
  entries: Array<{ date: string; allDay: boolean; startTime?: string; endTime?: string }>;
  opsUrl: string;
}): string {
  function fmt12h(t: string) {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
  }
  function fmtDate(d: string) {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }
  const dateRows = entries.map((e) => {
    const timeStr = e.allDay ? "All Day"
      : e.startTime ? `${fmt12h(e.startTime)}${e.endTime ? ` \u2013 ${fmt12h(e.endTime)}` : ""}` : "All Day";
    return `<tr>
      <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;">${fmtDate(e.date)}</td>
      <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-top:1px solid #e5e7eb;text-align:right;">${timeStr}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Time Off Notice \u2014 ${staffName}</title></head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
            <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
            <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Team Availability Notice</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
            <p style="margin:0 0 8px;font-size:16px;color:#1a1a1a;font-weight:bold;">Hi there,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Just a heads up \u2014 <strong>${staffName}</strong> has marked the following date${entries.length > 1 ? "s" : ""} as unavailable:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
              <tr style="background-color:#f9fafb;">
                <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Date</th>
                <th style="padding:10px 16px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Time</th>
              </tr>
              ${dateRows}
            </table>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              No action required \u2014 this is a courtesy notification to help with scheduling.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background-color:#2E6B4F;border-radius:8px;padding:13px 28px;">
                  <a href="${opsUrl}" style="color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Review Team Availability \u2192</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions \u2014 Internal Notification</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Estate Sale Pickup Details Email ────────────────────────────────────────
// Sent to buyers the morning of (or day prior) with everything they need for pickup.

export interface PickupDetailsEmailParams {
  buyerName: string;
  buyerEmail: string;
  estateName: string;
  cityRegion?: string;
  items: Array<{
    itemName: string;
    purchaseAmount: number;
    photoUrl?: string;
  }>;
  pickupAddress?: string;
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  pickupWindowStartTime?: string;
  pickupWindowEndTime?: string;
  contactEmail?: string;
  contactPhone?: string;
  terms?: string;
  pickupNotes?: string;
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function fmtPickupDate(d: string): string {
  if (!d) return "";
  const parts = d.slice(0, 10).split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function buildPickupDateRange(
  start?: string, end?: string,
  startTime?: string, endTime?: string
): string {
  if (!start && !end) return "";
  const isMultiDay = !!(start && end && start !== end);
  let s = "";
  if (isMultiDay) s = `${fmtPickupDate(start!)} \u2013 ${fmtPickupDate(end!)}`;
  else s = fmtPickupDate(start || end || "");
  if (startTime && endTime) s += isMultiDay ? `\n${startTime} \u2013 ${endTime} each day` : `\n${startTime} \u2013 ${endTime}`;
  else if (startTime) s += isMultiDay ? `\nFrom ${startTime} each day` : `\nFrom ${startTime}`;
  else if (endTime) s += isMultiDay ? `\nUntil ${endTime} each day` : `\nUntil ${endTime}`;
  return s;
}

const IL_TAX_RATE = 0.1025; // Illinois/Chicago 10.25%

export function buildPickupDetailsEmail(p: PickupDetailsEmailParams): string {
  const firstName = p.buyerName.split(" ")[0] || p.buyerName;
  const pickupRange = buildPickupDateRange(
    p.pickupWindowStart, p.pickupWindowEnd,
    p.pickupWindowStartTime, p.pickupWindowEndTime
  );

  const itemRows = p.items.map(item => {
    const photo = item.photoUrl
      ? `<td width="60" style="vertical-align:top;padding-right:14px;">
           <img src="${item.photoUrl}" alt="${item.itemName}" width="60" height="60"
             style="display:block;width:60px;height:60px;object-fit:cover;border-radius:6px;border:0;" />
         </td>`
      : `<td width="60" style="vertical-align:top;padding-right:14px;">
           <div style="width:60px;height:60px;background:#EEEBE6;border-radius:6px;"></div>
         </td>`;
    return `
      <tr>
        ${photo}
        <td style="vertical-align:middle;">
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:400;color:#2C2C2C;line-height:1.3;">
            ${item.itemName}
          </p>
        </td>
        <td align="right" style="vertical-align:middle;white-space:nowrap;padding-left:12px;">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#2C2C2C;">${fmtCurrency(item.purchaseAmount)}</span>
        </td>
      </tr>
      <tr><td colspan="3" style="padding:10px 0 0;"><div style="height:1px;background:#EEEBE6;"></div></td></tr>
    `;
  }).join("");

  const subtotal = p.items.reduce((s, i) => s + i.purchaseAmount, 0);
  const taxAmount = Math.round(subtotal * IL_TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pickup Details \u2014 ProFound Finds</title>
</head>
<body style="margin:0;padding:0;background:#F0EDE8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0EDE8;padding:32px 16px 48px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <!-- Brand header -->
          <tr>
            <td style="padding:0 0 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400;color:#2C2C2C;letter-spacing:0.03em;">ProFound Finds</span>
                  </td>
                  <td align="right">
                    <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#B8960C;">
                      Pickup Details
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:#FAF8F5;border-radius:14px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.07);">
              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Gold accent bar -->
                <tr>
                  <td style="padding:0;background:#B8960C;height:5px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>

                <!-- Greeting -->
                <tr>
                  <td style="padding:32px 36px 8px;">
                    <p style="margin:0 0 4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#B8960C;">
                      Important Pickup Information
                    </p>
                    <h1 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:400;color:#2C2C2C;line-height:1.2;">
                      Hi ${firstName}, you&rsquo;re all set!
                    </h1>
                    <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#555;line-height:1.65;">
                      Your ${p.items.length === 1 ? "item is" : `${p.items.length} items are`} ready for pickup from the <strong style="color:#2C2C2C;">${p.estateName}</strong> estate sale. Here is everything you need.
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr><td style="padding:20px 36px 0;"><div style="height:1px;background:#EEEBE6;"></div></td></tr>

                <!-- Your Items -->
                <tr>
                  <td style="padding:24px 36px;">
                    <p style="margin:0 0 16px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#999;">
                      ${p.items.length === 1 ? "Your Item" : "Your Items"}
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${itemRows}
                      <tr>
                        <td colspan="2" style="padding-top:12px;">
                          <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#888;">Subtotal</p>
                        </td>
                        <td align="right" style="padding-top:12px;white-space:nowrap;padding-left:12px;">
                          <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#888;">${fmtCurrency(subtotal)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top:6px;">
                          <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#888;">Illinois Tax (10.25%)</p>
                        </td>
                        <td align="right" style="padding-top:6px;white-space:nowrap;padding-left:12px;">
                          <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#888;">${fmtCurrency(taxAmount)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top:8px;border-top:1px solid #EEEBE6;">
                          <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#555;">Total Paid</p>
                        </td>
                        <td align="right" style="padding-top:8px;white-space:nowrap;padding-left:12px;border-top:1px solid #EEEBE6;">
                          <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#2C2C2C;">${fmtCurrency(total)}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Divider -->
                <tr><td style="padding:0 36px;"><div style="height:1px;background:#EEEBE6;"></div></td></tr>

                <!-- Pickup Location -->
                <tr>
                  <td style="padding:24px 36px;">
                    <p style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#999;">
                      Pickup Time and Location
                    </p>
                    <table cellpadding="0" cellspacing="0" style="background:#FDF9EE;border-radius:10px;overflow:hidden;width:100%;">
                      <tr>
                        <td style="width:4px;padding:0;background:#B8960C;border-radius:10px 0 0 10px;font-size:0;">&nbsp;</td>
                        <td style="padding:18px 22px;">
                          ${p.pickupAddress ? `
                          <p style="margin:0 0 ${pickupRange ? "12px" : "0"};font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#2C2C2C;line-height:1.5;">
                            ${p.pickupAddress.replace(/,\s*/g, "<br/>")}
                          </p>` : ""}
                          ${pickupRange ? `
                          <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#666;line-height:1.8;white-space:pre-line;">
                            ${pickupRange}
                          </p>` : ""}
                          ${!p.pickupAddress && !pickupRange ? `
                          <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#555;line-height:1.6;">
                            Our team will share the full pickup details shortly.
                          </p>` : ""}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${p.pickupNotes ? `
                <!-- Divider -->
                <tr><td style="padding:0 36px;"><div style="height:1px;background:#EEEBE6;"></div></td></tr>

                <!-- Pickup Notes -->
                <tr>
                  <td style="padding:24px 36px;">
                    <p style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#999;">
                      Additional Pickup Notes
                    </p>
                    <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#555;line-height:1.75;white-space:pre-line;">
                      ${p.pickupNotes}
                    </p>
                  </td>
                </tr>` : ""}

                ${(p.contactEmail || p.contactPhone) ? `
                <!-- Divider -->
                <tr><td style="padding:0 36px;"><div style="height:1px;background:#EEEBE6;"></div></td></tr>

                <!-- Day-of Contact -->
                <tr>
                  <td style="padding:24px 36px;">
                    <p style="margin:0 0 14px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#999;">
                      Day-of Contact
                    </p>
                    <table cellpadding="0" cellspacing="0" style="background:#F5F2EE;border-radius:10px;overflow:hidden;width:100%;">
                      <tr>
                        <td style="width:4px;padding:0;background:#7A9E7E;border-radius:10px 0 0 10px;font-size:0;">&nbsp;</td>
                        <td style="padding:16px 22px;">
                          <p style="margin:0 0 6px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#555;line-height:1.6;">
                            Have a question or need help on pickup day?
                          </p>
                          <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;color:#2C2C2C;line-height:1.8;">
                            ${p.contactEmail ? `<a href="mailto:${p.contactEmail}" style="color:#7A9E7E;text-decoration:none;font-weight:500;">${p.contactEmail}</a>` : ""}
                            ${p.contactEmail && p.contactPhone ? `<span style="color:#CCC;margin:0 10px;">&middot;</span>` : ""}
                            ${p.contactPhone ? `<a href="tel:${p.contactPhone.replace(/\D/g, "")}" style="color:#7A9E7E;text-decoration:none;font-weight:500;">${p.contactPhone}</a>` : ""}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>` : ""}

                ${p.terms ? `
                <!-- Divider -->
                <tr><td style="padding:0 36px;"><div style="height:1px;background:#EEEBE6;"></div></td></tr>

                <!-- Terms -->
                <tr>
                  <td style="padding:22px 36px 32px;">
                    <p style="margin:0 0 10px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#bbb;">
                      Sale Terms &amp; Conditions
                    </p>
                    <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#aaa;line-height:1.75;white-space:pre-line;">
                      ${p.terms}
                    </p>
                  </td>
                </tr>` : `
                <tr><td style="padding-bottom:32px;"></td></tr>`}

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;">
              <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#999;text-align:center;line-height:1.7;">
                All sales are final &nbsp;&middot;&nbsp; Illinois sales tax applied<br/>
                Questions? <a href="mailto:hello@profoundfinds.com" style="color:#7A9E7E;text-decoration:none;">hello@profoundfinds.com</a>
                &nbsp;&middot;&nbsp; <a href="tel:3126003016" style="color:#7A9E7E;text-decoration:none;">312-600-3016</a>
              </p>
              <p style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:11px;color:#bbb;text-align:center;letter-spacing:0.05em;">
                ProFound Finds &mdash; Chicago, IL
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── New User Admin Notification Email ───────────────────────────────────────
export function buildNewUserAdminEmail({
  fullName,
  email,
  imageUrl,
  userType,
  roleLabel,
  projectName,
  projectAddress,
  createdAt,
}: {
  fullName: string;
  email: string;
  imageUrl?: string | null;
  userType: "client" | "staff" | "unknown";
  roleLabel: string;
  projectName?: string | null;
  projectAddress?: string | null;
  createdAt: string;
}): string {
  const typeBadge =
    userType === "staff"
      ? { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a", label: "TTT Staff" }
      : userType === "client"
      ? { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46", label: "Client" }
      : { bg: "#f3f4f6", border: "#d1d5db", text: "#374151", label: "New User" };

  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  const avatarHtml = imageUrl
    ? `<img src="${imageUrl}" alt="${fullName}" width="64" height="64" style="border-radius:50%;display:block;object-fit:cover;border:3px solid #e5e7eb;" />`
    : `<table cellpadding="0" cellspacing="0"><tr><td style="width:64px;height:64px;border-radius:50%;background:#2E6B4F;font-size:22px;font-weight:700;color:#ffffff;text-align:center;line-height:64px;">${initials}</td></tr></table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New User — Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background-color:#1a3d2b;padding:28px 32px;border-radius:14px 14px 0 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#a8d4bc;">Top Tier Transitions</p>
                  <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">New User Account</p>
                </td>
                <td align="right" style="vertical-align:top;">
                  <p style="margin:0;font-size:12px;color:#a8d4bc;">${createdAt}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 14px 14px;">
            <table width="100%" cellpadding="0" cellspacing="0">

              <!-- User card -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding-right:18px;vertical-align:middle;">${avatarHtml}</td>
                            <td style="vertical-align:middle;">
                              <span style="display:inline-block;background:${typeBadge.bg};border:1px solid ${typeBadge.border};color:${typeBadge.text};font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px;margin-bottom:6px;">${typeBadge.label}</span>
                              <p style="margin:0;font-size:19px;font-weight:700;color:#111827;line-height:1.2;">${fullName}</p>
                              <p style="margin:4px 0 0;font-size:14px;"><a href="mailto:${email}" style="color:#2E6B4F;text-decoration:none;">${email}</a></p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Details rows -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                    <tr style="background:#f9fafb;">
                      <td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e5e7eb;">Account Details</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f3f4f6;">
                      <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;width:38%;">Role</td>
                      <td style="padding:12px 16px;font-size:13px;color:#111827;">${roleLabel}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f3f4f6;">
                      <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;">Email</td>
                      <td style="padding:12px 16px;font-size:13px;color:#111827;">${email}</td>
                    </tr>
                    <tr style="${projectAddress ? "border-bottom:1px solid #f3f4f6;" : ""}">
                      <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;">Project</td>
                      <td style="padding:12px 16px;font-size:13px;color:${projectName ? "#111827" : "#9ca3af"};${projectName ? "" : "font-style:italic;"}">${projectName ?? "No project yet"}</td>
                    </tr>
                    ${projectAddress ? `
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;vertical-align:top;">Address</td>
                      <td style="padding:12px 16px;font-size:13px;color:#111827;">${projectAddress}</td>
                    </tr>` : ""}
                  </table>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td style="padding:0 0 24px;">
                  <a href="https://app.toptiertransitions.com/admin/users"
                     style="display:block;background:#2E6B4F;color:#ffffff;font-size:14px;font-weight:700;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;">
                    View Users in Admin →
                  </a>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="border-top:1px solid #e5e7eb;padding-top:20px;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">Top Tier Transitions &nbsp;·&nbsp; <a href="https://app.toptiertransitions.com" style="color:#2E6B4F;text-decoration:none;">app.toptiertransitions.com</a></p>
                  <p style="margin:4px 0 0;font-size:11px;color:#d1d5db;text-align:center;">Sent automatically when a new account is created.</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Subcontractor Added Notification ────────────────────────────────────────
export function buildSubcontractorAddedEmail({
  addedByName,
  subName,
  charges,
  project,
  scope,
  date,
  fileUrl,
  appUrl,
}: {
  addedByName: string;
  subName: string;
  charges: number;
  project?: string;
  scope?: string;
  date: string;
  fileUrl?: string;
  appUrl: string;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:120px;vertical-align:top;">${label}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${value}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td style="background:#2E6B4F;border-radius:16px 16px 0 0;padding:28px 32px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#F5F0E8;">Top Tier Transitions</p>
            <p style="margin:6px 0 0;font-size:13px;color:#a8d4bc;">New Subcontractor Entry</p>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px 32px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;">
              <strong>${addedByName}</strong> added a new subcontractor entry on <strong>${date}</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e5e7eb;padding-top:16px;">
              <tbody>
                ${row("Name", subName)}
                ${row("Amount", fmt(charges))}
                ${project ? row("Project", project) : ""}
                ${scope ? row("Scope", scope) : ""}
                ${fileUrl ? row("File", `<a href="${fileUrl}" style="color:#2E6B4F;">View attached file</a>`) : ""}
              </tbody>
            </table>
            <div style="margin-top:24px;">
              <a href="${appUrl}/staff?tab=subcontractors"
                 style="display:inline-block;background:#2E6B4F;color:#ffffff;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;">
                View in Rightsize
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0;text-align:center;font-size:11px;color:#9ca3af;">
            Rightsize &middot; Top Tier Transitions
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export type ReferralPipelineRow = {
  priority: string;
  ownerName: string;
  companyName: string;
  contactName: string;
  contactTitle?: string;
  stage: string;
  lastActivityDate?: string;
  activityCount: number;
  nextStepDate?: string;
  nextStepNote?: string;
};

export function buildReferralPipelineEmail({
  rows,
  generatedAt,
}: {
  rows: ReferralPipelineRow[];
  generatedAt: string;
}): string {
  const STAGE_ORDER = ["Shared Leads", "Agreed to Refer", "Met", "Identified"];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const in7Days = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  function rowBg(nextStepDate?: string): string {
    if (!nextStepDate) return "#ffffff";
    if (nextStepDate < todayStr) return "#FEF2F2";
    if (nextStepDate <= in7Days) return "#FFFBEB";
    return "#ffffff";
  }

  function fmtDate(d?: string): string {
    if (!d) return "—";
    const [y, m, day] = d.slice(0, 10).split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}`;
  }

  const PRIORITY_BADGE: Record<string, string> = {
    High: "background:#fee2e2;color:#b91c1c;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;",
    Medium: "background:#fef9c3;color:#92400e;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;",
    Low: "background:#f3f4f6;color:#6b7280;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;",
  };

  // Split into high/medium and low buckets, each grouped by stage
  const hmByStage = new Map<string, ReferralPipelineRow[]>();
  const lowByStage = new Map<string, ReferralPipelineRow[]>();
  for (const stage of STAGE_ORDER) {
    hmByStage.set(stage, []);
    lowByStage.set(stage, []);
  }
  for (const row of rows) {
    const stage = STAGE_ORDER.includes(row.stage) ? row.stage : "Identified";
    if (row.priority === "Low") lowByStage.get(stage)!.push(row);
    else hmByStage.get(stage)!.push(row);
  }
  // Within each stage group: High before Medium, then company name alpha, then contact name alpha
  const sortRows = (a: ReferralPipelineRow, b: ReferralPipelineRow) => {
    const pa = a.priority === "High" ? 0 : 1;
    const pb = b.priority === "High" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const cc = a.companyName.localeCompare(b.companyName);
    if (cc !== 0) return cc;
    return a.contactName.localeCompare(b.contactName);
  };
  for (const stage of STAGE_ORDER) {
    hmByStage.get(stage)!.sort(sortRows);
    lowByStage.get(stage)!.sort((a, b) => {
      const cc = a.companyName.localeCompare(b.companyName);
      if (cc !== 0) return cc;
      return a.contactName.localeCompare(b.contactName);
    });
  }

  const totalHM = STAGE_ORDER.reduce((s, st) => s + hmByStage.get(st)!.length, 0);
  const totalLow = STAGE_ORDER.reduce((s, st) => s + lowByStage.get(st)!.length, 0);
  const stageCounts = STAGE_ORDER.map(s => {
    const total = (hmByStage.get(s)?.length ?? 0) + (lowByStage.get(s)?.length ?? 0);
    return `${s}: <strong>${total}</strong>`;
  }).join(" &nbsp;&middot;&nbsp; ");

  function dataRow(r: ReferralPipelineRow): string {
    const bg = rowBg(r.nextStepDate);
    const badge = `<span style="${PRIORITY_BADGE[r.priority] ?? ""}">${r.priority}</span>`;
    return `<tr style="background:${bg};border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 10px;font-size:12px;white-space:nowrap;">${badge}</td>
        <td style="padding:8px 10px;font-size:12px;color:#374151;">${r.ownerName || "—"}</td>
        <td style="padding:8px 10px;font-size:12px;color:#374151;font-weight:500;">${r.companyName}</td>
        <td style="padding:8px 10px;font-size:12px;color:#374151;">${r.contactName}${r.contactTitle ? `<br><span style="color:#9ca3af;font-size:11px;">${r.contactTitle}</span>` : ""}</td>
        <td style="padding:8px 10px;font-size:12px;color:#6b7280;white-space:nowrap;">${fmtDate(r.lastActivityDate)}</td>
        <td style="padding:8px 10px;font-size:12px;color:#6b7280;text-align:center;">${r.activityCount > 0 ? r.activityCount : "—"}</td>
        <td style="padding:8px 10px;font-size:12px;color:#374151;white-space:nowrap;">${fmtDate(r.nextStepDate)}</td>
        <td style="padding:8px 10px;font-size:12px;color:#374151;max-width:180px;">${r.nextStepNote || "—"}</td>
      </tr>`;
  }

  const THEAD = `<thead>
    <tr style="background:#f9fafb;">
      <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">Priority</th>
      <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">Owner</th>
      <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">Company</th>
      <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">Contact</th>
      <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">Last Activity</th>
      <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:center;white-space:nowrap;"># Activities</th>
      <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">Next Step</th>
      <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">Next Step Note</th>
    </tr>
  </thead>`;

  function stageBlock(stage: string, stageRows: ReferralPipelineRow[], accentColor: string): string {
    if (stageRows.length === 0) return "";
    return `<tr><td style="padding:20px 0 8px;">
        <p style="margin:0;font-size:14px;font-weight:700;color:#2d4a3e;border-left:4px solid ${accentColor};padding-left:10px;">${stage} <span style="font-weight:400;color:#9ca3af;font-size:12px;">(${stageRows.length})</span></p>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          ${THEAD}
          <tbody>${stageRows.map(dataRow).join("")}
          </tbody>
        </table>
      </td></tr>`;
  }

  const hmSections = STAGE_ORDER.map(s => stageBlock(s, hmByStage.get(s)!, "#C9A96E")).join("");
  const lowSections = STAGE_ORDER.map(s => stageBlock(s, lowByStage.get(s)!, "#d1d5db")).join("");

  const lowDivider = totalLow > 0 ? `
    <tr><td style="padding:28px 0 4px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-top:2px dashed #e5e7eb;"></td>
        <td style="padding:0 12px;white-space:nowrap;font-size:12px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Low Priority Partners (${totalLow})</td>
        <td style="border-top:2px dashed #e5e7eb;"></td>
      </tr></table>
    </td></tr>
    ${lowSections}` : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:900px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);" cellpadding="0" cellspacing="0">
        <tr style="background:#2d4a3e;">
          <td style="padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;color:#C9A96E;text-transform:uppercase;">Top Tier Transitions</p>
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Referral Pipeline Report</h1>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.65);">Generated ${generatedAt} &nbsp;&middot;&nbsp; ${totalHM} high/medium &nbsp;&middot;&nbsp; ${totalLow} low</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#f0fdf4;border-bottom:1px solid #d1fae5;">
            <p style="margin:0;font-size:13px;color:#374151;">${stageCounts}</p>
          </td>
        </tr>
        <tr><td style="padding:16px 32px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${hmSections}
            ${lowDivider}
          </table>
        </td></tr>
        <tr style="background:#f9fafb;border-top:1px solid #e5e7eb;">
          <td style="padding:16px 32px;font-size:11px;color:#9ca3af;">
            Rightsize &middot; Top Tier Transitions &nbsp;&middot;&nbsp;
            Row tinting: <span style="background:#FEF2F2;padding:1px 4px;border-radius:3px;">red = overdue</span> &nbsp;
            <span style="background:#FFFBEB;padding:1px 4px;border-radius:3px;">amber = due within 7 days</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Active Referral Report Email ─────────────────────────────────────────────

export type ActiveReferralContactRow = {
  contactName: string;
  contactTitle?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyName: string;
  companyType?: string;
  priority: string;
  ownerName: string;
  lastActivityDate?: string;
  activityCount: number;
  dateIntroduced?: string;
  nextStepDate?: string;
  nextStepNote?: string;
  interests?: string;
  coffeeOrder?: string;
  orgsGroups?: string;
  notes?: string;
  totalReferred: number;
  wonCount: number;
  lostCount: number;
  activeCount: number;
  wonValue: number;
  // Company-level monthly goal performance
  monthlyGoal: number;
  pacingGoal: number;
  thisMonthCount: number;
  thisMonthValue: number;
  lastMonthCount: number;
  lastMonthValue: number;
  thisMonthReferrals: { clientName: string; city?: string; state?: string; value: number }[];
  companyId: string;
};

function fmtDateShort(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMoney(n: number): string {
  if (!n) return "$0";
  return "$" + n.toLocaleString("en-US");
}

function nextStepRowBg(dateStr: string | undefined): string {
  if (!dateStr) return "#f9fafb";
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dateStr + "T00:00:00");
  if (due < today) return "#fef2f2";
  const diff = (due.getTime() - today.getTime()) / 86400000;
  if (diff <= 7) return "#fffbeb";
  return "#f0fdf4";
}

function priorityBadge(p: string): string {
  const styles: Record<string, string> =  {
    High: "background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;",
    Medium: "background:#fffbeb;color:#b45309;border:1px solid #fde68a;",
    Low: "background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb;",
  };
  const s = styles[p] || styles.Low;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;${s}">${p} Priority</span>`;
}

export function buildActiveReferralEmail({
  rows,
  generatedAt,
  thisMonthLabel,
  lastMonthLabel,
}: {
  rows: ActiveReferralContactRow[];
  generatedAt: string;
  thisMonthLabel: string;
  lastMonthLabel: string;
}): string {

  // ── Group contacts by company, sort companies, sort contacts within each ──────
  const companyGroups = new Map<string, ActiveReferralContactRow[]>();
  for (const r of rows) {
    const arr = companyGroups.get(r.companyId) ?? [];
    arr.push(r);
    companyGroups.set(r.companyId, arr);
  }
  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const sortedCompanies = [...companyGroups.values()].sort((a, b) => {
    const pa = priorityOrder[a[0].priority] ?? 3;
    const pb = priorityOrder[b[0].priority] ?? 3;
    if (pa !== pb) return pa - pb;
    const aWon = a.reduce((s, c) => s + c.wonValue, 0);
    const bWon = b.reduce((s, c) => s + c.wonValue, 0);
    if (aWon !== bWon) return bWon - aWon;
    return a[0].companyName.localeCompare(b[0].companyName);
  });
  for (const contacts of sortedCompanies) {
    contacts.sort((a, b) => b.activityCount - a.activityCount || a.contactName.localeCompare(b.contactName));
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // ── Build one card per company ─────────────────────────────────────────────────
  const companyCards = sortedCompanies.map(contacts => {
    const first = contacts[0];
    const { companyName, companyType, priority, ownerName,
            monthlyGoal, pacingGoal, thisMonthCount, thisMonthValue,
            lastMonthCount, lastMonthValue } = first;

    // Company aggregate lifetime stats (sum across all contacts)
    const totalReferred = contacts.reduce((s, c) => s + c.totalReferred, 0);
    const wonCount     = contacts.reduce((s, c) => s + c.wonCount, 0);
    const lostCount    = contacts.reduce((s, c) => s + c.lostCount, 0);
    const activeCount  = contacts.reduce((s, c) => s + c.activeCount, 0);
    const wonValue     = contacts.reduce((s, c) => s + c.wonValue, 0);

    // Goal performance helpers
    const goal = monthlyGoal;
    const goalLabel  = goal === 0 ? "Low — no monthly goal" : `${goal}/month goal`;
    const lastMet    = goal > 0 && lastMonthCount >= goal;
    const lastColor  = goal === 0 ? "#9ca3af" : (lastMet ? "#15803d" : "#dc2626");
    const lastLabel  = goal === 0 ? `${lastMonthCount} referred` : `${lastMonthCount} of ${goal}`;
    const thisMet    = goal > 0 && thisMonthCount >= pacingGoal;
    const thisColor  = goal === 0 ? "#9ca3af" : (thisMet ? "#15803d" : "#b45309");
    const thisLabel  = goal === 0 ? `${thisMonthCount} referred` : `${thisMonthCount} of ${pacingGoal} pace`;

    // ── Contact sub-sections ────────────────────────────────────────────────────
    const contactSections = contacts.map((r, idx) => {
      const nsBg = nextStepRowBg(r.nextStepDate);
      const nsDateFormatted = r.nextStepDate ? fmtDateShort(r.nextStepDate) : null;
      const nsDate   = r.nextStepDate ? new Date(r.nextStepDate + "T00:00:00") : null;
      const nsOverdue = nsDate && nsDate < today;
      const nsSoon   = nsDate && !nsOverdue && ((nsDate.getTime() - today.getTime()) / 86400000) <= 7;

      const personalParts = [
        r.interests   ? `<span style="color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">Interests</span>&nbsp;<span style="font-size:12px;color:#374151;">${r.interests}</span>` : "",
        r.coffeeOrder ? `<span style="color:#d97706;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">Coffee</span>&nbsp;<span style="font-size:12px;color:#92400e;">${r.coffeeOrder}</span>` : "",
        r.orgsGroups  ? `<span style="color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">Orgs</span>&nbsp;<span style="font-size:12px;color:#374151;">${r.orgsGroups}</span>` : "",
      ].filter(Boolean);

      const miniStats = [
        { label: "Referred", val: String(r.totalReferred), color: "#111827" },
        { label: "Won",      val: String(r.wonCount),      color: "#15803d" },
        { label: "Lost",     val: String(r.lostCount),     color: "#dc2626" },
        { label: "Active",   val: String(r.activeCount),   color: "#2563eb" },
        { label: "Won $",    val: fmtMoney(r.wonValue),    color: "#111827" },
      ];

      return `
        <!-- ── Contact ${idx + 1}: ${r.contactName} ── -->
        <tr style="border-top:${idx === 0 ? "2px" : "1px"} solid #d1d5db;">
          <td style="padding:11px 18px 6px;background:#ffffff;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;">
                  <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">${r.contactName}${r.contactTitle ? `<span style="font-weight:400;font-size:12px;color:#6b7280;"> · ${r.contactTitle}</span>` : ""}</p>
                  <p style="margin:3px 0 0;font-size:12px;color:#6b7280;">
                    ${r.contactEmail ? `<a href="mailto:${r.contactEmail}" style="color:#2563eb;text-decoration:none;">${r.contactEmail}</a>` : ""}${r.contactEmail && r.contactPhone ? ` <span style="color:#d1d5db;">·</span> ` : ""}${r.contactPhone ? r.contactPhone : ""}${r.dateIntroduced ? ` <span style="color:#d1d5db;">·</span> <span style="color:#9ca3af;">Intro ${fmtDateShort(r.dateIntroduced)}</span>` : ""}
                  </p>
                </td>
                <td style="text-align:right;vertical-align:top;white-space:nowrap;padding-left:12px;">
                  <p style="margin:0;font-size:10px;color:#9ca3af;">Last Activity</p>
                  <p style="margin:1px 0 0;font-size:12px;font-weight:600;color:#374151;">${r.lastActivityDate ? fmtDateShort(r.lastActivityDate) : "None"}</p>
                  <p style="margin:1px 0 0;font-size:11px;color:#9ca3af;">${r.activityCount} activit${r.activityCount === 1 ? "y" : "ies"}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Next step -->
        <tr>
          <td style="padding:8px 18px;background:${(r.nextStepDate || r.nextStepNote) ? nsBg : "#fafafa"};border-bottom:1px solid #f3f4f6;">
            ${(r.nextStepDate || r.nextStepNote) ? `
              <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${nsOverdue ? "#dc2626" : nsSoon ? "#b45309" : "#15803d"};">Next Step${nsDateFormatted ? ` — ${nsDateFormatted}` : ""}${nsOverdue ? " (OVERDUE)" : nsSoon ? " (Soon)" : ""}</p>
              ${r.nextStepNote ? `<p style="margin:3px 0 0;font-size:12px;color:#374151;">${r.nextStepNote}</p>` : ""}
            ` : `
              <p style="margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#d1d5db;">No next step</p>
            `}
          </td>
        </tr>
        <!-- Personal details + notes -->
        ${personalParts.length > 0 || r.notes ? `
        <tr>
          <td style="padding:8px 18px;border-bottom:1px solid #f3f4f6;background:#ffffff;">
            ${personalParts.length > 0 ? `<p style="margin:0;font-size:12px;line-height:1.7;">${personalParts.join(' <span style="color:#e5e7eb;margin:0 2px;">·</span> ')}</p>` : ""}
            ${r.notes ? `<p style="margin:${personalParts.length > 0 ? "5px" : "0"} 0 0;font-size:12px;color:#1e40af;background:#eff6ff;padding:5px 8px;border-radius:4px;white-space:pre-line;">${r.notes}</p>` : ""}
          </td>
        </tr>` : ""}
        <!-- Mini stats bar -->
        <tr style="background:#f9fafb;">
          <td style="padding:8px 18px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                ${miniStats.map((s, i) => `${i > 0 ? '<td style="width:1px;background:#e5e7eb;"></td><td style="width:14px;"></td>' : ""}<td style="vertical-align:middle;"><p style="margin:0;font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;">${s.label}</p><p style="margin:1px 0 0;font-size:13px;font-weight:700;color:${s.color};">${s.val}</p></td>`).join("")}
              </tr>
            </table>
          </td>
        </tr>`;
    }).join("");

    return `
    <tr><td style="padding:0 0 24px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d1d5db;border-radius:12px;overflow:hidden;background:#ffffff;">

        <!-- ── Company header ── -->
        <tr style="background:#2d4a3e;">
          <td style="padding:16px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;">
                  <p style="margin:0;font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.2px;">${companyName}</p>
                  <p style="margin:3px 0 0;font-size:12px;color:#a7c4b5;">${[companyType, contacts.length > 1 ? `${contacts.length} contacts` : "1 contact"].filter(Boolean).join(" · ")}</p>
                </td>
                <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;">
                  ${priority ? priorityBadge(priority) : ""}
                  <p style="margin:6px 0 0;font-size:11px;color:#a7c4b5;">Owner: <strong style="color:#e5e7eb;">${ownerName || "Unassigned"}</strong></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Monthly referral goal ── -->
        <tr>
          <td style="padding:12px 18px;background:#f0fdf4;border-bottom:1px solid #bbf7d0;">
            <p style="margin:0 0 8px 0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#15803d;">Referral Goal — ${goalLabel}</p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;padding-right:24px;">
                  <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${lastMonthLabel}</p>
                  <p style="margin:2px 0 0;font-size:17px;font-weight:800;color:${lastColor};">${lastLabel}</p>
                  <p style="margin:1px 0 0;font-size:11px;color:${lastMonthValue > 0 ? "#6b7280" : "#d1d5db"};">${lastMonthValue > 0 ? `${fmtMoney(lastMonthValue)} value` : "No value tracked"}</p>
                </td>
                <td style="width:1px;background:#bbf7d0;"></td>
                <td style="width:18px;"></td>
                <td style="vertical-align:top;">
                  <p style="margin:0;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${thisMonthLabel} · pacing ${pacingGoal}</p>
                  <p style="margin:2px 0 0;font-size:17px;font-weight:800;color:${thisColor};">${thisLabel}</p>
                  <p style="margin:1px 0 0;font-size:11px;color:${thisMonthValue > 0 ? "#6b7280" : "#d1d5db"};">${thisMonthValue > 0 ? `${fmtMoney(thisMonthValue)} value` : "No value tracked"}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Company lifetime aggregate stats ── -->
        <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
          <td style="padding:9px 18px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                ${[
                  { label: "Total Referred", val: String(totalReferred), color: "#111827" },
                  { label: "Won",            val: String(wonCount),      color: "#15803d" },
                  { label: "Lost",           val: String(lostCount),     color: "#dc2626" },
                  { label: "Active",         val: String(activeCount),   color: "#2563eb" },
                  { label: "Won Value",      val: fmtMoney(wonValue),    color: "#111827" },
                ].map((s, i) => `${i > 0 ? '<td style="width:1px;background:#e5e7eb;"></td><td style="width:14px;"></td>' : ""}<td style="vertical-align:middle;"><p style="margin:0;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;">${s.label}</p><p style="margin:2px 0 0;font-size:14px;font-weight:700;color:${s.color};">${s.val}</p></td>`).join("")}
              </tr>
            </table>
          </td>
        </tr>

        ${contactSections}

        ${first.thisMonthReferrals.length > 0 ? `
        <!-- ── This month's referrals ── -->
        <tr style="border-top:2px solid #e5e7eb;">
          <td style="padding:10px 18px 12px;background:#fffbeb;">
            <p style="margin:0 0 7px 0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#b45309;">${thisMonthLabel} Referrals (${first.thisMonthReferrals.length})</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              ${first.thisMonthReferrals.map(ref => `
              <tr>
                <td style="padding:2px 0;font-size:12px;color:#111827;font-weight:600;">${ref.clientName}</td>
                <td style="padding:2px 0 2px 12px;font-size:12px;color:#6b7280;white-space:nowrap;">${[ref.city, ref.state].filter(Boolean).join(", ") || "—"}</td>
                <td style="padding:2px 0 2px 12px;font-size:12px;color:#374151;text-align:right;white-space:nowrap;font-weight:600;">${ref.value > 0 ? fmtMoney(ref.value) : "—"}</td>
              </tr>`).join("")}
            </table>
          </td>
        </tr>` : ""}

      </table>
    </td></tr>`;
  }).join("");

  const uniqueCompanies = sortedCompanies.length;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">

        <!-- Header -->
        <tr><td style="background:#2d4a3e;border-radius:12px 12px 0 0;padding:24px 28px;">
          <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">Active Referral Report</p>
          <p style="margin:6px 0 0;font-size:12px;color:#a7c4b5;">${uniqueCompanies} compan${uniqueCompanies !== 1 ? "ies" : "y"} · ${rows.length} active contact${rows.length !== 1 ? "s" : ""} · Generated ${generatedAt}</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#f3f4f6;padding:20px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${companyCards}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:12px 0 24px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Rightsize &middot; Top Tier Transitions &nbsp;&middot;&nbsp; Active Referral partners only</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Consignment Price Drop Email ─────────────────────────────────────────────

function cldThumb(url: string | undefined, size = 64): string {
  if (!url) return "";
  if (url.includes("/upload/")) return url.replace("/upload/", `/upload/w_${size},h_${size},c_fill,f_auto,q_auto/`);
  return url;
}

function thumbCell(url: string | undefined): string {
  const thumb = cldThumb(url);
  return `<td style="padding:8px 8px 8px 12px;width:72px;vertical-align:middle;">${
    thumb
      ? `<img src="${thumb}" width="56" height="56" alt="" style="border-radius:6px;display:block;">`
      : `<div style="width:56px;height:56px;background:#f3f4f6;border-radius:6px;"></div>`
  }</td>`;
}

export type PriceDropEmailItem = {
  itemName: string;
  primaryRoute: string;
  currentPrice: number;
  futurePrice: number;
  photoUrl?: string;
};

export function buildPriceDropEmail({
  tenantName,
  dropNumber,
  dropDate,
  dropPercent,
  items,
  generatedAt,
}: {
  tenantName: string;
  dropNumber: 1 | 2;
  dropDate: string;
  dropPercent: number;
  items: PriceDropEmailItem[];
  generatedAt: string;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const itemRows = items.map((item, i) => `
    <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};border-bottom:1px solid #e5e7eb;">
      ${thumbCell(item.photoUrl)}
      <td style="padding:12px 16px;font-size:13px;color:#111827;font-weight:500;">${item.itemName}</td>
      <td style="padding:12px 16px;font-size:12px;color:#6b7280;white-space:nowrap;">${item.primaryRoute}</td>
      <td style="padding:12px 16px;font-size:13px;color:#9ca3af;text-align:right;white-space:nowrap;text-decoration:line-through;">${fmt(item.currentPrice)}</td>
      <td style="padding:12px 16px;font-size:14px;color:#2d4a3e;font-weight:700;text-align:right;white-space:nowrap;">${fmt(item.futurePrice)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);" cellpadding="0" cellspacing="0">
        <tr style="background:#2d4a3e;">
          <td style="padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;color:#C9A96E;text-transform:uppercase;">Top Tier Transitions &nbsp;&middot;&nbsp; ${tenantName}</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Price Drop ${dropNumber} Notification</h1>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.70);">Effective ${dropDate} &nbsp;&middot;&nbsp; ${dropPercent}% reduction from listing price</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#f0fdf4;border-bottom:1px solid #d1fae5;">
            <p style="margin:0;font-size:13px;color:#374151;">
              <strong>${items.length}</strong> item${items.length === 1 ? "" : "s"} will be repriced &nbsp;&middot;&nbsp; Generated ${generatedAt}
            </p>
          </td>
        </tr>
        <tr><td style="padding:24px 32px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:10px 12px 10px 12px;width:72px;"></th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;">Item</th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">Channel</th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:right;white-space:nowrap;">Current Price</th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:right;white-space:nowrap;">New Price</th>
              </tr>
            </thead>
            <tbody>${itemRows}
            </tbody>
          </table>
        </td></tr>
        <tr style="background:#f9fafb;border-top:1px solid #e5e7eb;">
          <td style="padding:16px 32px;font-size:11px;color:#9ca3af;">
            Rightsize &middot; Top Tier Transitions &middot; This report is for internal team use.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Unsold Items Email ───────────────────────────────────────────────────────

export type UnsoldEmailItem = {
  itemName: string;
  primaryRoute: string;
  currentPrice: number;
  action: string;
  isSpecialSituation: boolean;
  photoUrl?: string;
};

export function buildUnsoldItemsEmail({
  tenantName,
  unsoldDate,
  standardPreference,
  items,
  generatedAt,
}: {
  tenantName: string;
  unsoldDate: string;
  standardPreference: string;
  items: UnsoldEmailItem[];
  generatedAt: string;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const specialCount = items.filter(i => i.isSpecialSituation).length;

  const itemRows = items.map((item, i) => {
    const actionStyle = item.isSpecialSituation
      ? "padding:10px 16px;font-size:13px;color:#b45309;font-weight:600;white-space:nowrap;"
      : "padding:10px 16px;font-size:13px;color:#374151;white-space:nowrap;";
    return `<tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};border-bottom:1px solid #e5e7eb;">
      ${thumbCell(item.photoUrl)}
      <td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:500;">${item.itemName}${item.isSpecialSituation ? " <span style=\"font-size:10px;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:4px;font-weight:600;vertical-align:middle;\">Special</span>" : ""}</td>
      <td style="padding:10px 16px;font-size:12px;color:#6b7280;white-space:nowrap;">${item.primaryRoute}</td>
      <td style="padding:10px 16px;font-size:13px;color:#374151;text-align:right;white-space:nowrap;">${fmt(item.currentPrice)}</td>
      <td style="${actionStyle}">${item.action}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);" cellpadding="0" cellspacing="0">
        <tr style="background:#2d4a3e;">
          <td style="padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;color:#C9A96E;text-transform:uppercase;">Top Tier Transitions &nbsp;&middot;&nbsp; ${tenantName}</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Unsold Items Action Summary</h1>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.70);">90-day cutoff: ${unsoldDate} &nbsp;&middot;&nbsp; Standard preference: <strong style="color:#C9A96E;">${standardPreference || "Not set"}</strong></p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#fefce8;border-bottom:1px solid #fde68a;">
            <p style="margin:0;font-size:13px;color:#374151;">
              <strong>${items.length}</strong> item${items.length === 1 ? "" : "s"} remaining
              ${specialCount > 0 ? ` &nbsp;&middot;&nbsp; <strong style="color:#b45309;">${specialCount} special situation${specialCount === 1 ? "" : "s"}</strong>` : ""}
              &nbsp;&middot;&nbsp; Generated ${generatedAt}
            </p>
          </td>
        </tr>
        <tr><td style="padding:24px 32px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;">Item</th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">Channel</th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:right;white-space:nowrap;">Last Listed Price</th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">Action</th>
              </tr>
            </thead>
            <tbody>${itemRows}
            </tbody>
          </table>
          ${specialCount > 0 ? `<p style="margin:12px 0 0;font-size:12px;color:#b45309;"><strong>Special situations</strong> are items designated for the opposite of the standard preference.</p>` : ""}
        </td></tr>
        <tr style="background:#f9fafb;border-top:1px solid #e5e7eb;">
          <td style="padding:16px 32px;font-size:11px;color:#9ca3af;">
            Rightsize &middot; Top Tier Transitions &middot; This report is for internal team use.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildQuoteInfoEmail({
  recipientName,
  tenantName,
  address,
  city,
  state,
  destinationSqFt,
  totalRoomSqFt,
  opportunityNotes,
  estimate,
  photos,
}: {
  recipientName: string;
  tenantName: string;
  address?: string;
  city?: string;
  state?: string;
  destinationSqFt?: number;
  totalRoomSqFt?: number;
  opportunityNotes?: string;
  estimate?: {
    status: string;
    lineItems: { serviceName: string; hours: number; rate: number }[];
    totalCost: number;
  };
  photos: { url: string; publicId: string }[];
}): string {
  const fmtDollar = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cityState = [city, state].filter(Boolean).join(", ");
  const fullLocation = [address, cityState].filter(Boolean).join(", ");

  const sqFtRows = (() => {
    const rows: string[] = [];
    if (totalRoomSqFt) rows.push(`<tr><td style="padding:3px 0;font-size:13px;color:#6b7280;width:110px;">Origin</td><td style="padding:3px 0;font-size:13px;color:#374151;font-weight:600;">${totalRoomSqFt.toLocaleString()} SF</td></tr>`);
    if (destinationSqFt) rows.push(`<tr><td style="padding:3px 0;font-size:13px;color:#6b7280;">Destination</td><td style="padding:3px 0;font-size:13px;color:#374151;font-weight:600;">${destinationSqFt.toLocaleString()} SF</td></tr>`);
    return rows.join("");
  })();

  const photoRows = (() => {
    if (!photos.length) return "";
    const chunkSize = 3;
    const rows: string[] = [];
    for (let i = 0; i < photos.length; i += chunkSize) {
      const chunk = photos.slice(i, i + chunkSize);
      const cells = chunk.map((p) => `
        <td style="padding:4px;width:180px;vertical-align:top;">
          <img src="${p.url}" alt="Quote photo" width="172" height="172" style="width:172px;height:172px;object-fit:cover;border-radius:8px;display:block;border:1px solid #e5e7eb;" />
        </td>`).join("");
      const pad = Array(chunkSize - chunk.length).fill(`<td style="padding:4px;width:180px;"></td>`).join("");
      rows.push(`<tr>${cells}${pad}</tr>`);
    }
    return `
      <div style="margin-top:24px;">
        <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">
          Photos (${photos.length})
        </p>
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${rows.join("")}
        </table>
      </div>`;
  })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quote Info &amp; Photos — ${tenantName}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
              <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Quote Visit Summary</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 20px;font-size:16px;color:#1a1a1a;">Hi ${recipientName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                Here are the details and photos from your quoting visit with <strong>${tenantName}</strong>.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="background-color:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
                    <p style="margin:0;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Client / Project</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 8px;font-size:16px;font-weight:bold;color:#111827;">${tenantName}</p>
                    ${fullLocation ? `<p style="margin:0 0 10px;font-size:14px;color:#6b7280;">${fullLocation}</p>` : ""}
                    ${sqFtRows ? `<table cellpadding="0" cellspacing="0" style="margin:0;">${sqFtRows}</table>` : ""}
                  </td>
                </tr>
              </table>

              ${estimate && estimate.lineItems.length > 0 ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="background-color:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
                    <table width="100%" cellpadding="0" cellspacing="0"><tr>
                      <td><p style="margin:0;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Estimate</p></td>
                      <td style="text-align:right;"><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;${estimate.status === "Signed" ? "background:#dcfce7;color:#166534;" : estimate.status === "Sent" ? "background:#dbeafe;color:#1e40af;" : "background:#f3f4f6;color:#6b7280;"}">${estimate.status}</span></td>
                    </tr></table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <thead>
                        <tr style="background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">
                          <th style="padding:8px 16px;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;">Service</th>
                          <th style="padding:8px 16px;text-align:right;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;white-space:nowrap;">Hours</th>
                          <th style="padding:8px 16px;text-align:right;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;white-space:nowrap;">Rate</th>
                          <th style="padding:8px 16px;text-align:right;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;white-space:nowrap;">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${estimate.lineItems.map((li, i) => `
                        <tr style="${i % 2 === 1 ? "background-color:#f9fafb;" : ""}border-bottom:1px solid #f3f4f6;">
                          <td style="padding:10px 16px;font-size:13px;color:#374151;">${li.serviceName}</td>
                          <td style="padding:10px 16px;font-size:13px;color:#374151;text-align:right;white-space:nowrap;">${li.hours} hrs</td>
                          <td style="padding:10px 16px;font-size:13px;color:#9ca3af;text-align:right;white-space:nowrap;">${fmtDollar(li.rate)}/hr</td>
                          <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;text-align:right;white-space:nowrap;">${fmtDollar(li.hours * li.rate)}</td>
                        </tr>`).join("")}
                      </tbody>
                      <tfoot>
                        <tr style="background-color:#f0fdf4;border-top:2px solid #2E6B4F;">
                          <td colspan="3" style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;">Total</td>
                          <td style="padding:12px 16px;font-size:15px;font-weight:bold;color:#2E6B4F;text-align:right;white-space:nowrap;">${fmtDollar(estimate.totalCost)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </td>
                </tr>
              </table>` : ""}

              ${opportunityNotes ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="background-color:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
                    <p style="margin:0;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Notes</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${opportunityNotes.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
                  </td>
                </tr>
              </table>` : ""}

              ${photoRows}

              ${!photos.length ? `<p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">No photos were attached to this quote visit.</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions &mdash; Internal Team Summary</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Applied Price Drop Reference Email ───────────────────────────────────────

export type AppliedDropEmailItem = {
  displayId: string;
  itemName: string;
  photoUrl?: string;
  prevPrice: number;
  newPrice: number;
  dropPct: number;
};

export function buildAppliedPriceDropEmail({
  tenantName,
  dropNumber,
  dropPercent,
  appliedAt,
  items,
}: {
  tenantName: string;
  dropNumber: 1 | 2;
  dropPercent: number;
  appliedAt: string;
  items: AppliedDropEmailItem[];
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const itemRows = items.map((item, i) => {
    const thumb = cldThumb(item.photoUrl, 80);
    return `
    <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 8px 10px 12px;width:88px;vertical-align:middle;">
        ${thumb
          ? `<img src="${thumb}" width="72" height="72" alt="" style="border-radius:8px;display:block;object-fit:cover;">`
          : `<div style="width:72px;height:72px;background:#f3f4f6;border-radius:8px;"></div>`}
      </td>
      <td style="padding:10px 12px;font-size:11px;color:#6b7280;vertical-align:middle;white-space:nowrap;">${item.displayId}</td>
      <td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:500;vertical-align:middle;">${item.itemName}</td>
      <td style="padding:10px 16px;font-size:13px;color:#9ca3af;text-align:right;vertical-align:middle;white-space:nowrap;text-decoration:line-through;">${fmt(item.prevPrice)}</td>
      <td style="padding:10px 16px;font-size:15px;color:#2d4a3e;font-weight:700;text-align:right;vertical-align:middle;white-space:nowrap;">${fmt(item.newPrice)}</td>
      <td style="padding:10px 16px;text-align:center;vertical-align:middle;">
        <span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:3px 8px;border-radius:99px;white-space:nowrap;">−${item.dropPct}%</span>
      </td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:720px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);" cellpadding="0" cellspacing="0">

        <!-- Header -->
        <tr style="background:#2d4a3e;">
          <td style="padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;color:#C9A96E;text-transform:uppercase;">Top Tier Transitions &nbsp;&middot;&nbsp; ${tenantName}</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Price Drop ${dropNumber} Applied</h1>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.70);">&#8722;${dropPercent}% reduction applied &nbsp;&middot;&nbsp; ${appliedAt}</p>
          </td>
        </tr>

        <!-- Summary bar -->
        <tr>
          <td style="padding:14px 32px;background:#f0fdf4;border-bottom:1px solid #d1fae5;">
            <p style="margin:0;font-size:13px;color:#374151;">
              <strong>${items.length}</strong> item${items.length === 1 ? "" : "s"} repriced &nbsp;&middot;&nbsp; Use this list to locate items and apply new sale stickers.
            </p>
          </td>
        </tr>

        <!-- Table -->
        <tr><td style="padding:24px 32px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:10px 8px 10px 12px;width:88px;"></th>
                <th style="padding:10px 12px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;">ID #</th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;">Item Name</th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:right;white-space:nowrap;">Prev Price</th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:right;white-space:nowrap;">New Price</th>
                <th style="padding:10px 16px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:center;white-space:nowrap;">Drop</th>
              </tr>
            </thead>
            <tbody>${itemRows}
            </tbody>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr style="background:#f9fafb;border-top:1px solid #e5e7eb;">
          <td style="padding:16px 32px;font-size:11px;color:#9ca3af;">
            Rightsize &middot; Top Tier Transitions &middot; Internal use only.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildTrainingCertificateEmail(params: {
  userName: string;
  userEmail: string;
  trainingType: string;
  completedAt: string;
  score: string;
  includesChicago: boolean;
  isAdminCopy: boolean;
}): { subject: string; html: string } {
  const { userName, userEmail, trainingType, completedAt, score, includesChicago, isAdminCopy } = params;

  const subject = isAdminCopy
    ? `HR Copy: ${userName} completed ${trainingType}`
    : `${trainingType} — Certificate of Completion`;

  const legalNote = trainingType.toLowerCase().includes("bystander")
    ? "This training satisfies the Chicago Sexual Harassment Ordinance annual bystander intervention training requirement."
    : "This training satisfies Illinois Human Rights Act annual training requirements.";

  const chicagoRow = includesChicago
    ? `<tr>
        <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Chicago Supplement</td>
        <td style="padding:10px 16px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;">Acknowledged (employee works in Chicago)</td>
      </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${trainingType} &#x2014; Certificate of Completion</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f0;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f0;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background-color:#2d4a3e;padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
              <p style="margin:6px 0 0;color:#a8c4b8;font-size:13px;">Certificate of Completion</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
                This confirms that <strong>${userName}</strong> (${userEmail}) has completed
                <strong>${trainingType}</strong> on ${completedAt}.
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:#374151;">
                <strong>Quiz Score:</strong> ${score}
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
                ${legalNote}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #C9A96E;border-radius:8px;overflow:hidden;margin-bottom:24px;">
                <tr style="background-color:#faf7f0;">
                  <td colspan="2" style="padding:12px 16px;font-size:12px;font-weight:bold;color:#2d4a3e;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5d9c0;">Certificate Details</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;width:40%;">Employee</td>
                  <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:600;">${userName}</td>
                </tr>
                <tr style="background-color:#f9fafb;">
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Email</td>
                  <td style="padding:10px 16px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;">${userEmail}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Training</td>
                  <td style="padding:10px 16px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;">${trainingType}</td>
                </tr>
                <tr style="background-color:#f9fafb;">
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Date Completed</td>
                  <td style="padding:10px 16px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;">${completedAt}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Score</td>
                  <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#2d4a3e;border-top:1px solid #e5e7eb;">${score}</td>
                </tr>
                ${chicagoRow}
              </table>
              <p style="margin:0 0 24px;font-size:13px;color:#6b7280;line-height:1.6;font-style:italic;">
                By completing this training, the employee has acknowledged understanding of Illinois workplace harassment law and agreed to comply with Top Tier Transitions LLC&#x2019;s anti-harassment policy.
              </p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;" />
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Top Tier Transitions LLC &nbsp;&middot;&nbsp; 312-600-3016 &nbsp;&middot;&nbsp; toptiertransitions.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
