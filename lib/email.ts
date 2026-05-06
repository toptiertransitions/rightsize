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
  managerName,
  clientName,
  projectName,
  signedAt,
  totalCost,
}: {
  managerName?: string;
  clientName: string;
  projectName: string;
  signedAt: string;
  totalCost: number;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const signedDate = new Date(signedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agreement Signed — Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
              <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Agreement Signed</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi${managerName ? ` ${managerName}` : ""},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                <strong>${clientName}</strong> has signed the service agreement for <strong>${projectName}</strong>.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;font-size:14px;color:#6b7280;">Signed On</td>
                  <td style="padding:12px 16px;font-size:14px;color:#374151;font-weight:600;text-align:right;">${signedDate}</td>
                </tr>
                <tr style="background-color:#f9fafb;">
                  <td style="padding:12px 16px;font-size:14px;color:#6b7280;border-top:1px solid #e5e7eb;">Total</td>
                  <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:1px solid #e5e7eb;text-align:right;">${fmt(totalCost)}</td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
                Log in to the admin console to view the signed contract.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions &mdash; Internal Notification</p>
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
