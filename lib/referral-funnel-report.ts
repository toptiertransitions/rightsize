// "Referral Funnel for Me": the companion to "War Room for Me" for the
// Referral Funnel side of the CRM (companies still at Identified, Met, or
// with no contacts yet). Emailed to whoever clicks the button.
//
// It explicitly calls out:
//  - trends: stage moves in the last 30 days (forward, backward, and
//    graduations into War Room stages), new contacts, accounts going cold
//  - High priority companies with no quarterly plan
//  - in-scope companies with no next step (or an overdue one), flagged
//    hardest when they also had a stage change in the last 30 days
// "In scope" = every High priority company, plus the Medium companies a
// rep has added to this quarter's Not Yet Referring Pipeline (Mediums the
// reps haven't picked are left out on purpose). Separately, every High or
// Medium company that moved from the funnel into a War Room stage (Agreed to
// Refer or beyond) in the last 30 days is "Moving to War Room". Both get
// short AI status bullets and one next best action. Everything else in the
// funnel is listed without AI. The email is organized rep by rep.
//
// Read-only: unlike War Room for Me it never re-saves a company's AI Status
// (it reads the same CRM picture through buildPartnerAIContext).
//
// Runs as a background job in time-boxed batches, handing off to
// /api/cron/referral-funnel-continue, exactly like the War Room report.

import Anthropic from "@anthropic-ai/sdk";
import { getQuarterlyPlanData, getQuarterCompanyPlans } from "./crm-plan";
import { getReferralCompanies, getReferralContacts, getStaffMembers } from "./airtable";
import { buildPartnerAIContext } from "./partner-ai-status";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FunnelGroup = "moved" | "planned" | "unplanned";

export interface StageMove {
  contactName: string;
  companyId: string;
  companyName: string;
  priority: string;
  repName: string;
  from: string;
  to: string;
  at: string; // ISO
  direction: "forward" | "backward";
}

export interface FunnelCompanyJob {
  companyId: string;
  companyName: string;
  companyType: string;
  city: string;
  priority: string; // High | Medium | Low | ""
  repId: string;    // "" = unassigned / not a sales rep
  repName: string;
  bestStage: string; // Identified | Met | No contacts yet | (War Room stage if it just graduated)
  stageDays: number | null;
  contactCount: number;
  onPipeline: boolean; // picked as a Not Yet Referring target this quarter
  planMeetings: string[];
  lastActivityDate: string | null;
  nextStepDate: string | null;
  nextStepNote: string | null;
  moves: StageMove[]; // this company's stage moves in the last 30 days
  /** Newly in the War Room: every contact now at Agreed to Refer or beyond
   * moved there from a funnel stage in the last 30 days (a company that
   * already had a War Room contact before that doesn't count). */
  enteredWarRoom?: boolean;
}

export interface FunnelResult extends FunnelCompanyJob {
  urgency: number; // 1 (fine for now) .. 10 (act today)
  momentum: "Moving" | "Stalled" | "Slipping";
  bullets: string[];
  recommendation: string;
  error?: string;
}

export interface FunnelTrends {
  movesForward: number;
  movesBackward: number;
  graduated: number; // moved into a War Room stage
  transitions: Array<{ label: string; count: number }>;
  newContacts30: number;
  touched30: number;      // M/H funnel companies with activity in the last 30 days
  cold60: number;         // M/H funnel companies with no activity in 60+ days (or never)
  mhFunnel: number;
  lowFunnel: number;
  byRep: Array<{ repName: string; mh: number; movingToWarRoom: number; moves: number; noPlan: number; noNextStep: number }>;
}

export interface FunnelJobState {
  quarter: { id: string; label: string; startDate: string; endDate: string };
  recipientEmail: string;
  recipientName: string;
  startedAt: string;
  trends: FunnelTrends;
  allMoves: StageMove[];
  low: FunnelCompanyJob[]; // listed without AI
  pending: FunnelCompanyJob[];
  results: FunnelResult[];
  trendBullets?: string[];
  invocation: number;
}

// ─── Building the job ─────────────────────────────────────────────────────────

const STAGE_RANK: Record<string, number> = {
  "Inactive Referral": 0, "Identified": 1, "Met": 2, "Agreed to Refer": 3, "Shared Leads": 4, "Active Referral": 5,
};
// Same split as the CRM tabs: these stages live on the War Room tab
const WAR_ROOM_STAGES = ["Shared Leads", "Agreed to Refer", "Active Referral", "Inactive Referral"];
/** All Highs, and only the Mediums a rep picked for the quarter's pipeline */
const inScope = (j: { priority: string; onPipeline: boolean }) => j.priority === "High" || (j.priority === "Medium" && j.onPipeline);
// Test rep hidden on the CRM Referral Funnel tab too
const EXCLUDE_REPS = ["MattTest Sales"];
const DAY = 86400000;

