export function buildContractSentEmail({
  clientName,
  projectName,
  signingUrl,
  totalCost,
  lineItems,
  includeServiceHours = false,
  discountCode,
  discountAmount,
}: {
  clientName: string;
  projectName: string;
  signingUrl: string;
  totalCost: number;
  lineItems: { serviceName: string; hours: number; description?: string }[];
  includeServiceHours?: boolean;
  discountCode?: string;
  discountAmount?: number;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtHrs = (h: number) => `${Math.round(h * 10) / 10} hrs`;
  const totalHours = lineItems.reduce((s, i) => s + i.hours, 0);
  const hasDiscount = !!discountCode && !!discountAmount && discountAmount > 0;
  const rawTotal = hasDiscount ? totalCost + discountAmount! : totalCost;

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

  // Discount rows (only when a discount is applied): subtotal + discount + final total
  const discountRows = hasDiscount
    ? includeServiceHours
      ? `<tr>
          <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Subtotal</td>
          <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;text-align:right;white-space:nowrap;">${fmt(rawTotal)}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;font-size:13px;color:#1d4ed8;border-top:1px solid #e5e7eb;">Discount — ${discountCode}</td>
          <td style="padding:10px 16px;font-size:13px;color:#1d4ed8;border-top:1px solid #e5e7eb;text-align:right;white-space:nowrap;">−${fmt(discountAmount!)}</td>
        </tr>`
      : `<tr>
          <td style="padding:0;border-top:1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#6b7280;">Subtotal</td>
                <td style="padding:10px 16px;font-size:13px;color:#6b7280;text-align:right;white-space:nowrap;">${fmt(rawTotal)}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0;border-top:1px solid #e5e7eb;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#1d4ed8;">Discount — ${discountCode}</td>
                <td style="padding:10px 16px;font-size:13px;color:#1d4ed8;text-align:right;white-space:nowrap;">−${fmt(discountAmount!)}</td>
              </tr>
            </table>
          </td>
        </tr>`
    : "";

  // Totals row: always shows hours + cost in green.
  // When single-column, nest a table inside the td for left/right alignment (email-safe).
  const totalsRow = includeServiceHours
    ? `<tr style="background-color:#f0fdf4;">
        <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:2px solid #2E6B4F;">${hasDiscount ? "Total After Discount" : "Estimated Total"}</td>
        <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;border-top:2px solid #2E6B4F;text-align:right;white-space:nowrap;">${fmtHrs(totalHours)} &nbsp;&middot;&nbsp; ${fmt(totalCost)}</td>
      </tr>`
    : `<tr style="background-color:#f0fdf4;">
        <td style="padding:0;border-top:2px solid #2E6B4F;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#2E6B4F;">${hasDiscount ? "Total After Discount" : "Estimated Total"}</td>
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
                ${discountRows}
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
  discountCode,
  discountAmount,
}: {
  salesRepName?: string;
  clientName: string;
  projectName: string;
  signedAt: string;
  totalCost: number;
  lineItems?: { serviceName: string; hours: number; rate: number }[];
  originAddress?: string;
  destAddress?: string;
  discountCode?: string;
  discountAmount?: number;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtHrs = (h: number) => `${Math.round(h * 10) / 10} hr${Math.round(h * 10) / 10 === 1 ? "" : "s"}`;
  const signedDate = new Date(signedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const totalHours = (lineItems ?? []).reduce((s, li) => s + li.hours, 0);
  const hasDiscount = !!discountCode && !!discountAmount && discountAmount > 0;

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
                ${hasDiscount ? `
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;">Subtotal (before discount)</td>
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;text-align:right;">${fmt(totalCost + discountAmount!)}</td>
                </tr>
                <tr style="background-color:#eff6ff;">
                  <td style="padding:10px 16px;font-size:13px;color:#1d4ed8;border-top:1px solid #e5e7eb;">Discount — ${discountCode}</td>
                  <td style="padding:10px 16px;font-size:13px;color:#1d4ed8;text-align:right;border-top:1px solid #e5e7eb;">−${fmt(discountAmount!)}</td>
                </tr>` : ""}
                <tr style="background-color:#f0fdf4;">
                  <td style="padding:14px 16px;font-size:15px;font-weight:bold;color:#2E6B4F;${hasDiscount ? "border-top:2px solid #2E6B4F;" : ""}">${hasDiscount ? "Contract Value After Discount" : "Contract Value"}</td>
                  <td style="padding:14px 16px;font-size:20px;font-weight:bold;color:#2E6B4F;text-align:right;${hasDiscount ? "border-top:2px solid #2E6B4F;" : ""}">${fmt(totalCost)}</td>
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
  expenseItems,
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
  expenseItems?: { vendor: string; description: string; date: string; amount: number }[];
}): string {
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const GREEN = "#2E6B4F";
  const TEXT = "#374151";
  const MUTED = "#6b7280";
  const BORDER = "#e5e7eb";
  const BG = "#F5F0E8";

  // Logo lives in the header so transparent PNGs render naturally on the green background
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${companyName}" style="display:block;max-height:48px;max-width:160px;object-fit:contain;margin-bottom:12px;" />`
    : "";

  const positiveItems = (lineItems ?? []).filter((li) => li.rate >= 0);
  const creditItems = (lineItems ?? []).filter((li) => li.rate < 0);
  const expenses = expenseItems ?? [];
  const hasLineItems = positiveItems.length > 0 || expenses.length > 0;
  const hasCredits = creditItems.length > 0;
  const serviceSubtotal = positiveItems.reduce((s, li) => s + li.hours * li.rate, 0);
  const expenseSubtotal = expenses.reduce((s, ei) => s + ei.amount, 0);
  const subtotal = serviceSubtotal + expenseSubtotal;
  const totalLabel = hasCredits ? "Balance Owed" : "Total Due";

  const lineItemRows = positiveItems
    .map(
      (li) =>
        `<tr>
          <td style="padding:11px 16px;font-size:13px;color:${TEXT};border-top:1px solid ${BORDER};">${li.serviceName}</td>
          <td style="padding:11px 16px;font-size:13px;color:${MUTED};border-top:1px solid ${BORDER};text-align:right;">${li.hours % 1 === 0 ? li.hours : li.hours.toFixed(2)}</td>
          <td style="padding:11px 16px;font-size:13px;color:${MUTED};border-top:1px solid ${BORDER};text-align:right;">${fmt(li.rate)}</td>
          <td style="padding:11px 16px;font-size:13px;color:${TEXT};font-weight:600;border-top:1px solid ${BORDER};text-align:right;">${fmt(li.hours * li.rate)}</td>
        </tr>`
    )
    .join("");

  const expenseRows = expenses
    .map(
      (ei) =>
        `<tr>
          <td colspan="3" style="padding:11px 16px;font-size:13px;color:${TEXT};border-top:1px solid ${BORDER};">${ei.description}${ei.vendor ? ` &mdash; ${ei.vendor}` : ""}${ei.date ? ` <span style="color:#9ca3af;font-size:12px;">(${ei.date})</span>` : ""}</td>
          <td style="padding:11px 16px;font-size:13px;color:${TEXT};font-weight:600;border-top:1px solid ${BORDER};text-align:right;">${fmt(ei.amount)}</td>
        </tr>`
    )
    .join("");

  const subtotalRow = hasCredits
    ? `<tr style="background-color:#f9fafb;">
        <td colspan="3" style="padding:10px 16px;font-size:12px;color:${MUTED};border-top:1px solid ${BORDER};text-transform:uppercase;letter-spacing:0.4px;">Subtotal</td>
        <td style="padding:10px 16px;font-size:13px;color:${MUTED};border-top:1px solid ${BORDER};text-align:right;">${fmt(subtotal)}</td>
      </tr>`
    : "";

  const creditRows = creditItems
    .map(
      (li) =>
        `<tr style="background-color:#f0f7ff;">
          <td colspan="3" style="padding:10px 16px;font-size:13px;color:#2563eb;border-top:1px solid #dbeafe;">${li.serviceName}</td>
          <td style="padding:10px 16px;font-size:13px;color:#2563eb;border-top:1px solid #dbeafe;text-align:right;">-${fmt(Math.abs(li.hours * li.rate))}</td>
        </tr>`
    )
    .join("");

  const detailedTable = hasLineItems
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;margin-bottom:28px;">
        <thead>
          <tr style="background-color:#f8f9fa;">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid ${BORDER};">Service / Expense</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid ${BORDER};">Hrs</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid ${BORDER};">Rate</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid ${BORDER};">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemRows}
          ${expenseRows}
          ${subtotalRow}
          ${creditRows}
        </tbody>
        <tfoot>
          <tr style="background-color:#ecfdf5;">
            <td colspan="3" style="padding:14px 16px;font-size:15px;font-weight:700;color:${GREEN};border-top:2px solid ${GREEN};">${totalLabel}</td>
            <td style="padding:14px 16px;font-size:15px;font-weight:700;color:${GREEN};border-top:2px solid ${GREEN};text-align:right;">${fmt(amount)}</td>
          </tr>
        </tfoot>
      </table>`
    : `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BORDER};border-radius:8px;overflow:hidden;margin-bottom:28px;">
        <thead>
          <tr style="background-color:#f8f9fa;">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid ${BORDER};">Service</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid ${BORDER};">Amount Due</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:14px 16px;font-size:14px;color:${TEXT};border-bottom:1px solid ${BORDER};">${serviceName}</td>
            <td style="padding:14px 16px;font-size:14px;color:${TEXT};border-bottom:1px solid ${BORDER};text-align:right;">${fmt(amount)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr style="background-color:#ecfdf5;">
            <td style="padding:14px 16px;font-size:15px;font-weight:700;color:${GREEN};border-top:2px solid ${GREEN};">Total Due</td>
            <td style="padding:14px 16px;font-size:15px;font-weight:700;color:${GREEN};border-top:2px solid ${GREEN};text-align:right;">${fmt(amount)}</td>
          </tr>
        </tfoot>
      </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Invoice ${invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${GREEN};padding:32px 36px 28px;">
              ${logoHtml}
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;line-height:1.2;">${companyName}</p>
              <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;letter-spacing:0.2px;">Invoice ${invoiceNumber}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 36px 32px;">
              <p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#111827;">Hi ${tenantName},</p>
              <p style="margin:0 0 28px;font-size:14px;color:${MUTED};line-height:1.6;">
                You have a new <strong style="color:${TEXT};">${type} Invoice</strong> ready for review and payment.
              </p>

              ${detailedTable}

              <!-- Pay Now button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:${GREEN};border-radius:8px;">
                    <a href="${payUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.2px;">Pay Now &rarr;</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                Questions about this invoice? Reply to this email or reach out to your project coordinator.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:18px 36px;border-top:1px solid ${BORDER};text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">${companyName} &nbsp;&bull;&nbsp; Invoice ${invoiceNumber}</p>
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
  conflictingShifts = [],
}: {
  staffName: string;
  entries: Array<{ date: string; allDay: boolean; startTime?: string; endTime?: string }>;
  opsUrl: string;
  conflictingShifts?: Array<{ date: string; activity: string; projectName: string; startTime?: string; endTime?: string }>;
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

  const conflictBlock = conflictingShifts.length > 0 ? `
    <div style="background-color:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:bold;color:#c2410c;">
        \u26a0 Scheduled Shift Conflict${conflictingShifts.length > 1 ? "s" : ""}
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#92400e;line-height:1.5;">
        ${staffName} is currently scheduled on the following Daily Focus Shift${conflictingShifts.length > 1 ? "s" : ""} during this time off. You may need to reassign.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fed7aa;border-radius:6px;overflow:hidden;">
        <tr style="background-color:#ffedd5;">
          <th style="padding:8px 14px;text-align:left;font-size:11px;color:#c2410c;font-weight:600;text-transform:uppercase;">Date</th>
          <th style="padding:8px 14px;text-align:left;font-size:11px;color:#c2410c;font-weight:600;text-transform:uppercase;">Activity</th>
          <th style="padding:8px 14px;text-align:left;font-size:11px;color:#c2410c;font-weight:600;text-transform:uppercase;">Project</th>
        </tr>
        ${conflictingShifts.map(s => {
          const timeStr = s.startTime ? ` (${fmt12h(s.startTime)}${s.endTime ? `\u2013${fmt12h(s.endTime)}` : ""})` : "";
          return `<tr>
            <td style="padding:8px 14px;font-size:13px;color:#374151;border-top:1px solid #fed7aa;">${fmtDate(s.date)}${timeStr}</td>
            <td style="padding:8px 14px;font-size:13px;color:#374151;border-top:1px solid #fed7aa;">${s.activity}</td>
            <td style="padding:8px 14px;font-size:13px;color:#374151;border-top:1px solid #fed7aa;">${s.projectName}</td>
          </tr>`;
        }).join("")}
      </table>
    </div>` : "";

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
            ${conflictBlock}
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

// ─── Shift Declined Notification Email ───────────────────────────────────────
export function buildShiftDeclinedEmail({
  declinedByEmail,
  declinedByName,
  shiftDate,
  activity,
  projectName,
  planUrl,
}: {
  declinedByEmail: string;
  declinedByName?: string;
  shiftDate: string;
  activity: string;
  projectName: string;
  planUrl: string;
}): string {
  function fmtDate(d: string) {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }
  const who = declinedByName ? `${declinedByName} (${declinedByEmail})` : declinedByEmail;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Shift Declined — ${projectName}</title></head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
            <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
            <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Shift Declined — Action May Be Required</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
            <p style="margin:0 0 8px;font-size:16px;color:#1a1a1a;font-weight:bold;">Shift Declined</p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              <strong>${who}</strong> has declined their calendar invitation for the following shift:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
              <tr style="background-color:#f9fafb;">
                <td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;width:120px;">Project</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;">${projectName}</td>
              </tr>
              <tr style="border-top:1px solid #e5e7eb;">
                <td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Date</td>
                <td style="padding:10px 16px;font-size:14px;color:#374151;">${fmtDate(shiftDate)}</td>
              </tr>
              <tr style="border-top:1px solid #e5e7eb;">
                <td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Activity</td>
                <td style="padding:10px 16px;font-size:14px;color:#374151;">${activity}</td>
              </tr>
            </table>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              You may want to assign a replacement or adjust the schedule for this project.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background-color:#2E6B4F;border-radius:8px;padding:13px 28px;">
                  <a href="${planUrl}" style="color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">View Project Plan →</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions — Internal Notification</p>
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
  // Legacy single-window fields (used when pickupWindowsJson is absent)
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  pickupWindowStartTime?: string;
  pickupWindowEndTime?: string;
  // Multi-date pickup windows (JSON: [{date, startTime, endTime}])
  pickupWindowsJson?: string;
  contactEmail?: string;
  contactPhone?: string;
  terms?: string;
  pickupNotes?: string;
  customNote?: string;   // 1-2 sentences added by admin at send time — shown as a branded callout
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

function buildPickupDatesList(json: string): string {
  try {
    const windows = JSON.parse(json) as Array<{ date: string; startTime: string; endTime: string }>;
    if (!Array.isArray(windows) || windows.length === 0) return "";
    return windows
      .filter(w => w.date)
      .map(w => {
        let line = fmtPickupDate(w.date);
        if (w.startTime && w.endTime) line += `\n${w.startTime} – ${w.endTime}`;
        else if (w.startTime) line += `\nFrom ${w.startTime}`;
        else if (w.endTime) line += `\nUntil ${w.endTime}`;
        return line;
      })
      .join("\n\n");
  } catch {
    return "";
  }
}

export function buildPickupDetailsEmail(p: PickupDetailsEmailParams): string {
  const firstName = p.buyerName.split(" ")[0] || p.buyerName;
  const pickupRange = p.pickupWindowsJson
    ? buildPickupDatesList(p.pickupWindowsJson)
    : buildPickupDateRange(
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

                <!-- Divider -->
                <tr><td style="padding:0 36px;"><div style="height:1px;background:#EEEBE6;"></div></td></tr>

                <!-- Packing reminder — always shown -->
                <tr>
                  <td style="padding:20px 36px;">
                    <table cellpadding="0" cellspacing="0" style="background:#F5F2EE;border-radius:10px;overflow:hidden;width:100%;">
                      <tr>
                        <td style="width:4px;padding:0;background:#7A9E7E;border-radius:10px 0 0 10px;font-size:0;">&nbsp;</td>
                        <td style="padding:14px 20px;">
                          <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#555;line-height:1.65;">
                            <strong style="color:#2C2C2C;">Reminder:</strong> Please bring packing materials for fragile items, and bring help if you need assistance carrying large items.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${p.customNote ? `
                <!-- Divider -->
                <tr><td style="padding:0 36px;"><div style="height:1px;background:#EEEBE6;"></div></td></tr>

                <!-- Custom note from team -->
                <tr>
                  <td style="padding:20px 36px;">
                    <table cellpadding="0" cellspacing="0" style="background:#EEF4EE;border-radius:10px;overflow:hidden;width:100%;">
                      <tr>
                        <td style="width:4px;padding:0;background:#7A9E7E;border-radius:10px 0 0 10px;font-size:0;">&nbsp;</td>
                        <td style="padding:16px 20px;">
                          <p style="margin:0 0 4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#7A9E7E;">A note from our team</p>
                          <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#3a5c3a;line-height:1.65;">${p.customNote}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>` : ""}

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
  teamLeadName,
  planUrl,
  createdAt,
}: {
  fullName: string;
  email: string;
  imageUrl?: string | null;
  userType: "client" | "staff" | "unknown";
  roleLabel: string;
  projectName?: string | null;
  projectAddress?: string | null;
  teamLeadName?: string | null;
  planUrl?: string | null;
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

  const isClientNotification = userType === "client";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Client User Registered — Top Tier Transitions</title>
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
                  <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#a8d4bc;">Top Tier Transitions &nbsp;·&nbsp; Internal Notification</p>
                  <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${isClientNotification ? "New Client User Registered" : "New User Account"}</p>
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
                    <tr style="border-bottom:1px solid #f3f4f6;">
                      <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;">Project</td>
                      <td style="padding:12px 16px;font-size:13px;color:${projectName ? "#111827" : "#9ca3af"};${projectName ? "" : "font-style:italic;"}">${projectName ?? "No project yet"}</td>
                    </tr>
                    ${projectAddress ? `
                    <tr style="border-bottom:1px solid #f3f4f6;">
                      <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;vertical-align:top;">Address</td>
                      <td style="padding:12px 16px;font-size:13px;color:#111827;">${projectAddress}</td>
                    </tr>` : ""}
                    <tr>
                      <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;">Team Lead</td>
                      <td style="padding:12px 16px;font-size:13px;color:${teamLeadName ? "#111827" : "#9ca3af"};${teamLeadName ? "" : "font-style:italic;"}">${teamLeadName ?? "Not assigned"}</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td style="padding:0 0 24px;">
                  <a href="${planUrl ?? "https://app.toptiertransitions.com/plan"}"
                     style="display:block;background:#2E6B4F;color:#ffffff;font-size:14px;font-weight:700;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;">
                    View Project Plan →
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

export type StageChangeRow = {
  contactName: string;
  contactTitle?: string;
  companyName: string;
  priority: string;
  ownerName: string;
  previousStage: string;
  currentStage: string;
  stageChangedAt: string;
  lastActivityDate?: string;
  nextStepDate?: string;
  nextStepNote?: string;
};

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
  progressRows,
}: {
  rows: ReferralPipelineRow[];
  generatedAt: string;
  progressRows?: StageChangeRow[];
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

  const STAGE_BADGE: Record<string, string> = {
    "Shared Leads": "background:#dcfce7;color:#166534;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap;",
    "Agreed to Refer": "background:#dbeafe;color:#1e40af;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap;",
    "Met": "background:#fef9c3;color:#92400e;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap;",
    "Identified": "background:#f3f4f6;color:#374151;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap;",
    "Active Referral": "background:#ede9fe;color:#5b21b6;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap;",
  };

  function stageBadgeHtml(stage: string): string {
    const style = STAGE_BADGE[stage] ?? "background:#f3f4f6;color:#374151;padding:2px 7px;border-radius:9999px;font-size:11px;font-weight:600;white-space:nowrap;";
    return `<span style="${style}">${stage}</span>`;
  }

  const weeklyProgressSection = progressRows && progressRows.length > 0 ? `
        <tr>
          <td style="padding:16px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #d1fae5;border-radius:8px;overflow:hidden;">
              <thead>
                <tr style="background:#ecfdf5;">
                  <td colspan="8" style="padding:12px 16px;font-size:13px;font-weight:700;color:#065f46;border-bottom:1px solid #d1fae5;">
                    Weekly Progress &mdash; Stage Changes in Last 7 Days (${progressRows.length})
                  </td>
                </tr>
                <tr style="background:#f0fdf4;">
                  <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;border-bottom:1px solid #d1fae5;">Company</th>
                  <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;border-bottom:1px solid #d1fae5;">Contact</th>
                  <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;border-bottom:1px solid #d1fae5;">Owner</th>
                  <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;border-bottom:1px solid #d1fae5;">Stage Change</th>
                  <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:center;white-space:nowrap;border-bottom:1px solid #d1fae5;">Changed</th>
                  <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:center;white-space:nowrap;border-bottom:1px solid #d1fae5;">Last Activity</th>
                  <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;border-bottom:1px solid #d1fae5;">Next Step</th>
                  <th style="padding:8px 10px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;text-align:left;white-space:nowrap;border-bottom:1px solid #d1fae5;">Next Step Note</th>
                </tr>
              </thead>
              <tbody>
                ${progressRows.map(r => {
                  const priorityBadge = `<span style="${PRIORITY_BADGE[r.priority] ?? ""}">${r.priority}</span>`;
                  return `<tr style="border-bottom:1px solid #d1fae5;">
                    <td style="padding:8px 10px;font-size:12px;color:#374151;font-weight:500;white-space:nowrap;">${priorityBadge} ${r.companyName}</td>
                    <td style="padding:8px 10px;font-size:12px;color:#374151;white-space:nowrap;">${r.contactName}${r.contactTitle ? `<br><span style="color:#9ca3af;font-size:11px;">${r.contactTitle}</span>` : ""}</td>
                    <td style="padding:8px 10px;font-size:12px;color:#6b7280;white-space:nowrap;">${r.ownerName || "—"}</td>
                    <td style="padding:8px 10px;font-size:12px;white-space:nowrap;">${stageBadgeHtml(r.previousStage)} <span style="color:#9ca3af;margin:0 4px;">&rarr;</span> ${stageBadgeHtml(r.currentStage)}</td>
                    <td style="padding:8px 10px;font-size:12px;color:#6b7280;text-align:center;white-space:nowrap;">${fmtDate(r.stageChangedAt?.slice(0, 10))}</td>
                    <td style="padding:8px 10px;font-size:12px;color:#6b7280;text-align:center;white-space:nowrap;">${fmtDate(r.lastActivityDate)}</td>
                    <td style="padding:8px 10px;font-size:12px;color:#374151;white-space:nowrap;">${fmtDate(r.nextStepDate)}</td>
                    <td style="padding:8px 10px;font-size:12px;color:#374151;max-width:180px;">${r.nextStepNote || "—"}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </td>
        </tr>` : "";

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
        ${weeklyProgressSection}
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
  hasPortalAccount: boolean;
  portalLastActiveAt?: string; // ISO string from Clerk lastActiveAt/lastSignInAt
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
                  <p style="margin:6px 0 0;">
                    ${r.hasPortalAccount
                      ? r.portalLastActiveAt
                        ? `<span style="display:inline-block;font-size:10px;font-weight:600;color:#065f46;background:#d1fae5;border:1px solid #6ee7b7;border-radius:20px;padding:2px 7px;">Portal: ${fmtDateShort(r.portalLastActiveAt)}</span>`
                        : `<span style="display:inline-block;font-size:10px;font-weight:600;color:#6b7280;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:20px;padding:2px 7px;">Portal: No activity yet</span>`
                      : `<span style="display:inline-block;font-size:10px;font-weight:600;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:20px;padding:2px 7px;">No Portal Account Yet</span>`
                    }
                  </p>
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
  projectDetails,
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
  projectDetails?: {
    targetStartDate?: string;
    targetMoveDate?: string;
    datesFlexible?: boolean;
    deadlineNotes?: string;
    disposalNotes?: string;
    specialItems?: string;
    vendorNotes?: string;
  };
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

              ${(() => {
                const pd = projectDetails;
                if (!pd) return "";
                const hasAny = pd.targetStartDate || pd.targetMoveDate || pd.datesFlexible || pd.deadlineNotes || pd.disposalNotes || pd.specialItems || pd.vendorNotes;
                if (!hasAny) return "";
                const fmt = (d: string) => { try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
                const rows = [
                  pd.targetStartDate ? `<tr><td style="padding:8px 14px;font-size:13px;color:#6b7280;width:140px;border-top:1px solid #e5e7eb;white-space:nowrap;">Target Start</td><td style="padding:8px 14px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;border-left:1px solid #e5e7eb;">${fmt(pd.targetStartDate)}</td></tr>` : "",
                  pd.targetMoveDate ? `<tr><td style="padding:8px 14px;font-size:13px;color:#6b7280;width:140px;border-top:1px solid #e5e7eb;white-space:nowrap;">Target Move</td><td style="padding:8px 14px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;border-left:1px solid #e5e7eb;">${fmt(pd.targetMoveDate)}</td></tr>` : "",
                  (pd.targetStartDate || pd.targetMoveDate) ? `<tr><td style="padding:8px 14px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;white-space:nowrap;">Dates Flexible?</td><td style="padding:8px 14px;font-size:13px;font-weight:600;color:${pd.datesFlexible ? "#166534" : "#9a3412"};border-top:1px solid #e5e7eb;border-left:1px solid #e5e7eb;">${pd.datesFlexible ? "Yes" : "No"}</td></tr>` : "",
                  pd.deadlineNotes ? `<tr><td style="padding:8px 14px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;white-space:nowrap;vertical-align:top;">Deadline Notes</td><td style="padding:8px 14px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;border-left:1px solid #e5e7eb;line-height:1.5;">${pd.deadlineNotes.replace(/\n/g, "<br>")}</td></tr>` : "",
                  pd.disposalNotes ? `<tr><td style="padding:8px 14px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;white-space:nowrap;vertical-align:top;">Disposal / Hauling</td><td style="padding:8px 14px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;border-left:1px solid #e5e7eb;line-height:1.5;">${pd.disposalNotes.replace(/\n/g, "<br>")}</td></tr>` : "",
                  pd.specialItems ? `<tr><td style="padding:8px 14px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;white-space:nowrap;vertical-align:top;">Special Items</td><td style="padding:8px 14px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;border-left:1px solid #e5e7eb;line-height:1.5;">${pd.specialItems.replace(/\n/g, "<br>")}</td></tr>` : "",
                  pd.vendorNotes ? `<tr><td style="padding:8px 14px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;white-space:nowrap;vertical-align:top;">Vendor Notes</td><td style="padding:8px 14px;font-size:13px;color:#374151;border-top:1px solid #e5e7eb;border-left:1px solid #e5e7eb;line-height:1.5;">${pd.vendorNotes.replace(/\n/g, "<br>")}</td></tr>` : "",
                ].filter(Boolean).join("");
                return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
                  <tr><td style="background-color:#fff7ed;padding:12px 16px;border-bottom:1px solid #fed7aa;">
                    <p style="margin:0;font-size:11px;font-weight:600;color:#9a3412;text-transform:uppercase;letter-spacing:0.05em;">Project Details &mdash; Internal</p>
                  </td></tr>
                  <tbody>${rows}</tbody>
                </table>`;
              })()}

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

export function buildVendorHeadsUpEmail({
  pocName, vendorName, city, state, sentByName,
}: {
  pocName: string; vendorName: string; city: string; state: string; sentByName: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>Heads up — Top Tier Transitions</title></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#2d4a3e;padding:24px 32px;border-radius:12px 12px 0 0;">
    <p style="margin:0;color:#F5F0E8;font-size:20px;font-weight:bold;">Top Tier Transitions</p>
    <p style="margin:4px 0 0;color:#a8d4bc;font-size:13px;">Heads Up</p>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;border-radius:0 0 12px 12px;">
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${pocName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
      Quick note — we'll be sending over some items from a ${city}, ${state} transition tomorrow morning that we think would be a great fit for <strong>${vendorName}</strong>. Keep an eye out!
    </p>
    <p style="margin:24px 0 0;font-size:14px;color:#374151;">Warm regards,<br><strong>${sentByName}</strong><br><span style="color:#9ca3af;">Top Tier Transitions</span></p>
  </td></tr>
  <tr><td style="padding:16px;text-align:center;"><p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions &mdash; ${city}, ${state}</p></td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function buildMapToVendorsEmail({
  pocName, vendorName, city, state, itemCount, items, vendorPortalUrl, sentByName,
}: {
  pocName: string;
  vendorName: string;
  city: string;
  state: string;
  itemCount: number;
  items: Array<{ itemName: string; category: string; condition: string; valueMid: number; photoUrl?: string }>;
  vendorPortalUrl: string;
  sentByName: string;
}): string {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const displayItems = items.slice(0, 6);
  const itemGrid = displayItems.map(item =>
    `<td style="width:50%;padding:8px;vertical-align:top;">
      <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${item.photoUrl
          ? `<img src="${item.photoUrl}" alt="${item.itemName}" width="100%" style="display:block;height:140px;object-fit:cover;" />`
          : `<div style="height:140px;background:#f9fafb;display:flex;align-items:center;justify-content:center;"><span style="color:#9ca3af;font-size:12px;">No photo</span></div>`}
        <div style="padding:10px 12px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;">${item.itemName}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${item.category} &middot; ${item.condition} &middot; Est. ${fmt(item.valueMid)}</p>
        </div>
      </div>
    </td>`
  );

  const rows: string[] = [];
  for (let i = 0; i < itemGrid.length; i += 2) {
    rows.push(`<tr>${itemGrid[i]}${itemGrid[i + 1] || '<td style="width:50%;padding:8px;"></td>'}</tr>`);
  }

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>Items for you — Top Tier Transitions</title></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#2d4a3e;padding:28px 32px;border-radius:12px 12px 0 0;">
    <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
    <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Items Coming Your Way</p>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;">
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${pocName},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
      We've set aside <strong>${itemCount} item${itemCount !== 1 ? 's' : ''}</strong> from a client transition in <strong>${city}, ${state}</strong> that we think would be a great fit for <strong>${vendorName}</strong>. These are coming to you first — take a look when you get a chance.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${rows.join("")}</table>
    ${itemCount > 6 ? `<p style="margin:0 0 24px;font-size:13px;color:#6b7280;text-align:center;">+ ${itemCount - 6} more item${itemCount - 6 !== 1 ? 's' : ''} available in the portal</p>` : ""}
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr><td style="background:#C9A96E;border-radius:8px;padding:14px 28px;">
        <a href="${vendorPortalUrl}" style="color:#fff;font-size:15px;font-weight:bold;text-decoration:none;">See All Items &amp; Indicate Interest →</a>
      </td></tr>
    </table>
    <p style="margin:0 0 24px;font-size:13px;color:#6b7280;line-height:1.6;">Items are on a first-come basis — once something's claimed, it's off the table. We'll follow up in a few days if we don't hear from you.</p>
    <p style="margin:0;font-size:14px;color:#374151;">Warm regards,<br><strong>${sentByName}</strong><br><span style="color:#9ca3af;">Top Tier Transitions · 312-600-3016 · toptiertransitions.com</span></p>
  </td></tr>
  <tr><td style="padding:16px;text-align:center;"><p style="margin:0;font-size:12px;color:#9ca3af;">Sent by Top Tier Transitions &middot; ${sentByName}</p></td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function buildVendorClaimNotificationEmail({
  staffName, vendorName, city, state, claimedItems, catalogUrl,
}: {
  staffName: string;
  vendorName: string;
  city: string;
  state: string;
  claimedItems: Array<{ itemName: string; category: string; valueMid: number }>;
  catalogUrl: string;
}): string {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const itemList = claimedItems.map(i =>
    `<li style="padding:4px 0;font-size:14px;color:#374151;">${i.itemName} — ${i.category} — Est. ${fmt(i.valueMid)}</li>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>Vendor Claim — Top Tier Transitions</title></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#2d4a3e;padding:24px 32px;border-radius:12px 12px 0 0;">
    <p style="margin:0;color:#F5F0E8;font-size:20px;font-weight:bold;">Top Tier Transitions</p>
    <p style="margin:4px 0 0;color:#a8d4bc;font-size:13px;">Vendor Claim</p>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;border-radius:0 0 12px 12px;">
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${staffName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      Good news — <strong>${vendorName}</strong> just indicated interest in the following item(s) from your <strong>${city}, ${state}</strong> project:
    </p>
    <ul style="margin:0 0 24px;padding-left:20px;">${itemList}</ul>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="background:#2d4a3e;border-radius:8px;padding:12px 24px;">
        <a href="${catalogUrl}" style="color:#F5F0E8;font-size:15px;font-weight:bold;text-decoration:none;">View Project →</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:16px;text-align:center;"><p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions &mdash; Internal Notification</p></td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function buildPartnerRewardsEmail({
  companyName,
  pointsAvailable,
  pointsEarned,
  pointsRedeemed,
  currentProjects,
  potentialProjects,
  previousProjects,
  recentReviews,
  isInvited,
  appUrl,
}: {
  companyName: string;
  pointsAvailable: number;
  pointsEarned: number;
  pointsRedeemed: number;
  currentProjects: Array<{ name: string; address?: string; city?: string; state?: string }>;
  potentialProjects: Array<{ name: string; city?: string; state?: string }>;
  previousProjects: Array<{ name: string; city?: string; state?: string }>;
  recentReviews: Array<{ stars: number; text: string; tenantName?: string }>;
  isInvited: boolean;
  appUrl: string;
}): string {
  const portalUrl = `${appUrl}/partner/home`;
  const ctaText = isInvited ? "See Your Own Referral Dashboard →" : "Ask your TTT Rep about Accessing our Free Dashboard";
  const ctaHref = isInvited ? portalUrl : "mailto:hello@toptiertransitions.com";

  function projectRow(p: { name: string; address?: string; city?: string; state?: string }): string {
    const loc = [p.city, p.state].filter(Boolean).join(", ");
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;">${p.name}</p>
        ${p.address ? `<p style="margin:2px 0 0;font-size:12px;color:#9ca3af;">${p.address}</p>` : ""}
        ${loc ? `<p style="margin:2px 0 0;font-size:12px;color:#9ca3af;">${loc}</p>` : ""}
      </td>
    </tr>`;
  }

  function renderStars(n: number): string {
    return Array.from({ length: 5 }, (_, i) =>
      `<span style="color:${i < n ? "#f59e0b" : "#e5e7eb"};">&#9733;</span>`
    ).join("");
  }

  const currentRows = currentProjects.map(projectRow).join("");
  const potentialRows = potentialProjects.map(projectRow).join("");
  const previousRows = previousProjects.map(projectRow).join("");

  const reviewCards = recentReviews.map(r => `
    <div style="margin-bottom:12px;padding:14px 16px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;">
      <div style="margin-bottom:6px;">${renderStars(r.stars)}${r.tenantName ? `<span style="margin-left:8px;font-size:11px;color:#6b7280;">${r.tenantName}</span>` : ""}</div>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${r.text}</p>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${companyName} Partner Summary — Top Tier Transitions</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#2d4a3e;padding:28px 32px;border-radius:12px 12px 0 0;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Top Tier Transitions</p>
    <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;font-weight:500;">Partner Rewards Summary &mdash; ${companyName}</p>
  </td></tr>
  <tr><td style="background:#2d4a3e;padding:0 32px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.08);border-radius:10px;padding:20px 0;">
      <tr>
        <td style="text-align:center;padding:0 12px;">
          <p style="margin:0;font-size:34px;font-weight:800;color:#fff;line-height:1;">${pointsAvailable}</p>
          <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.06em;">Available</p>
        </td>
        <td style="text-align:center;padding:0 12px;border-left:1px solid rgba(255,255,255,0.12);border-right:1px solid rgba(255,255,255,0.12);">
          <p style="margin:0;font-size:34px;font-weight:800;color:#fff;line-height:1;">${pointsEarned}</p>
          <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.06em;">Earned This Year</p>
        </td>
        <td style="text-align:center;padding:0 12px;">
          <p style="margin:0;font-size:34px;font-weight:800;color:#fff;line-height:1;">${pointsRedeemed}</p>
          <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.06em;">Redeemed</p>
        </td>
      </tr>
    </table>
    <p style="margin:12px 0 0;font-size:11px;color:rgba(255,255,255,0.35);text-align:center;">Annual program &middot; Points and tier reset June 1 each year</p>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;border-radius:0 0 12px 12px;">
    ${currentProjects.length > 0 ? `
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#2d4a3e;text-transform:uppercase;letter-spacing:0.08em;">Current Projects (${currentProjects.length})</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">${currentRows}</table>` : ""}
    ${potentialProjects.length > 0 ? `
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.08em;">Potential Projects (${potentialProjects.length})</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">${potentialRows}</table>` : ""}
    ${recentReviews.length > 0 ? `
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.08em;">Recent Google Reviews</p>
    <div style="margin-bottom:28px;">${reviewCards}</div>` : ""}
    ${previousProjects.length > 0 ? `
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Prior Projects (${previousProjects.length})</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;opacity:0.7;">${previousRows}</table>` : ""}
    ${currentProjects.length === 0 && potentialProjects.length === 0 ? `
    <p style="margin:0 0 28px;font-size:14px;color:#9ca3af;text-align:center;">No active referred projects yet.</p>` : ""}
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="text-align:center;padding:24px 0;border-top:1px solid #f3f4f6;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr><td style="background:${isInvited ? "#2d4a3e" : "#6b7280"};border-radius:8px;padding:14px 28px;">
            <a href="${ctaHref}" style="color:#fff;font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap;">${ctaText}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
    <p style="margin:0;font-size:12px;color:#d1d5db;text-align:center;">Top Tier Transitions &middot; toptiertransitions.com</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ─── Payment Receipt Email ────────────────────────────────────────────────────
export function buildPaymentReceiptEmail({
  firstName,
  invoiceNumber,
  projectName,
  serviceName,
  amountPaid,
  surchargeAmount,
  paymentMethod,
  maskedCard,
  transactionId,
  paidAt,
  companyName,
  companyEmail,
  companyPhone,
  logoUrl,
  lineItems,
}: {
  firstName: string;
  invoiceNumber: string;
  projectName?: string;
  serviceName?: string;
  amountPaid: number;
  surchargeAmount?: number;
  paymentMethod: "credit_card" | "ach";
  maskedCard?: string;
  transactionId?: string;
  paidAt: string;
  companyName: string;
  companyEmail?: string;
  companyPhone?: string;
  logoUrl?: string;
  lineItems?: { serviceName: string; hours: number; rate: number }[];
}): string {
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const GREEN = "#2E6B4F";
  const LIGHT_GREEN = "#f0fdf4";
  const BG = "#F5F0E8";
  const MUTED = "#6b7280";
  const TEXT = "#374151";

  const methodLabel = paymentMethod === "credit_card"
    ? (maskedCard ? `Credit Card ending in ${maskedCard.slice(-4)}` : "Credit / Debit Card")
    : "ACH / Bank Transfer";

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${companyName}" style="max-height:48px;max-width:160px;object-fit:contain;display:block;margin-bottom:8px;" />`
    : "";

  const positiveItems = (lineItems ?? []).filter(li => li.rate >= 0);
  const creditItems = (lineItems ?? []).filter(li => li.rate < 0);
  const hasLineItems = positiveItems.length > 0;

  const lineItemRows = hasLineItems
    ? positiveItems.map((li, i) => `
        <tr${i % 2 === 1 ? ` style="background:#f9fafb;"` : ""}>
          <td style="padding:9px 16px;font-size:13px;color:${TEXT};border-top:1px solid #e5e7eb;">${li.serviceName}</td>
          <td style="padding:9px 16px;font-size:13px;color:${MUTED};border-top:1px solid #e5e7eb;text-align:right;">${fmt(li.hours * li.rate)}</td>
        </tr>`).join("")
    : serviceName
    ? `<tr><td style="padding:9px 16px;font-size:13px;color:${TEXT};border-top:1px solid #e5e7eb;">${serviceName}</td>
       <td style="padding:9px 16px;font-size:13px;color:${TEXT};border-top:1px solid #e5e7eb;text-align:right;">${fmt(amountPaid)}</td></tr>`
    : "";

  const creditRows = creditItems.map(li => `
    <tr style="background:#eff6ff;">
      <td style="padding:9px 16px;font-size:13px;color:#1d4ed8;font-style:italic;border-top:1px solid #dbeafe;">${li.serviceName}</td>
      <td style="padding:9px 16px;font-size:13px;color:#1d4ed8;font-style:italic;border-top:1px solid #dbeafe;text-align:right;">-${fmt(Math.abs(li.hours * li.rate))}</td>
    </tr>`).join("");

  const hasSurcharge = !!surchargeAmount && surchargeAmount > 0;
  const invoiceBalance = hasSurcharge ? amountPaid - surchargeAmount! : null;

  const surchargeRows = hasSurcharge
    ? `<tr style="background:#f9fafb;">
        <td style="padding:9px 16px;font-size:13px;color:${MUTED};border-top:1px solid #e5e7eb;">Subtotal</td>
        <td style="padding:9px 16px;font-size:13px;color:${MUTED};border-top:1px solid #e5e7eb;text-align:right;">${fmt(invoiceBalance!)}</td>
      </tr>
      <tr>
        <td style="padding:9px 16px;font-size:13px;color:${TEXT};border-top:1px solid #e5e7eb;">Credit Card Transaction</td>
        <td style="padding:9px 16px;font-size:13px;color:${TEXT};border-top:1px solid #e5e7eb;text-align:right;">+${fmt(surchargeAmount!)}</td>
      </tr>`
    : "";

  const itemsTable = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:9px 16px;text-align:left;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Service</th>
          <th style="padding:9px 16px;text-align:right;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemRows}
        ${creditRows}
        ${surchargeRows}
      </tbody>
      <tfoot>
        <tr style="background:${LIGHT_GREEN};">
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:${GREEN};border-top:2px solid ${GREEN};">Total Paid</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:${GREEN};border-top:2px solid ${GREEN};text-align:right;">${fmt(amountPaid)}</td>
        </tr>
      </tfoot>
    </table>`;

  const metaRows = [
    { label: "Invoice", value: invoiceNumber },
    projectName ? { label: "Project", value: projectName } : null,
    { label: "Date", value: paidAt },
    { label: "Payment Method", value: methodLabel },
    transactionId ? { label: "Transaction ID", value: transactionId } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const metaTable = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${metaRows.map((r, i) => `
      <tr>
        <td style="padding:${i === 0 ? "0" : "8px"} 0 0;font-size:12px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.4px;width:40%;vertical-align:top;">${r.label}</td>
        <td style="padding:${i === 0 ? "0" : "8px"} 0 0;font-size:13px;color:${TEXT};vertical-align:top;">${r.value}</td>
      </tr>`).join("")}
    </table>`;

  const contactLine = [companyEmail, companyPhone].filter(Boolean).join(" &nbsp;&bull;&nbsp; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Payment Confirmation — ${invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:${GREEN};padding:28px 32px;border-radius:12px 12px 0 0;">
          ${logoHtml}
          <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${companyName}</p>
          <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Payment Confirmation</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:36px 32px;border-radius:0 0 12px 12px;">

          <!-- Confirmation badge -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;width:100%;">
            <tr>
              <td style="background:${LIGHT_GREEN};border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:14px;vertical-align:middle;">
                      <table cellpadding="0" cellspacing="0"><tr><td style="width:40px;height:40px;background:${GREEN};border-radius:50%;text-align:center;vertical-align:middle;font-size:20px;color:#ffffff;font-weight:bold;line-height:40px;">&#10003;</td></tr></table>
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-size:16px;font-weight:700;color:${GREEN};">Payment received</p>
                      <p style="margin:3px 0 0;font-size:13px;color:#4d7c68;">${fmt(amountPaid)} has been successfully processed.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 24px;font-size:15px;color:${TEXT};line-height:1.6;">Hi ${firstName},<br /><br />Thank you for your payment. Here is a summary for your records.</p>

          ${metaTable}
          ${itemsTable}

          <p style="margin:0 0 6px;font-size:13px;color:${MUTED};line-height:1.6;">Questions about this payment? Reply to this email or reach out to your coordinator.</p>
          ${contactLine ? `<p style="margin:0 0 0;font-size:13px;color:${MUTED};">${contactLine}</p>` : ""}

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 0 0;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">${companyName} &mdash; Billing</p>
          <p style="margin:0;font-size:11px;color:#d1d5db;">This is a transactional receipt for invoice ${invoiceNumber}. Top Tier Transitions LLC &middot; Greater Hartford, CT</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Client Pipeline Report Email ─────────────────────────────────────────────

export type ClientPipelineRow = {
  clientName: string;
  location: string;
  value: number;
  referralSource: string;
  ownerName: string;
  expectedCloseDate?: string;
  nextStepDate?: string;
  nextStepNote?: string;
  wonAt?: string;
  lostAt?: string;
  lostReason?: string;
  createdAt: string;
  notes?: string;
};

export function buildClientPipelineEmail({
  wonRows,
  proposingRows,
  qualifyingRows,
  leadRows,
  lostRows,
  deletedRows,
  generatedAt,
}: {
  wonRows: ClientPipelineRow[];
  proposingRows: ClientPipelineRow[];
  qualifyingRows: ClientPipelineRow[];
  leadRows: ClientPipelineRow[];
  lostRows: ClientPipelineRow[];
  deletedRows: ClientPipelineRow[];
  generatedAt: string;
}): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const in7Days = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  function fmtDate(d?: string): string {
    if (!d) return "—";
    const [y, m, day] = d.slice(0, 10).split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}`;
  }

  function fmtMoney(n: number): string {
    if (!n) return "—";
    return "$" + n.toLocaleString("en-US");
  }

  function nextStepBg(d: string | undefined, isWon: boolean): string {
    if (isWon) return "#f0fdf4";
    if (!d || d >= todayStr) return "#ffffff";
    return "#FEF2F2";
  }

  const pipelineStages = [
    { label: "Proposing", rows: proposingRows },
    { label: "Qualifying", rows: qualifyingRows },
    { label: "Lead", rows: leadRows },
  ];

  const totalPipelineValue =
    proposingRows.reduce((s, r) => s + r.value, 0) +
    qualifyingRows.reduce((s, r) => s + r.value, 0) +
    leadRows.reduce((s, r) => s + r.value, 0);

  const totalWonValue = wonRows.reduce((s, r) => s + r.value, 0);
  const totalOpps = proposingRows.length + qualifyingRows.length + leadRows.length;

  const STAGE_COLORS: Record<string, { accent: string; bg: string; text: string }> = {
    Won:        { accent: "#16a34a", bg: "#f0fdf4", text: "#15803d" },
    Proposing:  { accent: "#C9A96E", bg: "#fefce8", text: "#92400e" },
    Qualifying: { accent: "#f97316", bg: "#fff7ed", text: "#c2410c" },
    Lead:       { accent: "#6b7280", bg: "#f9fafb", text: "#374151" },
  };

  function pipelineRow(r: ClientPipelineRow, includeWonDate = false): string {
    const isWon = includeWonDate;
    const bg = nextStepBg(r.nextStepDate, isWon);
    const nsdColor = isWon
      ? "#15803d"
      : (!r.nextStepDate || r.nextStepDate >= todayStr) ? "#374151" : "#dc2626";
    return `<tr style="background:${bg};border-bottom:1px solid #e5e7eb;">
      <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#1f2937;white-space:nowrap;vertical-align:top;">${r.clientName}</td>
      <td style="padding:9px 12px;font-size:12px;color:#6b7280;white-space:nowrap;vertical-align:top;">${r.location || "—"}</td>
      <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#2d4a3e;white-space:nowrap;vertical-align:top;">${fmtMoney(r.value)}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;vertical-align:top;">${r.referralSource || "—"}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;white-space:nowrap;vertical-align:top;">${r.ownerName || "—"}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;white-space:nowrap;vertical-align:top;">${fmtDate(r.expectedCloseDate)}</td>
      ${includeWonDate ? `<td style="padding:9px 12px;font-size:12px;color:#16a34a;white-space:nowrap;vertical-align:top;font-weight:500;">${fmtDate(r.wonAt)}</td>` : ""}
      <td style="padding:9px 12px;font-size:12px;color:${nsdColor};white-space:nowrap;vertical-align:top;font-weight:${r.nextStepDate ? "500" : "400"};">${fmtDate(r.nextStepDate)}</td>
      <td style="padding:9px 12px;font-size:12px;color:#374151;max-width:200px;vertical-align:top;">${r.nextStepNote || "—"}</td>
    </tr>`;
  }

  function thead(includeWonDate = false): string {
    return `<thead><tr style="background:#f3f4f6;">
      <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Client</th>
      <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Location</th>
      <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Value</th>
      <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Referral Source</th>
      <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Owner</th>
      <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Close Date</th>
      ${includeWonDate ? `<th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Won</th>` : ""}
      <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Next Step</th>
      <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Next Step Note</th>
    </tr></thead>`;
  }

  function sectionBlock(label: string, rows: ClientPipelineRow[], includeWonDate = false): string {
    if (rows.length === 0) return "";
    const c = STAGE_COLORS[label] ?? STAGE_COLORS["Lead"];
    const sectionValue = rows.reduce((s, r) => s + r.value, 0);
    return `<tr><td style="padding:24px 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-left:4px solid ${c.accent};padding-left:12px;">
              <span style="font-size:15px;font-weight:700;color:#1f2937;">${label}</span>
              <span style="font-size:12px;color:#9ca3af;margin-left:8px;">${rows.length} opp${rows.length !== 1 ? "s" : ""}</span>
              <span style="font-size:12px;font-weight:600;color:${c.text};margin-left:10px;">· ${fmtMoney(sectionValue)}</span>
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          ${thead(includeWonDate)}
          <tbody>${rows.map(r => pipelineRow(r, includeWonDate)).join("")}</tbody>
        </table>
      </td></tr>`;
  }

  function lostSection(): string {
    if (lostRows.length === 0) return "";
    return `
      <tr><td style="padding:28px 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-top:2px solid #e5e7eb;"></td>
          <td style="padding:0 14px;white-space:nowrap;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Lost Last 7 Days</td>
          <td style="border-top:2px solid #e5e7eb;"></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:0 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-left:4px solid #dc2626;padding-left:12px;">
            <span style="font-size:15px;font-weight:700;color:#1f2937;">Lost</span>
            <span style="font-size:12px;color:#9ca3af;margin-left:8px;">${lostRows.length} opp${lostRows.length !== 1 ? "s" : ""}</span>
            <span style="font-size:12px;font-weight:600;color:#dc2626;margin-left:10px;">· ${fmtMoney(lostRows.reduce((s, r) => s + r.value, 0))} pipeline lost</span>
          </td>
        </tr></table>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #fecaca;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#fef2f2;">
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Client</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Location</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Value</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Referral Source</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Owner</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Lost Date</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Lost Reason</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Notes</th>
          </tr></thead>
          <tbody>
            ${lostRows.map(r => `<tr style="background:#ffffff;border-bottom:1px solid #fecaca;">
              <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#1f2937;white-space:nowrap;vertical-align:top;">${r.clientName}</td>
              <td style="padding:9px 12px;font-size:12px;color:#6b7280;white-space:nowrap;vertical-align:top;">${r.location || "—"}</td>
              <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#2d4a3e;white-space:nowrap;vertical-align:top;">${fmtMoney(r.value)}</td>
              <td style="padding:9px 12px;font-size:12px;color:#374151;vertical-align:top;">${r.referralSource || "—"}</td>
              <td style="padding:9px 12px;font-size:12px;color:#374151;white-space:nowrap;vertical-align:top;">${r.ownerName || "—"}</td>
              <td style="padding:9px 12px;font-size:12px;color:#dc2626;white-space:nowrap;vertical-align:top;font-weight:500;">${fmtDate(r.lostAt)}</td>
              <td style="padding:9px 12px;font-size:12px;color:#7f1d1d;white-space:nowrap;vertical-align:top;font-weight:500;">${r.lostReason || "—"}</td>
              <td style="padding:9px 12px;font-size:12px;color:#374151;max-width:220px;vertical-align:top;">${r.notes || "—"}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </td></tr>`;
  }

  function deletedSection(): string {
    if (deletedRows.length === 0) return "";
    return `
      <tr><td style="padding:28px 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-top:2px solid #e5e7eb;"></td>
          <td style="padding:0 14px;white-space:nowrap;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Deleted Last 7 Days</td>
          <td style="border-top:2px solid #e5e7eb;"></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:0 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-left:4px solid #7f1d1d;padding-left:12px;">
            <span style="font-size:15px;font-weight:700;color:#1f2937;">Deleted</span>
            <span style="font-size:12px;color:#9ca3af;margin-left:8px;">${deletedRows.length} opp${deletedRows.length !== 1 ? "s" : ""}</span>
            <span style="font-size:12px;font-weight:600;color:#7f1d1d;margin-left:10px;">· ${fmtMoney(deletedRows.reduce((s, r) => s + r.value, 0))} removed</span>
          </td>
        </tr></table>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #fca5a5;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#fee2e2;">
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Client</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Location</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Value</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Referral Source</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Owner</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Stage at Deletion</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;white-space:nowrap;">Notes</th>
          </tr></thead>
          <tbody>
            ${deletedRows.map(r => `<tr style="background:#ffffff;border-bottom:1px solid #fca5a5;">
              <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#1f2937;white-space:nowrap;vertical-align:top;">${r.clientName}</td>
              <td style="padding:9px 12px;font-size:12px;color:#6b7280;white-space:nowrap;vertical-align:top;">${r.location || "—"}</td>
              <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#2d4a3e;white-space:nowrap;vertical-align:top;">${fmtMoney(r.value)}</td>
              <td style="padding:9px 12px;font-size:12px;color:#374151;vertical-align:top;">${r.referralSource || "—"}</td>
              <td style="padding:9px 12px;font-size:12px;color:#374151;white-space:nowrap;vertical-align:top;">${r.ownerName || "—"}</td>
              <td style="padding:9px 12px;font-size:12px;color:#7f1d1d;white-space:nowrap;vertical-align:top;font-weight:500;">${r.lostReason || "—"}</td>
              <td style="padding:9px 12px;font-size:12px;color:#374151;max-width:220px;vertical-align:top;">${r.notes || "—"}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </td></tr>`;
  }

  const wonSection = wonRows.length > 0 ? sectionBlock("Won", wonRows, true) : "";
  const wonDivider = wonRows.length > 0 ? `<tr><td style="padding:8px 0 4px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="border-top:2px solid #e5e7eb;"></td>
      <td style="padding:0 14px;white-space:nowrap;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Active Pipeline</td>
      <td style="border-top:2px solid #e5e7eb;"></td>
    </tr></table>
  </td></tr>` : "";

  const pipelineSections = pipelineStages.map(s => sectionBlock(s.label, s.rows)).join("");

  const emptySections = pipelineStages.every(s => s.rows.length === 0) && wonRows.length === 0
    ? `<tr><td style="padding:40px 0;text-align:center;color:#9ca3af;font-size:14px;">No opportunities found.</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:960px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);" cellpadding="0" cellspacing="0">

        <!-- Header -->
        <tr style="background:#2d4a3e;">
          <td style="padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;color:#C9A96E;text-transform:uppercase;">Top Tier Transitions</p>
            <h1 style="margin:6px 0 0;font-size:24px;font-weight:700;color:#ffffff;">Client Pipeline Report</h1>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.6);">Generated ${generatedAt}</p>
          </td>
        </tr>

        <!-- Summary bar -->
        <tr><td style="padding:0;border-bottom:1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:16px 32px;border-right:1px solid #e5e7eb;">
                <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Won Last 7 Days</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#16a34a;">${wonRows.length > 0 ? fmtMoney(totalWonValue) : "—"}</p>
                <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${wonRows.length} deal${wonRows.length !== 1 ? "s" : ""}</p>
              </td>
              <td style="padding:16px 32px;border-right:1px solid #e5e7eb;">
                <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Active Pipeline</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#2d4a3e;">${fmtMoney(totalPipelineValue)}</p>
                <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${totalOpps} open opp${totalOpps !== 1 ? "s" : ""}</p>
              </td>
              <td style="padding:16px 32px;border-right:1px solid #e5e7eb;">
                <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">By Stage</p>
                <p style="margin:6px 0 0;font-size:12px;color:#374151;line-height:1.8;">
                  <span style="color:#C9A96E;font-weight:600;">Proposing:</span> ${proposingRows.length} &nbsp;
                  <span style="color:#f97316;font-weight:600;">Qualifying:</span> ${qualifyingRows.length} &nbsp;
                  <span style="color:#6b7280;font-weight:600;">Lead:</span> ${leadRows.length}
                </p>
              </td>
              <td style="padding:16px 32px;">
                <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Lost Last 7 Days</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#dc2626;">${lostRows.length > 0 ? fmtMoney(lostRows.reduce((s, r) => s + r.value, 0)) : "—"}</p>
                <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${lostRows.length} deal${lostRows.length !== 1 ? "s" : ""}</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:8px 32px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${wonSection}
            ${wonDivider}
            ${pipelineSections}
            ${emptySections}
            ${lostSection()}
            ${deletedSection()}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr style="background:#f9fafb;border-top:1px solid #e5e7eb;">
          <td style="padding:16px 32px;font-size:11px;color:#9ca3af;">
            Rightsize &middot; Top Tier Transitions &middot; Internal use only &middot;
            Row tinting: <span style="background:#FEF2F2;padding:1px 4px;border-radius:3px;">red = next step overdue</span> &nbsp;
            <span style="background:#FFFBEB;padding:1px 4px;border-radius:3px;">amber = due within 7 days</span>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Partner Active Project Update Email ─────────────────────────────────────
export function buildPartnerActiveUpdateEmail({
  contactFirstName,
  companyName,
  projects,
  sentByName,
  sentDate,
}: {
  contactFirstName: string;
  companyName: string;
  projects: Array<{
    name: string;
    city?: string;
    state?: string;
    timeline: Array<{ date: string; label: string; isKeyDate: boolean }>;
  }>;
  sentByName?: string;
  sentDate: string;
}): string {
  function fmtDate(d: string): string {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function timelineRows(timeline: Array<{ date: string; label: string; isKeyDate: boolean }>): string {
    return timeline.map((item, i) => {
      const alt = i % 2 === 1;
      if (item.isKeyDate) {
        return `<tr style="background:${alt ? "#f0fdf9" : "#ffffff"};">
          <td style="padding:11px 16px;border-top:1px solid #f3f4f6;">
            <table cellpadding="0" cellspacing="0" style="width:100%;"><tr>
              <td style="width:72px;vertical-align:middle;padding-right:12px;">
                <span style="display:inline-block;background:#dcfce7;color:#065f46;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 8px;border-radius:4px;white-space:nowrap;">Key Date</span>
              </td>
              <td style="font-size:14px;color:#111827;font-weight:600;">${item.label}</td>
              <td style="font-size:12px;color:#6b7280;white-space:nowrap;text-align:right;padding-left:12px;">${fmtDate(item.date)}</td>
            </tr></table>
          </td>
        </tr>`;
      } else {
        return `<tr style="background:${alt ? "#fafafa" : "#ffffff"};">
          <td style="padding:10px 16px;border-top:1px solid #f3f4f6;">
            <table cellpadding="0" cellspacing="0" style="width:100%;"><tr>
              <td style="width:72px;vertical-align:middle;padding-right:12px;">
                <span style="display:inline-block;background:#f3f4f6;color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 8px;border-radius:4px;white-space:nowrap;">Service</span>
              </td>
              <td style="font-size:13px;color:#374151;">${item.label}</td>
              <td style="font-size:12px;color:#9ca3af;white-space:nowrap;text-align:right;padding-left:12px;">${fmtDate(item.date)}</td>
            </tr></table>
          </td>
        </tr>`;
      }
    }).join("");
  }

  function projectCard(p: { name: string; city?: string; state?: string; timeline: Array<{ date: string; label: string; isKeyDate: boolean }> }): string {
    const loc = [p.city, p.state].filter(Boolean).join(", ");
    const rows = timelineRows(p.timeline);
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <tr><td style="background:#f8faf9;padding:14px 16px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#111827;">${p.name}</p>
        ${loc ? `<p style="margin:3px 0 0;font-size:12px;color:#9ca3af;">${loc}</p>` : ""}
      </td></tr>
      ${rows || `<tr><td style="padding:13px 16px;font-size:13px;color:#9ca3af;font-style:italic;">Scheduling in progress — dates will appear here as your project gets underway.</td></tr>`}
    </table>`;
  }

  const bodyContent = projects.length > 0
    ? projects.map(projectCard).join("")
    : `<p style="padding:20px 0;margin:0 0 28px;font-size:14px;color:#9ca3af;text-align:center;">No active projects at this time — we&rsquo;ll keep you posted as things develop.</p>`;

  const signOff = sentByName
    ? `Questions? Simply reply to this email or reach out to <strong style="color:#374151;">${sentByName}</strong> on our team.`
    : `Questions? Simply reply to this email and we&rsquo;ll be happy to help.`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Active Project Update &mdash; ${companyName}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#2d4a3e;padding:28px 32px;border-radius:12px 12px 0 0;">
    <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Top Tier Transitions</p>
    <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;font-weight:500;">Active Project Update &mdash; ${companyName}</p>
    <p style="margin:5px 0 0;color:rgba(255,255,255,0.35);font-size:11px;">${sentDate}</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.65;">Hi <strong>${contactFirstName}</strong>, here&rsquo;s a project status update for the referrals you&rsquo;ve sent our way.</p>
    ${bodyContent}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">${signOff}</p>
    <p style="margin:28px 0 0;font-size:12px;color:#d1d5db;text-align:center;border-top:1px solid #f3f4f6;padding-top:20px;">Top Tier Transitions &middot; toptiertransitions.com</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function buildEmailChangeNotificationEmail({
  fullName,
  oldEmail,
  newEmail,
  changedAt,
}: {
  fullName: string;
  oldEmail: string;
  newEmail: string;
  changedAt: string;
}): string {
  const initials = fullName
    .split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Email Address Changed — Top Tier Transitions</title>
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
                  <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Email Address Changed</p>
                </td>
                <td align="right" style="vertical-align:top;">
                  <p style="margin:0;font-size:12px;color:#a8d4bc;">${changedAt}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 14px 14px;">
            <table width="100%" cellpadding="0" cellspacing="0">

              <!-- User chip -->
              <tr>
                <td style="padding-bottom:24px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:48px;height:48px;border-radius:50%;background:#2E6B4F;font-size:18px;font-weight:700;color:#ffffff;text-align:center;line-height:48px;vertical-align:middle;">${initials}</td>
                      <td style="padding-left:14px;vertical-align:middle;">
                        <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">${fullName}</p>
                        <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">updated their email address</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Old email -->
              <tr>
                <td style="padding-bottom:10px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
                    <tr>
                      <td style="padding:14px 18px;">
                        <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ef4444;">Previous Email</p>
                        <p style="margin:0;font-size:14px;color:#374151;font-family:monospace;">${oldEmail}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- New email -->
              <tr>
                <td style="padding-bottom:24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;">
                    <tr>
                      <td style="padding:14px 18px;">
                        <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#16a34a;">New Email</p>
                        <p style="margin:0;font-size:14px;color:#374151;font-family:monospace;">${newEmail}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Info note -->
              <tr>
                <td style="padding-bottom:24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                    <tr>
                      <td style="padding:14px 18px;">
                        <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
                          Airtable has been <strong>automatically updated</strong> to reflect the new email. Shift invitations going forward will use the new address.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td align="center" style="padding-bottom:28px;">
                  <a href="https://app.toptiertransitions.com/admin/users"
                     style="display:inline-block;background:#1a3d2b;color:#ffffff;font-size:13px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
                    View in Admin Users
                  </a>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="border-top:1px solid #f3f4f6;padding-top:20px;">
                  <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">Top Tier Transitions &middot; toptiertransitions.com</p>
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

// ─── Internal Wrap Notification (sent to TTTSales when Full Invoice is sent) ──
export function buildWrappedNotificationEmail({
  tenantName,
  invoiceNumber,
  estimatedValue,
  invoicedServicesAmount,
  salesRepName,
  teamLeadName,
  referralPartner,
  internalNotes,
}: {
  tenantName: string;
  invoiceNumber: string;
  estimatedValue: number;
  invoicedServicesAmount: number;
  salesRepName: string;
  teamLeadName?: string;
  referralPartner?: { name: string; email?: string; phone?: string };
  internalNotes: Array<{ authorName: string; content: string; createdAt: string }>;
}): string {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const variance = invoicedServicesAmount - estimatedValue;
  const varianceLabel = variance >= 0 ? "Overage" : "Underage";
  const varianceColor = variance >= 0 ? "#15803d" : "#b91c1c";
  const varianceBg = variance >= 0 ? "#f0fdf4" : "#fef2f2";
  const varianceSign = variance >= 0 ? "+" : "";

  const notesHtml = internalNotes.length === 0
    ? `<p style="margin:0;font-size:13px;color:#6b7280;font-style:italic;">No internal notes on file.</p>`
    : internalNotes.map(n => {
        const date = n.createdAt
          ? new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "";
        return `<div style="padding:10px 12px;background:#f9fafb;border-left:3px solid #1a3d2b;border-radius:0 6px 6px 0;margin-bottom:8px;"><p style="margin:0 0 4px;font-size:11px;color:#6b7280;">${n.authorName}${date ? ` &middot; ${date}` : ""}</p><p style="margin:0;font-size:13px;color:#111827;white-space:pre-line;">${n.content.length > 400 ? n.content.slice(0, 400) + "..." : n.content}</p></div>`;
      }).join("");

  const referralHtml = referralPartner
    ? `<tr><td style="padding:0 0 20px;"><p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Referral Partner</p><table style="border-collapse:collapse;width:100%;"><tr><td style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;"><p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${referralPartner.name}</p>${referralPartner.email ? `<p style="margin:4px 0 0;font-size:13px;color:#374151;">${referralPartner.email}</p>` : ""}${referralPartner.phone ? `<p style="margin:4px 0 0;font-size:13px;color:#374151;">${referralPartner.phone}</p>` : ""}</td></tr></table></td></tr>`
    : `<tr><td style="padding:0 0 20px;"><p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Referral Partner</p><p style="margin:0;font-size:13px;color:#6b7280;font-style:italic;">No referral partner on this project.</p></td></tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#1a3d2b;padding:28px 32px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#86efac;text-transform:uppercase;letter-spacing:.1em;">Internal Notification</p>
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.2;">${tenantName} Just Wrapped</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#a7f3d0;">Invoice ${invoiceNumber} sent to client</p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:28px 32px;">
          <table style="border-collapse:collapse;width:100%;">
            <tr><td style="padding:0 0 24px;">
              <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Project Financials</p>
              <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr style="background:#f9fafb;"><td style="padding:10px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;">Budget / Estimated Value</td><td style="padding:10px 14px;font-size:13px;font-weight:600;color:#111827;text-align:right;border-bottom:1px solid #e5e7eb;">${fmt(estimatedValue)}</td></tr>
                <tr><td style="padding:10px 14px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;">Final Services Invoiced</td><td style="padding:10px 14px;font-size:13px;font-weight:600;color:#111827;text-align:right;border-bottom:1px solid #e5e7eb;">${fmt(invoicedServicesAmount)}</td></tr>
                <tr style="background:${varianceBg};"><td style="padding:10px 14px;font-size:13px;font-weight:600;color:${varianceColor};">${varianceLabel}</td><td style="padding:10px 14px;font-size:14px;font-weight:700;color:${varianceColor};text-align:right;">${varianceSign}${fmt(Math.abs(variance))}</td></tr>
              </table>
            </td></tr>
            <tr><td style="padding:0 0 20px;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Team</p>
              <table style="border-collapse:collapse;width:100%;">
                <tr><td style="padding:8px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px 8px 0 0;border-bottom:none;font-size:12px;color:#6b7280;">Sales Owner</td><td style="padding:8px 14px;background:#f9fafb;border-top:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-bottom:none;border-radius:0 8px 0 0;font-size:13px;font-weight:600;color:#111827;text-align:right;">${salesRepName}</td></tr>
                <tr><td style="padding:8px 14px;background:#ffffff;border:1px solid #e5e7eb;border-radius:0 0 0 8px;font-size:12px;color:#6b7280;">Team Lead</td><td style="padding:8px 14px;background:#ffffff;border-top:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;border-radius:0 0 8px 0;font-size:13px;font-weight:600;color:#111827;text-align:right;">${teamLeadName || "&#8212;"}</td></tr>
              </table>
            </td></tr>
            ${referralHtml}
            <tr><td style="padding:0;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Internal Notes (Plan Page)</p>
              ${notesHtml}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">Top Tier Transitions &middot; Internal Use Only</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── eBay listing notification ─────────────────────────────────────────────────
export function buildEbayListingEmail(p: {
  itemName: string;
  category: string;
  condition: string;
  price: number;
  listingId: string;
  listingUrl: string;
  rightsizeUrl: string;
}): string {
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>eBay Listing Published</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#1a3d2b;padding:28px 32px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#6ee7b7;text-transform:uppercase;letter-spacing:.1em;">Top Tier Transitions</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;">eBay Listing Published</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Item Details</td></tr>
            <tr style="border-top:1px solid #e5e7eb;">
              <td style="padding:10px 14px;font-size:13px;color:#374151;">Title</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#111827;text-align:right;">${p.itemName}</td>
            </tr>
            <tr style="border-top:1px solid #e5e7eb;background:#f9fafb;">
              <td style="padding:10px 14px;font-size:13px;color:#374151;">Category</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#111827;text-align:right;">${p.category}</td>
            </tr>
            <tr style="border-top:1px solid #e5e7eb;">
              <td style="padding:10px 14px;font-size:13px;color:#374151;">Condition</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#111827;text-align:right;">${p.condition}</td>
            </tr>
            <tr style="border-top:1px solid #e5e7eb;background:#f9fafb;">
              <td style="padding:10px 14px;font-size:13px;color:#374151;">List Price</td>
              <td style="padding:10px 14px;font-size:14px;font-weight:700;color:#1a3d2b;text-align:right;">$${fmt(p.price)}</td>
            </tr>
            <tr style="border-top:1px solid #e5e7eb;">
              <td style="padding:10px 14px;font-size:13px;color:#374151;">eBay Listing ID</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#111827;text-align:right;font-family:monospace;">${p.listingId}</td>
            </tr>
          </table>

          <table role="presentation" width="100%" style="margin-top:24px;">
            <tr>
              <td style="padding-right:8px;">
                <a href="${p.listingUrl}" style="display:block;text-align:center;padding:11px 0;background:#e43137;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;border-radius:10px;">View on eBay</a>
              </td>
              <td style="padding-left:8px;">
                <a href="${p.rightsizeUrl}" style="display:block;text-align:center;padding:11px 0;background:#1a3d2b;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;border-radius:10px;">View in Rightsize</a>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">Top Tier Transitions &middot; Internal Use Only</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildItemSoldEmail({
  itemName,
  photoUrl,
  projectName,
  itemId,
  barcodeNumber,
  primaryRoute,
  salePrice,
  staffSellerName,
  buyerName,
  consignorPayout,
  saleDate,
  catalogUrl,
  zelleMatch,
  markedSoldBy,
  markedSoldBySource = "Manual",
  isAdjustment = false,
  changedFields = [],
}: {
  itemName: string;
  photoUrl?: string;
  projectName: string;
  itemId: string;
  barcodeNumber?: string;
  primaryRoute: string;
  salePrice: number;
  staffSellerName?: string;
  buyerName?: string;
  consignorPayout?: number;
  saleDate: string;
  catalogUrl: string;
  zelleMatch?: { payerName: string; amount: number; sentOn: string; memo?: string };
  markedSoldBy?: string;
  markedSoldBySource?: "Manual" | "Square";
  isAdjustment?: boolean;
  changedFields?: Array<{ label: string; oldValue: string; newValue: string }>;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d: string) => {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const photoHtml = photoUrl
    ? `<img src="${photoUrl}" alt="${itemName}" width="120" height="120"
         style="display:block;width:120px;height:120px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb;" />`
    : `<div style="width:120px;height:120px;background:#e5e7eb;border-radius:10px;"></div>`;

  const detailRow = (label: string, value: string, highlight = false) => `
    <tr>
      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#6b7280;width:40%;border-bottom:1px solid #f3f4f6;">${label}</td>
      <td style="padding:10px 16px;font-size:13px;color:${highlight ? "#166534" : "#111827"};font-weight:${highlight ? "700" : "400"};border-bottom:1px solid #f3f4f6;">${value}</td>
    </tr>`;

  const recordedByLabel = markedSoldBySource === "Square"
    ? "Square Integration"
    : (markedSoldBy || "Unknown");

  const rows = [
    detailRow("Project", projectName),
    detailRow("Item ID / Barcode", barcodeNumber ? `#${barcodeNumber} &nbsp;<span style="color:#9ca3af;font-size:11px;">${itemId}</span>` : itemId),
    detailRow("Route", primaryRoute),
    detailRow("Sale Price", fmt(salePrice), true),
    ...(staffSellerName ? [detailRow("Staff Seller", staffSellerName)] : []),
    ...(buyerName ? [detailRow("Customer", buyerName)] : []),
    detailRow("Payout Owed to Client", consignorPayout != null && consignorPayout > 0 ? fmt(consignorPayout) : "N/A"),
    detailRow("Date of Sale", fmtDate(saleDate)),
    detailRow(
      isAdjustment ? "Updated By" : "Marked Sold By",
      markedSoldBySource === "Square"
        ? `<span style="background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.3px;">SQUARE</span> Square Integration`
        : recordedByLabel
    ),
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Item Sold &mdash; Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background-color:${isAdjustment ? "#7c2d12" : "#1a3d2b"};padding:28px 32px;border-radius:14px 14px 0 0;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${isAdjustment ? "#fdba74" : "#a8d4bc"};">Top Tier Transitions &nbsp;&bull;&nbsp; Internal Notification</p>
            <p style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${isAdjustment ? "Sale Record Updated" : "Item Sold"}</p>
            <p style="margin:4px 0 0;font-size:13px;color:${isAdjustment ? "#fdba74" : "#a8d4bc"};">${projectName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 14px 14px;">
            <table width="100%" cellpadding="0" cellspacing="0">

              ${isAdjustment ? `
              <!-- Adjustment banner -->
              <tr>
                <td style="padding:0 0 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
                    <tr>
                      <td style="padding:14px 18px;">
                        <p style="margin:0;font-size:13px;font-weight:700;color:#9a3412;">&#9888;&nbsp; This is not a new sale &mdash; an existing sale record was updated.</p>
                        <p style="margin:6px 0 0;font-size:12px;color:#c2410c;">The item was already marked Sold. Review the changes below.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>` : ""}

              <!-- Item card -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding-right:20px;vertical-align:top;">${photoHtml}</td>
                            <td style="vertical-align:middle;">
                              <span style="display:inline-block;background:${isAdjustment ? "#fff7ed" : "#dcfce7"};border:1px solid ${isAdjustment ? "#fed7aa" : "#86efac"};color:${isAdjustment ? "#9a3412" : "#166534"};font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px;margin-bottom:8px;">${isAdjustment ? "UPDATED" : "SOLD"}</span>
                              <p style="margin:0;font-size:17px;font-weight:700;color:#111827;line-height:1.3;">${itemName}</p>
                              <p style="margin:8px 0 0;font-size:22px;font-weight:800;color:#166534;">${fmt(salePrice)}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              ${!isAdjustment && staffSellerName ? `
              <!-- Congratulatory banner for staff seller -->
              <tr>
                <td style="padding:0 0 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;">
                    <tr>
                      <td style="padding:14px 18px;">
                        <p style="margin:0;font-size:14px;font-weight:700;color:#166534;">&#127881;&nbsp; Congratulations, ${staffSellerName}!</p>
                        <p style="margin:5px 0 0;font-size:13px;color:#15803d;">Great work rehoming this item!</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>` : ""}

              ${isAdjustment && changedFields.length > 0 ? `
              <!-- What changed -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fed7aa;border-radius:10px;overflow:hidden;">
                    <tr style="background:#fff7ed;">
                      <td colspan="3" style="padding:10px 16px;font-size:11px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #fed7aa;">What Changed</td>
                    </tr>
                    ${changedFields.map(f => `
                    <tr>
                      <td style="padding:9px 16px;font-size:13px;font-weight:600;color:#6b7280;width:35%;border-bottom:1px solid #f3f4f6;">${f.label}</td>
                      <td style="padding:9px 12px;font-size:13px;color:#6b7280;text-decoration:line-through;border-bottom:1px solid #f3f4f6;">${f.oldValue}</td>
                      <td style="padding:9px 16px;font-size:13px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;">&rarr;&nbsp; ${f.newValue}</td>
                    </tr>`).join("")}
                  </table>
                </td>
              </tr>` : ""}

              <!-- Details table -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                    <tr style="background:#f9fafb;">
                      <td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e5e7eb;">Transaction Details</td>
                    </tr>
                    ${rows}
                  </table>
                </td>
              </tr>

              ${zelleMatch ? `
              <!-- Zelle match -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border:1px solid #fde047;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="padding:12px 16px;border-bottom:1px solid #fde047;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td>
                              <span style="font-size:11px;font-weight:700;color:#854d0e;text-transform:uppercase;letter-spacing:.6px;">&#9888; Potential Zelle Payment Match</span>
                            </td>
                            <td align="right">
                              <span style="font-size:11px;color:#a16207;">Amount matches sale price</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:14px 16px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding-bottom:6px;">
                              <span style="font-size:13px;font-weight:700;color:#1c1917;">${zelleMatch.payerName}</span>
                              <span style="font-size:13px;color:#78716c;"> &nbsp;sent&nbsp; </span>
                              <span style="font-size:13px;font-weight:700;color:#166534;">$${zelleMatch.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-bottom:${zelleMatch.memo ? "6px" : "0"};">
                              <span style="font-size:12px;color:#78716c;">Sent on: ${new Date(zelleMatch.sentOn).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                            </td>
                          </tr>
                          ${zelleMatch.memo ? `
                          <tr>
                            <td>
                              <span style="font-size:12px;color:#78716c;">Memo: &ldquo;${zelleMatch.memo}&rdquo;</span>
                            </td>
                          </tr>` : ""}
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>` : ""}

              <!-- CTA -->
              <tr>
                <td style="padding:0 0 24px;">
                  <a href="${catalogUrl}"
                     style="display:block;background:#2E6B4F;color:#ffffff;font-size:14px;font-weight:700;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;">
                    View Item in Catalog &rarr;
                  </a>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="border-top:1px solid #e5e7eb;padding-top:20px;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">Top Tier Transitions &nbsp;&middot;&nbsp; <a href="https://app.toptiertransitions.com" style="color:#2E6B4F;text-decoration:none;">app.toptiertransitions.com</a></p>
                  <p style="margin:4px 0 0;font-size:11px;color:#d1d5db;text-align:center;">${isAdjustment ? "Internal use only &mdash; sent when a sold item&rsquo;s record is updated. This is not a new sale." : "Internal use only &mdash; sent automatically when an item is marked Sold."}</p>
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

export function buildStaffItemSoldEmail({
  staffSellerName,
  itemName,
  photoUrl,
  projectName,
  salePrice,
  primaryRoute,
  barcodeNumber,
  catalogUrl,
  labelFileName,
}: {
  staffSellerName: string;
  itemName: string;
  photoUrl?: string;
  projectName: string;
  salePrice: number;
  primaryRoute: string;
  barcodeNumber?: string;
  catalogUrl: string;
  labelFileName: string;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const routeLabel = primaryRoute === "Online Marketplace" ? "eBay" : primaryRoute;

  const photoHtml = photoUrl
    ? `<img src="${photoUrl}" alt="${itemName}" width="110" height="110"
         style="display:block;width:110px;height:110px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb;" />`
    : `<div style="width:110px;height:110px;background:#e5e7eb;border-radius:10px;display:flex;align-items:center;justify-content:center;"></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Item Sold &mdash; Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background-color:#1a3d2b;padding:28px 32px;border-radius:14px 14px 0 0;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#a8d4bc;">Top Tier Transitions &nbsp;&bull;&nbsp; Staff Notification</p>
            <p style="margin:8px 0 0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Your item sold!</p>
            <p style="margin:4px 0 0;font-size:13px;color:#a8d4bc;">Hi ${staffSellerName} &mdash; great work on the sale.</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 14px 14px;">
            <table width="100%" cellpadding="0" cellspacing="0">

              <!-- Item card -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding-right:18px;vertical-align:top;">${photoHtml}</td>
                            <td style="vertical-align:middle;">
                              <span style="display:inline-block;background:#dcfce7;border:1px solid #86efac;color:#166534;font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px;margin-bottom:8px;">SOLD</span>
                              <p style="margin:0;font-size:16px;font-weight:700;color:#111827;line-height:1.3;">${itemName}</p>
                              ${barcodeNumber ? `<p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Item #${barcodeNumber}</p>` : ""}
                              <p style="margin:10px 0 0;font-size:24px;font-weight:800;color:#166534;">${fmt(salePrice)}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Details -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                    <tr style="background:#f9fafb;">
                      <td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e5e7eb;">Sale Details</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#6b7280;width:40%;border-bottom:1px solid #f3f4f6;">Project</td>
                      <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${projectName}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#6b7280;width:40%;border-bottom:1px solid #f3f4f6;">Channel</td>
                      <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${routeLabel}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#166534;width:40%;">Sale Price</td>
                      <td style="padding:10px 16px;font-size:13px;font-weight:700;color:#166534;">${fmt(salePrice)}</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Shipping label notice -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
                    <tr>
                      <td style="padding:16px 20px;">
                        <p style="margin:0;font-size:13px;font-weight:700;color:#1e40af;">&#128230;&nbsp; Shipping label attached</p>
                        <p style="margin:6px 0 0;font-size:13px;color:#1e3a8a;line-height:1.5;">
                          A shipping label (<strong>${labelFileName}</strong>) is attached to this email.
                          Please print it and ship the item as soon as possible.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td style="padding:0 0 24px;">
                  <a href="${catalogUrl}"
                     style="display:block;background:#2E6B4F;color:#ffffff;font-size:14px;font-weight:700;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;">
                    View Item in Catalog &rarr;
                  </a>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="border-top:1px solid #e5e7eb;padding-top:20px;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">Top Tier Transitions &nbsp;&middot;&nbsp; <a href="https://app.toptiertransitions.com" style="color:#2E6B4F;text-decoration:none;">app.toptiertransitions.com</a></p>
                  <p style="margin:4px 0 0;font-size:11px;color:#d1d5db;text-align:center;">Sent automatically when a shipping label is added to a sold item.</p>
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

export function buildGoogleReviewNotificationEmail({
  projectName,
  stars,
  reviewText,
  sellerName,
  referralPartnerName,
  referralCompanyName,
  teamLeadName,
  teamMemberNames,
  planUrl,
}: {
  projectName: string;
  stars: number;
  reviewText: string;
  sellerName?: string;
  referralPartnerName?: string;
  referralCompanyName?: string;
  teamLeadName?: string;
  teamMemberNames: string[];
  planUrl: string;
}): string {
  const filledStar = `<span style="color:#f59e0b;font-size:22px;line-height:1;">&#9733;</span>`;
  const emptyStar = `<span style="color:#d1d5db;font-size:22px;line-height:1;">&#9733;</span>`;
  const starsHtml = Array.from({ length: 5 }, (_, i) => i < stars ? filledStar : emptyStar).join("");

  const row = (label: string, value: string, last = false) => `
    <tr style="${last ? "" : "border-bottom:1px solid #f3f4f6;"}">
      <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#6b7280;width:38%;vertical-align:top;">${label}</td>
      <td style="padding:11px 16px;font-size:13px;color:#111827;vertical-align:top;">${value}</td>
    </tr>`;

  const referralDisplay = referralPartnerName
    ? (referralCompanyName ? `${referralPartnerName} &mdash; ${referralCompanyName}` : referralPartnerName)
    : "&mdash;";

  const teamMembersDisplay = teamMemberNames.length > 0
    ? teamMemberNames.join(", ")
    : "&mdash;";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Google Review — Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background-color:#1a3d2b;padding:28px 32px;border-radius:14px 14px 0 0;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#a8d4bc;">Top Tier Transitions</p>
            <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">New Google Review</p>
            <p style="margin:6px 0 0;font-size:14px;color:#a8d4bc;">${projectName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 14px 14px;">
            <table width="100%" cellpadding="0" cellspacing="0">

              <!-- Star rating + review text -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <div style="margin:0 0 10px;">${starsHtml}</div>
                        <p style="margin:0;font-size:15px;color:#374151;line-height:1.65;font-style:italic;">&ldquo;${reviewText}&rdquo;</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Project details table -->
              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                    <tr style="background:#f9fafb;">
                      <td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e5e7eb;">Project Details</td>
                    </tr>
                    ${row("Project", projectName)}
                    ${row("Seller", sellerName ?? "&mdash;")}
                    ${row("Referral Partner", referralDisplay)}
                    ${row("Team Lead", teamLeadName ?? "&mdash;")}
                    ${row("Team Members", teamMembersDisplay, true)}
                  </table>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td style="padding:0 0 24px;">
                  <a href="${planUrl}"
                     style="display:block;background:#2E6B4F;color:#ffffff;font-size:14px;font-weight:700;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;">
                    View Project Plan &rarr;
                  </a>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="border-top:1px solid #e5e7eb;padding-top:20px;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">Top Tier Transitions &nbsp;&middot;&nbsp; <a href="https://app.toptiertransitions.com" style="color:#2E6B4F;text-decoration:none;">app.toptiertransitions.com</a></p>
                  <p style="margin:4px 0 0;font-size:11px;color:#d1d5db;text-align:center;">Sent automatically when a Google Review is added to a project.</p>
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

// ─── CRM: Stage Progress Notification ────────────────────────────────────────

export interface StageProgressEmailParams {
  contactName: string;
  contactTitle?: string;
  companyName: string;
  previousStage: string;
  newStage: string;
  ownerName: string;
  totalActivities: number;
  recentActivities: Array<{ date: string; type: string; note: string }>;
  nextStepDate?: string;
  nextStepNote?: string;
  crmUrl: string;
}

export function buildStageProgressEmail(p: StageProgressEmailParams): string {
  const STAGES = ["Identified", "Met", "Agreed to Refer", "Shared Leads", "Active Referral"];
  const newIdx = STAGES.indexOf(p.newStage);

  function fmtD(d: string): string {
    try { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; }
  }

  // ── Stage stepper ──────────────────────────────────────────────────────────
  const stepNodes = STAGES.map((stage, idx) => {
    const isDone    = idx < newIdx;
    const isCurrent = idx === newIdx;
    const dotBg    = isCurrent ? "#3d6b4f" : isDone ? "#bbf7d0" : "#e5e7eb";
    const dotColor = isCurrent ? "#ffffff" : isDone ? "#14532d" : "#9ca3af";
    const txtColor = isCurrent ? "#3d6b4f" : isDone ? "#374151" : "#9ca3af";
    const weight   = isCurrent ? "700" : isDone ? "500" : "400";
    const symbol   = isDone ? "✓" : isCurrent ? "★" : String(idx + 1);
    return `<td align="center" style="vertical-align:top;padding:0 2px;">
      <div style="width:26px;height:26px;border-radius:50%;background:${dotBg};color:${dotColor};font-size:10px;font-weight:700;line-height:26px;text-align:center;margin:0 auto;${isCurrent ? "box-shadow:0 0 0 3px #d1fae5;" : ""}">${symbol}</div>
      <div style="font-size:8px;color:${txtColor};font-weight:${weight};margin-top:5px;line-height:1.3;text-align:center;max-width:58px;word-wrap:break-word;">${stage}</div>
    </td>`;
  });
  const connectors = STAGES.slice(0, -1).map((_, idx) => {
    const active = idx < newIdx;
    return `<td style="vertical-align:top;padding:0;width:24px;padding-top:12px;"><div style="height:2px;background:${active ? "#4ade80" : "#e5e7eb"};"></div></td>`;
  });

  const stepperCells: string[] = [];
  for (let i = 0; i < STAGES.length; i++) {
    stepperCells.push(stepNodes[i]);
    if (i < STAGES.length - 1) stepperCells.push(connectors[i]);
  }

  // ── Recent activities ──────────────────────────────────────────────────────
  const actHtml = p.recentActivities.length > 0
    ? p.recentActivities.slice(0, 4).map(a => `
      <tr>
        <td style="padding:9px 16px;border-bottom:1px solid #f3f4f6;">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px;">${a.type} &middot; ${fmtD(a.date)}</div>
          <div style="font-size:13px;color:#374151;line-height:1.5;">${a.note ? (a.note.length > 130 ? a.note.slice(0, 130) + "…" : a.note) : "—"}</div>
        </td>
      </tr>`).join("")
    : `<tr><td style="padding:12px 16px;font-size:13px;color:#9ca3af;font-style:italic;">No activities logged yet.</td></tr>`;

  // ── Next step callout ──────────────────────────────────────────────────────
  let nextStepHtml = "";
  if (p.nextStepNote) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nsDate = p.nextStepDate ? new Date(p.nextStepDate + "T00:00:00") : null;
    const isOverdue = !!(nsDate && nsDate < today);
    const isSoon    = !!(nsDate && !isOverdue && (nsDate.getTime() - today.getTime()) / 86400000 <= 7);
    const bg     = isOverdue ? "#fef2f2" : isSoon ? "#fffbeb" : "#f0fdf4";
    const border = isOverdue ? "#fca5a5" : isSoon ? "#fcd34d" : "#86efac";
    const label  = isOverdue ? "#dc2626" : isSoon ? "#b45309" : "#15803d";
    const tag    = isOverdue ? " — OVERDUE" : isSoon ? " — Soon" : "";
    nextStepHtml = `
      <tr><td style="padding:0 24px;"><div style="height:1px;background:#f3f4f6;"></div></td></tr>
      <tr>
        <td style="padding:16px 24px;">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;margin-bottom:10px;">Next Step</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border-radius:8px;border:1px solid ${border};">
            <tr><td style="padding:12px 16px;">
              ${p.nextStepDate ? `<div style="font-size:11px;font-weight:700;color:${label};margin-bottom:4px;">${fmtD(p.nextStepDate)}${tag}</div>` : ""}
              <div style="font-size:13px;color:#374151;line-height:1.5;">${p.nextStepNote}</div>
            </td></tr>
          </table>
        </td>
      </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>Partnership Progress</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px 48px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

  <!-- Header bar -->
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1f2937;border-radius:12px 12px 0 0;">
      <tr><td style="padding:22px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;">Top Tier Transitions &middot; CRM</div>
            <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:4px;line-height:1.2;">Partnership Progress</div>
          </td>
          <td align="right" style="padding-left:12px;white-space:nowrap;font-size:26px;vertical-align:middle;">&#129309;</td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Card -->
  <tr><td style="background:#ffffff;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.07);">
    <table width="100%" cellpadding="0" cellspacing="0">

      <!-- Congrats opener -->
      <tr><td style="padding:28px 28px 4px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6d9e7a;margin-bottom:6px;">Partnership Milestone</div>
        <div style="font-size:24px;font-weight:700;color:#111827;line-height:1.25;margin-bottom:10px;">Great work, ${p.ownerName}!</div>
        <div style="font-size:15px;color:#4b5563;line-height:1.65;">
          <strong style="color:#111827;">${p.contactName}</strong>${p.contactTitle ? ` <span style="color:#9ca3af;font-size:13px;">(${p.contactTitle})</span>` : ""} at <strong style="color:#111827;">${p.companyName}</strong> just moved from
          <span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:4px;font-size:13px;font-weight:600;">${p.previousStage}</span>
          &rarr;
          <span style="background:#dcfce7;color:#14532d;padding:1px 6px;border-radius:4px;font-size:13px;font-weight:600;">${p.newStage}</span>
        </div>
      </td></tr>

      <!-- Stage stepper -->
      <tr><td style="padding:20px 20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>${stepperCells.join("")}</tr></table>
      </td></tr>

      <tr><td style="padding:0 24px;"><div style="height:1px;background:#f3f4f6;"></div></td></tr>

      <!-- Contact + total touches -->
      <tr><td style="padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr><td style="padding:16px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td>
                <div style="font-size:15px;font-weight:700;color:#111827;">${p.contactName}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:3px;">${p.contactTitle ? `${p.contactTitle} &middot; ` : ""}${p.companyName}</div>
              </td>
              <td align="right" style="vertical-align:top;white-space:nowrap;padding-left:12px;">
                <div style="background:#eff9f1;border-radius:20px;padding:7px 14px;text-align:center;">
                  <div style="font-size:22px;font-weight:700;color:#3d6b4f;line-height:1;">${p.totalActivities}</div>
                  <div style="font-size:10px;color:#6d9e7a;letter-spacing:0.04em;text-transform:uppercase;margin-top:2px;">Touches</div>
                </div>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 24px;"><div style="height:1px;background:#f3f4f6;"></div></td></tr>

      <!-- Recent activity -->
      <tr><td style="padding:20px 24px 0;">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;margin-bottom:10px;">Recent Activity</div>
      </td></tr>
      <tr><td style="padding:0 12px 4px;">
        <table width="100%" cellpadding="0" cellspacing="0">${actHtml}</table>
      </td></tr>

      ${nextStepHtml || "<tr><td style=\"height:12px;\"></td></tr>"}

      <!-- CTA -->
      <tr><td style="padding:20px 28px 28px;">
        <a href="${p.crmUrl}" style="display:inline-block;background:#3d6b4f;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:8px;letter-spacing:0.02em;">Open in CRM &rarr;</a>
      </td></tr>

    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 0 0;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.7;">Top Tier Transitions &middot; CRM Notifications</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── CRM: Active Referral Milestone Celebration ──────────────────────────────

export interface ActiveReferralCelebrationEmailParams {
  contactName: string;
  contactTitle?: string;
  companyName: string;
  ownerName: string;
  totalActivities: number;
  recentActivities: Array<{ date: string; type: string; note: string }>;
  nextStepDate?: string;
  nextStepNote?: string;
  crmUrl: string;
}

export function buildActiveReferralCelebrationEmail(p: ActiveReferralCelebrationEmailParams): string {
  function fmtD(d: string): string {
    try { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; }
  }

  const actHtml = p.recentActivities.length > 0
    ? p.recentActivities.slice(0, 4).map(a => `
      <tr>
        <td style="padding:9px 16px;border-bottom:1px solid #f0fdf4;">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#86efac;margin-bottom:3px;">${a.type} &middot; ${fmtD(a.date)}</div>
          <div style="font-size:13px;color:#ecfdf5;line-height:1.5;">${a.note ? (a.note.length > 130 ? a.note.slice(0, 130) + "…" : a.note) : "—"}</div>
        </td>
      </tr>`).join("")
    : "";

  let nextStepHtml = "";
  if (p.nextStepNote) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nsDate = p.nextStepDate ? new Date(p.nextStepDate + "T00:00:00") : null;
    const isOverdue = !!(nsDate && nsDate < today);
    const isSoon    = !!(nsDate && !isOverdue && (nsDate.getTime() - today.getTime()) / 86400000 <= 7);
    const tag = isOverdue ? " — OVERDUE" : isSoon ? " — Soon" : "";
    const labelColor = isOverdue ? "#fca5a5" : isSoon ? "#fde68a" : "#86efac";
    nextStepHtml = `
      <tr><td style="padding:16px 28px 0;">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#86efac;margin-bottom:10px;">Next Step</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.08);border-radius:8px;border:1px solid rgba(255,255,255,0.15);">
          <tr><td style="padding:12px 16px;">
            ${p.nextStepDate ? `<div style="font-size:11px;font-weight:700;color:${labelColor};margin-bottom:4px;">${fmtD(p.nextStepDate)}${tag}</div>` : ""}
            <div style="font-size:13px;color:#d1fae5;line-height:1.5;">${p.nextStepNote}</div>
          </td></tr>
        </table>
      </td></tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>Active Referral Milestone</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px 48px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

  <!-- Header -->
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1a3d28 0%,#2d6a4f 100%);border-radius:12px 12px 0 0;">
      <tr><td style="padding:28px 28px 24px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#86efac;margin-bottom:6px;">Top Tier Transitions &middot; CRM Milestone</div>
        <div style="font-size:28px;font-weight:700;color:#ffffff;line-height:1.2;margin-bottom:4px;">&#127942; Active Referral!</div>
        <div style="font-size:15px;color:#a7f3d0;line-height:1.5;">
          Congrats, <strong style="color:#ffffff;">${p.ownerName}</strong>! You turned <strong style="color:#ffffff;">${p.contactName}</strong> at <strong style="color:#ffffff;">${p.companyName}</strong> into an active referral partner.
        </div>
        <div style="margin-top:14px;padding:14px 18px;background:rgba(255,255,255,0.1);border-radius:10px;border-left:4px solid #4ade80;">
          <div style="font-size:15px;color:#f0fdf4;font-weight:600;font-style:italic;line-height:1.5;">&ldquo;Now let&rsquo;s defend this castle!&rdquo;</div>
        </div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Stats card inside dark bg continuation -->
  <tr><td style="background:#2d6a4f;padding:0 24px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.1);border-radius:10px;border:1px solid rgba(255,255,255,0.15);">
      <tr><td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <div style="font-size:16px;font-weight:700;color:#ffffff;">${p.contactName}</div>
            <div style="font-size:12px;color:#a7f3d0;margin-top:3px;">${p.contactTitle ? `${p.contactTitle} &middot; ` : ""}${p.companyName}</div>
          </td>
          <td align="right" style="vertical-align:top;white-space:nowrap;padding-left:12px;">
            <div style="background:rgba(255,255,255,0.15);border-radius:20px;padding:7px 16px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#ffffff;line-height:1;">${p.totalActivities}</div>
              <div style="font-size:9px;color:#86efac;letter-spacing:0.06em;text-transform:uppercase;margin-top:2px;">Touches to Win</div>
            </div>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Recent activity (dark card) -->
  ${p.recentActivities.length > 0 ? `
  <tr><td style="background:#2d6a4f;padding:0 24px 0;">
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#86efac;margin-bottom:10px;">The Journey</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.15);border-radius:10px;overflow:hidden;">${actHtml}</table>
  </td></tr>` : ""}

  ${nextStepHtml ? `<tr><td style="background:#2d6a4f;">${nextStepHtml.replace(/<tr><td/, "<td").replace(/<\/td><\/tr>/, "</td>")}</td></tr>` : ""}

  <!-- White bottom section -->
  <tr><td style="background:#2d6a4f;padding:24px 24px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px 10px 0 0;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.6;">The whole team is rooting for you. Keep the momentum going and let&rsquo;s make sure this partner stays engaged and keeps the referrals flowing.</p>
        <a href="${p.crmUrl}" style="display:inline-block;background:#3d6b4f;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:8px;letter-spacing:0.02em;">Open in CRM &rarr;</a>
      </td></tr>
    </table>
  </td></tr>

  <!-- White continuation to footer -->
  <tr><td style="background:#ffffff;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.07);">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:4px;"></td></tr></table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 0 0;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.7;">Top Tier Transitions &middot; CRM Notifications</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildQuoteAlertEmail({
  clientName,
  clientEmail,
  referralSource,
  projectName,
  opportunity,
  contract,
  quotePhotos,
  projectDetails,
}: {
  clientName: string;
  clientEmail?: string;
  referralSource?: string;
  projectName: string;
  opportunity?: {
    stage?: string;
    estimatedValue?: number;
    address?: string;
    addressUnitNumber?: string;
    city?: string;
    state?: string;
    zip?: string;
    destAddress?: string;
    destAddressUnitNumber?: string;
    destCity?: string;
    destState?: string;
    destZip?: string;
    seniorCommunityName?: string;
    expectedCloseDate?: string;
    notes?: string;
    keyPeople?: { name: string; relationship: string; email?: string; phone?: string }[];
  };
  contract: {
    totalCost: number;
    lineItems?: { serviceName: string; hours: number; rate: number; description?: string }[];
    discountCode?: string;
    discountAmount?: number;
    notInScope?: string;
  };
  quotePhotos?: { url: string }[];
  projectDetails?: {
    targetStartDate?: string;
    targetMoveDate?: string;
    datesFlexible?: boolean;
    deadlineNotes?: string;
    disposalNotes?: string;
    specialItems?: string;
    vendorNotes?: string;
  };
}): string {
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtHrs = (h: number) => {
    const rounded = Math.round(h * 10) / 10;
    return `${rounded} hr${rounded === 1 ? "" : "s"}`;
  };

  const GREEN = "#2E6B4F";
  const TEXT = "#374151";
  const MUTED = "#6b7280";
  const BORDER = "#e5e7eb";
  const BG = "#F5F0E8";

  const hasDiscount = !!contract.discountCode && !!contract.discountAmount && contract.discountAmount > 0;
  const lineItems = contract.lineItems ?? [];
  const totalHours = lineItems.reduce((s, li) => s + li.hours, 0);

  const originParts = [
    opportunity?.address
      ? opportunity.address + (opportunity.addressUnitNumber ? `, Unit ${opportunity.addressUnitNumber}` : "")
      : null,
    [opportunity?.city, opportunity?.state, opportunity?.zip].filter(Boolean).join(" "),
  ].filter(Boolean);
  const originStr = originParts.join(", ");

  const destParts = [
    opportunity?.destAddress
      ? opportunity.destAddress + (opportunity.destAddressUnitNumber ? `, Unit ${opportunity.destAddressUnitNumber}` : "")
      : null,
    [opportunity?.destCity, opportunity?.destState, opportunity?.destZip].filter(Boolean).join(" "),
  ].filter(Boolean);
  const destStr = destParts.join(", ");

  const closeDate = opportunity?.expectedCloseDate
    ? (() => {
        try {
          return new Date(opportunity.expectedCloseDate!).toLocaleDateString("en-US", {
            month: "long", day: "numeric", year: "numeric",
          });
        } catch { return opportunity.expectedCloseDate!; }
      })()
    : null;

  const detailRow = (label: string, value: string) =>
    `<tr>
      <td style="padding:8px 14px;font-size:13px;color:${MUTED};width:130px;vertical-align:top;border-top:1px solid ${BORDER};white-space:nowrap;">${label}</td>
      <td style="padding:8px 14px;font-size:13px;color:${TEXT};border-top:1px solid ${BORDER};border-left:1px solid ${BORDER};line-height:1.5;">${value}</td>
    </tr>`;

  const destCellValue = [
    opportunity?.seniorCommunityName
      ? `<strong style="color:#1d4ed8;">${opportunity.seniorCommunityName}</strong>`
      : "",
    destStr,
  ].filter(Boolean).join("<br>");

  const oppRows = [
    clientEmail
      ? detailRow("Email", `<a href="mailto:${clientEmail}" style="color:${GREEN};text-decoration:none;">${clientEmail}</a>`)
      : "",
    referralSource ? detailRow("Referral Source", referralSource) : "",
    opportunity?.stage ? detailRow("CRM Stage", opportunity.stage) : "",
    opportunity?.estimatedValue
      ? detailRow("Estimated Value", `<strong>${fmt(opportunity.estimatedValue)}</strong>`)
      : "",
    closeDate ? detailRow("Expected Close", closeDate) : "",
    originStr ? detailRow("Origin", originStr) : "",
    destCellValue ? detailRow("Destination", destCellValue) : "",
    opportunity?.notes
      ? detailRow("Notes", opportunity.notes.replace(/\n/g, "<br>"))
      : "",
  ].filter(Boolean).join("");

  const keyPeople = opportunity?.keyPeople ?? [];
  const keyPeopleSection =
    keyPeople.length > 0
      ? `<p style="margin:24px 0 8px;font-size:13px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Key People</p>
         <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;margin-bottom:24px;">
           <thead>
             <tr style="background-color:#f9fafb;">
               <th style="padding:9px 14px;text-align:left;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Name</th>
               <th style="padding:9px 14px;text-align:left;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Role</th>
               <th style="padding:9px 14px;text-align:left;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Contact</th>
             </tr>
           </thead>
           <tbody>
             ${keyPeople.map((p, i) =>
               `<tr${i % 2 === 1 ? ` style="background-color:#f9fafb;"` : ""}>
                 <td style="padding:9px 14px;font-size:13px;color:${TEXT};border-top:1px solid ${BORDER};font-weight:500;">${p.name}</td>
                 <td style="padding:9px 14px;font-size:13px;color:${MUTED};border-top:1px solid ${BORDER};">${p.relationship}</td>
                 <td style="padding:9px 14px;font-size:13px;color:${MUTED};border-top:1px solid ${BORDER};">${[p.email, p.phone].filter(Boolean).join(" &middot; ") || "&mdash;"}</td>
               </tr>`
             ).join("")}
           </tbody>
         </table>`
      : "";

  const serviceRows = lineItems.map((li, i) =>
    `<tr${i % 2 === 1 ? ` style="background-color:#f9fafb;"` : ""}>
      <td style="padding:10px 14px;font-size:13px;color:${TEXT};border-top:1px solid ${BORDER};">${li.serviceName}${li.description ? `<br><span style="font-size:12px;color:#9ca3af;">${li.description}</span>` : ""}</td>
      <td style="padding:10px 14px;font-size:13px;color:${MUTED};border-top:1px solid ${BORDER};text-align:right;white-space:nowrap;">${fmtHrs(li.hours)}</td>
      <td style="padding:10px 14px;font-size:13px;color:${MUTED};border-top:1px solid ${BORDER};text-align:right;white-space:nowrap;">${fmt(li.rate)}/hr</td>
      <td style="padding:10px 14px;font-size:13px;color:${TEXT};font-weight:600;border-top:1px solid ${BORDER};text-align:right;white-space:nowrap;">${fmt(li.hours * li.rate)}</td>
    </tr>`
  ).join("");

  const discountRows = hasDiscount
    ? `<tr>
        <td colspan="3" style="padding:9px 14px;font-size:13px;color:${MUTED};border-top:1px solid ${BORDER};">Subtotal</td>
        <td style="padding:9px 14px;font-size:13px;color:${MUTED};border-top:1px solid ${BORDER};text-align:right;white-space:nowrap;">${fmt(contract.totalCost + contract.discountAmount!)}</td>
      </tr>
      <tr style="background-color:#eff6ff;">
        <td colspan="3" style="padding:9px 14px;font-size:13px;color:#1d4ed8;border-top:1px solid #dbeafe;">Discount &mdash; ${contract.discountCode}</td>
        <td style="padding:9px 14px;font-size:13px;color:#1d4ed8;border-top:1px solid #dbeafe;text-align:right;white-space:nowrap;">&minus;${fmt(contract.discountAmount!)}</td>
      </tr>`
    : "";

  const quoteSection =
    lineItems.length > 0
      ? `<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Quote &mdash; Scope &amp; Pricing</p>
         <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;margin-bottom:24px;">
           <thead>
             <tr style="background-color:#f9fafb;">
               <th style="padding:9px 14px;text-align:left;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Service</th>
               <th style="padding:9px 14px;text-align:right;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Hours</th>
               <th style="padding:9px 14px;text-align:right;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Rate</th>
               <th style="padding:9px 14px;text-align:right;font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Value</th>
             </tr>
           </thead>
           <tbody>${serviceRows}${discountRows}</tbody>
           <tfoot>
             <tr style="background-color:#f0fdf4;">
               <td colspan="2" style="padding:12px 14px;font-size:14px;font-weight:bold;color:${GREEN};border-top:2px solid ${GREEN};">${hasDiscount ? "Total After Discount" : "Estimated Total"}</td>
               <td style="padding:12px 14px;font-size:13px;color:${MUTED};border-top:2px solid ${GREEN};text-align:right;white-space:nowrap;">${fmtHrs(totalHours)}</td>
               <td style="padding:12px 14px;font-size:14px;font-weight:bold;color:${GREEN};border-top:2px solid ${GREEN};text-align:right;white-space:nowrap;">${fmt(contract.totalCost)}</td>
             </tr>
           </tfoot>
         </table>`
      : `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;margin-bottom:24px;">
           <tr style="background-color:#f0fdf4;">
             <td style="padding:14px;font-size:14px;font-weight:bold;color:${GREEN};">Estimated Total</td>
             <td style="padding:14px;font-size:14px;font-weight:bold;color:${GREEN};text-align:right;">${fmt(contract.totalCost)}</td>
           </tr>
         </table>`;

  const notInScopeSection = contract.notInScope
    ? `<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Not in Scope</p>
       <p style="margin:0 0 24px;font-size:13px;color:${TEXT};line-height:1.6;padding:12px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;">${contract.notInScope.replace(/\n/g, "<br>")}</p>`
    : "";

  const projectDetailsSection = (() => {
    const pd = projectDetails;
    if (!pd) return "";
    const hasAny = pd.targetStartDate || pd.targetMoveDate || pd.datesFlexible || pd.deadlineNotes || pd.disposalNotes || pd.specialItems || pd.vendorNotes;
    if (!hasAny) return "";
    const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };
    const dr = (label: string, value: string, valColor = TEXT) =>
      `<tr>
        <td style="padding:9px 14px;font-size:13px;color:${MUTED};width:140px;vertical-align:top;border-top:1px solid ${BORDER};white-space:nowrap;">${label}</td>
        <td style="padding:9px 14px;font-size:13px;color:${valColor};border-top:1px solid ${BORDER};border-left:1px solid ${BORDER};line-height:1.5;">${value}</td>
      </tr>`;
    const rows = [
      pd.targetStartDate ? dr("Target Start", `<strong>${fmtDate(pd.targetStartDate)}</strong>`) : "",
      pd.targetMoveDate ? dr("Target Move", `<strong>${fmtDate(pd.targetMoveDate)}</strong>`) : "",
      (pd.targetStartDate || pd.targetMoveDate) ? dr("Dates Flexible?", pd.datesFlexible ? "Yes" : "No", pd.datesFlexible ? "#166534" : "#9a3412") : "",
      pd.deadlineNotes ? dr("Deadline Notes", pd.deadlineNotes.replace(/\n/g, "<br>")) : "",
      pd.disposalNotes ? dr("Disposal / Hauling", pd.disposalNotes.replace(/\n/g, "<br>")) : "",
      pd.specialItems ? dr("Special Items", pd.specialItems.replace(/\n/g, "<br>")) : "",
      pd.vendorNotes ? dr("Vendor Notes", pd.vendorNotes.replace(/\n/g, "<br>")) : "",
    ].filter(Boolean).join("");
    return `<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Project Details</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;margin-bottom:24px;">
        <thead><tr style="background-color:#fff7ed;"><td colspan="2" style="padding:10px 14px;font-size:11px;font-weight:600;color:#9a3412;letter-spacing:0.5px;text-transform:uppercase;">Internal Only &mdash; Not shared with client</td></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  })();

  const photos = (quotePhotos ?? []).slice(0, 6);
  const photoRows: string[] = [];
  for (let i = 0; i < photos.length; i += 3) {
    const chunk = photos.slice(i, i + 3);
    const cells = chunk.map(photo => {
      let imgUrl = photo.url;
      if (imgUrl.includes("res.cloudinary.com") && imgUrl.includes("/upload/")) {
        imgUrl = imgUrl.replace("/upload/", "/upload/w_300,q_85,f_auto/");
      }
      return `<td style="padding:4px;width:33.33%;vertical-align:top;"><img src="${imgUrl}" alt="" style="display:block;width:100%;height:auto;border-radius:6px;border:1px solid ${BORDER};" /></td>`;
    }).join("");
    photoRows.push(`<tr>${cells}</tr>`);
  }
  const imageSection =
    photos.length > 0
      ? `<p style="margin:24px 0 10px;font-size:13px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Quote Photos (${photos.length})</p>
         <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${photoRows.join("")}</table>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Internal Alert &mdash; New Quote Sent</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background-color:${GREEN};padding:28px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
              <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Internal Alert &mdash; Quote Sent</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #fcd34d;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <p style="margin:0 0 4px;font-size:16px;font-weight:bold;color:#92400e;">New Quote Sent &mdash; Awaiting Signature</p>
                    <p style="margin:0;font-size:14px;color:#b45309;line-height:1.5;">A service agreement was just sent to <strong>${clientName}</strong> for <strong>${projectName}</strong>. It has not been signed yet.</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.5px;">Client &amp; Opportunity</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;margin-bottom:24px;">
                <tbody>
                  <tr>
                    <td style="padding:10px 14px;font-size:13px;color:${MUTED};width:130px;vertical-align:top;white-space:nowrap;">Client</td>
                    <td style="padding:10px 14px;font-size:15px;font-weight:bold;color:#111827;border-left:1px solid ${BORDER};">${clientName}</td>
                  </tr>
                  ${oppRows}
                </tbody>
              </table>

              ${keyPeopleSection}
              ${quoteSection}
              ${projectDetailsSection}
              ${notInScopeSection}
              ${imageSection}

              <p style="margin:8px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
                This is an automated internal notification. Log in to view the full project and quote details.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions &mdash; Internal Alert System</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── New Vendor Added — Internal Admin Notification ───────────────────────────

export function buildNewVendorAdminEmail({
  vendorName, vendorType, pocName, email, phone, address, city, state, zip,
  website, consignmentTake, notes, addedByName, addedByEmail, addedAt, source,
}: {
  vendorName: string;
  vendorType: string;
  pocName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  website?: string;
  consignmentTake?: number;
  notes?: string;
  addedByName: string;
  addedByEmail: string;
  addedAt: string;
  source: string;
}): string {
  const location = [address, [city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(", ");
  const typeColors: Record<string, { bg: string; border: string; text: string }> = {
    "Consignment Store":     { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
    "Collector/Reseller":    { bg: "#e0e7ff", border: "#a5b4fc", text: "#3730a3" },
    "Donation Org":          { bg: "#ffedd5", border: "#fdba74", text: "#9a3412" },
    "Move Manager":          { bg: "#f3e8ff", border: "#c4b5fd", text: "#5b21b6" },
    "Mover":                 { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
    "Realtor":               { bg: "#ccfbf1", border: "#5eead4", text: "#134e4a" },
    "Broker":                { bg: "#fef9c3", border: "#fde047", text: "#713f12" },
    "Future Home/Community": { bg: "#dcfce7", border: "#86efac", text: "#166534" },
    "Junk Hauler":           { bg: "#f3f4f6", border: "#d1d5db", text: "#374151" },
    "Attorney":              { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b" },
    "Other":                 { bg: "#f3f4f6", border: "#d1d5db", text: "#374151" },
  };
  const badge = typeColors[vendorType] ?? typeColors["Other"];

  const row = (label: string, value?: string | number | null, href?: string) => {
    if (!value && value !== 0) return "";
    const display = href
      ? `<a href="${href}" style="color:#2E6B4F;text-decoration:none;">${value}</a>`
      : `${value}`;
    return `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#6b7280;width:38%;white-space:nowrap;">${label}</td>
      <td style="padding:11px 16px;font-size:13px;color:#111827;">${display}</td>
    </tr>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Vendor Added — Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="background-color:#1a3d2b;padding:28px 32px;border-radius:14px 14px 0 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#a8d4bc;">Top Tier Transitions &nbsp;&middot;&nbsp; Internal Notification</p>
                  <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">New Vendor Added to Directory</p>
                </td>
                <td align="right" style="vertical-align:top;white-space:nowrap;">
                  <p style="margin:0;font-size:12px;color:#a8d4bc;">${addedAt}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 14px 14px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
              <tr>
                <td style="padding:22px 24px;">
                  <span style="display:inline-block;background:${badge.bg};border:1px solid ${badge.border};color:${badge.text};font-size:11px;font-weight:700;padding:3px 12px;border-radius:999px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.4px;">${vendorType}</span>
                  <p style="margin:0;font-size:22px;font-weight:700;color:#111827;line-height:1.2;">${vendorName}</p>
                  ${location ? `<p style="margin:6px 0 0;font-size:13px;color:#6b7280;">${location}</p>` : ""}
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#f9fafb;">
                <td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e5e7eb;">Vendor Details</td>
              </tr>
              ${row("Contact", pocName)}
              ${row("Email", email, email ? "mailto:" + email : undefined)}
              ${row("Phone", phone)}
              ${row("Website", website ? website.replace(/^https?:\/\//, "") : undefined, website ? (website.startsWith("http") ? website : "https://" + website) : undefined)}
              ${row("TTT Take %", consignmentTake && consignmentTake > 0 ? consignmentTake + "%" : undefined)}
              ${row("Notes", notes)}
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px;">
              <tr style="background:#f9fafb;">
                <td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #e5e7eb;">Added By</td>
              </tr>
              <tr style="border-bottom:1px solid #f3f4f6;">
                <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#6b7280;width:38%;">Name</td>
                <td style="padding:11px 16px;font-size:13px;color:#111827;">${addedByName}</td>
              </tr>
              <tr style="border-bottom:1px solid #f3f4f6;">
                <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#6b7280;">Email</td>
                <td style="padding:11px 16px;font-size:13px;color:#111827;"><a href="mailto:${addedByEmail}" style="color:#2E6B4F;text-decoration:none;">${addedByEmail}</a></td>
              </tr>
              <tr>
                <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#6b7280;">Source</td>
                <td style="padding:11px 16px;font-size:13px;color:#111827;">${source}</td>
              </tr>
            </table>
            <a href="https://app.toptiertransitions.com/admin/local-vendors"
               style="display:block;background:#2E6B4F;color:#ffffff;font-size:14px;font-weight:700;text-align:center;padding:14px 24px;border-radius:10px;text-decoration:none;">
              View Vendor Directory &rarr;
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions &mdash; Internal Notification</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Daily Recap Notification Email ──────────────────────────────────────────
export function buildDailyRecapEmail({
  projectName,
  recapDate,
  uploaderName,
  aiRecapText,
  fileName,
}: {
  projectName: string;
  recapDate: string;
  uploaderName: string;
  aiRecapText: string;
  fileName: string;
}): string {
  const displayDate = (() => {
    const [year, month, day] = recapDate.split("-");
    if (!year || !month || !day) return recapDate;
    return new Date(`${year}-${month}-${day}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  })();

  const safeText = aiRecapText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Daily Recap &mdash; ${projectName}</title></head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
            <p style="margin:0;color:#F5F0E8;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
            <p style="margin:6px 0 0;color:#a8d4bc;font-size:13px;">Internal Notification &mdash; Daily Recap</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">

            <p style="margin:0 0 6px;font-size:20px;font-weight:bold;color:#1a1a1a;">Daily Recap</p>
            <p style="margin:0 0 24px;font-size:15px;color:#2E6B4F;font-weight:600;">${projectName}</p>

            <!-- Meta info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr style="background-color:#f9fafb;">
                <td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;width:40%;">Date</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;">${displayDate}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;border-top:1px solid #e5e7eb;">Uploaded By</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #e5e7eb;">${uploaderName}</td>
              </tr>
              <tr style="background-color:#f9fafb;">
                <td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;border-top:1px solid #e5e7eb;">File</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #e5e7eb;">${fileName}</td>
              </tr>
            </table>

            <!-- AI-extracted notes -->
            <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">Handwritten Notes (AI Transcription)</p>
            <div style="background-color:#f8fdf9;border:1px solid #d1fae5;border-left:4px solid #2E6B4F;border-radius:6px;padding:20px;margin-bottom:28px;">
              <p style="margin:0;font-size:15px;color:#1f2937;line-height:1.7;font-family:Georgia,serif;">${safeText}</p>
            </div>

            <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
              The original handwritten document is attached to this email. You can also view it on the project&rsquo;s Plan page.
            </p>

            <p style="margin:0;font-size:12px;color:#9ca3af;">Top Tier Transitions &mdash; Internal Notification</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildScheduleModificationEmail({
  projectName,
  requesterName,
  request,
  reason,
  priority,
  planUrl,
}: {
  projectName: string;
  requesterName: string;
  request: string;
  reason?: string;
  priority: "Normal" | "Urgent";
  planUrl: string;
}): string {
  const safeRequest = request.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  const safeReason = reason ? reason.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>") : "";
  const priorityBadge = priority === "Urgent"
    ? `<span style="display:inline-block;background:#f97316;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:3px 10px;border-radius:20px;">Urgent</span>`
    : `<span style="display:inline-block;background:#e5e7eb;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:3px 10px;border-radius:20px;">Normal</span>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background-color:#2E6B4F;padding:28px 36px;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a7f3d0;">Internal Notification</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Schedule Modification Request</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
              <tr style="background-color:#f9fafb;">
                <td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;width:130px;">Project</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;">${projectName}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;border-top:1px solid #e5e7eb;">Requested by</td>
                <td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #e5e7eb;">${requesterName}</td>
              </tr>
              <tr style="background-color:#f9fafb;">
                <td style="padding:10px 16px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;border-top:1px solid #e5e7eb;">Priority</td>
                <td style="padding:10px 16px;border-top:1px solid #e5e7eb;">${priorityBadge}</td>
              </tr>
            </table>

            <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">Requested Change</p>
            <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #2E6B4F;border-radius:6px;padding:18px;margin-bottom:${reason ? "24px" : "28px"};">
              <p style="margin:0;font-size:15px;color:#1f2937;line-height:1.7;">${safeRequest}</p>
            </div>

            ${reason ? `<p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">Reason / Context</p>
            <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-bottom:28px;">
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">${safeReason}</p>
            </div>` : ""}

            <div style="text-align:center;margin-bottom:20px;">
              <a href="${planUrl}" style="display:inline-block;background-color:#2E6B4F;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">View Project Plan</a>
            </div>

            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Top Tier Transitions &mdash; Internal Notification</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
