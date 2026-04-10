export function buildContractSentEmail({
  clientName,
  projectName,
  signingUrl,
  totalCost,
  lineItems,
}: {
  clientName: string;
  projectName: string;
  signingUrl: string;
  totalCost: number;
  lineItems: { serviceName: string; hours: number; description?: string }[];
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const serviceRows = lineItems
    .map(
      (item, i) =>
        `<tr${i % 2 === 1 ? ' style="background-color:#f9fafb;"' : ""}>
          <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;">
            ${item.serviceName}${item.description ? `<br><span style="font-size:12px;color:#9ca3af;">${item.description}</span>` : ""}
          </td>
          <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;text-align:right;">${item.hours}</td>
        </tr>`
    )
    .join("");
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
                <tr style="background-color:#f9fafb;">
                  <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Service</th>
                  <th style="padding:10px 16px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Hours</th>
                </tr>
                ${serviceRows}
                <tr style="background-color:#f0fdf4;">
                  <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:2px solid #2E6B4F;">Estimated Total</td>
                  <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:2px solid #2E6B4F;text-align:right;">${fmt(totalCost)}</td>
                </tr>
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
