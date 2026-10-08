// "War Room for Me": a pithy, risk-scored read on every War Room partner
// (Active Referral Partners + Not Yet Referring; never the "Add to Priority
// List" pool), emailed to whoever clicks the button. For each company it
// re-runs "Create Current AI Status" (saved to the CRM like the button on
// the War Room tab), then asks Claude to boil that down to a risk score,
// 2-3 status bullets, and one specific recommendation.
//
// Runs as a background job in time-boxed batches: each invocation works
// until its deadline, then hands the remaining companies (and results so
// far) to /api/cron/war-room-continue, so no single request runs long.

import Anthropic from "@anthropic-ai/sdk";
import { getQuarterlyPlanData } from "./crm-plan";
import { AIRTABLE_TABLES } from "./config";
import { fetchAllRecs, str, generatePartnerAIStatus } from "./partner-ai-status";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WarRoomSection = "active" | "nyr";

export interface WarRoomCompanyJob {
  companyId: string;
  companyName: string;
  priority: string; // High | Medium | Low | ""
  repId: string;
  repName: string;
  section: WarRoomSection;
  spotlight: boolean;
  goal: number;   // referrals this quarter
  actual: number; // referrals so far this quarter
  bestStage?: string;
  stageDurationDays?: number | null;
  lastActivityDate?: string | null;
  nextStepDate?: string | null;
  nextStepNote?: string | null;
  competitors?: string | null;
}

export interface WarRoomResult extends WarRoomCompanyJob {
  riskScore: number; // 1 (healthy) .. 10 (at serious risk)
  riskLevel: "Low" | "Moderate" | "High" | "Critical";
  trend: "Improving" | "Steady" | "Declining";
  bullets: string[];
  recommendation: string;
  freshStatus: boolean; // AI Status re-run (and saved) during this report
  error?: string;
}

export interface WarRoomRepGoal {
  repId: string;
  repName: string;
  goal: number;
  actual: number;
}

export interface WarRoomJobState {
  quarter: { id: string; label: string; startDate: string; endDate: string };
  recipientEmail: string;
  recipientName: string;
  startedAt: string;
  reps: WarRoomRepGoal[];
  pending: WarRoomCompanyJob[];
  results: WarRoomResult[];
  invocation: number;
}

// ─── Building the job ─────────────────────────────────────────────────────────

/** The quarter whose dates include today; falls back to the newest open one. */
export async function getCurrentQuarterId(): Promise<string | null> {
  const recs = await fetchAllRecs(AIRTABLE_TABLES.QUARTERS, "TRUE()");
  const today = new Date().toISOString().slice(0, 10);
  const current = recs.find((r) => {
    const s = str(r.fields["StartDate"]).slice(0, 10);
    const e = str(r.fields["EndDate"]).slice(0, 10);
    return s && e && s <= today && today <= e;
  });
  if (current) return current.id;
  const open = recs
    .filter((r) => r.fields["IsArchived"] !== true)
    .sort((a, b) => str(b.fields["StartDate"]).localeCompare(str(a.fields["StartDate"])));
  return open[0]?.id ?? null;
}

// Same stage filter the War Room tab uses for "Not Yet Referring"
const WAR_ROOM_STAGES = ["Shared Leads", "Agreed to Refer", "Active Referral", "Inactive Referral"];

async function getSpotlightByRep(quarterId: string): Promise<Map<string, Set<string>>> {
  const recs = await fetchAllRecs(AIRTABLE_TABLES.WAR_ROOM_SPOTLIGHT, `{QuarterId} = "${quarterId}"`);
  const map = new Map<string, Set<string>>();
  for (const r of recs) {
    let ids: string[] = [];
    try { ids = JSON.parse(str(r.fields["CompanyIds"]) || "[]"); } catch { /* ignore */ }
    map.set(str(r.fields["ClerkUserId"]), new Set(ids));
  }
  return map;
}