function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export async function buildFunnelJob(params: {
  quarterId: string;
  recipientEmail: string;
  recipientName: string;
}): Promise<FunnelJobState | null> {
  const [plan, companyPlans, companies, contacts, staff] = await Promise.all([
    getQuarterlyPlanData(params.quarterId),
    getQuarterCompanyPlans(params.quarterId).catch(() => new Map()),
    getReferralCompanies(),
    getReferralContacts(),
    getStaffMembers().catch(() => []),
  ]);
  if (!plan) return null;

  const staffName = new Map(staff.map((s) => [s.clerkUserId, s.displayName]));
  const salesRepIds = new Set(plan.reps.map((r) => r.clerkUserId));
  const onPipeline = new Set(plan.reps.flatMap((r) => r.conversionTargets.map((t) => `${t.companyId}::${r.clerkUserId}`)));

  const contactsByCompany = new Map<string, typeof contacts>();
  for (const c of contacts) {
    if (!c.referralCompanyId) continue;
    contactsByCompany.set(c.referralCompanyId, [...(contactsByCompany.get(c.referralCompanyId) ?? []), c]);
  }

  const excluded = new Set(staff.filter((st) => EXCLUDE_REPS.includes(st.displayName)).map((st) => st.clerkUserId));
  const realCompanies = companies.filter((co) => !excluded.has(co.assignedToClerkId));
  const realIds = new Set(realCompanies.map((co) => co.id));

  const now = Date.now();
  const cutoff30 = new Date(now - 30 * DAY).toISOString();
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const repNameFor = (clerkId: string) => (clerkId ? staffName.get(clerkId) ?? "Unassigned" : "Unassigned");

  // Stage moves in the last 30 days (latest move per contact, as the CRM keeps it)
  const allMoves: StageMove[] = contacts
    .filter((c) => realIds.has(c.referralCompanyId) && c.previousStage && c.stageChangedAt && c.stageChangedAt >= cutoff30 && c.previousStage !== c.stage)
    .map((c) => {
      const co = companyById.get(c.referralCompanyId);
      return {
        contactName: c.name,
        companyId: c.referralCompanyId,
        companyName: co?.name ?? "Unknown",
        priority: co?.priority ?? "",
        repName: repNameFor(co?.assignedToClerkId ?? ""),
        from: c.previousStage!,
        to: c.stage,
        at: c.stageChangedAt!,
        direction: (STAGE_RANK[c.stage] ?? 0) >= (STAGE_RANK[c.previousStage!] ?? 0) ? "forward" as const : "backward" as const,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
  const movesByCompany = new Map<string, StageMove[]>();
  for (const m of allMoves) movesByCompany.set(m.companyId, [...(movesByCompany.get(m.companyId) ?? []), m]);

  const jobFor = (co: (typeof companies)[number]): FunnelCompanyJob => {
    const cs = contactsByCompany.get(co.id) ?? [];
    let best = "";
    for (const c of cs) if (!best || (STAGE_RANK[c.stage] ?? -1) > (STAGE_RANK[best] ?? -1)) best = c.stage;
    let stageDays: number | null = null;
    let lastActivity: string | null = co.lastActivityDate || null;
    let nextDate: string | null = null;
    let nextNote: string | null = null;
    for (const c of cs) {
      if (c.lastActivityDate && (!lastActivity || c.lastActivityDate > lastActivity)) lastActivity = c.lastActivityDate;
      if (c.nextStepDate && (!nextDate || c.nextStepDate < nextDate)) { nextDate = c.nextStepDate; nextNote = c.nextStepNote ?? null; }
      if (c.stage === best) {
        const ref = c.stageChangedAt || c.dateIntroduced || c.createdAt;
        const ms = ref ? new Date(ref).getTime() : NaN;
        if (!isNaN(ms)) stageDays = Math.max(stageDays ?? 0, Math.floor((now - ms) / DAY));
      }
    }
    const recentEntry = (c: (typeof cs)[number]) =>
      !!c.stageChangedAt && c.stageChangedAt >= cutoff30 && !!c.previousStage && !WAR_ROOM_STAGES.includes(c.previousStage);
    const wrContacts = cs.filter((c) => WAR_ROOM_STAGES.includes(c.stage) && c.stage !== "Inactive Referral");
    const enteredWarRoom = wrContacts.length > 0 && wrContacts.every(recentEntry);
    const repId = salesRepIds.has(co.assignedToClerkId) ? co.assignedToClerkId : "";
    const p = companyPlans.get(co.id);
    const planMeetings = p ? [p.meeting1, p.meeting2, p.meeting3, p.resource1, p.resource2, p.resource3].filter((s: string) => s.trim()) : [];
    return {
      companyId: co.id, companyName: co.name, companyType: co.type, city: co.city,
      priority: co.priority || "", repId, repName: repNameFor(co.assignedToClerkId),
      bestStage: best || "No contacts yet", stageDays, contactCount: cs.length,
      onPipeline: onPipeline.has(`${co.id}::${co.assignedToClerkId}`),
      planMeetings,
      lastActivityDate: lastActivity, nextStepDate: nextDate, nextStepNote: nextNote,
      moves: movesByCompany.get(co.id) ?? [],
      enteredWarRoom,
    };
  };

  const all = realCompanies.map(jobFor);
  const funnel = all.filter((j) => !WAR_ROOM_STAGES.includes(j.bestStage));
  // Moving to War Room: any High or Medium with a move from a funnel stage
  // into Agreed to Refer or beyond in the last 30 days (pipeline or not)
  const graduatedMH = all.filter((j) => (j.priority === "High" || j.priority === "Medium") && j.enteredWarRoom);
  const mhFunnel = funnel.filter(inScope);
  const low = funnel.filter((j) => !inScope(j));

  const t = today();
  const hasPlan = (j: FunnelCompanyJob) => j.onPipeline || j.planMeetings.length > 0;
  const hasNext = (j: FunnelCompanyJob) => !!j.nextStepDate && j.nextStepDate.slice(0, 10) >= t;
  const funnelIds = new Set(funnel.map((j) => j.companyId));

  const transitions = new Map<string, number>();
  for (const m of allMoves) transitions.set(`${m.from} → ${m.to}`, (transitions.get(`${m.from} → ${m.to}`) ?? 0) + 1);
  const repNames = Array.from(new Set([...mhFunnel, ...graduatedMH, ...low].map((j) => j.repName)))
    .sort((a, b) => (a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b)));

  const trends: FunnelTrends = {
    movesForward: allMoves.filter((m) => m.direction === "forward").length,
    movesBackward: allMoves.filter((m) => m.direction === "backward").length,
    graduated: allMoves.filter((m) => WAR_ROOM_STAGES.includes(m.to) && !WAR_ROOM_STAGES.includes(m.from)).length,
    transitions: Array.from(transitions, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    newContacts30: contacts.filter((c) => c.createdAt >= cutoff30 && funnelIds.has(c.referralCompanyId)).length,
    touched30: mhFunnel.filter((j) => j.lastActivityDate && j.lastActivityDate >= cutoff30.slice(0, 10)).length,
    cold60: mhFunnel.filter((j) => !j.lastActivityDate || j.lastActivityDate < new Date(now - 60 * DAY).toISOString().slice(0, 10)).length,
    mhFunnel: mhFunnel.length,
    lowFunnel: low.length,
    byRep: repNames.map((repName) => {
      const mine = mhFunnel.filter((j) => j.repName === repName);
      return {
        repName,
        mh: mine.length,
        movingToWarRoom: graduatedMH.filter((j) => j.repName === repName).length,
        moves: allMoves.filter((m) => m.repName === repName).length,
        noPlan: mine.filter((j) => !hasPlan(j)).length,
        noNextStep: mine.filter((j) => !hasNext(j)).length,
      };
    }),
  };

  return {
    quarter: plan.quarter,
    recipientEmail: params.recipientEmail,
    recipientName: params.recipientName,
    startedAt: new Date().toISOString(),
    trends,
    allMoves,
    low,
    pending: [...mhFunnel, ...graduatedMH],
    results: [],
    invocation: 1,
  };
}

// ─── Flags (deterministic, shown on cards and in the call-outs) ──────────────

export function flagsFor(j: FunnelCompanyJob): { noPlan: boolean; noNextStep: boolean; overdue: boolean; moved: boolean } {
  const t = today();
  const overdue = !!j.nextStepDate && j.nextStepDate.slice(0, 10) < t;
  return {
    noPlan: !j.onPipeline && j.planMeetings.length === 0,
    noNextStep: !j.nextStepDate,
    overdue,
    moved: j.moves.length > 0,
  };
}

// ─── Per-company analysis ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the head of referral-partner development for Top Tier Transitions (TTT), a premium senior move management company in the Chicago area. TTT plans and runs later-life moves end to end: downsizing, floor-plan and space planning, packing, the move, unpacking and setup, and clearing the old home through estate sales, donation, and consignment at its ProFound Finds store. Families and partners use TTT's Rightsize platform; referral partners get a Partner Portal with their clients' progress and loyalty rewards.

These companies are early in the referral funnel: Identified (we know of them) or Met (we've met someone) but no agreement to refer yet. Typical partners are senior living communities (sales/marketing directors, move-in coordinators, executive directors), senior-specialist realtors, elder-law and estate attorneys, financial advisors, geriatric care managers, home care agencies, and hospital discharge planners. What moves a funnel account forward: getting the first real meeting with the right decision maker, a lunch-and-learn or resident/family downsizing seminar, tour-day or open-house support, a fast helpful response to a first family, and following up on a set date instead of drifting.

You write for a busy sales rep. Be blunt, specific, and short. Use the real names, numbers, and dates in the data. Never invent facts that aren't in the data. Don't use em dashes.`;

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["urgency", "momentum", "statusBullets", "recommendation"],
  properties: {
    urgency: { type: "integer", description: "1 = fine for now, 10 = act today or lose the opening" },
    momentum: { type: "string", enum: ["Moving", "Stalled", "Slipping"] },
    statusBullets: { type: "array", items: { type: "string" }, description: "2 or 3 bullets, each one sentence under 20 words" },
    recommendation: { type: "string", description: "The single next best action, in under 45 words" },
  },
} as const;

export async function analyzeFunnelCompany(job: FunnelCompanyJob, quarter: FunnelJobState["quarter"]): Promise<FunnelResult> {
  let context = "";
  let brief = "";
  try {
    const r = await buildPartnerAIContext(job.companyId, quarter.id);
    context = r.context;
    brief = r.brief;
  } catch (e) {
    console.error(`[referral-funnel] context failed for ${job.companyName}:`, e);
  }

  const f = flagsFor(job);
  const facts = [
    `COMPANY: ${job.companyName}${job.companyType ? ` (${job.companyType})` : ""}${job.city ? `, ${job.city}` : ""}`,
    `Sales rep: ${job.repName}`,
    `Priority: ${job.priority || "unset"}`,
    `Best contact stage: ${job.bestStage}${job.stageDays != null ? `, ${job.stageDays} days in stage` : ""} | ${job.contactCount} contact${job.contactCount === 1 ? "" : "s"} in the CRM`,
    `Today: ${today()} | Quarter: ${quarter.label} (${quarter.startDate} to ${quarter.endDate})`,
    `Quarterly plan: ${job.onPipeline ? "picked as a Not Yet Referring target this quarter" : "NOT on this quarter's pipeline"}${job.planMeetings.length ? `; key meetings/resources: ${job.planMeetings.join("; ")}` : "; no key meetings or resources written"}`,
    job.lastActivityDate ? `Last logged activity: ${job.lastActivityDate}` : "Last logged activity: none",
    job.nextStepDate ? `Next step on file: ${job.nextStepDate}${f.overdue ? " (OVERDUE)" : ""} ${job.nextStepNote ?? ""}` : "Next step on file: NONE",
    job.moves.length
      ? `Stage moves in the last 30 days:\n${job.moves.map((m) => `  - ${m.contactName}: ${m.from} -> ${m.to} on ${m.at.slice(0, 10)}`).join("\n")}`
      : "Stage moves in the last 30 days: none",
  ].join("\n");

  const userPrompt = `${facts}

${brief ? `TIMING AND HISTORY:\n${brief}\n` : ""}
${context ? `CRM DATA:\n${context.slice(0, 12000)}` : "(no further CRM data available)"}

Write this company's Referral Funnel entry.
- urgency 1-10: how much it matters that ${job.repName} acts on this account now. Raise it for a High priority account, a recent forward move that needs follow-through (momentum is perishable), a backward move, no next step or an overdue one, no quarterly plan, or no activity in 45+ days. Lower it when a dated next step and plan are in place and things are moving. Most accounts land 3-6.
- momentum: Moving (recent forward progress or active dialogue), Stalled (no change, little activity), Slipping (moved backward, contact left, or going cold).
- statusBullets: 2 or 3 bullets, each under 20 words, on where this account really stands and what changed recently. If there's no next step or no quarterly plan, say so plainly in one bullet. No filler, no restating the company name.
- recommendation: the single next best action to move this account to its next stage (Identified: land a first meeting with the right decision maker; Met: get an agreement to refer; Agreed to Refer or later, i.e. just moved into the War Room: lock in the first referral and keep the new momentum). Name the contact, the specific move or offer, and when (this week, a date). If there's no next step on file, the action must end with setting a dated next step in the CRM; if there's no quarterly plan and the priority is Medium or High, say to add it to this quarter's plan. Under 45 words, one move.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium", format: { type: "json_schema", schema: RESULT_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content: userPrompt }],
  });
  if (msg.stop_reason === "refusal") throw new Error("The model declined to analyze this company");
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as { urgency: number; momentum: FunnelResult["momentum"]; statusBullets: string[]; recommendation: string };

  return {
    ...job,
    urgency: Math.max(1, Math.min(10, Math.round(parsed.urgency))),
    momentum: parsed.momentum,
    bullets: (parsed.statusBullets ?? []).slice(0, 3),
    recommendation: parsed.recommendation,
  };
}

/** One short AI read on the whole funnel, from the numbers and the per-company results. */
async function writeTrendBullets(state: FunnelJobState): Promise<string[]> {
  const tr = state.trends;
  const lines = state.results.filter((r) => !r.error).map((r) => {
    const f = flagsFor(r);
    return `- ${r.companyName} (${r.priority}, ${r.repName}, ${r.bestStage}, ${r.momentum}, urgency ${r.urgency})${f.noPlan ? " [no plan]" : ""}${f.noNextStep ? " [no next step]" : f.overdue ? " [next step overdue]" : ""}${f.moved ? ` [moved: ${r.moves.map((m) => `${m.from}->${m.to}`).join(", ")}]` : ""}`;
  });
  const prompt = `Referral Funnel numbers, last 30 days (${today()}):
- Stage moves: ${tr.movesForward} forward, ${tr.movesBackward} backward, ${tr.graduated} moved up into War Room stages (Agreed to Refer or beyond)
- Transitions: ${tr.transitions.map((x) => `${x.label} x${x.count}`).join("; ") || "none"}
- New contacts added at funnel companies: ${tr.newContacts30}
- In-scope funnel companies (all Highs + Mediums on the pipeline): ${tr.mhFunnel}; touched in last 30 days: ${tr.touched30}; no activity in 60+ days: ${tr.cold60}
- By rep: ${tr.byRep.map((r) => `${r.repName}: ${r.mh} in scope, ${r.movingToWarRoom} moving to War Room, ${r.moves} moves, ${r.noPlan} with no plan, ${r.noNextStep} with no next step`).join("; ")}

Per company:
${lines.join("\n")}

Write 3 to 5 bullets on the trends a sales leader should know: where the funnel is moving or stuck, which rep or account type stands out, and the planning gaps (no quarterly plan, no next step) with counts. Each bullet one sentence under 25 words. Plain text, no bullet characters.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: { type: "object", additionalProperties: false, required: ["bullets"], properties: { bullets: { type: "array", items: { type: "string" } } } } },
    },
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  return ((JSON.parse(text) as { bullets: string[] }).bullets ?? []).slice(0, 5);
}

// ─── Batching ─────────────────────────────────────────────────────────────────

const CONCURRENCY = 5;

export async function runFunnelBatch(state: FunnelJobState, deadlineMs: number): Promise<FunnelJobState> {
  const queue = [...state.pending];
  const results = [...state.results];
  async function worker() {
    while (queue.length > 0 && Date.now() < deadlineMs) {
      const job = queue.shift()!;
      try {
        results.push(await analyzeFunnelCompany(job, state.quarter));
      } catch (e) {
        console.error(`[referral-funnel] analysis failed for ${job.companyName}:`, e);
        results.push({ ...job, urgency: 0, momentum: "Stalled", bullets: [], recommendation: "", error: e instanceof Error ? e.message : "Analysis failed" });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { ...state, pending: queue, results };
}

export async function continueFunnelJob(state: FunnelJobState): Promise<void> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const res = await fetch(`${appUrl}/api/cron/referral-funnel-continue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    body: JSON.stringify({ ...state, invocation: state.invocation + 1 }),
  });
  if (!res.ok) throw new Error(`Referral Funnel continuation failed: ${res.status}`);
}

