// Weekly "Internal Report - Tasks from CRM" email — one per TTTSales user, Fridays 9 AM Central.
import type { CrmTask } from "./crm-tasks";

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

/** Today's date (YYYY-MM-DD) in Central time */
export function centralToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export interface CrmTaskReportSections {
  pastDue: CrmTask[];
  dueToday: CrmTask[];
  dueNextWeek: CrmTask[];
  noDate: CrmTask[];
  laterCount: number;
}

/** Splits tasks into report sections, each sorted by due date. "Next week" = the 7 days after today. */
export function sectionCrmTasks(tasks: CrmTask[], today: string): CrmTaskReportSections {
  const weekEnd = addDays(today, 7);
  const byDate = (a: CrmTask, b: CrmTask) => a.date.localeCompare(b.date) || a.contactName.localeCompare(b.contactName);
  const dated = tasks.filter(t => t.date).sort(byDate);
  return {
    pastDue: dated.filter(t => t.date < today),
    dueToday: dated.filter(t => t.date === today),
    dueNextWeek: dated.filter(t => t.date > today && t.date <= weekEnd),
    noDate: tasks.filter(t => !t.date).sort((a, b) => a.contactName.localeCompare(b.contactName)),
    laterCount: dated.filter(t => t.date > weekEnd).length,
  };
}

const KIND_LABEL: Record<CrmTask["kind"], { label: string; bg: string; color: string }> = {
  referral: { label: "Referral Partner", bg: "#f3e8ff", color: "#6b21a8" },
  client: { label: "Client", bg: "#e0f2fe", color: "#075985" },
  opportunity: { label: "Opportunity", bg: "#fef3c7", color: "#92400e" },
};

export function buildCrmTasksReportEmail({
  salesUserName,
  sections,
  today,
  appUrl,
}: {
  salesUserName: string;
  sections: CrmTaskReportSections;
  today: string;
  appUrl: string;
}): string {
  const { pastDue, dueToday, dueNextWeek, noDate, laterCount } = sections;
  const firstName = salesUserName.split(" ")[0] || salesUserName;
  const openCount = pastDue.length + dueToday.length + dueNextWeek.length + noDate.length;

  function row(t: CrmTask, dateColor: string): string {
    const k = KIND_LABEL[t.kind];
    const detail = t.kind === "referral" ? t.companyName : t.companyName.replace(/^Opportunity · /, "");
    return `<tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 12px;font-size:12px;font-weight:600;color:${dateColor};white-space:nowrap;vertical-align:top;">${t.date ? fmtDate(t.date) : "—"}</td>
      <td style="padding:10px 12px;vertical-align:top;">
        <p style="margin:0;font-size:13px;font-weight:600;color:#1f2937;">${esc(t.contactName)}</p>
        <p style="margin:4px 0 0;font-size:11px;">
          <span style="display:inline-block;padding:1px 7px;border-radius:10px;background:${k.bg};color:${k.color};font-weight:600;">${k.label}</span>
          ${detail && detail !== "Client" ? `<span style="color:#6b7280;margin-left:6px;">${esc(detail)}</span>` : ""}
        </p>
      </td>
      <td style="padding:10px 12px;font-size:12px;color:#374151;vertical-align:top;">${t.note ? esc(t.note) : `<span style="color:#9ca3af;">No note</span>`}</td>
    </tr>`;
  }

  function section(label: string, sub: string, tasks: CrmTask[], accent: string, dateColor: string, emptyText: string): string {
    const body = tasks.length === 0
      ? `<p style="margin:0;padding:14px 16px;font-size:13px;color:#9ca3af;background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;">${emptyText}</p>`
      : `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#f3f4f6;">
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;width:90px;">Due</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;">Who</th>
            <th style="padding:8px 12px;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;text-align:left;">Next Step</th>
          </tr></thead>
          <tbody>${tasks.map(t => row(t, dateColor)).join("")}</tbody>
        </table>`;
    return `<tr><td style="padding:24px 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-left:4px solid ${accent};padding-left:12px;">
            <span style="font-size:15px;font-weight:700;color:#1f2937;">${label}</span>
            <span style="font-size:12px;color:#9ca3af;margin-left:8px;">${tasks.length} task${tasks.length !== 1 ? "s" : ""} · ${sub}</span>
          </td>
        </tr></table>
      </td></tr>
      <tr><td>${body}</td></tr>`;
  }

  function stat(label: string, n: number, color: string, last = false): string {
    return `<td style="padding:16px 24px;${last ? "" : "border-right:1px solid #e5e7eb;"}">
      <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">${label}</p>
      <p style="margin:4px 0 0;font-size:24px;font-weight:700;color:${n > 0 ? color : "#9ca3af"};">${n}</p>
    </td>`;
  }

  const weekEnd = addDays(today, 7);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr style="background:#2d4a3e;">
          <td style="padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;color:#C9A96E;text-transform:uppercase;">Top Tier Transitions · Internal Report</p>
            <h1 style="margin:6px 0 0;font-size:24px;font-weight:700;color:#ffffff;">Tasks from CRM</h1>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.7);">FYI for ${esc(salesUserName)} · Week of ${fmtDate(today)}</p>
          </td>
        </tr>

        <tr><td style="padding:0;border-bottom:1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            ${stat("Past Due", pastDue.length, "#dc2626")}
            ${stat("Due Today", dueToday.length, "#C9A96E")}
            ${stat("Due Next 7 Days", dueNextWeek.length, "#2d4a3e", true)}
          </tr></table>
        </td></tr>

        <tr><td style="padding:8px 32px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:20px 0 0;font-size:14px;color:#374151;line-height:1.6;">
              Hi ${esc(firstName)}, here are your open Next Steps from the CRM across referral partners, clients and opportunities${openCount === 0 ? " — you're all caught up this week!" : "."}
            </td></tr>
            ${section("Past Due", "before today", pastDue, "#dc2626", "#dc2626", "Nothing past due — nice work.")}
            ${section("Due Today", fmtDate(today), dueToday, "#C9A96E", "#92400e", "Nothing due today.")}
            ${section("Due Next Week", `${fmtDate(addDays(today, 1))} – ${fmtDate(weekEnd)}`, dueNextWeek, "#2d4a3e", "#2d4a3e", "Nothing due in the next 7 days.")}
            ${noDate.length > 0 ? section("No Due Date", "add a date so these don't slip", noDate, "#9ca3af", "#6b7280", "") : ""}
            ${laterCount > 0 ? `<tr><td style="padding:16px 0 0;font-size:12px;color:#6b7280;">+ ${laterCount} more task${laterCount !== 1 ? "s" : ""} scheduled after ${fmtDate(weekEnd)}.</td></tr>` : ""}
            <tr><td align="center" style="padding:28px 0 0;">
              <a href="${appUrl}/crm?tab=tasks" style="display:inline-block;background:#2d4a3e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Open CRM Tasks</a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:16px 32px;background:#FAF8F5;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
          System-generated every Friday at 9 AM Central from Rightsize CRM · Top Tier Transitions
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