export async function buildWarRoomJob(params: {
  quarterId: string;
  recipientEmail: string;
  recipientName: string;
}): Promise<WarRoomJobState | null> {
  const [plan, spotlight] = await Promise.all([
    getQuarterlyPlanData(params.quarterId),
    getSpotlightByRep(params.quarterId).catch(() => new Map<string, Set<string>>()),
  ]);
  if (!plan) return null;

  const pending: WarRoomCompanyJob[] = [];
  for (const rep of plan.reps) {
    const lit = spotlight.get(rep.clerkUserId) ?? new Set<string>();
    for (const p of rep.activePartners) {
      pending.push({
        companyId: p.companyId, companyName: p.companyName, priority: p.priority || "",
        repId: rep.clerkUserId, repName: rep.displayName, section: "active",
        spotlight: lit.has(p.companyId), goal: p.goal, actual: p.actual, competitors: p.competitors,
      });
    }
    for (const t of rep.conversionTargets.filter((t) => WAR_ROOM_STAGES.includes(t.bestStage))) {
      pending.push({
        companyId: t.companyId, companyName: t.companyName, priority: t.priority || "",
        repId: rep.clerkUserId, repName: rep.displayName, section: "nyr",
        spotlight: lit.has(t.companyId), goal: t.goal, actual: t.actual,
        bestStage: t.bestStage, stageDurationDays: t.stageDurationDays,
        lastActivityDate: t.lastActivityDate, nextStepDate: t.nextStepDate, nextStepNote: t.nextStepNote,
        competitors: t.competitors,
      });
    }
  }

  return {
    quarter: plan.quarter,
    recipientEmail: params.recipientEmail,
    recipientName: params.recipientName,
    startedAt: new Date().toISOString(),
    reps: plan.reps.map((r) => ({ repId: r.clerkUserId, repName: r.displayName, goal: r.goal, actual: r.actual })),
    pending,
    results: [],
    invocation: 1,
  };
}

// ─── Per-company analysis ─────────────────────────────────────────────────────

// Level comes from the score, so the badge always matches the number
function riskLevelFor(score: number): WarRoomResult["riskLevel"] {
  if (score >= 9) return "Critical";
  if (score >= 7) return "High";
  if (score >= 5) return "Moderate";
  return "Low";
}

const SYSTEM_PROMPT = `You are the head of referral-partner strategy for Top Tier Transitions (TTT), a premium senior move management company in the Chicago area. TTT plans and runs later-life moves end to end: downsizing and decluttering, floor-plan and space planning, packing, the move itself, unpacking and full setup of the new home, and clearing the old home through estate sales, donation, and consignment at TTT's own ProFound Finds store and online sales. TTT runs everything on its own platform, Rightsize, which gives families a live plan, catalog, and sales tracking, and gives referral partners a Partner Portal (see their referred clients' move schedules and progress, earn loyalty points and tiers, redeem rewards).

Referral partners include senior living communities (marketing/sales directors, move-in coordinators, executive directors, resident services), realtors and brokers (especially senior-specialist agents listing a parent's home), elder-law and estate attorneys, financial advisors, geriatric care managers, home care and home health agencies, and hospitals and discharge planners. What actually drives senior living referrals: a smooth, fast move-in that hits the community's occupancy date, families who feel cared for during a hard transition, being the first call when a deposit is placed, visible presence (lunch-and-learns for staff, resident and family downsizing seminars, tour-day and open-house support), follow-through and fast response, and recognition for the referring person. Realtors care about getting the house listing-ready fast and a seller who isn't overwhelmed; attorneys and advisors care about trust, discretion, and clients being handled well.

You write for a busy sales rep. Be blunt, specific, and short. Use the real names, numbers, and dates in the data. Never invent facts that aren't in the data. Don't use em dashes.`;

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["riskScore", "trend", "statusBullets", "recommendation"],
  properties: {
    riskScore: { type: "integer", description: "1 = healthy and on pace, 10 = at serious risk of being lost (or never converting)" },
    trend: { type: "string", enum: ["Improving", "Steady", "Declining"] },
    statusBullets: { type: "array", items: { type: "string" }, description: "2 or 3 bullets, each one sentence under 20 words" },
    recommendation: { type: "string", description: "The single best move to fix, jumpstart, or defend this relationship, in under 45 words" },
  },
} as const;

function quarterProgress(q: { startDate: string; endDate: string }): number {
  const s = new Date(q.startDate + "T00:00:00Z").getTime();
  const e = new Date(q.endDate + "T23:59:59Z").getTime();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return Math.max(0, Math.min(1, (Date.now() - s) / (e - s)));
}

