import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, getProFoundFindsStorefrontItems, getTenantById } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { getQAIssues } from "@/lib/pf-qa";
import type { QAIssue } from "@/lib/pf-qa";
import type { Item } from "@/lib/types";

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Email builder ────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface FlaggedItem {
  item: Item;
  tenantName: string;
  issues: QAIssue[];
}

function buildEmail(flagged: FlaggedItem[], totalListed: number, generatedAt: string): string {
  const SAGE   = "#2E6B4F";
  const LIGHT  = "#f8faf8";
  const MUTED  = "#6b7280";
  const DARK   = "#111827";
  const BORDER = "#e5e7eb";
  const CRITICAL_BG   = "#fef2f2";
  const CRITICAL_TEXT = "#dc2626";
  const WARN_BG       = "#fffbeb";
  const WARN_TEXT     = "#d97706";

  const criticalCount = flagged.filter(f => f.issues.some(i => i.severity === "critical")).length;
  const warningOnlyCount = flagged.length - criticalCount;

  const summaryCards = `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="padding:0 6px 0 0;">
          <table width="100%" cellpadding="16" cellspacing="0" border="0" style="background:#fff;border:1px solid ${BORDER};border-radius:8px;">
            <tr>
              <td align="center">
                <div style="font-size:28px;font-weight:700;color:${DARK};">${totalListed}</div>
                <div style="font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">Listed &amp; Active</div>
              </td>
            </tr>
          </table>
        </td>
        <td style="padding:0 6px;">
          <table width="100%" cellpadding="16" cellspacing="0" border="0" style="background:#fff;border:1px solid #fecaca;border-radius:8px;">
            <tr>
              <td align="center">
                <div style="font-size:28px;font-weight:700;color:${CRITICAL_TEXT};">${criticalCount}</div>
                <div style="font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">Critical Issues</div>
              </td>
            </tr>
          </table>
        </td>
        <td style="padding:0 0 0 6px;">
          <table width="100%" cellpadding="16" cellspacing="0" border="0" style="background:#fff;border:1px solid #fde68a;border-radius:8px;">
            <tr>
              <td align="center">
                <div style="font-size:28px;font-weight:700;color:${WARN_TEXT};">${warningOnlyCount}</div>
                <div style="font-size:11px;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">Warnings Only</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  // Sort: critical first, then warnings
  const sorted = [...flagged].sort((a, b) => {
    const aHasCrit = a.issues.some(i => i.severity === "critical") ? 0 : 1;
    const bHasCrit = b.issues.some(i => i.severity === "critical") ? 0 : 1;
    return aHasCrit - bHasCrit;
  });

  const itemRows = sorted.map(({ item, tenantName, issues }) => {
    const photoUrl = item.photos?.[0]?.url ?? "";
    const photoHtml = photoUrl
      ? `<img src="${photoUrl}" width="72" height="72" style="width:72px;height:72px;object-fit:cover;border-radius:6px;display:block;border:1px solid ${BORDER};" alt="${item.itemName}" />`
      : `<div style="width:72px;height:72px;background:#f3f4f6;border-radius:6px;display:flex;align-items:center;justify-content:center;border:1px solid ${BORDER};"></div>`;

    const issueChips = issues.map(issue => {
      const bg   = issue.severity === "critical" ? CRITICAL_BG : WARN_BG;
      const text = issue.severity === "critical" ? CRITICAL_TEXT : WARN_TEXT;
      const dot  = issue.severity === "critical" ? "●" : "◐";
      return `<span style="display:inline-block;background:${bg};color:${text};font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;margin:2px 3px 2px 0;white-space:nowrap;">${dot} ${issue.label}</span>`;
    }).join("");

    const priceLine = item.valueMid ? fmtMoney(item.valueMid) : "—";
    const catLine   = item.category || "—";

    return `
      <tr>
        <td style="padding:0 0 12px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
            <tr>
              <!-- Photo -->
              <td width="88" valign="top" style="padding:14px 0 14px 14px;">
                ${photoHtml}
              </td>
              <!-- Details -->
              <td valign="top" style="padding:14px 14px 14px 12px;">
                <div style="font-size:14px;font-weight:700;color:${DARK};margin-bottom:2px;">${item.itemName}</div>
                <div style="font-size:12px;color:${MUTED};margin-bottom:8px;">
                  ${tenantName} &nbsp;·&nbsp; ${catLine} &nbsp;·&nbsp; ${priceLine}
                  ${item.pickupLocation ? `&nbsp;·&nbsp; ${item.pickupLocation}` : ""}
                </div>
                <div>${issueChips}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join("");

  const cleanCount = totalListed - flagged.length;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Online Listing QA Report</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:660px;">

        <!-- Header -->
        <tr>
          <td style="background:${SAGE};border-radius:12px 12px 0 0;padding:28px 32px 24px;">
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Top Tier Transitions</div>
            <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:4px;">Online Listing QA Report</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.75);">ProFoundFinds · Active Listings Audit · ${generatedAt}</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:28px 32px;">

            ${summaryCards}

            ${flagged.length === 0 ? `
            <table cellpadding="24" cellspacing="0" border="0" width="100%" style="background:${LIGHT};border-radius:8px;text-align:center;margin-bottom:24px;">
              <tr><td>
                <div style="font-size:32px;margin-bottom:8px;">✓</div>
                <div style="font-size:16px;font-weight:600;color:${DARK};">All ${totalListed} listings look good!</div>
                <div style="font-size:13px;color:${MUTED};margin-top:4px;">No QA issues detected.</div>
              </td></tr>
            </table>` : `
            <div style="font-size:13px;color:${MUTED};margin-bottom:16px;">
              <strong style="color:${DARK};">${flagged.length} of ${totalListed}</strong> active listings have issues that need attention.
              ${cleanCount > 0 ? `<span style="color:#059669;font-weight:600;">${cleanCount} listing${cleanCount !== 1 ? "s" : ""} are clean.</span>` : ""}
            </div>

            <!-- Section: Critical first -->
            ${criticalCount > 0 ? `
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${CRITICAL_TEXT};margin:0 0 10px 0;padding-top:4px;">
              ● Critical Issues (${criticalCount})
            </div>` : ""}

            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              ${itemRows}
            </table>
            `}

            <!-- Action callout -->
            ${flagged.length > 0 ? `
            <table cellpadding="16" cellspacing="0" border="0" width="100%" style="background:${LIGHT};border-left:3px solid ${SAGE};border-radius:0 6px 6px 0;margin-top:8px;">
              <tr><td>
                <div style="font-size:13px;font-weight:600;color:${DARK};margin-bottom:4px;">How to take action</div>
                <div style="font-size:12px;color:${MUTED};line-height:1.6;">
                  Log in to the Rightsize admin and go to <strong>PF Inventory</strong>. Find each flagged item by name,
                  click to edit inline, and resolve the issues listed above before the next QA run.
                </div>
              </td></tr>
            </table>` : ""}

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid ${BORDER};border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
            <div style="font-size:11px;color:#9ca3af;">Top Tier Transitions — Online Listing QA Report &nbsp;·&nbsp; Generated ${generatedAt}</div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!isTTTAdmin(userId) && sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get logged-in user's email
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const userEmail =
    clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!userEmail) return NextResponse.json({ error: "Could not determine your email" }, { status: 400 });

  // Fetch all active listed items
  const allItems = await getProFoundFindsStorefrontItems();
  const listedItems = allItems.filter(i => i.status === "Listed");

  // Resolve tenant names
  const tenantIds = [...new Set(listedItems.map(i => i.tenantId).filter(Boolean))];
  const tenantMap: Record<string, string> = {};
  await Promise.all(tenantIds.map(async (id) => {
    const t = await getTenantById(id).catch(() => null);
    if (t) tenantMap[id] = t.name;
  }));

  // Run QA on each item
  const flagged: FlaggedItem[] = [];
  for (const item of listedItems) {
    const issues = getQAIssues(item);
    if (issues.length > 0) {
      flagged.push({
        item,
        tenantName: tenantMap[item.tenantId] ?? "Unknown Client",
        issues,
      });
    }
  }

  const generatedAt = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const html = buildEmail(flagged, listedItems.length, generatedAt);

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";
  await resend.emails.send({
    from: `Top Tier Transitions <${fromEmail}>`,
    to: userEmail,
    subject: `Online Listing QA Report — ${flagged.length} issue${flagged.length !== 1 ? "s" : ""} found (${generatedAt})`,
    html,
  });

  return NextResponse.json({
    success: true,
    sentTo: userEmail,
    totalListed: listedItems.length,
    flaggedCount: flagged.length,
    message: flagged.length === 0
      ? `All ${listedItems.length} listings are clean.`
      : `${flagged.length} of ${listedItems.length} listings have issues.`,
  });
}