// ─── Email ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function inline(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const x = new Date(d.length === 10 ? `${d}T12:00:00Z` : d);
  return isNaN(x.getTime()) ? d : x.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}

function urgencyLevel(u: number): "Act now" | "High" | "Medium" | "Low" {
  if (u >= 8) return "Act now";
  if (u >= 6) return "High";
  if (u >= 4) return "Medium";
  return "Low";
}
const URGENCY_STYLE: Record<ReturnType<typeof urgencyLevel>, { bg: string; text: string; bar: string }> = {
  "Act now": { bg: "#fee2e2", text: "#b91c1c", bar: "#dc2626" },
  High:      { bg: "#ffedd5", text: "#c2410c", bar: "#ea580c" },
  Medium:    { bg: "#fef3c7", text: "#b45309", bar: "#d97706" },
  Low:       { bg: "#dcfce7", text: "#15803d", bar: "#16a34a" },
};
const MOMENTUM_ICON: Record<FunnelResult["momentum"], string> = { Moving: "&#9650;", Stalled: "&#9654;", Slipping: "&#9660;" };
const MOMENTUM_COLOR: Record<FunnelResult["momentum"], string> = { Moving: "#16a34a", Stalled: "#6b7280", Slipping: "#dc2626" };

function pill(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:${bg};color:${color};text-transform:uppercase;letter-spacing:0.04em;margin:0 0 0 6px;">${text}</span>`;
}

