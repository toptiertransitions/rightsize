import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getTenantById,
  getContractsForTenant,
  getTimeEntries,
  getPlanEntriesForTenant,
  getItemsForTenant,
  getStaffMembers,
} from "@/lib/airtable";
import type { Tenant, PlanEntry, Item } from "@/lib/types";

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function fmtDateShort(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtHrs(h: number): string {
  return `${Math.round(h * 10) / 10}`;
}

function progressPct(worked: number, contracted: number): number {
  if (!contracted) return 0;
  return Math.min(100, Math.round((worked / contracted) * 100));
}

function estimatedPayout(item: Item): number | null {
  if (item.consignorPayout) return item.consignorPayout;
  if (item.salePrice && item.clientSharePercent) return item.salePrice * item.clientSharePercent / 100;
  if (item.salePrice) return item.salePrice * 0.5;
  if (item.vendorExpectedPrice && item.clientSharePercent) return item.vendorExpectedPrice * item.clientSharePercent / 100;
  return null;
}

const KEY_DATE_EMAIL_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "Start Date":       { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" },
  "Move Date":        { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  "Pickup Date":      { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  "Estate Sale Date": { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95" },
  "Close Date":       { bg: "#fee2e2", border: "#fca5a5", text: "#7f1d1d" },
};

// ─── Client Weekly Email ──────────────────────────────────────────────────────
function buildClientWeeklyEmail({
  tenant, contractedHours, workedHours, upcomingEntries, recentEntries, keyDates, forSaleItems, recentSoldItems, allSoldItems, donatedItems, pendingReviewCount, todayStr, teamLeadName, teamLeadPhone,
}: {
  tenant: Tenant;
  contractedHours: number;
  workedHours: number;
  upcomingEntries: PlanEntry[];
  recentEntries: PlanEntry[];
  keyDates: PlanEntry[];
  forSaleItems: Item[];
  recentSoldItems: Item[];
  allSoldItems: Item[];
  donatedItems: Item[];
  pendingReviewCount: number;
  todayStr: string;
  teamLeadName?: string;
  teamLeadPhone?: string;
}): string {
  const pct = progressPct(workedHours, contractedHours);
  const dateLabel = new Date(todayStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const address = [tenant.address, tenant.city, tenant.state].filter(Boolean).join(", ");

  // Progress bar
  const progressBar = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
      <tr>
        <td style="background:#e5e7eb;border-radius:999px;height:10px;overflow:hidden;">
          <div style="width:${pct}%;background:#2E6B4F;height:10px;border-radius:999px;"></div>
        </td>
      </tr>
    </table>`;

  const catalogUrl = `https://app.toptiertransitions.com/catalog?tenantId=${tenant.id}`;

  // Last 7 days entries (focus + key dates combined, sorted by date)
  const recentRows = recentEntries.length === 0
    ? `<tr><td colspan="2" style="padding:16px;text-align:center;color:#9ca3af;font-size:14px;">No activity recorded in the last 7 days.</td></tr>`
    : recentEntries.map((e) => {
        const isKeyDate = e.entryType === "keydate";
        const timeStr = e.startTime && e.endTime
          ? `${fmtTime(e.startTime)} – ${fmtTime(e.endTime)}`
          : e.startTime ? fmtTime(e.startTime) : "";
        const c = isKeyDate ? (KEY_DATE_EMAIL_COLORS[e.activity] ?? { bg: "#f3f4f6", border: "#d1d5db", text: "#374151" }) : null;
        return `
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td width="38%" style="padding:14px 16px;vertical-align:top;">
              <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">${fmtDateShort(e.date)}</p>
              ${timeStr ? `<p style="margin:3px 0 0;font-size:13px;color:#6b7280;">${timeStr}</p>` : ""}
            </td>
            <td style="padding:14px 16px;vertical-align:top;border-left:1px solid #f3f4f6;">
              ${isKeyDate && c
                ? `<span style="display:inline-block;background:${c.bg};border:1px solid ${c.border};color:${c.text};font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;margin-bottom:4px;">🏁 ${e.activity}</span>`
                : `<p style="margin:0;font-size:14px;font-weight:600;color:#2E6B4F;">✓ ${e.activity}</p>`}
              ${e.notes ? `<p style="margin:4px 0 0;font-size:12px;color:#9ca3af;font-style:italic;">${e.notes}</p>` : ""}
            </td>
          </tr>`;
      }).join("");

  // Upcoming schedule rows (client view — 2 columns, no team)
  const scheduleRows = upcomingEntries.length === 0
    ? `<tr><td colspan="2" style="padding:16px;text-align:center;color:#9ca3af;font-size:14px;">No shifts scheduled in the next two weeks.</td></tr>`
    : upcomingEntries.map((e) => {
        const timeStr = e.startTime && e.endTime
          ? `${fmtTime(e.startTime)} – ${fmtTime(e.endTime)}`
          : e.startTime ? fmtTime(e.startTime) : "TBD";
        return `
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td width="38%" style="padding:14px 16px;vertical-align:top;">
              <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">${fmtDateShort(e.date)}</p>
              <p style="margin:3px 0 0;font-size:13px;color:#6b7280;">${timeStr}</p>
            </td>
            <td style="padding:14px 16px;vertical-align:top;border-left:1px solid #f3f4f6;">
              <p style="margin:0;font-size:14px;font-weight:600;color:#2E6B4F;">${e.activity}</p>
              ${e.address ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${e.address}</p>` : ""}
              ${e.notes ? `<p style="margin:4px 0 0;font-size:12px;color:#9ca3af;font-style:italic;">${e.notes}</p>` : ""}
            </td>
          </tr>`;
      }).join("");

  // Sold items grid (max 9)
  const soldToShow = recentSoldItems.slice(0, 9);
  const soldSection = soldToShow.length === 0 ? "" : `
    <tr>
      <td style="padding:0 0 28px;">
        <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#111827;">🎉 Items Sold This Week</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            ${soldToShow.map((item, i) => {
              const payout = estimatedPayout(item);
              const imgUrl = item.photos?.[0]?.url ?? item.photoUrl;
              return `
                <td width="33%" style="padding:0 ${i % 3 === 2 ? "0" : "8px"} 12px 0;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td>
                        ${imgUrl
                          ? `<img src="${imgUrl}" alt="${item.itemName}" width="100%" style="display:block;width:100%;height:120px;object-fit:cover;" />`
                          : `<div style="width:100%;height:120px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;"><span style="color:#9ca3af;font-size:24px;">📦</span></div>`
                        }
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:10px;">
                        <p style="margin:0;font-size:12px;font-weight:600;color:#111827;line-height:1.3;">${item.itemName}</p>
                        ${item.salePrice ? `<p style="margin:4px 0 0;font-size:11px;color:#2E6B4F;font-weight:600;">Sold ${fmtMoney(item.salePrice)}</p>` : ""}
                        ${payout ? `<p style="margin:2px 0 0;font-size:11px;color:#059669;">Est. Payout ${fmtMoney(payout)}</p>` : ""}
                      </td>
                    </tr>
                  </table>
                </td>`;
            }).join("")}
            ${soldToShow.length % 3 !== 0 ? Array(3 - (soldToShow.length % 3)).fill(`<td width="33%"></td>`).join("") : ""}
          </tr>
        </table>
      </td>
    </tr>`;

  // Items summary stats
  const totalSoldValue = allSoldItems.reduce((s, i) => s + (i.salePrice ?? 0), 0);
  const totalSoldPayout = allSoldItems.reduce((s, i) => {
    const p = estimatedPayout(i);
    return s + (p ?? 0);
  }, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weekly Project Update — Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
                    <p style="margin:4px 0 0;color:#a8d4bc;font-size:13px;">Weekly Project Update</p>
                  </td>
                  <td align="right">
                    <p style="margin:0;color:#a8d4bc;font-size:12px;">${dateLabel}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Greeting -->
                <tr>
                  <td style="padding:0 0 24px;">
                    <p style="margin:0 0 10px;font-size:16px;color:#111827;">Dear ${tenant.name} family,</p>
                    <p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.7;">We hope this update finds you well. Below is your weekly project progress report as of <strong>${dateLabel}</strong>. We're committed to keeping you fully informed every step of the way, and we encourage you to reach out any time with questions or feedback.</p>
                    <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">Your trust means everything to us — thank you for allowing the Top Tier Transitions team to support you through this journey.</p>
                  </td>
                </tr>

                <!-- Pending Review Alert -->
                ${pendingReviewCount > 0 ? `
                <tr>
                  <td style="padding:0 0 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:2px solid #f59e0b;border-radius:12px;">
                      <tr>
                        <td style="padding:18px 24px;">
                          <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#92400e;">⚠️ Action Needed: ${pendingReviewCount} Item${pendingReviewCount === 1 ? "" : "s"} Awaiting Your Review</p>
                          <p style="margin:0 0 12px;font-size:14px;color:#78350f;line-height:1.6;">You have <strong>${pendingReviewCount} item${pendingReviewCount === 1 ? "" : "s"}</strong> in your catalog marked <em>Pending Review</em>. Please take a moment to log in and approve the recommended route for each item — or flag any concerns to us — in the next few days.</p>
                          <a href="${catalogUrl}" style="display:inline-block;background:#f59e0b;color:#ffffff;font-size:13px;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;">Review Your Catalog →</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>` : ""}

                <!-- Progress -->
                <tr>
                  <td style="padding:0 0 28px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 16px;font-size:15px;font-weight:700;color:#111827;">Project Progress</p>
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td width="33%" style="text-align:center;padding:0 8px 0 0;">
                                <p style="margin:0;font-size:28px;font-weight:700;color:#2E6B4F;">${fmtHrs(contractedHours)}</p>
                                <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Hours Contracted</p>
                              </td>
                              <td width="33%" style="text-align:center;padding:0 8px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
                                <p style="margin:0;font-size:28px;font-weight:700;color:#2E6B4F;">${fmtHrs(workedHours)}</p>
                                <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Hours Worked</p>
                              </td>
                              <td width="33%" style="text-align:center;padding:0 0 0 8px;">
                                <p style="margin:0;font-size:28px;font-weight:700;color:${pct >= 75 ? "#dc2626" : "#2E6B4F"};">${pct}%</p>
                                <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Complete</p>
                              </td>
                            </tr>
                          </table>
                          ${progressBar}
                          <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;text-align:right;">${fmtHrs(Math.max(0, contractedHours - workedHours))} hrs remaining as of ${dateLabel}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Last 7 Days -->
                <tr>
                  <td style="padding:0 0 28px;">
                    <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#111827;">🌟 Progress This Week</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                      <thead>
                        <tr style="background:#f9fafb;">
                          <th width="38%" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;">Date</th>
                          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;border-left:1px solid #f3f4f6;">Activity</th>
                        </tr>
                      </thead>
                      <tbody>${recentRows}</tbody>
                    </table>
                  </td>
                </tr>

                <!-- Key Dates -->
                ${keyDates.length > 0 ? `
                <tr>
                  <td style="padding:0 0 28px;">
                    <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#111827;">🏁 Key Project Dates</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 6px;">
                      ${keyDates.map(e => {
                        const c = KEY_DATE_EMAIL_COLORS[e.activity] ?? { bg: "#f3f4f6", border: "#d1d5db", text: "#111827" };
                        const timeStr = e.startTime ? (e.endTime ? `${fmtTime(e.startTime)} – ${fmtTime(e.endTime)}` : fmtTime(e.startTime)) : "";
                        return `<tr>
                          <td style="background:${c.bg};border:1px solid ${c.border};border-radius:8px;padding:12px 16px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td>
                                  <span style="display:inline-block;background:${c.bg};border:1px solid ${c.border};color:${c.text};font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px;">${e.activity}</span>
                                </td>
                                <td align="right">
                                  <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">${fmtDate(e.date)}</p>
                                  ${timeStr ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${timeStr}</p>` : ""}
                                </td>
                              </tr>
                              ${e.notes ? `<tr><td colspan="2" style="padding-top:6px;"><p style="margin:0;font-size:12px;color:#6b7280;font-style:italic;">${e.notes}</p></td></tr>` : ""}
                            </table>
                          </td>
                        </tr>`;
                      }).join("")}
                    </table>
                  </td>
                </tr>` : ""}

                <!-- Upcoming Schedule -->
                <tr>
                  <td style="padding:0 0 28px;">
                    <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#111827;">📅 Schedule — Next Two Weeks</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                      <thead>
                        <tr style="background:#f9fafb;">
                          <th width="38%" style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;">Date &amp; Time</th>
                          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;border-left:1px solid #f3f4f6;">Activity</th>
                        </tr>
                      </thead>
                      <tbody>${scheduleRows}</tbody>
                    </table>
                  </td>
                </tr>

                <!-- Team Lead -->
                ${teamLeadName ? `
                <tr>
                  <td style="padding:0 0 28px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#111827;">Your Project Team Lead</p>
                          <p style="margin:0;font-size:15px;font-weight:600;color:#2E6B4F;">${teamLeadName}</p>
                          ${teamLeadPhone ? `<p style="margin:4px 0 0;font-size:13px;color:#374151;">${teamLeadPhone}</p>` : ""}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>` : ""}

                <!-- Items Summary -->
                <tr>
                  <td style="padding:0 0 28px;">
                    <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#111827;">🏷️ Items Summary</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="33%" style="padding:0 6px 0 0;">
                          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;text-align:center;padding:16px;">
                            <tr><td>
                              <p style="margin:0;font-size:24px;font-weight:700;color:#2E6B4F;">${allSoldItems.length}</p>
                              <p style="margin:4px 0 0;font-size:12px;color:#059669;font-weight:600;">Items Sold</p>
                              ${totalSoldValue ? `<p style="margin:4px 0 0;font-size:11px;color:#6b7280;">${fmtMoney(totalSoldPayout)} est. payout</p>` : ""}
                            </td></tr>
                          </table>
                        </td>
                        <td width="33%" style="padding:0 3px;">
                          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;padding:16px;">
                            <tr><td>
                              <p style="margin:0;font-size:24px;font-weight:700;color:#1d4ed8;">${forSaleItems.length}</p>
                              <p style="margin:4px 0 0;font-size:12px;color:#1d4ed8;font-weight:600;">Listed for Sale</p>
                              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Actively marketed</p>
                            </td></tr>
                          </table>
                        </td>
                        <td width="33%" style="padding:0 0 0 6px;">
                          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;text-align:center;padding:16px;">
                            <tr><td>
                              <p style="margin:0;font-size:24px;font-weight:700;color:#c2410c;">${donatedItems.length}</p>
                              <p style="margin:4px 0 0;font-size:12px;color:#c2410c;font-weight:600;">Donated</p>
                              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Given to good causes</p>
                            </td></tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Recent Sales (past 7 days) -->
                ${soldSection}

                <!-- Feedback -->
                <tr>
                  <td style="padding:0 0 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111827;">💬 We'd Love Your Feedback</p>
                          <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">Your input helps us serve you better. If you have questions about the schedule, items, or anything about your project, please don't hesitate to reach out. We are here every step of the way.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="border-top:1px solid #e5e7eb;padding-top:20px;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">Top Tier Transitions &nbsp;·&nbsp; <a href="https://app.toptiertransitions.com" style="color:#2E6B4F;text-decoration:none;">app.toptiertransitions.com</a></p>
                    <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;text-align:center;">This email was generated on ${dateLabel} for internal review and forwarding.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Staff Weekly Email ───────────────────────────────────────────────────────
function buildStaffWeeklyEmail({
  tenant, upcomingEntries, staffNotes, todayStr, staffByEmail,
}: {
  tenant: Tenant;
  upcomingEntries: PlanEntry[];
  staffNotes: string;
  todayStr: string;
  staffByEmail: Map<string, { name: string; phone?: string }>;
}): string {
  const dateLabel = new Date(todayStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const address = [tenant.address, tenant.city, tenant.state].filter(Boolean).join(", ");

  const shiftRows = upcomingEntries.length === 0
    ? `<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;font-size:14px;">No shifts scheduled in the next two weeks.</td></tr>`
    : upcomingEntries.map((e, i) => {
        const timeStr = e.startTime && e.endTime
          ? `${fmtTime(e.startTime)} – ${fmtTime(e.endTime)}`
          : e.startTime ? fmtTime(e.startTime) : "—";
        const staffList = (e.helpers ?? []).map((h) => {
          const info = staffByEmail.get(h.email);
          const name = info?.name ?? h.email.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const phone = info?.phone;
          const statusColor = h.status === "accepted" ? "#059669" : h.status === "declined" ? "#dc2626" : "#d97706";
          return `<span style="display:inline-block;margin:2px 0;font-size:12px;color:${statusColor};">● ${name}${phone ? ` <span style="color:#9ca3af;">${phone}</span>` : ""}</span>`;
        }).join("<br>");
        const bg = i % 2 === 1 ? "background:#f9fafb;" : "";
        return `
          <tr style="${bg}border-bottom:1px solid #f3f4f6;">
            <td style="padding:13px 16px;vertical-align:top;white-space:nowrap;">
              <p style="margin:0;font-size:13px;font-weight:700;color:#111827;">${fmtDateShort(e.date)}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${timeStr}</p>
            </td>
            <td style="padding:13px 16px;vertical-align:top;">
              <span style="display:inline-block;background:#d1fae5;color:#065f46;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;">${e.activity}</span>
            </td>
            <td style="padding:13px 16px;vertical-align:top;font-size:12px;color:#374151;">${e.address ?? "—"}</td>
            <td style="padding:13px 16px;vertical-align:top;">${staffList || '<span style="font-size:12px;color:#9ca3af;">TBD</span>'}</td>
          </tr>`;
      }).join("");

  const notesSection = staffNotes.trim() ? `
    <tr>
      <td style="padding:0 0 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;">
          <tr>
            <td style="padding:20px 24px;">
              <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#92400e;">📝 Internal Team Notes</p>
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">${staffNotes.trim()}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Staff Schedule — Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F0E8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0E8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#2E6B4F;padding:28px 32px;border-radius:12px 12px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Top Tier Transitions</p>
                    <p style="margin:4px 0 0;color:#a8d4bc;font-size:13px;">Staff Schedule — Next Two Weeks</p>
                  </td>
                  <td align="right">
                    <p style="margin:0;color:#a8d4bc;font-size:12px;">${dateLabel}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Project info -->
                <tr>
                  <td style="padding:0 0 24px;">
                    <p style="margin:0 0 4px;font-size:17px;font-weight:700;color:#111827;">${tenant.name}</p>
                    ${address ? `<p style="margin:0;font-size:13px;color:#6b7280;">${address}</p>` : ""}
                  </td>
                </tr>

                <!-- Notes -->
                ${notesSection}

                <!-- Schedule table -->
                <tr>
                  <td style="padding:0 0 28px;">
                    <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#111827;">Upcoming Shifts</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                      <thead>
                        <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb;">
                          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Date</th>
                          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Activity</th>
                          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Location</th>
                          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Staff</th>
                        </tr>
                      </thead>
                      <tbody>${shiftRows}</tbody>
                    </table>
                    <p style="margin:10px 0 0;font-size:11px;color:#9ca3af;">Staff status: <span style="color:#059669;">● Accepted</span> &nbsp; <span style="color:#d97706;">● Pending</span> &nbsp; <span style="color:#dc2626;">● Declined</span></p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="border-top:1px solid #e5e7eb;padding-top:20px;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">Top Tier Transitions &nbsp;·&nbsp; <a href="https://app.toptiertransitions.com" style="color:#2E6B4F;text-decoration:none;">app.toptiertransitions.com</a></p>
                    <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;text-align:center;">Generated ${dateLabel} · Internal use only — review before forwarding.</p>
                  </td>
                </tr>

              </table>
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
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { tenantId, type, staffNotes } = body as { tenantId?: string; type?: string; staffNotes?: string };
  if (!tenantId || (type !== "client" && type !== "staff")) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get logged-in user's email
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const userEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!userEmail) return NextResponse.json({ error: "Could not determine your email" }, { status: 400 });

  const fmtCT = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
  const today = new Date();
  const todayStr = fmtCT(today);
  const in14Days = new Date(today);
  in14Days.setDate(in14Days.getDate() + 14);
  const in14DaysStr = fmtCT(in14Days);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = fmtCT(sevenDaysAgo);

  const [tenant, contracts, timeEntries, allEntries, items] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getContractsForTenant(tenantId).catch(() => []),
    getTimeEntries({ tenantId }).catch(() => []),
    getPlanEntriesForTenant(tenantId).catch(() => []),
    type === "client" ? getItemsForTenant(tenantId).catch(() => []) : Promise.resolve([]),
  ]);

  if (!tenant) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const upcomingEntries = allEntries
    .filter((e) => e.entryType !== "keydate" && e.date >= todayStr && e.date <= in14DaysStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const keyDates = allEntries
    .filter((e) => e.entryType === "keydate" && e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const recentEntries = allEntries
    .filter((e) => e.date >= sevenDaysAgoStr && e.date < todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const primaryContract = contracts
    .filter((c) => c.status === "Signed")
    .sort((a, b) => (b.signedAt ?? b.createdAt).localeCompare(a.signedAt ?? a.createdAt))[0] ?? null;

  const contractedHours = primaryContract?.lineItems?.reduce((s, li) => s + li.hours, 0) ?? 0;
  const workedHours = timeEntries.filter((e) => !e.nonBillable).reduce((s, e) => s + e.durationMinutes, 0) / 60;

  let html: string;
  let subject: string;

  if (type === "client") {
    const SALE_ROUTES = new Set(["ProFoundFinds Consignment", "FB/Marketplace", "Online Marketplace", "Other Consignment", "Estate Sale"]);
    const forSaleItems = items.filter((i) => SALE_ROUTES.has(i.primaryRoute) && ["Approved", "Listed"].includes(i.status));
    const allSoldItems = items.filter((i) => i.status === "Sold" && SALE_ROUTES.has(i.primaryRoute));
    const recentSoldItems = allSoldItems.filter((i) => {
      const d = i.saleDate ?? i.completedDate;
      return d ? d >= sevenDaysAgoStr : false;
    });
    const donatedItems = items.filter((i) => i.primaryRoute === "Donate" && i.status === "Donated");
    const pendingReviewCount = items.filter((i) => i.status === "Pending Review").length;

    // Fetch team lead name/phone if assigned
    let teamLeadName: string | undefined;
    let teamLeadPhone: string | undefined;
    if (tenant.teamLeadClerkId) {
      const staffMembers = await getStaffMembers().catch(() => []);
      const lead = staffMembers.find(m => m.clerkUserId === tenant.teamLeadClerkId);
      if (lead) {
        teamLeadName = lead.displayName || undefined;
        teamLeadPhone = lead.phone || undefined;
      }
    }

    html = buildClientWeeklyEmail({ tenant, contractedHours, workedHours, upcomingEntries, recentEntries, keyDates, forSaleItems, recentSoldItems, allSoldItems, donatedItems, pendingReviewCount, todayStr, teamLeadName, teamLeadPhone });
    subject = `[REVIEW & FORWARD TO CLIENT] Weekly Update — ${tenant.name}`;
  } else {
    // Build staffByEmail map from Clerk for full names + phones
    const helperEmails = [...new Set(upcomingEntries.flatMap((e) => (e.helpers ?? []).map((h) => h.email)))];
    const staffByEmail = new Map<string, { name: string; phone?: string }>();
    if (helperEmails.length > 0) {
      const clerkUsers = await clerk.users.getUserList({ emailAddress: helperEmails, limit: 100 }).catch(() => ({ data: [] }));
      for (const u of clerkUsers.data) {
        const email = u.emailAddresses.find((ea) => ea.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses[0]?.emailAddress;
        if (email) {
          const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || email;
          const phone = u.phoneNumbers?.[0]?.phoneNumber;
          staffByEmail.set(email, { name, phone: phone ?? undefined });
        }
      }
    }
    html = buildStaffWeeklyEmail({ tenant, upcomingEntries, staffNotes: staffNotes ?? "", todayStr, staffByEmail });
    subject = `[REVIEW & FORWARD TO TEAM] Staff Schedule — ${tenant.name}`;
  }

  await resend.emails.send({
    from: "Top Tier Transitions <noreply@toptiertransitions.com>",
    to: userEmail,
    subject,
    html,
  });

  return NextResponse.json({ success: true });
}