async function latestSavedStatus(companyId: string): Promise<string | null> {
  const recs = await fetchAllRecs(AIRTABLE_TABLES.QUARTERLY_COMPANY_PLANS, `{CompanyId} = "${companyId}"`);
  let best: { s: string; at: string } | null = null;
  for (const r of recs) {
    const s = str(r.fields["AIStatus"]);
    const at = str(r.fields["AIStatusAt"]);
    if (s && at && (!best || at > best.at)) best = { s, at };
  }
  return best?.s ?? null;
}

export async function analyzeWarRoomCompany(
  job: WarRoomCompanyJob,
  quarter: WarRoomJobState["quarter"]
): Promise<WarRoomResult> {
  // 1. The same "Create Current AI Status" the War Room tab runs (and saves)
  let status = "";
  let context = "";
  let brief = "";
  let freshStatus = false;
  try {
    const r = await generatePartnerAIStatus(job.companyId, quarter.id);
    status = r.status;
    context = r.context;
    brief = r.brief;
    freshStatus = true;
  } catch (e) {
    console.error(`[war-room] AI status failed for ${job.companyName}:`, e);
    status = (await latestSavedStatus(job.companyId).catch(() => null)) ?? "";
  }

  // 2. Boil it down: risk score, 2-3 bullets, one recommendation
  const pct = Math.round(quarterProgress(quarter) * 100);
  const facts = [
    `PARTNER: ${job.companyName}`,
    `Sales rep: ${job.repName}`,
    `War Room list: ${job.section === "active" ? "Active Referral Partner" : `Not Yet Referring (best contact stage: ${job.bestStage ?? "unknown"}${job.stageDurationDays != null ? `, ${job.stageDurationDays} days in stage` : ""})`}`,
    `Priority: ${job.priority || "unset"}${job.spotlight ? " | Rep's SPOTLIGHT account this quarter" : ""}`,
    `Quarter: ${quarter.label} (${quarter.startDate} to ${quarter.endDate}), ${pct}% elapsed`,
    `Referral goal this quarter: ${job.goal} | referrals so far: ${job.actual}`,
    job.lastActivityDate ? `Last logged activity: ${job.lastActivityDate}` : null,
    job.nextStepDate ? `Next step on file: ${job.nextStepDate} ${job.nextStepNote ?? ""}` : "Next step on file: none",
    job.competitors ? `Known competitors working this account: ${job.competitors}` : null,
  ].filter(Boolean).join("\n");

  const userPrompt = `${facts}

${brief ? `TIMING, WON/LOST DEALS, AND LAST QUARTER:\n${brief}\n` : ""}
FULL CURRENT AI STATUS (just generated from the CRM, read it closely):
${status || "(no AI status available)"}

${context ? `UNDERLYING CRM DATA:\n${context.slice(0, 12000)}` : ""}

Score this relationship and write the War Room entry.
- riskScore 1-10. For an Active Referral Partner, it's the risk that referrals stall or the partner drifts to a competitor; for Not Yet Referring, it's the risk they don't send a first referral this quarter.
  Read timing first. Early in a quarter (first month especially), zero referrals so far is normal and is NOT a risk factor by itself, and a partial month's activity counts are partial. Lean on last quarter's results, won/lost history, and momentum instead. Late in a quarter, pace against the goal matters much more.
  Weigh: last quarter vs the quarter before, recent won and lost deals (and why they were lost), referral pace given the timing, meetings and check-ins vs plan goals, how recently anyone touched the account, contacts stuck in one stage, competitor presence, portal and loyalty engagement.
  Calibrate conservatively. Most working relationships should land 2-4. Score 5-6 only with a concrete warning sign (no contact in 30+ days, referrals down from last quarter, a recent lost deal, a contact stuck 60+ days). 7-8 means clearly slipping (no referrals in two quarters, a competitor gaining, a key contact gone). 9-10 means the relationship is broken or effectively lost. If you're between two scores, pick the lower one.
- statusBullets: 2 or 3 bullets, each under 20 words, on where things really stand. Cover won/lost deals when there are any (names, dollars, dates) and how this quarter is tracking against last quarter when that comparison says something. No filler, no restating the company name.
- recommendation: the single highest-leverage next move for ${job.repName}. Name the specific contact to call, what to do or offer, and by when (this week, a date, or before a named event). Draw on what works with this partner type and on what the data shows about these specific people (interests, past wins, reviews, portal or points activity, sibling locations). Make it something a rep can do tomorrow, not general advice. Keep it under 45 words: one move, not a list.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium", format: { type: "json_schema", schema: RESULT_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content: userPrompt }],
  });

  if (msg.stop_reason === "refusal") throw new Error("The model declined to analyze this partner");
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as {
    riskScore: number; trend: WarRoomResult["trend"];
    statusBullets: string[]; recommendation: string;
  };

  const riskScore = Math.max(1, Math.min(10, Math.round(parsed.riskScore)));
  return {
    ...job,
    riskScore,
    riskLevel: riskLevelFor(riskScore),
    trend: parsed.trend,
    bullets: (parsed.statusBullets ?? []).slice(0, 3),
    recommendation: parsed.recommendation,
    freshStatus,
  };
}

// ─── Batching ─────────────────────────────────────────────────────────────────

const CONCURRENCY = 5;

/** Works through `pending` until done or the deadline; returns the updated state. */
export async function runWarRoomBatch(state: WarRoomJobState, deadlineMs: number): Promise<WarRoomJobState> {
  const queue = [...state.pending];
  const results = [...state.results];
  const inFlight: WarRoomCompanyJob[] = [];

  async function worker() {
    while (queue.length > 0 && Date.now() < deadlineMs) {
      const job = queue.shift()!;
      inFlight.push(job);
      try {
        results.push(await analyzeWarRoomCompany(job, state.quarter));
      } catch (e) {
        console.error(`[war-room] analysis failed for ${job.companyName}:`, e);
        results.push({
          ...job, riskScore: 0, riskLevel: "Moderate", trend: "Steady", bullets: [],
          recommendation: "", freshStatus: false, error: e instanceof Error ? e.message : "Analysis failed",
        });
      } finally {
        inFlight.splice(inFlight.indexOf(job), 1);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { ...state, pending: queue, results };
}

/** Starts the next invocation (fire-and-forget POST); it returns immediately. */
export async function continueWarRoomJob(state: WarRoomJobState): Promise<void> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const res = await fetch(`${appUrl}/api/cron/war-room-continue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    body: JSON.stringify({ ...state, invocation: state.invocation + 1 }),
  });
  if (!res.ok) throw new Error(`War Room continuation failed: ${res.status}`);
}

