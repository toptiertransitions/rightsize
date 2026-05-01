import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getTenants,
  getContractsForTenant,
  getInvoicesForTenant,
  getOpportunities,
  getClientContacts,
  getReferralCompanies,
  getStaffMembers,
} from "@/lib/airtable";
import type { Tenant, Contract, Invoice, ClientOpportunity, ClientContact, ReferralCompany } from "@/lib/types";

const resend = new Resend(process.env.RESEND_API_KEY);

const MONTHLY_GOALS: Record<string, { signed: number; billed: number }> = {
  "2026-04": { signed: 80_000,  billed: 60_000  },
  "2026-05": { signed: 100_000, billed: 80_000  },
  "2026-06": { signed: 120_000, billed: 100_000 },
  "2026-07": { signed: 140_000, billed: 120_000 },
  "2026-08": { signed: 160_000, billed: 140_000 },
  "2026-09": { signed: 180_000, billed: 160_000 },
  "2026-10": { signed: 190_000, billed: 180_000 },
  "2026-11": { signed: 200_000, billed: 190_000 },
  "2026-12": { signed: 220_000, billed: 200_000 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtMoneyFull(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtDate(s: string | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pctChange(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? "+100%" : "—";
  const pct = Math.round(((curr - prev) / prev) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function pacingColors(pct: number) {
  if (pct >= 100) return { text: "#059669", bg: "#f0fdf4", border: "#bbf7d0", badge: "#d1fae5" };
  if (pct >= 75)  return { text: "#d97706", bg: "#fffbeb", border: "#fde68a", badge: "#fef3c7" };
  return             { text: "#dc2626", bg: "#fef2f2", border: "#fecaca", badge: "#fee2e2" };
}

function stageColors(stage: string) {
  const m: Record<string, { bg: string; text: string; border: string }> = {
    Lead:       { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" },
    Qualifying: { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
    Proposing:  { bg: "#dbeafe", text: "#1e3a8a", border: "#93c5fd" },
  };
  return m[stage] ?? m.Lead;
}

// ─── Week bucket helpers ──────────────────────────────────────────────────────

interface WeekBucket {
  label: string;
  start: Date;
  end: Date;
  isCurrentWeek: boolean;
}

function buildWeekBuckets(n: number): WeekBucket[] {
  const now = new Date();
  // Monday of current week
  const dow = now.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const thisMon = new Date(now);
  thisMon.setDate(now.getDate() - daysToMon);
  thisMon.setHours(0, 0, 0, 0);

  const buckets: WeekBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(thisMon);
    start.setDate(thisMon.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const label = i === 0
      ? "This Wk"
      : start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    buckets.push({ label, start, end, isCurrentWeek: i === 0 });
  }
  return buckets;
}

function inBucket(dateStr: string | undefined, bucket: WeekBucket): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d >= bucket.start && d <= bucket.end;
}

// ─── Batch-fetch across all tenants ──────────────────────────────────────────

async function fetchAllContracts(tenants: Tenant[]): Promise<Map<string, Contract[]>> {
  const map = new Map<string, Contract[]>();
  for (let i = 0; i < tenants.length; i += 10) {
    const batch = tenants.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map((t) => getContractsForTenant(t.id).then((cs) => ({ id: t.id, cs })))
    );
    for (const r of results) {
      if (r.status === "fulfilled") map.set(r.value.id, r.value.cs);
    }
  }
  return map;
}

async function fetchAllInvoices(tenants: Tenant[]): Promise<Map<string, Invoice[]>> {
  const map = new Map<string, Invoice[]>();
  for (let i = 0; i < tenants.length; i += 10) {
    const batch = tenants.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map((t) => getInvoicesForTenant(t.id).then((invs) => ({ id: t.id, invs })))
    );
    for (const r of results) {
      if (r.status === "fulfilled") map.set(r.value.id, r.value.invs);
    }
  }
  return map;
}

// ─── Referral / rep resolution helpers ───────────────────────────────────────

function resolveRefSource(
  opp: ClientOpportunity | undefined,
  contactMap: Map<string, ClientContact>,
  companyMap: Map<string, ReferralCompany>,
): string {
  if (!opp) return "—";
  const contact = contactMap.get(opp.clientContactId);
  if (!contact) return "—";
  if (contact.referralPartnerId) {
    const co = companyMap.get(contact.referralPartnerId);
    if (co?.name) return co.name;
  }
  return contact.source || "—";
}

function resolveRep(
  clerkId: string | undefined,
  staffMap: Map<string, string>,
): string {
  if (!clerkId) return "—";
  return staffMap.get(clerkId) || "—";
}

// ─── QuickChart PNG ───────────────────────────────────────────────────────────

async function buildWoWChart(
  labels: string[],
  signedData: number[],
  billedData: number[],
  currentWeekIdx: number,
): Promise<string | null> {
  const signedBg = signedData.map((_, i) =>
    i === currentWeekIdx ? "rgba(45,74,62,0.45)" : "#2d4a3e"
  );
  const billedBg = billedData.map((_, i) =>
    i === currentWeekIdx ? "rgba(201,169,110,0.45)" : "#C9A96E"
  );

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Signed", data: signedData, backgroundColor: signedBg },
        { label: "Billed", data: billedData, backgroundColor: billedBg },
      ],
    },
    options: {
      plugins: {
        legend: { position: "top", labels: { font: { size: 11 }, padding: 14 } },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "#f0f0f0" },
          ticks: {
            callback: (v: number) => v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`,
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
      body: JSON.stringify({ chart: config, width: 600, height: 260, format: "png", backgroundColor: "white" }),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

// ─── Email template ───────────────────────────────────────────────────────────

interface SignedRow {
  clientName: string;
  address: string;
  signedAt: string;
  value: number;
  refSource: string;
  rep: string;
}

interface BilledRow {
  clientName: string;
  address: string;
  latestPaidAt: string;
  totalBilled: number;
  refSource: string;
  rep: string;
}

interface PipelineRow {
  clientName: string;
  address: string;
  stage: string;
  estimatedValue: number;
  refSource: string;
  rep: string;
  nextStepDate?: string;
  nextStepNote?: string;
  daysInPipeline: number;
}

function buildEmail({
  reportDate,
  currentMonthLabel,
  signedMTD, proratedSignedGoal,
  billedMTD, proratedBilledGoal,
  daysElapsed, totalDays,
  chartSrc,
  woWSignedCurr, woWSignedPrev,
  woWBilledCurr, woWBilledPrev,
  signedRows,
  billedRows,
  pipelineRows,
}: {
  reportDate: string;
  currentMonthLabel: string;
  signedMTD: number;
  proratedSignedGoal: number;
  billedMTD: number;
  proratedBilledGoal: number;
  daysElapsed: number;
  totalDays: number;
  chartSrc: string | null;
  woWSignedCurr: number;
  woWSignedPrev: number;
  woWBilledCurr: number;
  woWBilledPrev: number;
  signedRows: SignedRow[];
  billedRows: BilledRow[];
  pipelineRows: PipelineRow[];
}): string {
  const SAGE  = "#2d4a3e";
  const TINT  = "#f0f4f0";
  const GOLD  = "#C9A96E";
  const DARK  = "#1a1a1a";
  const MUTED = "#666666";

  const signedPct = proratedSignedGoal > 0 ? Math.round((signedMTD / proratedSignedGoal) * 100) : 0;
  const billedPct = proratedBilledGoal > 0 ? Math.round((billedMTD / proratedBilledGoal) * 100) : 0;
  const sc = pacingColors(signedPct);
  const bc = pacingColors(billedPct);

  const woWSignedChange = pctChange(woWSignedCurr, woWSignedPrev);
  const woWBilledChange = pctChange(woWBilledCurr, woWBilledPrev);
  const woWSignedColor = woWSignedCurr >= woWSignedPrev ? "#059669" : "#dc2626";
  const woWBilledColor = woWBilledCurr >= woWBilledPrev ? "#059669" : "#dc2626";

  // Pipeline by stage summary
  const stages = ["Lead", "Qualifying", "Proposing"] as const;
  const stageSummary = stages.map((s) => {
    const rows = pipelineRows.filter((r) => r.stage === s);
    return { stage: s, count: rows.length, total: rows.reduce((sum, r) => sum + r.estimatedValue, 0) };
  });
  const totalPipeline = pipelineRows.reduce((s, r) => s + r.estimatedValue, 0);

  const TH = `style="padding:9px 12px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;background:#f9fafb;border-bottom:1px solid #e5e7eb;white-space:nowrap;text-align:left;"`;
  const TD = `style="padding:10px 12px;font-size:13px;color:${DARK};border-bottom:1px solid #f3f4f6;"`;
  const TDm = `style="padding:10px 12px;font-size:12px;color:${MUTED};border-bottom:1px solid #f3f4f6;"`;

  function section(title: string, content: string): string {
    return `
    <tr><td style="background:#fff;padding:0 32px;"><div style="height:1px;background:#eee;"></div></td></tr>
    <tr>
      <td style="background:#fff;padding:24px 32px;">
        <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;">${title}</p>
        ${content}
      </td>
    </tr>`;
  }

  // ── Pipeline table ──
  const pipelineTableRows = pipelineRows.length === 0
    ? `<tr><td colspan="7" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No open pipeline.</td></tr>`
    : pipelineRows
        .sort((a, b) => stages.indexOf(a.stage as typeof stages[number]) - stages.indexOf(b.stage as typeof stages[number]) || b.estimatedValue - a.estimatedValue)
        .map((r, i) => {
          const sc = stageColors(r.stage);
          const bg = i % 2 === 0 ? "#fff" : TINT;
          const daysLabel = r.daysInPipeline === 0 ? "Today" : `${r.daysInPipeline}d`;
          return `<tr style="background:${bg};">
            <td ${TD}><span style="font-weight:600;">${r.clientName}</span></td>
            <td ${TDm}>${r.address || "—"}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
              <span style="display:inline-block;background:${sc.bg};border:1px solid ${sc.border};color:${sc.text};font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">${r.stage}</span>
            </td>
            <td style="padding:10px 12px;font-size:13px;font-weight:700;color:${GOLD};border-bottom:1px solid #f3f4f6;">${r.estimatedValue ? fmtMoneyFull(r.estimatedValue) : "—"}</td>
            <td ${TDm}>${r.refSource}</td>
            <td ${TDm}>${r.rep}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
              ${r.nextStepDate ? `<p style="margin:0;font-size:11px;font-weight:600;color:${SAGE};">${fmtDate(r.nextStepDate)}</p>` : ""}
              ${r.nextStepNote ? `<p style="margin:2px 0 0;font-size:11px;color:${MUTED};">${r.nextStepNote}</p>` : ""}
              ${!r.nextStepDate && !r.nextStepNote ? `<span style="font-size:11px;color:#d1d5db;">—</span>` : ""}
              <p style="margin:4px 0 0;font-size:10px;color:#9ca3af;">${daysLabel} in pipeline</p>
            </td>
          </tr>`;
        }).join("") + `
        <tr style="background:#f9fafb;">
          <td colspan="3" style="padding:10px 12px;font-size:13px;font-weight:700;color:${DARK};border-top:2px solid #e5e7eb;">Total Pipeline</td>
          <td style="padding:10px 12px;font-size:14px;font-weight:700;color:${GOLD};border-top:2px solid #e5e7eb;">${fmtMoneyFull(totalPipeline)}</td>
          <td colspan="3" style="border-top:2px solid #e5e7eb;"></td>
        </tr>`;

  const pipelineContent = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        ${stageSummary.map((s) => {
          const c = stageColors(s.stage);
          return `<td style="width:33%;padding:0 6px 0 0;vertical-align:top;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};border:1.5px solid ${c.border};border-radius:10px;">
              <tr><td style="padding:14px 16px;">
                <p style="margin:0;font-size:11px;font-weight:700;color:${c.text};text-transform:uppercase;letter-spacing:.5px;">${s.stage}</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:${DARK};">${fmtMoney(s.total)}</p>
                <p style="margin:2px 0 0;font-size:12px;color:${MUTED};">${s.count} deal${s.count !== 1 ? "s" : ""}</p>
              </td></tr>
            </table>
          </td>`;
        }).join("")}
        <td style="width:1px;"></td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <thead><tr>
        <th ${TH}>Client</th>
        <th ${TH}>Address</th>
        <th ${TH}>Stage</th>
        <th ${TH}>Est. Value</th>
        <th ${TH}>Referral</th>
        <th ${TH}>Rep</th>
        <th ${TH}>Next Step</th>
      </tr></thead>
      <tbody>${pipelineTableRows}</tbody>
    </table>`;

  // ── Signed this month table ──
  const signedTableRows = signedRows.length === 0
    ? `<tr><td colspan="6" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No signed contracts this month.</td></tr>`
    : signedRows
        .sort((a, b) => b.value - a.value)
        .map((r, i) => {
          const bg = i % 2 === 0 ? "#fff" : TINT;
          return `<tr style="background:${bg};">
            <td ${TD}><span style="font-weight:600;">${r.clientName}</span></td>
            <td ${TDm}>${r.address || "—"}</td>
            <td ${TDm}>${r.signedAt}</td>
            <td style="padding:10px 12px;font-size:13px;font-weight:700;color:${SAGE};border-bottom:1px solid #f3f4f6;">${fmtMoneyFull(r.value)}</td>
            <td ${TDm}>${r.refSource}</td>
            <td ${TDm}>${r.rep}</td>
          </tr>`;
        }).join("") + `
        <tr style="background:#f9fafb;">
          <td colspan="3" style="padding:10px 12px;font-size:13px;font-weight:700;color:${DARK};border-top:2px solid #e5e7eb;">Total Signed</td>
          <td style="padding:10px 12px;font-size:14px;font-weight:700;color:${SAGE};border-top:2px solid #e5e7eb;">${fmtMoneyFull(signedRows.reduce((s, r) => s + r.value, 0))}</td>
          <td colspan="2" style="border-top:2px solid #e5e7eb;"></td>
        </tr>`;

  const signedContent = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <thead><tr>
        <th ${TH}>Client</th><th ${TH}>Address</th><th ${TH}>Signed</th>
        <th ${TH}>Contract Value</th><th ${TH}>Referral</th><th ${TH}>Rep</th>
      </tr></thead>
      <tbody>${signedTableRows}</tbody>
    </table>`;

  // ── Billed/completed this month table ──
  const billedTableRows = billedRows.length === 0
    ? `<tr><td colspan="6" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No completed billing this month.</td></tr>`
    : billedRows
        .sort((a, b) => b.totalBilled - a.totalBilled)
        .map((r, i) => {
          const bg = i % 2 === 0 ? "#fff" : TINT;
          return `<tr style="background:${bg};">
            <td ${TD}><span style="font-weight:600;">${r.clientName}</span></td>
            <td ${TDm}>${r.address || "—"}</td>
            <td ${TDm}>${fmtDate(r.latestPaidAt)}</td>
            <td style="padding:10px 12px;font-size:13px;font-weight:700;color:${GOLD};border-bottom:1px solid #f3f4f6;">${fmtMoneyFull(r.totalBilled)}</td>
            <td ${TDm}>${r.refSource}</td>
            <td ${TDm}>${r.rep}</td>
          </tr>`;
        }).join("") + `
        <tr style="background:#f9fafb;">
          <td colspan="3" style="padding:10px 12px;font-size:13px;font-weight:700;color:${DARK};border-top:2px solid #e5e7eb;">Total Billed</td>
          <td style="padding:10px 12px;font-size:14px;font-weight:700;color:${GOLD};border-top:2px solid #e5e7eb;">${fmtMoneyFull(billedRows.reduce((s, r) => s + r.totalBilled, 0))}</td>
          <td colspan="2" style="border-top:2px solid #e5e7eb;"></td>
        </tr>`;

  const billedContent = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <thead><tr>
        <th ${TH}>Client</th><th ${TH}>Address</th><th ${TH}>Latest Payment</th>
        <th ${TH}>Total Billed</th><th ${TH}>Referral</th><th ${TH}>Rep</th>
      </tr></thead>
      <tbody>${billedTableRows}</tbody>
    </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>Weekly Sales Report</title></head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:28px 16px;">
<tr><td align="center">
<table width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%;">

  <!-- Header -->
  <tr>
    <td style="background:#fff;padding:28px 32px 20px;border-radius:12px 12px 0 0;border-bottom:3px solid ${SAGE};">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <p style="margin:0;font-size:11px;font-weight:700;color:${SAGE};text-transform:uppercase;letter-spacing:1.5px;">Top Tier Transitions</p>
          <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:${DARK};letter-spacing:-0.5px;">Weekly Sales Report</p>
          <p style="margin:4px 0 0;font-size:14px;color:${MUTED};">${reportDate}</p>
        </td>
        <td align="right" style="vertical-align:middle;">
          <span style="display:inline-block;background:${TINT};border:1.5px solid #c8d8c8;color:${SAGE};font-size:12px;font-weight:700;padding:6px 14px;border-radius:999px;">${currentMonthLabel}</span>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- MTD Pacing -->
  <tr>
    <td style="background:#fff;padding:24px 32px;">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;">Month-to-Date Pacing &mdash; Day ${daysElapsed} of ${totalDays}</p>
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="49%" style="padding-right:8px;vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${sc.bg};border:1.5px solid ${sc.border};border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.5px;">Signed MTD</p>
              <p style="margin:0;font-size:32px;font-weight:800;color:${sc.text};line-height:1.1;">${fmtMoney(signedMTD)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 8px;">
                <tr><td style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;">
                  <div style="width:${Math.min(100, signedPct)}%;background:${sc.text};height:8px;border-radius:999px;"></div>
                </td></tr>
              </table>
              <p style="margin:0;font-size:12px;color:${sc.text};font-weight:700;">${signedPct}% of pace &nbsp;·&nbsp; Prorated goal: ${fmtMoney(proratedSignedGoal)}</p>
              <p style="margin:4px 0 0;font-size:11px;color:${MUTED};">Full month goal: ${fmtMoney(proratedSignedGoal / (daysElapsed / totalDays))}</p>
            </td></tr>
          </table>
        </td>
        <td width="49%" style="padding-left:8px;vertical-align:top;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${bc.bg};border:1.5px solid ${bc.border};border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.5px;">Billed MTD</p>
              <p style="margin:0;font-size:32px;font-weight:800;color:${bc.text};line-height:1.1;">${fmtMoney(billedMTD)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 8px;">
                <tr><td style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;">
                  <div style="width:${Math.min(100, billedPct)}%;background:${bc.text};height:8px;border-radius:999px;"></div>
                </td></tr>
              </table>
              <p style="margin:0;font-size:12px;color:${bc.text};font-weight:700;">${billedPct}% of pace &nbsp;·&nbsp; Prorated goal: ${fmtMoney(proratedBilledGoal)}</p>
              <p style="margin:4px 0 0;font-size:11px;color:${MUTED};">Full month goal: ${fmtMoney(proratedBilledGoal / (daysElapsed / totalDays))}</p>
            </td></tr>
          </table>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- WoW Chart -->
  <tr><td style="background:#fff;padding:0 32px;"><div style="height:1px;background:#eee;"></div></td></tr>
  <tr>
    <td style="background:#fff;padding:24px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr>
        <td>
          <p style="margin:0;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;">Week-over-Week Trend &mdash; Last 8 Weeks</p>
        </td>
        <td align="right">
          <span style="font-size:13px;font-weight:700;color:${woWSignedColor};">Signed ${woWSignedChange}</span>
          <span style="font-size:13px;color:#d1d5db;margin:0 6px;">·</span>
          <span style="font-size:13px;font-weight:700;color:${woWBilledColor};">Billed ${woWBilledChange}</span>
          <span style="font-size:11px;color:${MUTED};margin-left:4px;">vs last wk</span>
        </td>
      </tr></table>
      ${chartSrc
        ? `<img src="${chartSrc}" alt="WoW Chart" width="596" style="display:block;width:100%;max-width:596px;border-radius:8px;border:1px solid #e5e7eb;" />`
        : `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:32px;text-align:center;color:#9ca3af;font-size:13px;">Chart unavailable</div>`}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <td style="background:${TINT};border-radius:8px;padding:10px 14px;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:20px;">
                <p style="margin:0;font-size:11px;color:${MUTED};">This week signed</p>
                <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:${SAGE};">${fmtMoney(woWSignedCurr)}</p>
              </td>
              <td style="padding-right:20px;border-left:1px solid #d1d5db;padding-left:20px;">
                <p style="margin:0;font-size:11px;color:${MUTED};">Last week signed</p>
                <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:${DARK};">${fmtMoney(woWSignedPrev)}</p>
              </td>
              <td style="padding-right:20px;border-left:1px solid #d1d5db;padding-left:20px;">
                <p style="margin:0;font-size:11px;color:${MUTED};">This week billed</p>
                <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:${GOLD};">${fmtMoney(woWBilledCurr)}</p>
              </td>
              <td style="border-left:1px solid #d1d5db;padding-left:20px;">
                <p style="margin:0;font-size:11px;color:${MUTED};">Last week billed</p>
                <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:${DARK};">${fmtMoney(woWBilledPrev)}</p>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${section(`Open Pipeline — ${pipelineRows.length} Deals · ${fmtMoney(totalPipeline)} Total`, pipelineContent)}
  ${section(`New Signed Contracts — ${currentMonthLabel} (${signedRows.length} deals)`, signedContent)}
  ${section(`Completed Billing — ${currentMonthLabel} (${billedRows.length} projects)`, billedContent)}

  <!-- Footer -->
  <tr>
    <td style="background:${SAGE};padding:16px 32px;border-radius:0 0 12px 12px;">
      <p style="margin:0;font-size:12px;color:#a8d4bc;text-align:center;line-height:1.7;">
        Generated ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
        &nbsp;·&nbsp; Top Tier Transitions &nbsp;·&nbsp; 312-600-3016
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

  // ── Dates ──
  const now = new Date();
  const ctNow = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const year  = parseInt(ctNow.find((p) => p.type === "year")!.value);
  const month = parseInt(ctNow.find((p) => p.type === "month")!.value);
  const day   = parseInt(ctNow.find((p) => p.type === "day")!.value);
  const curMonthKey = `${year}-${String(month).padStart(2, "0")}`;
  const daysTotal   = daysInMonth(year, month);
  const reportDate  = now.toLocaleDateString("en-US", {
    timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const currentMonthLabel = now.toLocaleDateString("en-US", {
    timeZone: "America/Chicago", month: "long", year: "numeric",
  });

  // ── Fetch all reference data in parallel ──
  const [allTenants, opps, contacts, refCompanies, staffMembers] = await Promise.all([
    getTenants().catch(() => [] as Tenant[]),
    getOpportunities().catch(() => [] as ClientOpportunity[]),
    getClientContacts().catch(() => [] as ClientContact[]),
    getReferralCompanies().catch(() => [] as ReferralCompany[]),
    getStaffMembers().catch(() => []),
  ]);

  // Only TTT-managed client projects (isTTT !== false)
  const clientTenants = allTenants.filter((t) => t.isTTT !== false);

  // ── Fetch contracts + invoices across all client tenants ──
  const [contractsByTenant, invoicesByTenant] = await Promise.all([
    fetchAllContracts(clientTenants),
    fetchAllInvoices(clientTenants),
  ]);

  // ── Build lookup maps ──
  const tenantMap    = new Map(allTenants.map((t) => [t.id, t]));
  const contactMap   = new Map(contacts.map((c) => [c.id, c]));
  const companyMap   = new Map(refCompanies.map((r) => [r.id, r]));
  const staffMap     = new Map(staffMembers.map((s) => [s.clerkUserId, s.displayName]));
  // Best opportunity per tenant (prefer Won, then most recent)
  const oppByTenant  = new Map<string, ClientOpportunity>();
  for (const opp of opps) {
    if (!opp.tenantId) continue;
    const existing = oppByTenant.get(opp.tenantId);
    if (!existing || opp.stage === "Won" || (opp.createdAt > existing.createdAt)) {
      oppByTenant.set(opp.tenantId, opp);
    }
  }

  function tenantAddress(t: Tenant): string {
    return [t.address, t.city, t.state].filter(Boolean).join(", ");
  }

  // ── Flatten all contracts + invoices for trend calculations ──
  const allSignedContracts: { tenantId: string; c: Contract }[] = [];
  const allPaidInvoices:    { tenantId: string; inv: Invoice }[] = [];

  for (const [tid, cs] of contractsByTenant) {
    for (const c of cs) {
      if (c.status === "Signed" && c.signedAt) allSignedContracts.push({ tenantId: tid, c });
    }
  }
  for (const [tid, invs] of invoicesByTenant) {
    for (const inv of invs) {
      if (inv.status === "Paid" && inv.paidAt) allPaidInvoices.push({ tenantId: tid, inv });
    }
  }

  // ── MTD pacing ──
  const goals = MONTHLY_GOALS[curMonthKey] ?? { signed: 0, billed: 0 };
  const proratedSignedGoal = goals.signed * (day / daysTotal);
  const proratedBilledGoal = goals.billed * (day / daysTotal);

  const signedMTD = allSignedContracts
    .filter(({ c }) => c.signedAt && monthKey(new Date(c.signedAt)) === curMonthKey)
    .reduce((s, { c }) => s + c.totalCost, 0);
  const billedMTD = allPaidInvoices
    .filter(({ inv }) => inv.paidAt && monthKey(new Date(inv.paidAt)) === curMonthKey)
    .reduce((s, { inv }) => s + inv.amount, 0);

  // ── Week-over-week trend ──
  const weekBuckets = buildWeekBuckets(8);

  const signedPerWeek = weekBuckets.map((b) =>
    allSignedContracts
      .filter(({ c }) => inBucket(c.signedAt, b))
      .reduce((s, { c }) => s + c.totalCost, 0)
  );
  const billedPerWeek = weekBuckets.map((b) =>
    allPaidInvoices
      .filter(({ inv }) => inBucket(inv.paidAt, b))
      .reduce((s, { inv }) => s + inv.amount, 0)
  );

  const n = weekBuckets.length;
  const woWSignedCurr = signedPerWeek[n - 1];
  const woWSignedPrev = signedPerWeek[n - 2];
  const woWBilledCurr = billedPerWeek[n - 1];
  const woWBilledPrev = billedPerWeek[n - 2];

  // ── Chart ──
  const chartSrc = await buildWoWChart(
    weekBuckets.map((b) => b.label),
    signedPerWeek.map(Math.round),
    billedPerWeek.map(Math.round),
    n - 1,
  );

  // ── Pipeline rows ──
  const pipelineRows: PipelineRow[] = opps
    .filter((o) => ["Lead", "Qualifying", "Proposing"].includes(o.stage))
    .map((o) => {
      const contact = contactMap.get(o.clientContactId);
      const clientName = o.keyPeople?.[0]?.name || contact?.name || "Unknown Client";
      const addr = [o.address, o.city, o.state].filter(Boolean).join(", ");
      const daysIn = Math.max(0, Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86_400_000));
      return {
        clientName,
        address: addr,
        stage: o.stage,
        estimatedValue: o.estimatedValue || 0,
        refSource: resolveRefSource(o, contactMap, companyMap),
        rep: resolveRep(o.assignedToClerkId, staffMap),
        nextStepDate: o.nextStepDate,
        nextStepNote: o.nextStepNote,
        daysInPipeline: daysIn,
      };
    });

  // ── Signed this month rows ──
  const signedRows: SignedRow[] = allSignedContracts
    .filter(({ c }) => c.signedAt && monthKey(new Date(c.signedAt)) === curMonthKey)
    .map(({ tenantId, c }) => {
      const tenant = tenantMap.get(tenantId);
      const opp    = oppByTenant.get(tenantId);
      return {
        clientName: tenant?.name || "Unknown",
        address: tenant ? tenantAddress(tenant) : "",
        signedAt: fmtDate(c.signedAt),
        value: c.totalCost,
        refSource: resolveRefSource(opp, contactMap, companyMap),
        rep: resolveRep(opp?.assignedToClerkId, staffMap),
      };
    });

  // ── Completed billing this month rows ──
  // Group paid invoices by tenant, find tenants where latest paidAt is this month
  const invoiceSumByTenant = new Map<string, { total: number; latestPaidAt: string }>();
  for (const { tenantId, inv } of allPaidInvoices) {
    const existing = invoiceSumByTenant.get(tenantId);
    const latestPaidAt = !existing || (inv.paidAt! > existing.latestPaidAt)
      ? inv.paidAt!
      : existing.latestPaidAt;
    invoiceSumByTenant.set(tenantId, {
      total: (existing?.total ?? 0) + inv.amount,
      latestPaidAt,
    });
  }

  const billedRows: BilledRow[] = [];
  for (const [tenantId, { total, latestPaidAt }] of invoiceSumByTenant) {
    if (monthKey(new Date(latestPaidAt)) !== curMonthKey) continue;
    const tenant = tenantMap.get(tenantId);
    const opp    = oppByTenant.get(tenantId);
    billedRows.push({
      clientName: tenant?.name || "Unknown",
      address: tenant ? tenantAddress(tenant) : "",
      latestPaidAt,
      totalBilled: total,
      refSource: resolveRefSource(opp, contactMap, companyMap),
      rep: resolveRep(opp?.assignedToClerkId, staffMap),
    });
  }

  // ── Build + send ──
  const html = buildEmail({
    reportDate, currentMonthLabel,
    signedMTD, proratedSignedGoal,
    billedMTD, proratedBilledGoal,
    daysElapsed: day, totalDays: daysTotal,
    chartSrc,
    woWSignedCurr, woWSignedPrev,
    woWBilledCurr, woWBilledPrev,
    signedRows, billedRows, pipelineRows,
  });

  await resend.emails.send({
    from: "Top Tier Transitions <noreply@toptiertransitions.com>",
    to: "matt@toptiertransitions.com",
    subject: `Weekly Sales Report — ${reportDate}`,
    html,
  });

  return NextResponse.json({ success: true });
}
