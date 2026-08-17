import { execSync } from "child_process";
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
  getReferralContacts,
  getStaffMembers,
  getSalesGoals,
  getAllActivities,
} from "@/lib/airtable";
import type { Tenant, Contract, Invoice, ClientOpportunity, ClientContact, ReferralCompany, ReferralContact } from "@/lib/types";
import { ctDateStr, ctNow } from "@/lib/date-ct";

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns the gross service value for a Full invoice.
// inv.amount = service lines + expenses − deposit credit applied.
// Summing only positive-rate line items gives pure service value,
// correctly excluding both deposit credits (negative rate) and
// pass-through expense items (stored in expenseItems, not lineItems).
// Falls back to inv.amount for invoices with no stored line items.
function grossInvoiceAmount(inv: Invoice): number {
  if (inv.lineItems && inv.lineItems.length > 0) {
    return inv.lineItems
      .filter(li => li.rate > 0)
      .reduce((s, li) => s + li.rate * li.hours, 0);
  }
  return inv.amount;
}

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

// Returns the most meaningful date for a signed contract.
// Prefer signedAt; fall back to createdAt for contracts manually marked Signed without running the signing flow.
function contractDate(c: Contract): string {
  return c.signedAt || c.createdAt || "";
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Returns YYYY-MM in CT for any date-only or full datetime string.
function monthKey(d: Date | string): string {
  if (d instanceof Date) {
    return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(0, 7);
  }
  return ctDateStr(d).slice(0, 7);
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
  refContactMap: Map<string, ReferralContact>,
): string {
  if (!opp) return "—";
  const contact = contactMap.get(opp.clientContactId);
  if (!contact) return "—";
  // referralPartnerId stores a ReferralContact.id (the individual person at the referral company)
  if (contact.referralPartnerId) {
    const refPerson = refContactMap.get(contact.referralPartnerId);
    if (refPerson?.name) return refPerson.name;
    // fallback: try company map in case the ID is a company ID for legacy records
    const co = companyMap.get(contact.referralPartnerId);
    if (co?.name) return co.name;
  }
  // clientReferralId stores a ClientContact.id (another client who referred them)
  if (contact.clientReferralId) {
    const referrer = contactMap.get(contact.clientReferralId);
    if (referrer?.name) return referrer.name;
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

// Returns a QuickChart-hosted image URL (not base64) so email clients can load it.
// Gmail and most clients block data: URIs but will load external https images.
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

  const chartJs = `{
    type: 'bar',
    data: {
      labels: ${JSON.stringify(labels)},
      datasets: [
        { label: 'Signed', data: ${JSON.stringify(signedData)}, backgroundColor: ${JSON.stringify(signedBg)} },
        { label: 'Billed',  data: ${JSON.stringify(billedData)}, backgroundColor: ${JSON.stringify(billedBg)} }
      ]
    },
    options: {
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, padding: 14 } }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#f0f0f0' },
          ticks: {
            callback: function(v) { return v >= 1000 ? '$' + Math.round(v/1000) + 'k' : '$' + v; },
            font: { size: 11 }
          }
        },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  }`;

  try {
    // Use QuickChart's /chart/create endpoint which returns a hosted URL,
    // not a base64 blob. Email clients (Gmail etc.) block data: URIs but
    // will load regular https:// image URLs.
    const res = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chart: chartJs, width: 600, height: 260, backgroundColor: "white" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.url as string) || null;
  } catch {
    return null;
  }
}

// ─── New-feature detection ────────────────────────────────────────────────────

function isFeatureCommit(msg: string): boolean {
  const lower = msg.toLowerCase();
  if (lower.startsWith("feat:") || lower.startsWith("feat ")) return true;
  if ((lower.startsWith("add ") || lower.startsWith("new ")) && !lower.includes("fix")) return true;
  return false;
}

function cleanMessage(msg: string): string {
  return msg.replace(/^feat:\s*/i, "").trim();
}

async function getNewFeatures(): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // GitHub API — works in Vercel (no git binary needed)
  try {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "rightsize-report" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(
      `https://api.github.com/repos/toptiertransitions/rightsize/commits?since=${since}&per_page=100`,
      { headers }
    );
    if (res.ok) {
      const commits = await res.json() as Array<{ commit: { message: string } }>;
      return commits
        .map(({ commit }) => commit.message.split("\n")[0].trim())
        .filter(isFeatureCommit)
        .map(cleanMessage)
        .filter(Boolean)
        .reverse(); // oldest first
    }
  } catch { /* fall through */ }

  // Fallback: git log (works locally)
  try {
    const out = execSync(
      `git log --since="${since}" --pretty=format:"%s" --reverse`,
      { encoding: "utf-8", cwd: process.cwd(), timeout: 5000 }
    );
    return out.split("\n").map(l => l.trim()).filter(isFeatureCommit).map(cleanMessage).filter(Boolean);
  } catch {
    return [];
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
  latestCreatedAt: string;
  totalBilled: number;
  refSource: string;
  rep: string;
}

interface PipelineRow {
  clientName: string;
  address: string;
  stage: string;
  estimatedValue: number;
  estimatedCloseDate?: string;
  refSource: string;
  rep: string;
  nextStepDate?: string;
  nextStepNote?: string;
  daysInPipeline: number;
}

interface ActivityRepRow {
  repName: string;
  totalActivities: number;
  uniqueContacts: number;
  byType: Record<string, number>;
}

interface BilledDetail {
  clientName: string;
  invoiceDate: string;
  amount: number;
}

interface SignedDetail {
  clientName: string;
  signedAt: string;
  amount: number;
}

function buildEmail({
  reportDate,
  currentMonthLabel,
  priorMonthLabel,
  signedMTD, signedMonthGoal, proratedSignedGoal,
  billedMTD, billedMonthGoal, proratedBilledGoal,
  daysElapsed, totalDays,
  priorSignedActual, priorSignedGoal,
  priorBilledActual, priorBilledGoal,
  chartSrc,
  woWSignedCurr, woWSignedPrev,
  woWBilledCurr, woWBilledPrev,
  signedRows,
  billedRows,
  pipelineRows,
  activityRows,
  weekLabel,
  priorBilledDetails,
  priorSignedDetails,
  newFeatures,
}: {
  reportDate: string;
  currentMonthLabel: string;
  priorMonthLabel: string;
  signedMTD: number;
  signedMonthGoal: number;
  proratedSignedGoal: number;
  billedMTD: number;
  billedMonthGoal: number;
  proratedBilledGoal: number;
  daysElapsed: number;
  totalDays: number;
  priorSignedActual: number;
  priorSignedGoal: number;
  priorBilledActual: number;
  priorBilledGoal: number;
  chartSrc: string | null;
  woWSignedCurr: number;
  woWSignedPrev: number;
  woWBilledCurr: number;
  woWBilledPrev: number;
  signedRows: SignedRow[];
  billedRows: BilledRow[];
  pipelineRows: PipelineRow[];
  activityRows: ActivityRepRow[];
  weekLabel: string;
  priorBilledDetails: BilledDetail[];
  priorSignedDetails: SignedDetail[];
  newFeatures: string[];
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
    ? `<tr><td colspan="8" style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">No open pipeline.</td></tr>`
    : [...pipelineRows]
        .sort((a, b) => {
          const da = a.estimatedCloseDate ? new Date(a.estimatedCloseDate).getTime() : Infinity;
          const db = b.estimatedCloseDate ? new Date(b.estimatedCloseDate).getTime() : Infinity;
          return da - db;
        })
        .map((r, i) => {
          const sc = stageColors(r.stage);
          const bg = i % 2 === 0 ? "#fff" : TINT;
          const daysLabel = r.daysInPipeline === 0 ? "Today" : `${r.daysInPipeline}d`;
          return `<tr style="background:${bg};">
            <td ${TD}><span style="font-weight:600;">${r.clientName}</span></td>
            <td style="padding:10px 12px;font-size:12px;color:${MUTED};border-bottom:1px solid #f3f4f6;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.address || "—"}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
              <span style="display:inline-block;background:${sc.bg};border:1px solid ${sc.border};color:${sc.text};font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">${r.stage}</span>
            </td>
            <td style="padding:10px 12px;font-size:12px;color:${MUTED};border-bottom:1px solid #f3f4f6;white-space:nowrap;">${r.estimatedCloseDate ? fmtDate(r.estimatedCloseDate) : "—"}</td>
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
          <td colspan="4" style="padding:10px 12px;font-size:13px;font-weight:700;color:${DARK};border-top:2px solid #e5e7eb;">Total Pipeline</td>
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
        <th ${TH}>Est. Close</th>
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
            <td ${TDm}>${fmtDate(r.latestCreatedAt)}</td>
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
        <th ${TH}>Client</th><th ${TH}>Address</th><th ${TH}>Invoice Date</th>
        <th ${TH}>Total Billed</th><th ${TH}>Referral</th><th ${TH}>Rep</th>
      </tr></thead>
      <tbody>${billedTableRows}</tbody>
    </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>Weekly Revenue Report</title></head>
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
          <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:${DARK};letter-spacing:-0.5px;">Weekly Revenue Report</p>
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
              <p style="margin:4px 0 0;font-size:11px;color:${MUTED};">Full month goal: ${signedMonthGoal > 0 ? fmtMoney(signedMonthGoal) : "Not set"}</p>
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
              <p style="margin:4px 0 0;font-size:11px;color:${MUTED};">Full month goal: ${billedMonthGoal > 0 ? fmtMoney(billedMonthGoal) : "Not set"}</p>
            </td></tr>
          </table>
        </td>
      </tr></table>
      ${(priorSignedGoal > 0 || priorBilledGoal > 0 || priorSignedActual > 0 || priorBilledActual > 0) ? (() => {
        const priorSPct = priorSignedGoal > 0 ? Math.round((priorSignedActual / priorSignedGoal) * 100) : 0;
        const priorBPct = priorBilledGoal > 0 ? Math.round((priorBilledActual / priorBilledGoal) * 100) : 0;
        const priorSColor = priorSPct >= 100 ? "#059669" : priorSPct >= 75 ? "#d97706" : "#dc2626";
        const priorBColor = priorBPct >= 100 ? "#059669" : priorBPct >= 75 ? "#d97706" : "#dc2626";
        return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
        <tr><td style="padding:12px 16px;">
          <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;">${priorMonthLabel} Final Results</p>
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:24px;">
              <p style="margin:0;font-size:11px;color:${MUTED};">Signed</p>
              <p style="margin:2px 0 0;font-size:15px;font-weight:700;color:${priorSColor};">${fmtMoney(priorSignedActual)} <span style="font-size:11px;font-weight:400;color:#9ca3af;">/ ${priorSignedGoal > 0 ? fmtMoney(priorSignedGoal) : "no goal"} ${priorSignedGoal > 0 ? `(${priorSPct}%)` : ""}</span></p>
              ${priorSignedDetails.length > 0 ? `<p style="margin:6px 0 0;font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">${priorSignedDetails.length} contract${priorSignedDetails.length !== 1 ? "s" : ""} signed:</p>
              ${priorSignedDetails.map(d => `<p style="margin:2px 0 0;font-size:10px;color:#6b7280;">${d.clientName} &middot; ${d.signedAt} &middot; ${fmtMoneyFull(d.amount)}</p>`).join("")}` : `<p style="margin:4px 0 0;font-size:10px;color:#9ca3af;">No contracts found for this month.</p>`}
            </td>
            <td style="border-left:1px solid #e5e7eb;padding-left:24px;">
              <p style="margin:0;font-size:11px;color:${MUTED};">Earned</p>
              <p style="margin:2px 0 0;font-size:15px;font-weight:700;color:${priorBColor};">${fmtMoney(priorBilledActual)} <span style="font-size:11px;font-weight:400;color:#9ca3af;">/ ${priorBilledGoal > 0 ? fmtMoney(priorBilledGoal) : "no goal"} ${priorBilledGoal > 0 ? `(${priorBPct}%)` : ""}</span></p>
              ${priorBilledDetails.length > 0 ? `<p style="margin:6px 0 0;font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">${priorBilledDetails.length} invoice${priorBilledDetails.length !== 1 ? "s" : ""} counted:</p>
              ${priorBilledDetails.map(d => `<p style="margin:2px 0 0;font-size:10px;color:#6b7280;">${d.clientName} &middot; ${d.invoiceDate} &middot; ${fmtMoneyFull(d.amount)}</p>`).join("")}` : `<p style="margin:4px 0 0;font-size:10px;color:#9ca3af;">No invoices found for this month.</p>`}
            </td>
          </tr></table>
        </td></tr>
      </table>`;
      })() : ""}
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
          <span style="font-size:11px;color:${MUTED};margin-left:4px;">vs wk prior</span>
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
                <p style="margin:0;font-size:11px;color:${MUTED};">Prior week signed</p>
                <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:${SAGE};">${fmtMoney(woWSignedCurr)}</p>
              </td>
              <td style="padding-right:20px;border-left:1px solid #d1d5db;padding-left:20px;">
                <p style="margin:0;font-size:11px;color:${MUTED};">Wk before signed</p>
                <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:${DARK};">${fmtMoney(woWSignedPrev)}</p>
              </td>
              <td style="padding-right:20px;border-left:1px solid #d1d5db;padding-left:20px;">
                <p style="margin:0;font-size:11px;color:${MUTED};">Prior week billed</p>
                <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:${GOLD};">${fmtMoney(woWBilledCurr)}</p>
              </td>
              <td style="border-left:1px solid #d1d5db;padding-left:20px;">
                <p style="margin:0;font-size:11px;color:${MUTED};">Wk before billed</p>
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
  ${section(`Weekly Outreach Activity — ${weekLabel}`, (() => {
    if (activityRows.length === 0) {
      return `<p style="font-size:13px;color:#9ca3af;text-align:center;margin:8px 0;">No activities logged this week.</p>`;
    }
    const allTypes = Array.from(new Set(activityRows.flatMap((r) => Object.keys(r.byType)))).sort();
    const sorted = [...activityRows].sort((a, b) => b.uniqueContacts - a.uniqueContacts || b.totalActivities - a.totalActivities);
    const headerCells = allTypes.map((t) => `<th ${TH}>${t}</th>`).join("");
    const rows = sorted.map((r, i) => {
      const bg = i % 2 === 0 ? "#fff" : TINT;
      const typeCells = allTypes.map((t) => `<td style="padding:10px 12px;font-size:12px;color:${MUTED};border-bottom:1px solid #f3f4f6;text-align:center;">${r.byType[t] ?? "—"}</td>`).join("");
      return `<tr style="background:${bg};">
        <td ${TD}><span style="font-weight:600;">${r.repName}</span></td>
        <td style="padding:10px 12px;font-size:15px;font-weight:700;color:${SAGE};border-bottom:1px solid #f3f4f6;">${r.uniqueContacts}</td>
        <td style="padding:10px 12px;font-size:13px;color:${MUTED};border-bottom:1px solid #f3f4f6;">${r.totalActivities}</td>
        ${typeCells}
      </tr>`;
    }).join("");
    return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <thead><tr>
        <th ${TH}>Rep</th>
        <th ${TH} style="color:${SAGE};">Unique Contacts</th>
        <th ${TH}>Total Activities</th>
        ${headerCells}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  })())}

  ${section("New Features — Last 7 Days", (() => {
    if (newFeatures.length === 0) {
      return `<p style="font-size:13px;color:#9ca3af;text-align:center;margin:8px 0;">No new features tracked in this period.</p>`;
    }
    return `<ul style="margin:0;padding:0 0 0 18px;">
      ${newFeatures.map(f => `<li style="font-size:13px;color:#374151;padding:3px 0;">${f}</li>`).join("")}
    </ul>`;
  })())}

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

// ─── Shared builder (used by both GET preview and POST send) ─────────────────

async function buildReportHtml(_userId: string): Promise<{ html: string; reportDate: string }> {
  // ── Dates — all in CT ──
  const now = new Date();
  const { year, month, day } = ctNow();
  const curMonthKey       = `${year}-${String(month).padStart(2, "0")}`;
  const daysTotal         = daysInMonth(year, month);
  const reportDate        = now.toLocaleDateString("en-US", {
    timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const currentMonthLabel = now.toLocaleDateString("en-US", {
    timeZone: "America/Chicago", month: "long", year: "numeric",
  });

  // ── Prior month key ──
  // Compute directly from year/month to avoid any Date object UTC-vs-CT ambiguity.
  const priorYear = month === 1 ? year - 1 : year;
  const priorMonthNum = month === 1 ? 12 : month - 1;
  const priorMonthKey = `${priorYear}-${String(priorMonthNum).padStart(2, "0")}`;
  // Use the 15th to safely get a mid-month date — no timezone edge cases.
  const priorMonthLabel = new Date(priorYear, priorMonthNum - 1, 15)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // ── Fetch all reference data in parallel (including sales goals) ──
  const [allTenants, opps, contacts, refCompanies, refContacts, staffMembers, allSalesGoals] = await Promise.all([
    getTenants().catch(() => [] as Tenant[]),
    getOpportunities().catch(() => [] as ClientOpportunity[]),
    getClientContacts().catch(() => [] as ClientContact[]),
    getReferralCompanies().catch(() => [] as ReferralCompany[]),
    getReferralContacts().catch(() => [] as ReferralContact[]),
    getStaffMembers().catch(() => []),
    getSalesGoals().catch(() => []),
  ]);

  const salesGoalMap   = new Map(allSalesGoals.map((g) => [g.monthKey, g]));
  const refContactMap  = new Map(refContacts.map((c) => [c.id, c]));

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
  const allInvoices:        { tenantId: string; inv: Invoice }[] = [];

  for (const [tid, cs] of contractsByTenant) {
    for (const c of cs) {
      // Include any contract with Signed or Archived status that has an identifiable date.
      // Fall back to createdAt for contracts manually marked Signed without the signing flow (signedAt may be null).
      if ((c.status === "Signed" || c.status === "Archived") && (c.signedAt || c.createdAt)) {
        allSignedContracts.push({ tenantId: tid, c });
      }
    }
  }
  for (const [tid, invs] of invoicesByTenant) {
    for (const inv of invs) {
      // Exclude deposit invoices — only count final/full billing
      if (inv.createdAt && inv.type !== "Deposit") allInvoices.push({ tenantId: tid, inv });
    }
  }

  // ── MTD pacing ──
  const curGoal   = salesGoalMap.get(curMonthKey);
  const signedMonthGoal   = curGoal?.signedGoal ?? 0;
  const billedMonthGoal   = curGoal?.billedGoal ?? 0;
  const proratedSignedGoal = signedMonthGoal * (day / daysTotal);
  const proratedBilledGoal = billedMonthGoal * (day / daysTotal);

  // ── Prior month actuals ──
  const priorGoal         = salesGoalMap.get(priorMonthKey);
  const priorSignedGoal   = priorGoal?.signedGoal ?? 0;
  const priorBilledGoal   = priorGoal?.billedGoal ?? 0;
  const priorSignedContracts = allSignedContracts
    .filter(({ c }) => monthKey(contractDate(c)) === priorMonthKey);
  const priorSignedActual = priorSignedContracts.reduce((s, { c }) => s + c.totalCost, 0);
  const priorSignedDetails: SignedDetail[] = [...priorSignedContracts]
    .sort((a, b) => contractDate(a.c).localeCompare(contractDate(b.c)))
    .map(({ tenantId, c }) => ({
      clientName: tenantMap.get(tenantId)?.name ?? "Unknown",
      signedAt: fmtDate(contractDate(c)),
      amount: c.totalCost,
    }));
  const priorBilledInvoices = allInvoices
    .filter(({ inv }) => monthKey(inv.createdAt) === priorMonthKey);
  const priorBilledActual = priorBilledInvoices
    .reduce((s, { inv }) => s + grossInvoiceAmount(inv), 0);
  const priorBilledDetails: BilledDetail[] = [...priorBilledInvoices]
    .sort((a, b) => (a.inv.createdAt ?? "").localeCompare(b.inv.createdAt ?? ""))
    .map(({ tenantId, inv }) => ({
      clientName: tenantMap.get(tenantId)?.name ?? "Unknown",
      invoiceDate: fmtDate(inv.createdAt),
      amount: grossInvoiceAmount(inv),
    }));

  const signedMTD = allSignedContracts
    .filter(({ c }) => monthKey(contractDate(c)) === curMonthKey)
    .reduce((s, { c }) => s + c.totalCost, 0);
  const billedMTD = allInvoices
    .filter(({ inv }) => monthKey(inv.createdAt) === curMonthKey)
    .reduce((s, { inv }) => s + grossInvoiceAmount(inv), 0);

  // ── Week-over-week trend ──
  const weekBuckets = buildWeekBuckets(8);

  const signedPerWeek = weekBuckets.map((b) =>
    allSignedContracts
      .filter(({ c }) => inBucket(contractDate(c), b))
      .reduce((s, { c }) => s + c.totalCost, 0)
  );
  const billedPerWeek = weekBuckets.map((b) =>
    allInvoices
      .filter(({ inv }) => inBucket(inv.createdAt, b))
      .reduce((s, { inv }) => s + grossInvoiceAmount(inv), 0)
  );

  const n = weekBuckets.length;
  // Focus on prior week (n-2) vs week-before-prior (n-3); current week (n-1) is too new on Mondays
  const woWSignedCurr = signedPerWeek[n - 2];
  const woWSignedPrev = signedPerWeek[n - 3];
  const woWBilledCurr = billedPerWeek[n - 2];
  const woWBilledPrev = billedPerWeek[n - 3];

  // ── Chart ──
  const chartSrc = await buildWoWChart(
    weekBuckets.map((b) => b.label),
    signedPerWeek.map(Math.round),
    billedPerWeek.map(Math.round),
    n - 2, // highlight prior week, not current week
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
        estimatedCloseDate: o.expectedCloseDate,
        refSource: resolveRefSource(o, contactMap, companyMap, refContactMap),
        rep: resolveRep(o.assignedToClerkId, staffMap),
        nextStepDate: o.nextStepDate,
        nextStepNote: o.nextStepNote,
        daysInPipeline: daysIn,
      };
    });

  // ── Signed this month rows ──
  const signedRows: SignedRow[] = allSignedContracts
    .filter(({ c }) => monthKey(contractDate(c)) === curMonthKey)
    .map(({ tenantId, c }) => {
      const tenant = tenantMap.get(tenantId);
      const opp    = oppByTenant.get(tenantId);
      return {
        clientName: tenant?.name || "Unknown",
        address: tenant ? tenantAddress(tenant) : "",
        signedAt: fmtDate(contractDate(c)),
        value: c.totalCost,
        refSource: resolveRefSource(opp, contactMap, companyMap, refContactMap),
        rep: resolveRep(opp?.assignedToClerkId, staffMap),
      };
    });

  // ── Billed this month rows ──
  // Filter to current-month invoices first so totals only reflect this month's billing.
  const curMonthInvoices = allInvoices.filter(
    ({ inv }) => monthKey(inv.createdAt) === curMonthKey
  );
  const invoiceSumByTenant = new Map<string, { total: number; latestCreatedAt: string }>();
  for (const { tenantId, inv } of curMonthInvoices) {
    const existing = invoiceSumByTenant.get(tenantId);
    const latestCreatedAt = !existing || (inv.createdAt > existing.latestCreatedAt)
      ? inv.createdAt
      : existing.latestCreatedAt;
    invoiceSumByTenant.set(tenantId, {
      total: (existing?.total ?? 0) + grossInvoiceAmount(inv),
      latestCreatedAt,
    });
  }

  const billedRows: BilledRow[] = [];
  for (const [tenantId, { total, latestCreatedAt }] of invoiceSumByTenant) {
    const tenant = tenantMap.get(tenantId);
    const opp    = oppByTenant.get(tenantId);
    billedRows.push({
      clientName: tenant?.name || "Unknown",
      address: tenant ? tenantAddress(tenant) : "",
      latestCreatedAt,
      totalBilled: total,
      refSource: resolveRefSource(opp, contactMap, companyMap, refContactMap),
      rep: resolveRep(opp?.assignedToClerkId, staffMap),
    });
  }

  // ── Weekly activity by rep ──
  // Rolling 7-day window ending today CT (inclusive on both ends).
  const todayStr    = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Compute 6 days before today using local calendar arithmetic (avoids UTC shift).
  const weekStart   = new Date(year, month - 1, day - 6);
  const weekStartStr = weekStart.toLocaleDateString("en-CA"); // YYYY-MM-DD local
  const weekLabel =
    weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " – " +
    new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const oppContactMap = new Map(opps.map((o) => [o.id, o.clientContactId]));

  let weekActivities: { createdByClerkId: string; contactKey: string; type: string }[] = [];
  try {
    const allActivities = await getAllActivities();
    weekActivities = allActivities
      .filter((a) => a.activityDate && a.activityDate.slice(0, 10) >= weekStartStr && a.activityDate.slice(0, 10) <= todayStr)
      .map((a) => ({
        createdByClerkId: a.createdByClerkId,
        contactKey: a.clientContactId || oppContactMap.get(a.opportunityId) || a.opportunityId || "",
        type: a.type,
      }))
      .filter((a) => a.createdByClerkId && a.contactKey);
  } catch { /* non-fatal */ }

  // Group by rep
  const repData = new Map<string, { contacts: Set<string>; total: number; byType: Record<string, number> }>();
  for (const { createdByClerkId, contactKey, type } of weekActivities) {
    if (createdByClerkId === "user_3Aw06FvmrUG36VFw1ACgncn0dkE") continue;
    if (!repData.has(createdByClerkId)) repData.set(createdByClerkId, { contacts: new Set(), total: 0, byType: {} });
    const d = repData.get(createdByClerkId)!;
    d.contacts.add(contactKey);
    d.total++;
    d.byType[type] = (d.byType[type] ?? 0) + 1;
  }
  const activityRows: ActivityRepRow[] = Array.from(repData.entries()).map(([clerkId, d]) => ({
    repName: staffMap.get(clerkId) || clerkId,
    totalActivities: d.total,
    uniqueContacts: d.contacts.size,
    byType: d.byType,
  }));

  // ── Build + send ──
  const newFeatures = await getNewFeatures();
  const html = buildEmail({
    reportDate, currentMonthLabel, priorMonthLabel,
    signedMTD, signedMonthGoal, proratedSignedGoal,
    billedMTD, billedMonthGoal, proratedBilledGoal,
    daysElapsed: day, totalDays: daysTotal,
    priorSignedActual, priorSignedGoal,
    priorBilledActual, priorBilledGoal,
    chartSrc,
    woWSignedCurr, woWSignedPrev,
    woWBilledCurr, woWBilledPrev,
    signedRows, billedRows, pipelineRows,
    activityRows, weekLabel,
    priorBilledDetails,
    priorSignedDetails,
    newFeatures,
  });

  return { html, reportDate };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// GET: preview the email HTML in a browser (admin only, no email sent)
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { html } = await buildReportHtml(userId);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// POST: generate and send the email
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { html, reportDate } = await buildReportHtml(userId);

  await resend.emails.send({
    from: "Top Tier Transitions <noreply@toptiertransitions.com>",
    to: "matt@toptiertransitions.com",
    subject: `Weekly Revenue Report — ${reportDate}`,
    html,
  });

  return NextResponse.json({ success: true });
}