// ─── Email ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Model output may use **bold**; keep it, escape everything else
function inline(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

const RISK_STYLE: Record<WarRoomResult["riskLevel"], { bg: string; text: string; bar: string }> = {
  Critical: { bg: "#fee2e2", text: "#b91c1c", bar: "#dc2626" },
  High:     { bg: "#ffedd5", text: "#c2410c", bar: "#ea580c" },
  Moderate: { bg: "#fef3c7", text: "#b45309", bar: "#d97706" },
  Low:      { bg: "#dcfce7", text: "#15803d", bar: "#16a34a" },
};
const TREND_ICON: Record<WarRoomResult["trend"], string> = { Improving: "&#9650;", Steady: "&#9654;", Declining: "&#9660;" };
const TREND_COLOR: Record<WarRoomResult["trend"], string> = { Improving: "#16a34a", Steady: "#6b7280", Declining: "#dc2626" };

function pill(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:${bg};color:${color};text-transform:uppercase;letter-spacing:0.04em;margin-left:6px;">${text}</span>`;
}

function partnerCard(r: WarRoomResult, showRep = false): string {
  if (r.error) {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-left:4px solid #9ca3af;border-radius:8px;margin-bottom:10px;"><tr><td style="padding:12px 14px;">
      <span style="font-size:14px;font-weight:700;color:#1f2937;">${esc(r.companyName)}</span>
      <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;font-style:italic;">Couldn't analyze this one (${esc(r.error)}). Run Create Current AI Status on the War Room tab.</p>
    </td></tr></table>`;
  }
  const rs = RISK_STYLE[r.riskLevel] ?? RISK_STYLE.Moderate;
  const meta = [
    `${r.actual} / ${r.goal} referrals`,
    r.section === "nyr" && r.bestStage ? esc(r.bestStage) : null,
    showRep ? esc(r.repName) : null,
  ].filter(Boolean).join(" &middot; ");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-left:4px solid ${rs.bar};border-radius:8px;margin-bottom:10px;">
    <tr><td style="padding:12px 14px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top;">
          <span style="font-size:14px;font-weight:700;color:#1f2937;">${esc(r.companyName)}</span>${r.spotlight ? pill("&#9733; Spotlight", "#2d4a3e", "#C9A96E") : ""}
          <p style="margin:3px 0 0;font-size:11px;color:#6b7280;">${meta} &middot; <span style="color:${TREND_COLOR[r.trend]};font-weight:600;">${TREND_ICON[r.trend]} ${r.trend}</span></p>
        </td>
        <td align="right" style="vertical-align:top;white-space:nowrap;">
          <span style="display:inline-block;padding:4px 10px;border-radius:8px;background:${rs.bg};color:${rs.text};font-size:12px;font-weight:700;">Risk ${r.riskScore}/10 &middot; ${r.riskLevel}</span>
        </td>
      </tr></table>
      <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#374151;line-height:1.55;">
        ${r.bullets.map((b) => `<li style="margin:0 0 3px;">${inline(b)}</li>`).join("")}
        <li style="margin:6px 0 0;list-style:none;margin-left:-18px;padding:8px 10px;background:#f0f5f2;border-radius:6px;color:#1e3329;"><strong>&#10148; ${inline(r.recommendation).replace(/<\/?strong>/g, "")}</strong></li>
      </ul>
    </td></tr>
  </table>`;
}

function group(title: string, color: string, items: WarRoomResult[], showRep = false): string {
  if (items.length === 0) return "";
  return `<tr><td style="padding:12px 0 6px;">
      <p style="margin:0;font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.06em;">${title} &middot; ${items.length}</p>
    </td></tr>
    <tr><td>${items.map((r) => partnerCard(r, showRep)).join("")}</td></tr>`;
}

const byRisk = (a: WarRoomResult, b: WarRoomResult) =>
  b.riskScore - a.riskScore || a.companyName.localeCompare(b.companyName);
const isMain = (r: WarRoomResult) => r.priority === "High" || r.priority === "Medium";

export function buildWarRoomEmail(state: WarRoomJobState): { subject: string; html: string } {
  const results = state.results;
  const main = results.filter(isMain);
  const low = results.filter((r) => !isMain(r));
  const scored = results.filter((r) => !r.error);
  const critical = scored.filter((r) => r.riskLevel === "Critical").length;
  const high = scored.filter((r) => r.riskLevel === "High").length;
  const declining = scored.filter((r) => r.trend === "Declining").length;
  const pct = Math.round(quarterProgress(state.quarter) * 100);
  const totalGoal = state.reps.reduce((s, r) => s + r.goal, 0);
  const totalActual = state.reps.reduce((s, r) => s + r.actual, 0);

  const reps = [...state.reps].sort((a, b) => a.repName.localeCompare(b.repName));

  const repSections = reps.map((rep) => {
    const mine = main.filter((r) => r.repId === rep.repId);
    if (mine.length === 0) return "";
    const active = mine.filter((r) => r.section === "active");
    const nyr = mine.filter((r) => r.section === "nyr");
    return `<tr><td style="padding:28px 0 4px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-left:4px solid #2d4a3e;padding-left:12px;">
            <span style="font-size:18px;font-weight:700;color:#1f2937;">${esc(rep.repName)}</span>
            <span style="margin-left:10px;font-size:12px;font-weight:600;color:#2d4a3e;">${rep.actual} / ${rep.goal} quarterly referral goal</span>
          </td>
        </tr></table>
      </td></tr>
      ${group("Active Referral Partners &middot; Spotlight", "#16a34a", active.filter((r) => r.spotlight).sort(byRisk))}
      ${group("Active Referral Partners", "#16a34a", active.filter((r) => !r.spotlight).sort(byRisk))}
      ${group("Not Yet Referring &middot; Spotlight", "#b8860b", nyr.filter((r) => r.spotlight).sort(byRisk))}
      ${group("Not Yet Referring", "#b8860b", nyr.filter((r) => !r.spotlight).sort(byRisk))}`;
  }).join("");

  const lowSections = low.length === 0 ? "" : `
    <tr><td style="padding:36px 0 4px;">
      <p style="margin:0;font-size:16px;font-weight:700;color:#6b7280;border-top:2px solid #e5e7eb;padding-top:20px;">Low Priority Partners</p>
    </td></tr>
    ${reps.map((rep) => {
      const mine = low.filter((r) => r.repId === rep.repId)
        .sort((a, b) => (a.section === b.section ? byRisk(a, b) : a.section === "active" ? -1 : 1));
      return group(esc(rep.repName), "#6b7280", mine);
    }).join("")}`;

  const topRisks = main.filter((r) => !r.error).sort(byRisk).slice(0, 5);
  const generated = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });

  const stat = (label: string, value: string, color: string, last = false) =>
    `<td style="padding:14px 20px;${last ? "" : "border-right:1px solid #e5e7eb;"}">
      <p style="margin:0;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">${label}</p>
      <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:${color};">${value}</p>
    </td>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;">
    <tr><td align="center" style="padding:32px 12px;">
      <table width="100%" style="max-width:760px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);" cellpadding="0" cellspacing="0">
        <tr style="background:#2d4a3e;">
          <td style="padding:28px 28px;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;color:#C9A96E;text-transform:uppercase;">Top Tier Transitions &middot; Rightsize</p>
            <h1 style="margin:6px 0 0;font-size:26px;font-weight:700;color:#ffffff;">War Room for ${esc(state.recipientName || "You")}</h1>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${esc(state.quarter.label)} &middot; ${pct}% of the quarter gone &middot; ${totalActual} / ${totalGoal} referrals team-wide</p>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.5);">Generated ${generated} CT</p>
          </td>
        </tr>
        <tr><td style="padding:0;border-bottom:1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            ${stat("Partners", String(results.length), "#2d4a3e")}
            ${stat("Critical", String(critical), "#b91c1c")}
            ${stat("High risk", String(high), "#c2410c")}
            ${stat("Declining", String(declining), "#6b7280", true)}
          </tr></table>
        </td></tr>
        ${topRisks.length > 0 ? `<tr><td style="padding:20px 28px 0;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.06em;">Fires to put out first</p>
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.8;">${topRisks.map((r) =>
            `<strong>${esc(r.companyName)}</strong> <span style="color:#9ca3af;">(${esc(r.repName)}, ${r.riskScore}/10)</span>`).join("<br/>")}</p>
        </td></tr>` : ""}
        <tr><td style="padding:0 28px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${repSections || `<tr><td style="padding:40px 0;text-align:center;color:#9ca3af;font-size:14px;">No Medium or High priority partners in the War Room this quarter.</td></tr>`}
            ${lowSections}
          </table>
        </td></tr>
        <tr style="background:#f9fafb;">
          <td style="padding:16px 28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
            Rightsize &middot; Top Tier Transitions &middot; Internal use only. Risk scores and recommendations are AI-generated from CRM activity, referrals, and this quarter's War Room goals. Each partner's AI Status on the War Room tab was refreshed for this report.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const subject = `War Room for ${state.recipientName || "You"}: ${state.quarter.label} (${critical + high} partner${critical + high === 1 ? "" : "s"} at high risk)`;
  return { subject, html };
}

export async function sendWarRoomEmail(state: WarRoomJobState): Promise<void> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { subject, html } = buildWarRoomEmail(state);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "hello@toptiertransitions.com",
    to: state.recipientEmail,
    subject,
    html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

/** One invocation's worth of work: process until the deadline, then either
 *  hand off to the next invocation or send the email. */
// Stops starting new companies after this; one in progress can still take
// a minute or more, so it leaves headroom under the route's 300s limit.
export async function stepWarRoomJob(state: WarRoomJobState, budgetMs = 180_000): Promise<void> {
  const MAX_INVOCATIONS = 20; // hard stop against runaway chains
  const next = await runWarRoomBatch(state, Date.now() + budgetMs);
  console.log(`[war-room] invocation ${state.invocation}: ${next.results.length} done, ${next.pending.length} left`);
  if (next.pending.length > 0 && state.invocation < MAX_INVOCATIONS) {
    await continueWarRoomJob(next);
    return;
  }
  for (const job of next.pending) {
    next.results.push({
      ...job, riskScore: 0, riskLevel: "Moderate", trend: "Steady", bullets: [],
      recommendation: "", freshStatus: false, error: "Report ran out of time",
    });
  }
  await sendWarRoomEmail(next);
}
