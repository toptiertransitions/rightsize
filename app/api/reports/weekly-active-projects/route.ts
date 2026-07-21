import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getTenants,
  getContractsForTenant,
  getTimeEntriesForTenants,
  getPlanEntriesForTenants,
  getStaffMembers,
} from "@/lib/airtable";
import { getProjectNotes } from "@/lib/airtable-notes";
import type { Tenant, Contract, PlanEntry, TimeEntry } from "@/lib/types";

const resend = new Resend(process.env.RESEND_API_KEY);
const HOURLY_RATE = 85;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
}

function fmtHrs(h: number): string {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

function fmtDateLabel(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function fmtFullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function scheduledHoursFromEntries(entries: PlanEntry[]): number {
  let total = 0;
  for (const e of entries) {
    if (e.entryType === "keydate") continue;
    if (!e.startTime || !e.endTime) continue;
    const [sh, sm] = e.startTime.split(":").map(Number);
    const [eh, em] = e.endTime.split(":").map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins > 0) total += mins / 60;
  }
  return Math.round(total * 10) / 10;
}

function bestContract(contracts: Contract[]): Contract | null {
  const signed = contracts.filter(c => c.status === "Signed");
  if (signed.length) return signed.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const sent = contracts.filter(c => c.status === "Sent");
  if (sent.length) return sent.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return contracts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

const KEY_DATE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "Start Date":       { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" },
  "Move Date":        { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  "Pickup Date":      { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  "Estate Sale Date": { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95" },
  "Close Date":       { bg: "#fee2e2", border: "#fca5a5", text: "#7f1d1d" },
};

// ─── Email builder ────────────────────────────────────────────────────────────

interface ProjectData {
  tenant: Tenant;
  quoteAmount: number | null;
  estimatedHours: number;
  loggedHours: number;
  scheduledHours: number;
  upcomingEntries: PlanEntry[];
  teamLeadName?: string;
  teamLeadPhotoUrl?: string;
  recentNotes: Array<{ authorName: string; content: string; createdAt: string }>;
}

function addrLine(t: Tenant, dest = false): string {
  const parts = dest
    ? [t.destAddress, t.destCity, t.destState].filter(Boolean)
    : [t.address, t.city, t.state].filter(Boolean);
  return parts.join(", ") || "—";
}

function buildEmail(projects: ProjectData[], reportDate: string): string {
  const SAGE   = "#2E6B4F";
  const LIGHT  = "#f8faf8";
  const MUTED  = "#6b7280";
  const DARK   = "#111827";
  const BORDER = "#e5e7eb";

  const projectCards = projects.map(p => {
    const { tenant, quoteAmount, estimatedHours, loggedHours, scheduledHours, upcomingEntries, teamLeadName, teamLeadPhotoUrl, recentNotes } = p;
    const remainingHours = Math.round((estimatedHours - loggedHours) * 10) / 10;
    const budgetDelta = Math.round(remainingHours * HOURLY_RATE);
    const isOver = remainingHours < 0;
    const isOn = remainingHours === 0;

    const budgetBg     = isOver ? "#fef2f2" : isOn ? "#f9fafb" : "#f0fdf4";
    const budgetBorder = isOver ? "#fecaca" : isOn ? "#e5e7eb" : "#bbf7d0";
    const budgetColor  = isOver ? "#dc2626" : isOn ? "#6b7280" : "#059669";
    const budgetLabel  = isOver
      ? `Over budget by ${fmtMoney(Math.abs(budgetDelta))}`
      : isOn
      ? "Exactly on budget"
      : `Under budget by ${fmtMoney(budgetDelta)}`;

    // Team lead block
    const teamLeadHtml = teamLeadName ? `
      <td align="right" style="vertical-align:middle;padding-left:16px;white-space:nowrap;">
        ${teamLeadPhotoUrl
          ? `<img src="${teamLeadPhotoUrl}" alt="${teamLeadName}" width="32" height="32" style="border-radius:50%;display:inline-block;vertical-align:middle;margin-right:8px;" />`
          : `<span style="display:inline-block;width:32px;height:32px;border-radius:50%;background:#d1fae5;text-align:center;line-height:32px;font-size:13px;font-weight:700;color:#065f46;vertical-align:middle;margin-right:8px;">${teamLeadName.charAt(0).toUpperCase()}</span>`
        }
        <span style="font-size:12px;color:${MUTED};vertical-align:middle;">${teamLeadName}</span>
      </td>` : "";

    // Stats
    const statCell = (label: string, value: string, color?: string) => `
      <td style="text-align:center;padding:0 12px;border-right:1px solid ${BORDER};">
        <p style="margin:0;font-size:18px;font-weight:700;color:${color || DARK};">${value}</p>
        <p style="margin:2px 0 0;font-size:10px;color:${MUTED};text-transform:uppercase;letter-spacing:0.07em;">${label}</p>
      </td>`;

    const statsHtml = `
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${statCell("Quote", quoteAmount != null ? fmtMoney(quoteAmount) : "—")}
          ${statCell("Estimated", estimatedHours > 0 ? fmtHrs(estimatedHours) : "—")}
          ${statCell("Logged", fmtHrs(loggedHours))}
          ${statCell("Scheduled", scheduledHours > 0 ? fmtHrs(scheduledHours) : "—")}
          <td style="text-align:center;padding:0 12px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:${budgetColor};">${estimatedHours > 0 ? fmtHrs(Math.abs(remainingHours)) : "—"}</p>
            <p style="margin:2px 0 0;font-size:10px;color:${MUTED};text-transform:uppercase;letter-spacing:0.07em;">Remaining</p>
          </td>
        </tr>
      </table>`;

    // Budget badge
    const budgetBadge = estimatedHours > 0 ? `
      <tr>
        <td style="padding:0 24px 16px;">
          <div style="display:inline-block;padding:6px 14px;background:${budgetBg};border:1px solid ${budgetBorder};border-radius:20px;">
            <span style="font-size:12px;font-weight:600;color:${budgetColor};">${isOver ? "▲" : isOn ? "●" : "▼"} ${budgetLabel}</span>
            <span style="font-size:11px;color:${budgetColor};margin-left:6px;">(${HOURLY_RATE}/hr)</span>
          </div>
        </td>
      </tr>` : "";

    // Upcoming schedule
    const scheduleRows = upcomingEntries.slice(0, 8).map(e => {
      const isKey = e.entryType === "keydate";
      const colors = isKey ? (KEY_DATE_COLORS[e.activity] || { bg: "#f3f4f6", border: "#d1d5db", text: "#374151" }) : null;
      const timeStr = e.startTime && e.endTime ? ` · ${e.startTime}–${e.endTime}` : "";
      return `
        <tr>
          <td style="padding:4px 0;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:10px;white-space:nowrap;">
                  <span style="font-size:12px;color:${MUTED};">${fmtDateLabel(e.date)}</span>
                </td>
                <td>
                  ${isKey && colors
                    ? `<span style="display:inline-block;padding:2px 10px;background:${colors.bg};border:1px solid ${colors.border};border-radius:10px;font-size:11px;font-weight:600;color:${colors.text};">${e.activity}</span>`
                    : `<span style="font-size:12px;color:${DARK};">${e.activity}${timeStr}</span>`
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }).join("");

    const scheduleSection = upcomingEntries.length > 0 ? `
      <tr>
        <td style="padding:16px 24px 4px;">
          <p style="margin:0 0 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${MUTED};">Upcoming Schedule</p>
          <table width="100%" cellpadding="0" cellspacing="0">${scheduleRows}</table>
          ${upcomingEntries.length > 8 ? `<p style="margin:6px 0 0;font-size:11px;color:${MUTED};">+${upcomingEntries.length - 8} more events</p>` : ""}
        </td>
      </tr>` : `
      <tr>
        <td style="padding:16px 24px 4px;">
          <p style="margin:0;font-size:12px;color:${MUTED};font-style:italic;">No upcoming schedule entries</p>
        </td>
      </tr>`;

    // Internal notes
    const notesHtml = recentNotes.length > 0 ? `
      <tr>
        <td style="padding:12px 24px 20px;border-top:1px solid ${BORDER};">
          <p style="margin:0 0 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${MUTED};">Internal Notes</p>
          ${recentNotes.map(n => `
            <div style="margin-bottom:8px;padding:10px 12px;background:#fffbeb;border-left:3px solid #fcd34d;border-radius:0 6px 6px 0;">
              <p style="margin:0 0 3px;font-size:11px;font-weight:600;color:#92400e;">${n.authorName} <span style="font-weight:400;color:#b45309;">${fmtFullDate(n.createdAt)}</span></p>
              <p style="margin:0;font-size:12px;color:#78350f;white-space:pre-wrap;line-height:1.5;">${n.content.length > 300 ? n.content.slice(0, 297) + "…" : n.content}</p>
            </div>`).join("")}
        </td>
      </tr>` : "";

    const origin = addrLine(tenant);
    const dest   = addrLine(tenant, true);
    const addrStr = (origin !== "—" || dest !== "—")
      ? `${origin}${dest !== "—" ? ` <span style="color:#9ca3af;">→</span> ${dest}` : ""}`
      : "";

    return `
      <tr>
        <td style="padding:0 0 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid ${BORDER};overflow:hidden;">

            <!-- Header -->
            <tr>
              <td style="padding:20px 24px 16px;border-bottom:1px solid ${BORDER};">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-size:16px;font-weight:700;color:${DARK};">${tenant.name}</p>
                      ${addrStr ? `<p style="margin:4px 0 0;font-size:12px;color:${MUTED};">${addrStr}</p>` : ""}
                    </td>
                    ${teamLeadHtml}
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Stats -->
            <tr>
              <td style="padding:16px 24px;background:${LIGHT};border-bottom:1px solid ${BORDER};">
                ${statsHtml}
              </td>
            </tr>

            <!-- Budget badge -->
            ${budgetBadge}

            <!-- Schedule -->
            ${scheduleSection}

            <!-- Notes -->
            ${notesHtml}

          </table>
        </td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px 48px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

        <!-- Header -->
        <tr>
          <td style="background:${SAGE};padding:28px 32px;border-radius:12px 12px 0 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#ffffff;font-weight:400;letter-spacing:0.02em;">Top Tier Transitions</p>
                  <p style="margin:6px 0 0;font-size:13px;color:#a8d4bc;letter-spacing:0.04em;">Weekly Active Project Report</p>
                </td>
                <td align="right">
                  <p style="margin:0;font-size:12px;color:#a8d4bc;">${reportDate}</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#6ea88a;">${projects.length} active project${projects.length !== 1 ? "s" : ""}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Summary strip -->
        <tr>
          <td style="background:#1e4d38;padding:14px 32px;border-bottom:1px solid #2a5e46;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align:center;border-right:1px solid #2a5e46;padding-right:16px;">
                  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${projects.length}</p>
                  <p style="margin:2px 0 0;font-size:10px;color:#6ea88a;text-transform:uppercase;letter-spacing:0.08em;">Active Projects</p>
                </td>
                <td style="text-align:center;padding:0 16px;border-right:1px solid #2a5e46;">
                  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">
                    ${fmtMoney(projects.reduce((s, p) => s + (p.quoteAmount ?? 0), 0))}
                  </p>
                  <p style="margin:2px 0 0;font-size:10px;color:#6ea88a;text-transform:uppercase;letter-spacing:0.08em;">Total Quoted</p>
                </td>
                <td style="text-align:center;padding:0 16px;border-right:1px solid #2a5e46;">
                  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">
                    ${fmtHrs(Math.round(projects.reduce((s, p) => s + p.loggedHours, 0) * 10) / 10)}
                  </p>
                  <p style="margin:2px 0 0;font-size:10px;color:#6ea88a;text-transform:uppercase;letter-spacing:0.08em;">Hours Logged</p>
                </td>
                <td style="text-align:center;padding-left:16px;">
                  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">
                    ${fmtHrs(Math.round(projects.reduce((s, p) => s + p.scheduledHours, 0) * 10) / 10)}
                  </p>
                  <p style="margin:2px 0 0;font-size:10px;color:#6ea88a;text-transform:uppercase;letter-spacing:0.08em;">Hours Scheduled</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Project cards -->
        <tr>
          <td style="padding:24px 0 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${projectCards.length > 0 ? projectCards : `
                <tr>
                  <td style="padding:40px;text-align:center;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
                    <p style="margin:0;font-size:16px;color:#9ca3af;">No active projects with upcoming schedule</p>
                  </td>
                </tr>`}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0 0;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">Top Tier Transitions &nbsp;·&nbsp; Weekly Active Project Report &nbsp;·&nbsp; ${reportDate}</p>
            <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">For internal leadership use only</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const userEmail =
    clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!userEmail) return NextResponse.json({ error: "Could not determine your email" }, { status: 400 });

  const todayStr = today();
  const reportDate = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  // ── Fetch base data ──────────────────────────────────────────────────────────
  const [allTenants, staffMembers] = await Promise.all([
    getTenants(),
    getStaffMembers().catch(() => [] as Awaited<ReturnType<typeof getStaffMembers>>),
  ]);

  // Active TTT-managed projects (not archived, not lost)
  const activeTenants = allTenants.filter(t => !t.isArchived && !t.isLostDeal && t.isTTT !== false);

  if (activeTenants.length === 0) {
    return NextResponse.json({ success: true, message: "No active projects found" });
  }

  const tenantIds = activeTenants.map(t => t.id);

  // Batch-fetch plan entries and time entries across all active projects
  let allTimeEntries: TimeEntry[] = [];
  try {
    allTimeEntries = await getTimeEntriesForTenants(tenantIds);
  } catch (err) {
    console.error("[weekly-active-projects] getTimeEntriesForTenants THREW:", err);
  }
  const allPlanEntries = await getPlanEntriesForTenants(tenantIds).catch(() => [] as PlanEntry[]);

  console.log("[weekly-active-projects] tenantIds:", tenantIds);
  console.log("[weekly-active-projects] allTimeEntries.length:", allTimeEntries.length);
  if (allTimeEntries.length > 0) {
    const sample = allTimeEntries[0];
    console.log("[weekly-active-projects] sample entry tenantId:", sample.tenantId, "durationMinutes:", sample.durationMinutes, "nonBillable:", sample.nonBillable);
    const uniqueTenantIds = [...new Set(allTimeEntries.map(e => e.tenantId))];
    console.log("[weekly-active-projects] unique tenantIds in time entries:", uniqueTenantIds);
  }

  // Group by tenantId
  const planByTenant = new Map<string, PlanEntry[]>();
  for (const e of allPlanEntries) {
    if (!planByTenant.has(e.tenantId)) planByTenant.set(e.tenantId, []);
    planByTenant.get(e.tenantId)!.push(e);
  }
  const timeByTenant = new Map<string, TimeEntry[]>();
  for (const e of allTimeEntries) {
    if (!timeByTenant.has(e.tenantId)) timeByTenant.set(e.tenantId, []);
    timeByTenant.get(e.tenantId)!.push(e);
  }

  // Filter to projects with at least one upcoming focus or keydate entry
  const tenantsWithUpcoming = activeTenants.filter(t => {
    const entries = planByTenant.get(t.id) ?? [];
    return entries.some(e => e.date >= todayStr);
  });

  if (tenantsWithUpcoming.length === 0) {
    return NextResponse.json({ success: true, message: "No projects with upcoming schedule entries" });
  }

  // Sort alphabetically
  tenantsWithUpcoming.sort((a, b) => a.name.localeCompare(b.name));

  // Fetch contracts and notes per project in parallel
  const [contractsPerProject, notesPerProject] = await Promise.all([
    Promise.all(tenantsWithUpcoming.map(t => getContractsForTenant(t.id).catch(() => [] as Contract[]))),
    Promise.all(tenantsWithUpcoming.map(t => getProjectNotes(t.id).catch(() => []))),
  ]);

  // Fetch team lead Clerk user photos for unique team lead IDs
  const uniqueLeadIds = [...new Set(
    tenantsWithUpcoming.map(t => t.teamLeadClerkId).filter(Boolean) as string[]
  )];
  const leadPhotoMap = new Map<string, string>();
  await Promise.all(
    uniqueLeadIds.map(async (clerkId) => {
      try {
        const u = await clerk.users.getUser(clerkId);
        if (u.imageUrl) leadPhotoMap.set(clerkId, u.imageUrl);
      } catch { /* ignore */ }
    })
  );

  // ── Assemble per-project data ─────────────────────────────────────────────
  const projects: ProjectData[] = tenantsWithUpcoming.map((tenant, i) => {
    const contracts   = contractsPerProject[i];
    const rawNotes    = notesPerProject[i];
    const planEntries = planByTenant.get(tenant.id) ?? [];
    const timeEntries = timeByTenant.get(tenant.id) ?? [];

    const contract = bestContract(contracts);
    const quoteAmount = contract?.totalCost ?? null;

    // Estimated hours: from contract line items if available, else tenant field
    const estimatedHours =
      (contract?.lineItems && contract.lineItems.length > 0)
        ? Math.round(contract.lineItems.reduce((s, li) => s + li.hours, 0) * 10) / 10
        : (tenant.estimatedHours ?? 0);

    // Logged hours: sum of all non-nonBillable time entries
    const loggedHours = Math.round(
      timeEntries
        .filter(e => !e.nonBillable)
        .reduce((s, e) => s + e.durationMinutes, 0) / 60 * 10
    ) / 10;

    // Upcoming plan entries (today or future), sorted by date
    const upcomingEntries = planEntries
      .filter(e => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Scheduled hours from upcoming focus entries with times
    const scheduledHours = scheduledHoursFromEntries(upcomingEntries);

    // Team lead
    const staffMember = tenant.teamLeadClerkId
      ? staffMembers.find(s => s.clerkUserId === tenant.teamLeadClerkId)
      : undefined;
    const teamLeadName = staffMember?.displayName;
    const teamLeadPhotoUrl = tenant.teamLeadClerkId
      ? leadPhotoMap.get(tenant.teamLeadClerkId)
      : undefined;

    // Recent notes (latest 3)
    const recentNotes = rawNotes.slice(0, 3).map(n => ({
      authorName: n.authorName,
      content: n.content,
      createdAt: n.createdAt,
    }));

    return {
      tenant,
      quoteAmount,
      estimatedHours,
      loggedHours,
      scheduledHours,
      upcomingEntries,
      teamLeadName,
      teamLeadPhotoUrl,
      recentNotes,
    };
  });

  const html = buildEmail(projects, reportDate);

  await resend.emails.send({
    from: "Top Tier Transitions <noreply@toptiertransitions.com>",
    to: userEmail,
    subject: `Weekly Active Project Report — ${reportDate}`,
    html,
  });

  return NextResponse.json({ success: true, sentTo: userEmail, projectCount: projects.length });
}
