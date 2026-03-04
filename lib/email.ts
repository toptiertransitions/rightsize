export function buildContractSentEmail({
  clientName,
  projectName,
  signingUrl,
  totalCost,
  rightsizingHours,
  packingHours,
  unpackingHours,
}: {
  clientName: string;
  projectName: string;
  signingUrl: string;
  totalCost: number;
  rightsizingHours: number;
  packingHours: number;
  unpackingHours: number;
}): string {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
                  <th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Phase</th>
                  <th style="padding:10px 16px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Hours</th>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;">Rightsizing</td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;text-align:right;">${rightsizingHours}</td>
                </tr>
                <tr style="background-color:#f9fafb;">
                  <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;">Packing</td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;text-align:right;">${packingHours}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;">Unpacking</td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;border-top:1px solid #e5e7eb;text-align:right;">${unpackingHours}</td>
                </tr>
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
