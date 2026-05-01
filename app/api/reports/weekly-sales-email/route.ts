import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, getOpportunities, getStaffMembers } from "@/lib/airtable";

const resend = new Resend(process.env.RESEND_API_KEY);

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1NXIDYFOUPyk945lXjhLQ-jdnu2UYQXOjA1Uti7W_NwA/export?format=csv&gid=2136171572";

// 2026 monthly goals (Apr–Dec)
const MONTHLY_GOALS: Record<string, { signed: number; billed: number }> = {
  "2026-04": { signed: 80000, billed: 60000 },
  "2026-05": { signed: 100000, billed: 80000 },
  "2026-06": { signed: 120000, billed: 100000 },
  "2026-07": { signed: 140000, billed: 120000 },
  "2026-08": { signed: 160000, billed: 140000 },
  "2026-09": { signed: 180000, billed: 160000 },
  "2026-10": { signed: 190000, billed: 180000 },
  "2026-11": { signed: 200000, billed: 190000 },
  "2026-12": { signed: 220000, billed: 200000 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        cols.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function parseSheetDate(s: string): Date | null {
  if (!s) return null;
  // MM/DD/YYYY
  const a = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (a) return new Date(+a[3], +a[1] - 1, +a[2]);
  // YYYY-MM-DD
  const b = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (b) return new Date(+b[1], +b[2] - 1, +b[3]);
  // M/D/YY
  const c = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (c) return new Date(2000 + +c[3], +c[1] - 1, +c[2]);
  return null;
}

function parseDollar(s: string): number {
  return parseFloat(s.replace(/[$,\s]/g, "")) || 0;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtMoneyFull(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function pacingColor(pct: number) {
  if (pct >= 100) return { text: "#059669", bg: "#f0fdf4", border: "#bbf7d0" };
  if (pct >= 75)  return { text: "#d97706", bg: "#fffbeb", border: "#fde68a" };
  return             { text: "#dc2626", bg: "#fef2f2", border: "#fecaca" };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ─── Chart via QuickChart.io ──────────────────────────────────────────────────

async function buildChartBase64(
  monthLabels: string[],
  signedActuals: number[],
  billedActuals: number[],
  signedGoals: number[],
  billedGoals: number[],
): Promise<string | null> {
  const n = monthLabels.length;
  const signedBg = signedActuals.map((_, i) =>
    i === n - 1 ? "rgba(45,74,62,0.45)" : "#2d4a3e"
  );
  const billedBg = billedActuals.map((_, i) =>
    i === n - 1 ? "rgba(201,169,110,0.45)" : "#C9A96E"
  );

  const config = {
    type: "bar",
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: "Signed Actual",
          data: signedActuals,
          backgroundColor: signedBg,
          yAxisID: "y",
          order: 2,
        },
        {
          label: "Billed Actual",
          data: billedActuals,
          backgroundColor: billedBg,
          yAxisID: "y",
          order: 2,
        },
        {
          type: "line",
          label: "Signed Goal",
          data: signedGoals,
          borderColor: "#888",
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 3,
          pointBackgroundColor: "#888",
          fill: false,
          yAxisID: "y",
          order: 1,
        },
        {
          type: "line",
          label: "Billed Goal",
          data: billedGoals,
          borderColor: "#bbb",
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 3,
          pointBackgroundColor: "#bbb",
          fill: false,
          yAxisID: "y",
          order: 1,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "top", labels: { font: { size: 11 }, padding: 12 } },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#f0f0f0" },
          ticks: {
            callback: (v: number) =>
              v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`,
            font: { size: 11 },
          },
        },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  };

  try {
    const res = await fetch("https://quickchart.io/chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chart: config, width: 580, height: 260, format: "png", backgroundColor: "white" }),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

// ─── Email template ───────────────────────────────────────────────────────────

interface SheetDeal {
  clientName: string;
  signedDate: Date | null;
  completedDate: Date | null;
  address: string;
  referralSource: string;
  assignedRep: string;
  value: number;
}

interface PipelineDeal {
  clientName: string;
  address: string;
  stage: string;
  estimatedValue: number;
  referralSource: string;
  assignedRep: string;
}

function buildEmail({
  reportDate,
  signedMTD,
  proratedSignedGoal,
  expectedToBill,
  proratedBilledGoal,
  daysElapsed,
  totalDays,
  chartSrc,
  signedThisMonth,
  pipeline,
  completedThisMonth,
  currentMonthLabel,
}: {
  reportDate: string;
  signedMTD: number;
  proratedSignedGoal: number;
  expectedToBill: number;
  proratedBilledGoal: number;
  daysElapsed: number;
  totalDays: number;
  chartSrc: string | null;
  signedThisMonth: SheetDeal[];
  pipeline: PipelineDeal[];
  completedThisMonth: SheetDeal[];
  currentMonthLabel: string;
}): string {
  const signedPct = proratedSignedGoal > 0 ? Math.round((signedMTD / proratedSignedGoal) * 100) : 0;
  const billedPct = proratedBilledGoal > 0 ? Math.round((expectedToBill / proratedBilledGoal) * 100) : 0;
  const sc = pacingColor(signedPct);
  const bc = pacingColor(billedPct);

  const SAGE = "#2d4a3e";
  const GOLD = "#C9A96E";
  const TINT = "#f0f4f0";

  const tdHdr = `style="padding:8px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;background:#f9fafb;white-space:nowrap;"`;
  const tdCell = `style="padding:10px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;"`;
  const tdCellMuted = `style="padding:10px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #f3f4f6;"`;

  const stageBadge = (stage: string) => {
    const map: Record<string, { bg: string; text: string }> = {
      Lead:        { bg: "#f3f4f6", text: "#374151" },
      Qualifying:  { bg: "#fef3c7", text: "#92400e" },
      Proposing:   { bg: "#d1fae5", text: "#065f46" },
    };
    const c = map[stage] ?? { bg: "#f3f4f6", text: "#374151" };
    return `<span style="display:inline-block;background:${c.bg};color:${c.text};font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">${stage}</span>`;
  };

  // Section 4: Signed this month
  const signedRows = signedThisMonth.length === 0
    ? `<tr><td colspan="6" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No signed deals this month.</td></tr>`
    : signedThisMonth.map((d, i) => {
        const bg = i % 2 === 0 ? "background:#fff;" : `background:${TINT};`;
        return `<tr style="${bg}">
          <td ${tdCell}>${d.clientName}</td>
          <td ${tdCellMuted}>${d.address || "—"}</td>
          <td ${tdCellMuted}>${d.signedDate ? d.signedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
          <td style="padding:10px 12px;font-size:13px;color:${SAGE};font-weight:700;border-bottom:1px solid #f3f4f6;">${fmtMoneyFull(d.value)}</td>
          <td ${tdCellMuted}>${d.referralSource || "—"}</td>
          <td ${tdCellMuted}>${d.assignedRep || "—"}</td>
        </tr>`;
      }).join("") + `<tr style="background:#f9fafb;">
        <td colspan="3" style="padding:10px 12px;font-size:13px;font-weight:700;color:#111827;border-top:2px solid #e5e7eb;">Total</td>
        <td style="padding:10px 12px;font-size:14px;font-weight:700;color:${SAGE};border-top:2px solid #e5e7eb;">${fmtMoneyFull(signedThisMonth.reduce((s, d) => s + d.value, 0))}</td>
        <td colspan="2" style="border-top:2px solid #e5e7eb;"></td>
      </tr>`;

  // Section 5: Pipeline
  const pipelineRows = pipeline.length === 0
    ? `<tr><td colspan="6" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No open pipeline.</td></tr>`
    : pipeline.map((d, i) => {
        const bg = i % 2 === 0 ? "background:#fff;" : `background:${TINT};`;
        return `<tr style="${bg}">
          <td ${tdCell}>${d.clientName}</td>
          <td ${tdCellMuted}>${d.address || "—"}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">${stageBadge(d.stage)}</td>
          <td style="padding:10px 12px;font-size:13px;color:${GOLD};font-weight:700;border-bottom:1px solid #f3f4f6;">${d.estimatedValue ? fmtMoneyFull(d.estimatedValue) : "—"}</td>
          <td ${tdCellMuted}>${d.referralSource || "—"}</td>
          <td ${tdCellMuted}>${d.assignedRep || "—"}</td>
        </tr>`;
      }).join("") + `<tr style="background:#f9fafb;">
        <td colspan="3" style="padding:10px 12px;font-size:13px;font-weight:700;color:#111827;border-top:2px solid #e5e7eb;">Total Pipeline</td>
        <td style="padding:10px 12px;font-size:14px;font-weight:700;color:${GOLD};border-top:2px solid #e5e7eb;">${fmtMoneyFull(pipeline.reduce((s, d) => s + (d.estimatedValue || 0), 0))}</td>
        <td colspan="2" style="border-top:2px solid #e5e7eb;"></td>
      </tr>`;

  // Section 6: Completed this month
  const completedRows = completedThisMonth.length === 0
    ? `<tr><td colspan="6" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No completed projects this month.</td></tr>`
    : completedThisMonth.map((d, i) => {
        const bg = i % 2 === 0 ? "background:#fff;" : `background:${TINT};`;
        return `<tr style="${bg}">
          <td ${tdCell}>${d.clientName}</td>
          <td ${tdCellMuted}>${d.address || "—"}</td>
          <td ${tdCellMuted}>${d.completedDate ? d.completedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
          <td style="padding:10px 12px;font-size:13px;color:${GOLD};font-weight:700;border-bottom:1px solid #f3f4f6;">${fmtMoneyFull(d.value)}</td>
          <td ${tdCellMuted}>${d.referralSource || "—"}</td>
          <td ${tdCellMuted}>${d.assignedRep || "—"}</td>
        </tr>`;
      }).join("") + `<tr style="background:#f9fafb;">
        <td colspan="3" style="padding:10px 12px;font-size:13px;font-weight:700;color:#111827;border-top:2px solid #e5e7eb;">Total</td>
        <td style="padding:10px 12px;font-size:14px;font-weight:700;color:${GOLD};border-top:2px solid #e5e7eb;">${fmtMoneyFull(completedThisMonth.reduce((s, d) => s + d.value, 0))}</td>
        <td colspan="2" style="border-top:2px solid #e5e7eb;"></td>
      </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weekly Sales Report</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 16px;">
  <tr><td align="center">
  <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

    <!-- Header -->
    <tr>
      <td style="background:#fff;padding:28px 32px 20px;border-radius:12px 12px 0 0;border-bottom:3px solid ${SAGE};">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p style="margin:0;font-size:22px;font-weight:800;color:${SAGE};letter-spacing:-0.5px;">Top Tier Transitions</p>
              <p style="margin:4px 0 0;font-size:15px;color:#555;font-weight:500;">Weekly Sales Report &mdash; ${reportDate}</p>
            </td>
            <td align="right" style="vertical-align:middle;">
              <span style="display:inline-block;background:${TINT};border:1px solid #c8d8c8;color:${SAGE};font-size:11px;font-weight:700;padding:4px 12px;border-radius:999px;letter-spacing:.3px;">${currentMonthLabel}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Pacing Cards -->
    <tr>
      <td style="background:#fff;padding:24px 32px;">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;">Pacing · Day ${daysElapsed} of ${totalDays}</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <!-- Signed MTD -->
            <td width="49%" style="vertical-align:top;padding-right:8px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:${sc.bg};border:1.5px solid ${sc.border};border-radius:12px;">
                <tr><td style="padding:18px 20px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;">Signed MTD</p>
                  <p style="margin:0;font-size:30px;font-weight:800;color:${sc.text};line-height:1.1;">${fmtMoney(signedMTD)}</p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 8px;">
                    <tr>
                      <td style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;">
                        <div style="width:${Math.min(100, signedPct)}%;background:${sc.text};height:8px;border-radius:999px;"></div>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:12px;color:${sc.text};font-weight:700;">${signedPct}% of pace &nbsp;·&nbsp; Goal: ${fmtMoney(proratedSignedGoal)}</p>
                </td></tr>
              </table>
            </td>
            <!-- Expected to Bill -->
            <td width="49%" style="vertical-align:top;padding-left:8px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:${bc.bg};border:1.5px solid ${bc.border};border-radius:12px;">
                <tr><td style="padding:18px 20px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;">Expected to Bill</p>
                  <p style="margin:0;font-size:30px;font-weight:800;color:${bc.text};line-height:1.1;">${fmtMoney(expectedToBill)}</p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 8px;">
                    <tr>
                      <td style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;">
                        <div style="width:${Math.min(100, billedPct)}%;background:${bc.text};height:8px;border-radius:999px;"></div>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:12px;color:${bc.text};font-weight:700;">${billedPct}% of pace &nbsp;·&nbsp; Goal: ${fmtMoney(proratedBilledGoal)}</p>
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Divider -->
    <tr><td style="background:#fff;padding:0 32px;"><div style="height:1px;background:#f0f0f0;"></div></td></tr>

    <!-- 6-Month Chart -->
    <tr>
      <td style="background:#fff;padding:24px 32px;">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;">Rolling 6-Month Performance</p>
        ${chartSrc
          ? `<img src="${chartSrc}" alt="6-Month Chart" width="576" style="display:block;width:100%;max-width:576px;border-radius:8px;border:1px solid #e5e7eb;" />`
          : `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:32px;text-align:center;color:#9ca3af;font-size:13px;">Chart unavailable</div>`
        }
      </td>
    </tr>

    <!-- Divider -->
    <tr><td style="background:#fff;padding:0 32px;"><div style="height:1px;background:#f0f0f0;"></div></td></tr>

    <!-- Section 4: Signed This Month -->
    <tr>
      <td style="background:#fff;padding:24px 32px;">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;">New Signed Deals &mdash; ${currentMonthLabel}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <thead>
            <tr>
              <th ${tdHdr}>Client</th>
              <th ${tdHdr}>Address</th>
              <th ${tdHdr}>Signed</th>
              <th ${tdHdr}>Value</th>
              <th ${tdHdr}>Referral</th>
              <th ${tdHdr}>Rep</th>
            </tr>
          </thead>
          <tbody>${signedRows}</tbody>
        </table>
      </td>
    </tr>

    <!-- Divider -->
    <tr><td style="background:#fff;padding:0 32px;"><div style="height:1px;background:#f0f0f0;"></div></td></tr>

    <!-- Section 5: Pipeline -->
    <tr>
      <td style="background:#fff;padding:24px 32px;">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;">Open Pipeline (CRM)</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <thead>
            <tr>
              <th ${tdHdr}>Client</th>
              <th ${tdHdr}>Address</th>
              <th ${tdHdr}>Stage</th>
              <th ${tdHdr}>Est. Value</th>
              <th ${tdHdr}>Referral</th>
              <th ${tdHdr}>Rep</th>
            </tr>
          </thead>
          <tbody>${pipelineRows}</tbody>
        </table>
      </td>
    </tr>

    <!-- Divider -->
    <tr><td style="background:#fff;padding:0 32px;"><div style="height:1px;background:#f0f0f0;"></div></td></tr>

    <!-- Section 6: Completed This Month -->
    <tr>
      <td style="background:#fff;padding:24px 32px 32px;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;">Closed / Completed Projects &mdash; ${currentMonthLabel}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <thead>
            <tr>
              <th ${tdHdr}>Client</th>
              <th ${tdHdr}>Address</th>
              <th ${tdHdr}>Completed</th>
              <th ${tdHdr}>Value</th>
              <th ${tdHdr}>Referral</th>
              <th ${tdHdr}>Rep</th>
            </tr>
          </thead>
          <tbody>${completedRows}</tbody>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:${SAGE};padding:16px 32px;border-radius:0 0 12px 12px;margin-top:4px;">
        <p style="margin:0;font-size:12px;color:#a8d4bc;text-align:center;line-height:1.6;">
          Generated ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
          &nbsp;&middot;&nbsp; Top Tier Transitions &nbsp;&middot;&nbsp; 312-600-3016
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // CT time
  const now = new Date();
  const ctFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" });
  const todayStr = ctFormatter.format(now); // YYYY-MM-DD
  const [yearS, monthS, dayS] = todayStr.split("-").map(Number);
  const year = yearS, month = monthS, day = dayS;
  const curMonthKey = `${year}-${String(month).padStart(2, "0")}`;
  const daysTotal = daysInMonth(year, month);
  const daysElapsed = day;

  const reportDate = now.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const currentMonthLabel = now.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "long", year: "numeric",
  });

  // ── Fetch Google Sheet CSV ────────────────────────────────────────────────
  let dataRows: SheetDeal[] = [];
  try {
    const csvRes = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    const csvText = await csvRes.text();
    const allRows = parseCSV(csvText);
    // rows[0] = header, rows[1..N] = data; spreadsheet rows 2-38 = indices 1-37
    const rawDataRows = allRows.slice(1, 38).filter((r) => r[0]?.trim());
    dataRows = rawDataRows.map((r) => ({
      clientName: r[0] || "",
      signedDate: parseSheetDate(r[1] || ""),
      completedDate: parseSheetDate(r[2] || ""),
      address: r[3] || "",
      referralSource: r[4] || "",
      assignedRep: r[5] || "",
      value: parseDollar(r[6] || "0"),
    }));
  } catch {
    // continue with empty data
  }

  // ── Pacing calculations ───────────────────────────────────────────────────
  const goals = MONTHLY_GOALS[curMonthKey] ?? { signed: 0, billed: 0 };
  const proratedSignedGoal = goals.signed * (daysElapsed / daysTotal);
  const proratedBilledGoal = goals.billed * (daysElapsed / daysTotal);

  const signedThisMonth = dataRows.filter(
    (d) => d.signedDate && monthKey(d.signedDate) === curMonthKey
  );
  const completedThisMonth = dataRows.filter(
    (d) => d.completedDate && monthKey(d.completedDate) === curMonthKey
  );

  const signedMTD = signedThisMonth.reduce((s, d) => s + d.value, 0);
  const expectedToBill = completedThisMonth.reduce((s, d) => s + d.value, 0);

  // ── Rolling 6-month chart data ────────────────────────────────────────────
  const monthWindow: Array<{ key: string; label: string; month: number; year: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    monthWindow.push({
      key: monthKey(d),
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      month: d.getMonth() + 1,
      year: d.getFullYear(),
    });
  }

  const signedByMonth: Record<string, number> = {};
  const billedByMonth: Record<string, number> = {};
  for (const row of dataRows) {
    if (row.signedDate) {
      const k = monthKey(row.signedDate);
      signedByMonth[k] = (signedByMonth[k] || 0) + row.value;
    }
    if (row.completedDate) {
      const k = monthKey(row.completedDate);
      billedByMonth[k] = (billedByMonth[k] || 0) + row.value;
    }
  }

  const monthLabels = monthWindow.map((m) => m.label);
  const signedActuals = monthWindow.map((m) => Math.round(signedByMonth[m.key] || 0));
  const billedActuals = monthWindow.map((m) => Math.round(billedByMonth[m.key] || 0));
  const signedGoals = monthWindow.map((m) => {
    const g = MONTHLY_GOALS[m.key];
    return g ? g.signed : 0;
  });
  const billedGoals = monthWindow.map((m) => {
    const g = MONTHLY_GOALS[m.key];
    return g ? g.billed : 0;
  });

  // ── CRM Pipeline ──────────────────────────────────────────────────────────
  let pipeline: PipelineDeal[] = [];
  try {
    const [opps, staffMembers] = await Promise.all([
      getOpportunities().catch(() => []),
      getStaffMembers().catch(() => []),
    ]);
    const staffMap = new Map(staffMembers.map((s) => [s.clerkUserId, s.displayName]));

    pipeline = opps
      .filter((o) => ["Lead", "Qualifying", "Proposing"].includes(o.stage))
      .map((o) => ({
        clientName: o.keyPeople?.[0]?.name || "Unknown Client",
        address: [o.address, o.city, o.state].filter(Boolean).join(", "),
        stage: o.stage,
        estimatedValue: o.estimatedValue || 0,
        referralSource: "",
        assignedRep: staffMap.get(o.assignedToClerkId) || "",
      }));
  } catch {
    // continue with empty pipeline
  }

  // ── Chart ─────────────────────────────────────────────────────────────────
  const chartSrc = await buildChartBase64(
    monthLabels,
    signedActuals,
    billedActuals,
    signedGoals,
    billedGoals,
  );

  // ── Build + send email ────────────────────────────────────────────────────
  const html = buildEmail({
    reportDate,
    signedMTD,
    proratedSignedGoal,
    expectedToBill,
    proratedBilledGoal,
    daysElapsed,
    totalDays: daysTotal,
    chartSrc,
    signedThisMonth,
    pipeline,
    completedThisMonth,
    currentMonthLabel,
  });

  await resend.emails.send({
    from: "Top Tier Transitions <noreply@toptiertransitions.com>",
    to: "matt@toptiertransitions.com",
    subject: `Weekly Sales Report — ${reportDate}`,
    html,
  });

  return NextResponse.json({ success: true });
}