function flagPills(j: FunnelCompanyJob): string {
  const f = flagsFor(j);
  return [
    f.moved ? pill("Moved", "#dbeafe", "#1d4ed8") : "",
    f.noPlan && j.priority === "High" ? pill("No plan", "#fee2e2", "#b91c1c") : "",
    f.noNextStep ? pill("No next step", "#fee2e2", "#b91c1c") : f.overdue ? pill("Next step overdue", "#ffedd5", "#c2410c") : "",
  ].join("");
}

function companyCard(r: FunnelResult, showRep = false): string {
  if (r.error) {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-left:4px solid #9ca3af;border-radius:8px;margin-bottom:10px;"><tr><td style="padding:12px 14px;">
      <span style="font-size:14px;font-weight:700;color:#1f2937;">${esc(r.companyName)}</span>${flagPills(r)}
      <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;font-style:italic;">Couldn't analyze this one (${esc(r.error)}).</p>
    </td></tr></table>`;
  }
  const level = urgencyLevel(r.urgency);
  const us = URGENCY_STYLE[level];
  const meta = [
    esc(r.bestStage) + (r.stageDays != null ? ` ${r.stageDays}d` : ""),
    `${esc(r.priority || "No")} priority`,
    r.nextStepDate ? `Next step ${fmtDate(r.nextStepDate)}` : null,
    showRep ? esc(r.repName) : null,
  ].filter(Boolean).join(" &middot; ");
  const moves = r.moves.length
    ? `<p style="margin:6px 0 0;font-size:11px;color:#1d4ed8;">${r.moves.map((m) => `${esc(m.contactName)}: ${esc(m.from)} &rarr; ${esc(m.to)} (${fmtDate(m.at)})`).join("<br/>")}</p>`
    : "";
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-left:4px solid ${us.bar};border-radius:8px;margin-bottom:10px;">
    <tr><td style="padding:12px 14px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top;">
          <span style="font-size:14px;font-weight:700;color:#1f2937;">${esc(r.companyName)}</span>${flagPills(r)}
          <p style="margin:3px 0 0;font-size:11px;color:#6b7280;">${meta} &middot; <span style="color:${MOMENTUM_COLOR[r.momentum]};font-weight:600;">${MOMENTUM_ICON[r.momentum]} ${r.momentum}</span></p>
          ${moves}
        </td>
        <td align="right" style="vertical-align:top;white-space:nowrap;">
          <span style="display:inline-block;padding:4px 10px;border-radius:8px;background:${us.bg};color:${us.text};font-size:12px;font-weight:700;">Urgency ${r.urgency}/10</span>
        </td>
      </tr></table>
      <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#374151;line-height:1.55;">
        ${r.bullets.map((b) => `<li style="margin:0 0 3px;">${inline(b)}</li>`).join("")}
        <li style="margin:6px 0 0;list-style:none;margin-left:-18px;padding:8px 10px;background:#f0f5f2;border-radius:6px;color:#1e3329;"><strong>&#10148; ${inline(r.recommendation).replace(/<\/?strong>/g, "")}</strong></li>
      </ul>
    </td></tr>
  </table>`;
}

function group(title: string, color: string, items: FunnelResult[], showRep = false): string {
  if (items.length === 0) return "";
  return `<tr><td style="padding:12px 0 6px;">
      <p style="margin:0;font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.06em;">${title} &middot; ${items.length}</p>
    </td></tr>
    <tr><td>${items.map((r) => companyCard(r, showRep)).join("")}</td></tr>`;
}

const byUrgency = (a: FunnelResult, b: FunnelResult) =>
  b.urgency - a.urgency || (a.priority === "High" ? -1 : 0) - (b.priority === "High" ? -1 : 0) || a.companyName.localeCompare(b.companyName);

function callout(title: string, color: string, note: string, items: FunnelCompanyJob[], showRep = true): string {
  if (items.length === 0) return "";
  return `<tr><td style="padding:16px 0 0;">
    <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.06em;">${title} &middot; ${items.length}</p>
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">${note}</p>
    <p style="margin:0;font-size:13px;color:#374151;line-height:1.8;">${items.map((j) =>
      `<strong>${esc(j.companyName)}</strong> <span style="color:#9ca3af;">(${showRep ? `${esc(j.repName)}, ` : ""}${esc(j.priority)}, ${esc(j.bestStage)})</span>`).join("<br/>")}</p>
  </td></tr>`;
}

export function buildFunnelEmail(state: FunnelJobState): { subject: string; html: string } {
  const tr = state.trends;
  const results = state.results;
  const funnelResults = results.filter((r) => !WAR_ROOM_STAGES.includes(r.bestStage));
  const graduated = results.filter((r) => WAR_ROOM_STAGES.includes(r.bestStage));
  const isMHr = (j: FunnelCompanyJob) => inScope(j);

  const movedNoNext = funnelResults.filter((r) => { const f = flagsFor(r); return f.moved && (f.noNextStep || f.overdue); });
  const noPlan = funnelResults.filter((r) => isMHr(r) && flagsFor(r).noPlan);
  const noNext = funnelResults.filter((r) => { const f = flagsFor(r); return isMHr(r) && (f.noNextStep || f.overdue) && !f.moved; });

  const cardIds = new Set(results.map((r) => r.companyId));
  const reps = tr.byRep.map((r) => r.repName);

  const movesTable = (moves: StageMove[]) => moves.length === 0 ? "" : `<tr><td style="padding:12px 0 6px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.06em;">Other stage changes, last 30 days &middot; ${moves.length}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#374151;border-collapse:collapse;">
        ${moves.map((m) => `<tr>
          <td style="padding:4px 6px 4px 0;border-bottom:1px solid #f3f4f6;white-space:nowrap;color:#9ca3af;">${fmtDate(m.at)}</td>
          <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;"><strong>${esc(m.companyName)}</strong> <span style="color:#9ca3af;">${esc(m.contactName)}</span></td>
          <td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;white-space:nowrap;color:${m.direction === "forward" ? "#16a34a" : "#dc2626"};">${esc(m.from)} &rarr; ${esc(m.to)}</td>
          <td style="padding:4px 0 4px 6px;border-bottom:1px solid #f3f4f6;white-space:nowrap;color:#6b7280;">${esc(m.priority || "Unset")}</td>
        </tr>`).join("")}
      </table>
    </td></tr>`;

  const restList = (items: FunnelCompanyJob[]) => items.length === 0 ? "" : `<tr><td style="padding:12px 0 0;">
      <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Rest of the funnel &middot; ${items.length}</p>
      <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">Mediums not on the pipeline, Low, and unset priority. No AI read.</p>
      <p style="margin:0;font-size:12px;color:#374151;line-height:1.7;">${[...items].sort((a, b) => b.moves.length - a.moves.length || a.companyName.localeCompare(b.companyName)).map((j) =>
        `${esc(j.companyName)} <span style="color:#9ca3af;">(${esc(j.priority || "Unset")}, ${esc(j.bestStage)}${j.nextStepDate ? `, next ${fmtDate(j.nextStepDate)}` : ", no next step"})</span>${j.moves.length ? pill("Moved", "#dbeafe", "#1d4ed8") : ""}`).join("<br/>")}</p>
    </td></tr>`;

  const repSections = reps.map((repName) => {
    const mine = funnelResults.filter((r) => r.repName === repName);
    const grads = graduated.filter((r) => r.repName === repName);
    const rest = state.low.filter((j) => j.repName === repName);
    const otherMoves = state.allMoves.filter((m) => m.repName === repName && !cardIds.has(m.companyId));
    if (mine.length + grads.length + rest.length + otherMoves.length === 0) return "";
    const rt = tr.byRep.find((x) => x.repName === repName);
    const attention = [
      callout("Moved stages but no next step", "#b91c1c", "Recent progress with nothing scheduled to build on it. Fix these first.", movedNoNext.filter((r) => r.repName === repName), false),
      callout("High priority with no quarterly plan", "#b91c1c", "Not on this quarter's Not Yet Referring Pipeline and no key meetings written.", noPlan.filter((r) => r.repName === repName), false),
      callout("No next step", "#c2410c", "No next step on file, or the one on file is past due.", noNext.filter((r) => r.repName === repName), false),
    ].join("");
    return `<tr><td style="padding:32px 0 4px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-left:4px solid #2d4a3e;padding-left:12px;">
            <span style="font-size:18px;font-weight:700;color:#1f2937;">${esc(repName)}</span>
            <span style="margin-left:10px;font-size:12px;font-weight:600;color:#2d4a3e;">${rt ? `${rt.mh} in scope &middot; ${rt.movingToWarRoom} moving to War Room &middot; ${rt.moves} stage move${rt.moves === 1 ? "" : "s"}` : ""}</span>
          </td>
        </tr></table>
      </td></tr>
      ${attention ? `<tr><td style="padding:4px 0 8px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fef7f7;border-radius:8px;"><tr><td style="padding:0 14px 14px;"><table width="100%" cellpadding="0" cellspacing="0">${attention}</table></td></tr></table></td></tr>` : ""}
      ${group("Moving to War Room (Agreed to Refer +)", "#16a34a", grads.sort(byUrgency))}
      ${group("Recent stage changes in the funnel", "#1d4ed8", mine.filter((r) => r.moves.length > 0).sort(byUrgency))}
      ${group("On this quarter's plan", "#2d4a3e", mine.filter((r) => r.moves.length === 0 && !flagsFor(r).noPlan).sort(byUrgency))}
      ${group("No quarterly plan", "#b91c1c", mine.filter((r) => r.moves.length === 0 && flagsFor(r).noPlan).sort(byUrgency))}
      ${movesTable(otherMoves)}
      ${restList(rest)}`;
  }).join("");

  const teamTable = tr.byRep.length === 0 ? "" : `<tr><td style="padding:16px 28px 0;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#2d4a3e;text-transform:uppercase;letter-spacing:0.06em;">By sales rep</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#374151;border-collapse:collapse;">
        <tr style="color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;">
          <td style="padding:4px 6px 4px 0;border-bottom:1px solid #e5e7eb;">Rep</td>
          <td align="right" style="padding:4px 6px;border-bottom:1px solid #e5e7eb;">In scope</td>
          <td align="right" style="padding:4px 6px;border-bottom:1px solid #e5e7eb;">To War Room</td>
          <td align="right" style="padding:4px 6px;border-bottom:1px solid #e5e7eb;">Stage moves</td>
          <td align="right" style="padding:4px 6px;border-bottom:1px solid #e5e7eb;">No plan</td>
          <td align="right" style="padding:4px 0 4px 6px;border-bottom:1px solid #e5e7eb;">No next step</td>
        </tr>
        ${tr.byRep.map((r) => `<tr>
          <td style="padding:5px 6px 5px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">${esc(r.repName)}</td>
          <td align="right" style="padding:5px 6px;border-bottom:1px solid #f3f4f6;">${r.mh}</td>
          <td align="right" style="padding:5px 6px;border-bottom:1px solid #f3f4f6;color:#16a34a;">${r.movingToWarRoom}</td>
          <td align="right" style="padding:5px 6px;border-bottom:1px solid #f3f4f6;">${r.moves}</td>
          <td align="right" style="padding:5px 6px;border-bottom:1px solid #f3f4f6;color:${r.noPlan ? "#b91c1c" : "#9ca3af"};">${r.noPlan}</td>
          <td align="right" style="padding:5px 0 5px 6px;border-bottom:1px solid #f3f4f6;color:${r.noNextStep ? "#c2410c" : "#9ca3af"};">${r.noNextStep}</td>
        </tr>`).join("")}
      </table>
    </td></tr>`;

  const generated = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
  const stat = (label: string, value: string, color: string, last = false) =>
    `<td style="padding:14px 16px;${last ? "" : "border-right:1px solid #e5e7eb;"}">
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
            <h1 style="margin:6px 0 0;font-size:26px;font-weight:700;color:#ffffff;">Referral Funnel for ${esc(state.recipientName || "You")}</h1>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${esc(state.quarter.label)} &middot; Identified, Met, and not-yet-contacted companies &middot; last 30 days</p>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.5);">Generated ${generated} CT</p>
          </td>
        </tr>
        <tr><td style="padding:0;border-bottom:1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            ${stat("In scope", String(tr.mhFunnel), "#2d4a3e")}
            ${stat("Stage moves", `${tr.movesForward}&#9650; ${tr.movesBackward}&#9660;`, "#1d4ed8")}
            ${stat("No plan", String(noPlan.length), "#b91c1c")}
            ${stat("No next step", String(funnelResults.filter((r) => { const f = flagsFor(r); return isMHr(r) && (f.noNextStep || f.overdue); }).length), "#c2410c", true)}
          </tr></table>
        </td></tr>
        <tr><td style="padding:20px 28px 0;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#2d4a3e;text-transform:uppercase;letter-spacing:0.06em;">Trends</p>
          <ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.6;">
            <li>${tr.movesForward} forward and ${tr.movesBackward} backward stage moves; ${tr.graduated} moved up into War Room stages.</li>
            ${tr.transitions.length ? `<li>Most common: ${tr.transitions.slice(0, 4).map((x) => `${esc(x.label)} (${x.count})`).join(", ")}.</li>` : ""}
            <li>${tr.touched30} of ${tr.mhFunnel} in-scope companies (all Highs + Mediums on the pipeline) were touched in the last 30 days; ${tr.cold60} have had no activity in 60+ days.</li>
            <li>${tr.newContacts30} new contact${tr.newContacts30 === 1 ? "" : "s"} added at funnel companies.</li>
            ${(state.trendBullets ?? []).map((b) => `<li>${inline(b)}</li>`).join("")}
          </ul>
        </td></tr>
        ${teamTable}
        <tr><td style="padding:0 28px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${repSections || `<tr><td style="padding:40px 0;text-align:center;color:#9ca3af;font-size:14px;">Nothing in the funnel right now.</td></tr>`}
          </table>
        </td></tr>
        <tr style="background:#f9fafb;">
          <td style="padding:16px 28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
            Rightsize &middot; Top Tier Transitions &middot; Internal use only. Status bullets and next actions are AI-generated from CRM contacts, activity, and this quarter's plans. Stage changes use each contact's most recent move. Saved AI Statuses were not changed by this report.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const gaps = movedNoNext.length + noPlan.length;
  const subject = `Referral Funnel for ${state.recipientName || "You"}: ${tr.movesForward + tr.movesBackward} stage move${tr.movesForward + tr.movesBackward === 1 ? "" : "s"}, ${gaps} planning gap${gaps === 1 ? "" : "s"}`;
  return { subject, html };
}

export async function sendFunnelEmail(state: FunnelJobState): Promise<void> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { subject, html } = buildFunnelEmail(state);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "hello@toptiertransitions.com",
    to: state.recipientEmail,
    subject,
    html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function stepFunnelJob(state: FunnelJobState, budgetMs = 180_000): Promise<void> {
  const MAX_INVOCATIONS = 20;
  const next = await runFunnelBatch(state, Date.now() + budgetMs);
  console.log(`[referral-funnel] invocation ${state.invocation}: ${next.results.length} done, ${next.pending.length} left`);
  if (next.pending.length > 0 && state.invocation < MAX_INVOCATIONS) {
    await continueFunnelJob(next);
    return;
  }
  for (const job of next.pending) {
    next.results.push({ ...job, urgency: 0, momentum: "Stalled", bullets: [], recommendation: "", error: "Report ran out of time" });
  }
  next.trendBullets = await writeTrendBullets(next).catch((e) => {
    console.error("[referral-funnel] trend bullets failed:", e);
    return [];
  });
  await sendFunnelEmail(next);
}
