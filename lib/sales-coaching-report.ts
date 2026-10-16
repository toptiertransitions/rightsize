// "Activity Analysis for Me": a coaching report on one sales rep (TTTSales),
// built from ALL of their CRM activity and compared against every other
// sales rep. Emailed to the admin who clicked, written to be forwarded to
// the rep.
//
// How it works (background job, like the Referral Funnel report):
//  1. Gather: every rep's partners, contacts, stages, referrals, clients and
//     opportunities, plus all of their activity. Numbers are computed in
//     code (never by the AI). Each rep's activity text — every Email in the
//     last 180 days, and every Call / Meeting / Text / Note / Task ever — is
//     cleaned (entities decoded, quoted reply chains dropped), grouped by
//     partner or client, and split into ~70k-token chunks.
//  2. Digest: one AI pass per chunk pulls out what's moving partners down
//     the funnel and what isn't, with short quotes as evidence. A rep's
//     digests are the expensive part, so they're saved: every other rep's
//     (the team baseline) is reused for 30 days, and the selected rep's own
//     for 7, unless the admin asks to rebuild the baseline.
//  3. Synthesize: one AI pass writes the coaching plan for the selected rep
//     from their digests, every other rep's digests, and the numbers.
//  4. Email.
// Each AI call stays well inside the 300s function limit; the job hands off
// to /api/cron/sales-coaching-continue between steps. State and chunk text
// live in Upstash Redis (too large to pass between invocations).

import Anthropic from "@anthropic-ai/sdk";
import { Redis } from "@upstash/redis";
import {
  getReferralCompanies,
  getReferralContacts,
  getClientContacts,
  getOpportunities,
  getAllActivities,
  getStaffMembers,
} from "./airtable";
import type { CRMActivity, ReferralCompany, ReferralContact, ClientContact, ClientOpportunity, StaffMember } from "./types";

const MODEL = "claude-opus-5-5";
const DAY = 86400000;
const EMAIL_WINDOW_DAYS = 180;
const CHUNK_CHARS = 280_000; // ~70k tokens of activity text per digest call
const MAX_ITEM_CHARS = 3500; // one email / note, after quoted replies are dropped
const DIGEST_CONCURRENCY = 4;
const JOB_TTL_S = 6 * 3600;
// Saved digests: the team baseline (other reps) is reused for 30 days, the
// rep being coached for 7, so their own coaching reflects recent activity.
const BASELINE_MAX_AGE_DAYS = 30;
const SUBJECT_MAX_AGE_DAYS = 7;
const DIGEST_CACHE_TTL_S = BASELINE_MAX_AGE_DAYS * 86400;
const MAX_INVOCATIONS = 25;
// Test account, hidden everywhere in the CRM
const EXCLUDE_REPS = ["MattTest Sales"];

const STAGES = ["Identified", "Met", "Agreed to Refer", "Shared Leads", "Active Referral", "Inactive Referral"] as const;
const STAGE_RANK: Record<string, number> = {
  "Inactive Referral": 0, "Identified": 1, "Met": 2, "Agreed to Refer": 3, "Shared Leads": 4, "Active Referral": 5,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Counts = Record<string, number>;

export interface PartnerRow {
  company: string;
  type: string;
  priority: string;
  bestStage: string;
  contacts: string; // "Jane Doe (Met since May 2)"
  referralsAll: number;
  referrals180: number;
  won: number;
  lost: number;
  touches180: Counts;
  lastTouch: string | null;
}

export interface RepStats {
  repId: string;
  repName: string;
  companies: number;
  companiesByType: Counts;
  companiesByPriority: Counts;
  companiesByBestStage: Counts;
  contactsByStage: Counts;
  stageMoves180: { forward: number; backward: number; transitions: Counts };
  activityAll: Counts;
  activity180: Counts;
  emailsSent180: number;
  emailsReceived180: number;
  monthly: Array<{ month: string; counts: Counts }>;
  partnersTouched30: number;
  partnersTouched90: number;
  partnersNeverTouched: number;
  highMediumUntouched90: number;
  referralsAll: number;
  referrals180: number;
  referralsByCompanyType180: Counts;
  opportunities: { won: number; lost: number; open: number; won180: number; lost180: number; winRate: number | null; wonValue180: number; lostReasons180: string[] };
  partners: PartnerRow[];
}

interface Chunk { repId: string; index: number; key: string }

export interface CoachingJobState {
  id: string;
  repId: string;
  repName: string;
  recipientEmail: string;
  recipientName: string;
  startedAt: string;
  invocation: number;
  reps: RepStats[];
  pendingChunks: Chunk[];
  /** repId -> one digest (JSON string) per chunk */
  digests: Record<string, string[]>;
  digestErrors: string[];
  /** repId -> when that rep's digests were made (ISO), for the email footer */
  digestsAsOf: Record<string, string>;
  /** First half of the plan (diagnosis), written in its own leg */
  diagnosis?: Diagnosis;
}

// ─── Redis ────────────────────────────────────────────────────────────────────

function redis(): Redis {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("This report needs Upstash Redis, which isn't configured here.");
  }
  return Redis.fromEnv();
}
const jobKey = (id: string) => `coach:job:${id}`;
const chunkKey = (id: string, repId: string, n: number) => `coach:chunk:${id}:${repId}:${n}`;
const digestCacheKey = (repId: string) => `coach:digest:v2:${repId}`;
interface SavedDigests { at: string; digests: string[] }

export async function saveJob(state: CoachingJobState): Promise<void> {
  await redis().set(jobKey(state.id), state, { ex: JOB_TTL_S });
}
export async function loadJob(id: string): Promise<CoachingJobState | null> {
  return (await redis().get<CoachingJobState>(jobKey(id))) ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ctToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
}
function inc(c: Counts, k: string, by = 1) {
  c[k] = (c[k] ?? 0) + by;
}
function fmtDay(d: string | null | undefined): string {
  if (!d) return "";
  const x = new Date(d.length === 10 ? `${d}T12:00:00Z` : d);
  return isNaN(x.getTime()) ? d : x.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (ENTITIES[e.toLowerCase()]) return ENTITIES[e.toLowerCase()];
    if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return m;
  });
}

/**
 * An activity's text, cleaned for analysis: entities decoded, quoted reply
 * chains and signatures-after-quotes dropped (they repeat the previous
 * message), whitespace collapsed, capped at MAX_ITEM_CHARS. Emails keep
 * their Subject line; the From line is turned into a direction label.
 */
export function cleanActivityText(note: string): { text: string; from: string | null; subject: string | null } {
  let s = decodeEntities(note ?? "").replace(/\r/g, "");
  const subject = s.match(/^Subject:\s*(.*)$/m)?.[1]?.trim() ?? null;
  const from = s.match(/^From:\s*(.*)$/m)?.[1]?.trim() ?? null;
  s = s.replace(/^Subject:.*$/m, "").replace(/^From:.*$/m, "");
  // Cut at the start of a quoted earlier message
  const cutPatterns = [
    /\n\s*On .{5,200}wrote:\s*\n/i,
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*From:\s.+\n\s*(Sent|Date):/i,
    /\n_{10,}\n/,
  ];
  s = s.trimStart();
  for (const re of cutPatterns) {
    const m = s.match(re);
    // Only when there's real text above the quote (a forward can start with one)
    if (m && m.index !== undefined && s.slice(0, m.index).trim().length >= 10) s = s.slice(0, m.index);
  }
  s = s
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length > MAX_ITEM_CHARS) s = `${s.slice(0, MAX_ITEM_CHARS)} [...trimmed]`;
  return { text: s, from, subject };
}

// ─── 1. Gather ────────────────────────────────────────────────────────────────

interface CrmData {
  reps: StaffMember[];
  companies: ReferralCompany[];
  contacts: ReferralContact[];
  clients: ClientContact[];
  opps: ClientOpportunity[];
  activities: CRMActivity[];
}

export async function getSalesReps(): Promise<{ id: string; name: string }[]> {
  const staff = await getStaffMembers();
  return staff
    .filter((s) => s.isActive && s.role === "TTTSales" && s.clerkUserId && !EXCLUDE_REPS.includes(s.displayName))
    .map((s) => ({ id: s.clerkUserId, name: s.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadCrm(): Promise<CrmData> {
  const [staff, companies, contacts, clients, opps, activities] = await Promise.all([
    getStaffMembers(),
    getReferralCompanies(),
    getReferralContacts(),
    getClientContacts(),
    getOpportunities(),
    getAllActivities(),
  ]);
  const reps = staff.filter((s) => s.isActive && s.role === "TTTSales" && s.clerkUserId && !EXCLUDE_REPS.includes(s.displayName));
  return { reps, companies, contacts, clients, opps, activities };
}

function computeRepStats(rep: StaffMember, d: CrmData): RepStats {
  const cut180 = daysAgo(EMAIL_WINDOW_DAYS);
  const cut90 = daysAgo(90);
  const cut30 = daysAgo(30);
  const myCompanies = d.companies.filter((c) => c.assignedToClerkId === rep.clerkUserId);
  const myCompanyIds = new Set(myCompanies.map((c) => c.id));
  const contactsByCompany = new Map<string, ReferralContact[]>();
  for (const c of d.contacts) {
    if (!myCompanyIds.has(c.referralCompanyId)) continue;
    if (!contactsByCompany.has(c.referralCompanyId)) contactsByCompany.set(c.referralCompanyId, []);
    contactsByCompany.get(c.referralCompanyId)!.push(c);
  }
  const contactToCompany = new Map<string, string>();
  for (const [cid, list] of contactsByCompany) for (const c of list) contactToCompany.set(c.id, cid);

  // Referrals = clients whose referring partner contact is at one of this rep's companies
  const referralsByCompany = new Map<string, ClientContact[]>();
  for (const cl of d.clients) {
    const comp = cl.referralPartnerId ? contactToCompany.get(cl.referralPartnerId) : undefined;
    if (!comp) continue;
    if (!referralsByCompany.has(comp)) referralsByCompany.set(comp, []);
    referralsByCompany.get(comp)!.push(cl);
  }
  const oppsByClient = new Map<string, ClientOpportunity[]>();
  for (const o of d.opps) {
    if (!oppsByClient.has(o.clientContactId)) oppsByClient.set(o.clientContactId, []);
    oppsByClient.get(o.clientContactId)!.push(o);
  }

  const myActs = d.activities.filter((a) => a.createdByClerkId === rep.clerkUserId);
  const activityAll: Counts = {};
  const activity180: Counts = {};
  let emailsSent180 = 0;
  let emailsReceived180 = 0;
  const lastTouchByCompany = new Map<string, string>();
  const touches180ByCompany = new Map<string, Counts>();
  const monthlyMap = new Map<string, Counts>();
  for (let i = 5; i >= 0; i--) {
    const dt = new Date();
    dt.setUTCDate(1);
    dt.setUTCMonth(dt.getUTCMonth() - i);
    monthlyMap.set(dt.toISOString().slice(0, 7), {});
  }
  for (const a of myActs) {
    const day = (a.activityDate || a.createdAt || "").slice(0, 10);
    inc(activityAll, a.type);
    const month = monthlyMap.get(day.slice(0, 7));
    if (month) inc(month, a.type);
    const comp = a.clientContactId ? contactToCompany.get(a.clientContactId) : undefined;
    if (comp && (!lastTouchByCompany.get(comp) || day > lastTouchByCompany.get(comp)!)) lastTouchByCompany.set(comp, day);
    if (day >= cut180) {
      inc(activity180, a.type);
      if (a.type === "Email") {
        const { from } = cleanActivityText(a.note);
        if (!from || /toptiertransitions\.com/i.test(from)) emailsSent180++;
        else emailsReceived180++;
      }
      if (comp) {
        if (!touches180ByCompany.has(comp)) touches180ByCompany.set(comp, {});
        inc(touches180ByCompany.get(comp)!, a.type);
      }
    }
  }

  const companiesByType: Counts = {};
  const companiesByPriority: Counts = {};
  const companiesByBestStage: Counts = {};
  const contactsByStage: Counts = {};
  const transitions: Counts = {};
  let forward = 0;
  let backward = 0;
  let referralsAll = 0;
  let referrals180 = 0;
  const referralsByCompanyType180: Counts = {};
  let partnersTouched30 = 0;
  let partnersTouched90 = 0;
  let partnersNeverTouched = 0;
  let highMediumUntouched90 = 0;
  const partners: PartnerRow[] = [];

  for (const co of myCompanies) {
    const type = co.type || "Unspecified";
    const priority = co.priority || "None";
    inc(companiesByType, type);
    inc(companiesByPriority, priority);
    const cs = contactsByCompany.get(co.id) ?? [];
    let best = cs.length ? "Identified" : "No contacts yet";
    for (const c of cs) {
      inc(contactsByStage, c.stage);
      if ((STAGE_RANK[c.stage] ?? 0) > (STAGE_RANK[best] ?? -1)) best = c.stage;
      if (c.previousStage && c.stageChangedAt && c.stageChangedAt.slice(0, 10) >= cut180) {
        const dir = (STAGE_RANK[c.stage] ?? 0) - (STAGE_RANK[c.previousStage] ?? 0);
        if (dir > 0) forward++; else if (dir < 0) backward++;
        inc(transitions, `${c.previousStage} -> ${c.stage}`);
      }
    }
    inc(companiesByBestStage, best);

    const refs = referralsByCompany.get(co.id) ?? [];
    const refs180 = refs.filter((r) => (r.createdAt || "").slice(0, 10) >= cut180);
    referralsAll += refs.length;
    referrals180 += refs180.length;
    if (refs180.length) inc(referralsByCompanyType180, type, refs180.length);
    let won = 0;
    let lost = 0;
    for (const r of refs) for (const o of oppsByClient.get(r.id) ?? []) {
      if (o.stage === "Won") won++;
      else if (o.stage === "Lost") lost++;
    }

    const last = lastTouchByCompany.get(co.id) ?? null;
    if (!last) partnersNeverTouched++;
    if (last && last >= cut30) partnersTouched30++;
    if (last && last >= cut90) partnersTouched90++;
    if ((priority === "High" || priority === "Medium") && (!last || last < cut90)) highMediumUntouched90++;

    partners.push({
      company: co.name,
      type,
      priority,
      bestStage: best,
      contacts: cs.map((c) => `${c.name}${c.title ? `, ${c.title}` : ""} (${c.stage}${c.stageChangedAt ? ` since ${fmtDay(c.stageChangedAt)}` : ""})`).join("; "),
      referralsAll: refs.length,
      referrals180: refs180.length,
      won,
      lost,
      touches180: touches180ByCompany.get(co.id) ?? {},
      lastTouch: last,
    });
  }

  // Opportunities this rep owns (their own leads, referred or not)
  const myOpps = d.opps.filter((o) => o.assignedToClerkId === rep.clerkUserId);
  const won = myOpps.filter((o) => o.stage === "Won");
  const lost = myOpps.filter((o) => o.stage === "Lost");
  const won180 = won.filter((o) => (o.wonAt || o.createdAt || "").slice(0, 10) >= cut180);
  const lost180 = lost.filter((o) => (o.lostAt || o.createdAt || "").slice(0, 10) >= cut180);
  const closed180 = won180.length + lost180.length;

  partners.sort((a, b) =>
    b.referrals180 - a.referrals180 || b.referralsAll - a.referralsAll ||
    (STAGE_RANK[b.bestStage] ?? -1) - (STAGE_RANK[a.bestStage] ?? -1) ||
    (b.lastTouch ?? "").localeCompare(a.lastTouch ?? "")
  );

  return {
    repId: rep.clerkUserId,
    repName: rep.displayName,
    companies: myCompanies.length,
    companiesByType,
    companiesByPriority,
    companiesByBestStage,
    contactsByStage,
    stageMoves180: { forward, backward, transitions },
    activityAll,
    activity180,
    emailsSent180,
    emailsReceived180,
    monthly: [...monthlyMap].map(([month, counts]) => ({ month, counts })),
    partnersTouched30,
    partnersTouched90,
    partnersNeverTouched,
    highMediumUntouched90,
    referralsAll,
    referrals180,
    referralsByCompanyType180,
    opportunities: {
      won: won.length,
      lost: lost.length,
      open: myOpps.length - won.length - lost.length,
      won180: won180.length,
      lost180: lost180.length,
      winRate: closed180 ? Math.round((won180.length / closed180) * 100) : null,
      wonValue180: won180.reduce((s, o) => s + (o.estimatedValue || 0), 0),
      lostReasons180: lost180.map((o) => o.lostReason).filter((r): r is string => !!r).slice(0, 25),
    },
    partners,
  };
}

/**
 * The rep's activity text, grouped by partner company or client and in date
 * order, split into chunks of at most CHUNK_CHARS (a group stays whole unless
 * it alone is bigger than a chunk).
 */
function buildCorpus(rep: StaffMember, d: CrmData): string[] {
  const cut180 = daysAgo(EMAIL_WINDOW_DAYS);
  const companyById = new Map(d.companies.map((c) => [c.id, c]));
  const contactById = new Map(d.contacts.map((c) => [c.id, c]));
  const clientById = new Map(d.clients.map((c) => [c.id, c]));
  const oppById = new Map(d.opps.map((o) => [o.id, o]));
  const oppsByClient = new Map<string, ClientOpportunity[]>();
  for (const o of d.opps) {
    if (!oppsByClient.has(o.clientContactId)) oppsByClient.set(o.clientContactId, []);
    oppsByClient.get(o.clientContactId)!.push(o);
  }

  const groups = new Map<string, { header: string; lines: { day: string; text: string }[] }>();
  const groupFor = (key: string, header: () => string) => {
    if (!groups.has(key)) groups.set(key, { header: header(), lines: [] });
    return groups.get(key)!;
  };

  for (const a of d.activities) {
    if (a.createdByClerkId !== rep.clerkUserId) continue;
    const day = (a.activityDate || a.createdAt || "").slice(0, 10);
    if (a.type === "Email" && day < cut180) continue; // emails: last 180 days; everything else: all time
    const { text, from, subject } = cleanActivityText(a.note);
    if (!text && !subject) continue;

    let group;
    let who = "";
    const partnerContact = a.clientContactId ? contactById.get(a.clientContactId) : undefined;
    const client = a.clientContactId ? clientById.get(a.clientContactId) : undefined;
    const oppClient = !client && a.opportunityId ? clientById.get(oppById.get(a.opportunityId)?.clientContactId ?? "") : undefined;
    if (partnerContact) {
      const co = companyById.get(partnerContact.referralCompanyId);
      who = partnerContact.name;
      group = groupFor(`p:${co?.id ?? partnerContact.id}`, () => {
        const cs = d.contacts.filter((c) => c.referralCompanyId === co?.id);
        return `=== PARTNER: ${co?.name ?? "Unknown company"} (type: ${co?.type || "Unspecified"}, priority: ${co?.priority || "None"}) | contacts: ${cs.map((c) => `${c.name} [${c.stage}${c.previousStage ? `, was ${c.previousStage} until ${fmtDay(c.stageChangedAt)}` : ""}]`).join("; ")}`;
      });
    } else if (client || oppClient) {
      const cl = (client ?? oppClient)!;
      who = cl.name;
      group = groupFor(`c:${cl.id}`, () => {
        const ref = cl.referralPartnerId ? contactById.get(cl.referralPartnerId) : undefined;
        const refCo = ref ? companyById.get(ref.referralCompanyId) : undefined;
        const outcome = (oppsByClient.get(cl.id) ?? []).map((o) => `${o.stage}${o.lostReason ? ` (lost: ${o.lostReason})` : ""}`).join(", ") || "no opportunity";
        return `=== CLIENT LEAD: ${cl.name} | source: ${cl.source || "unknown"}${ref ? ` | referred by ${ref.name} at ${refCo?.name ?? "?"} (${refCo?.type || "?"})` : ""} | outcome: ${outcome}`;
      });
    } else {
      group = groupFor("other", () => "=== OTHER ACTIVITY (no partner or client linked)");
    }

    const dir = a.type === "Email"
      ? (!from || /toptiertransitions\.com/i.test(from) ? `EMAIL SENT${who ? ` to ${who}` : ""}` : `EMAIL RECEIVED from ${from.replace(/<.*>/, "").trim() || who}`)
      : `${a.type.toUpperCase()}${who ? ` with ${who}` : ""}`;
    group.lines.push({ day, text: `[${day}] ${dir}${subject ? ` | Subject: ${subject}` : ""}\n${text}` });
  }

  const blocks = [...groups.values()]
    .map((g) => `${g.header}\n${g.lines.sort((x, y) => x.day.localeCompare(y.day)).map((l) => l.text).join("\n\n")}`)
    .sort((a, b) => b.length - a.length);

  const chunks: string[] = [];
  let cur = "";
  for (const b of blocks) {
    if (cur && cur.length + b.length > CHUNK_CHARS) {
      chunks.push(cur);
      cur = "";
    }
    if (b.length > CHUNK_CHARS) {
      for (let i = 0; i < b.length; i += CHUNK_CHARS) chunks.push(b.slice(i, i + CHUNK_CHARS));
      continue;
    }
    cur += (cur ? "\n\n" : "") + b;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export async function buildCoachingJob(params: { repId: string; recipientEmail: string; recipientName: string; refreshBaseline?: boolean }): Promise<CoachingJobState> {
  const d = await loadCrm();
  const target = d.reps.find((r) => r.clerkUserId === params.repId);
  if (!target) throw new Error("That sales rep wasn't found (active TTTSales only).");

  const r = redis();
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const reps = d.reps.map((rep) => computeRepStats(rep, d));
  const digests: Record<string, string[]> = {};
  const pendingChunks: Chunk[] = [];
  const digestsAsOf: Record<string, string> = {};

  for (const rep of d.reps) {
    const saved = params.refreshBaseline ? null : await r.get<SavedDigests>(digestCacheKey(rep.clerkUserId)).catch(() => null);
    const maxAgeDays = rep.clerkUserId === params.repId ? SUBJECT_MAX_AGE_DAYS : BASELINE_MAX_AGE_DAYS;
    if (saved?.digests?.length && Date.now() - new Date(saved.at).getTime() <= maxAgeDays * DAY) {
      digests[rep.clerkUserId] = saved.digests;
      digestsAsOf[rep.clerkUserId] = saved.at;
      continue;
    }
    digestsAsOf[rep.clerkUserId] = new Date().toISOString();
    const chunks = buildCorpus(rep, d);
    digests[rep.clerkUserId] = [];
    for (let n = 0; n < chunks.length; n++) {
      const key = chunkKey(id, rep.clerkUserId, n);
      await r.set(key, chunks[n], { ex: JOB_TTL_S });
      pendingChunks.push({ repId: rep.clerkUserId, index: n, key });
    }
  }
  // The selected rep's own chunks first
  pendingChunks.sort((a, b) => Number(b.repId === params.repId) - Number(a.repId === params.repId));

  const state: CoachingJobState = {
    id,
    repId: params.repId,
    repName: target.displayName,
    recipientEmail: params.recipientEmail,
    recipientName: params.recipientName,
    startedAt: new Date().toISOString(),
    invocation: 0,
    reps,
    pendingChunks,
    digests,
    digestErrors: [],
    digestsAsOf,
  };
  await saveJob(state);
  return state;
}

// ─── 2. Digest ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior sales coach for Top Tier Transitions, a Chicago-area senior move management company (downsizing, packing, moving, estate dispersal for older adults and their families). Most of its business comes from referral partners: senior living communities, realtors, estate and elder law attorneys, financial advisors, home care agencies, and similar. Sales reps build those relationships through a funnel: Identified -> Met -> Agreed to Refer -> Shared Leads -> Active Referral (Inactive Referral = went dormant). Reps also work the client leads partners send, from first contact to Won or Lost.

You analyze reps' real CRM communications. Be specific and evidence-based: tie every claim to what the data shows, quote short phrases (under 25 words) when language matters, and never invent facts, names, or numbers. Plain, direct, encouraging-but-honest tone. No emojis, no em dashes.`;

const DIGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "advancing", "stalling", "strongLanguage", "weakLanguage", "channels", "followUp", "partners", "leads"],
  properties: {
    summary: { type: "string" },
    advancing: { type: "array", items: { type: "object", additionalProperties: false, required: ["pattern", "evidence"], properties: { pattern: { type: "string" }, evidence: { type: "string" } } } },
    stalling: { type: "array", items: { type: "object", additionalProperties: false, required: ["pattern", "evidence"], properties: { pattern: { type: "string" }, evidence: { type: "string" } } } },
    strongLanguage: { type: "array", items: { type: "object", additionalProperties: false, required: ["quote", "why", "partner"], properties: { quote: { type: "string" }, why: { type: "string" }, partner: { type: "string" } } } },
    weakLanguage: { type: "array", items: { type: "object", additionalProperties: false, required: ["quote", "why", "better"], properties: { quote: { type: "string" }, why: { type: "string" }, better: { type: "string" } } } },
    channels: { type: "string" },
    followUp: { type: "string" },
    partners: { type: "array", items: { type: "object", additionalProperties: false, required: ["company", "situation", "nextMove"], properties: { company: { type: "string" }, situation: { type: "string" }, nextMove: { type: "string" } } } },
    leads: { type: "array", items: { type: "object", additionalProperties: false, required: ["client", "outcome", "lesson"], properties: { client: { type: "string" }, outcome: { type: "string" }, lesson: { type: "string" } } } },
  },
} as const;

function client(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function structuredCall<T>(params: { prompt: string; schema: Record<string, unknown>; effort: "medium" | "high"; maxTokens: number }): Promise<T> {
  // Streaming: long inputs and outputs, so no HTTP timeout on the request
  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: params.maxTokens,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    output_config: { effort: params.effort, format: { type: "json_schema", schema: params.schema } },
    messages: [{ role: "user", content: params.prompt }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The AI declined to analyze this part of the data");
  if (msg.stop_reason === "max_tokens") throw new Error("The AI ran out of room before finishing");
  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  return JSON.parse(text) as T;
}

async function digestChunk(state: CoachingJobState, chunk: Chunk): Promise<string> {
  const corpus = await redis().get<string>(chunk.key);
  if (!corpus) throw new Error("Chunk text expired");
  const rep = state.reps.find((r) => r.repId === chunk.repId)!;
  const prompt = `Below is part ${chunk.index + 1} of ${rep.repName}'s logged CRM communications: every email in the last ${EMAIL_WINDOW_DAYS} days and every call, meeting, text, note, and task they ever logged, grouped by referral partner company or client lead. Each partner header shows contacts' current funnel stage and their most recent stage change. Each client header shows who referred them and the outcome. Long emails are trimmed and quoted reply chains are removed.

Analyze this slice:
- summary: 3-5 sentences on how ${rep.repName} works these relationships in this slice.
- advancing: up to 8 patterns that coincide with partners moving forward in the funnel or sending referrals (what they did, when, in which channel). evidence = partner, date, and a short quote or fact.
- stalling: up to 8 patterns where relationships stall, go cold, or slip back (no follow-up, generic asks, one-way emails, long gaps, no clear next step). Same evidence format.
- strongLanguage: up to 6 short quotes of phrasing that works well, and why.
- weakLanguage: up to 6 short quotes of phrasing that falls flat (vague, salesy, too long, no ask), why, and a better version in their voice.
- channels: how they use email vs calls vs meetings vs texts, and which channel actually moves partners here.
- followUp: their follow-up rhythm and discipline (gaps, persistence, next steps set).
- partners: up to 12 partner companies in this slice with momentum or risk: where it stands and the single best next move.
- leads: up to 8 client leads: outcome and the lesson for how leads are handled (speed, tone, closing).
Return only the JSON.

${corpus}`;
  const out = await structuredCall<Record<string, unknown>>({ prompt, schema: DIGEST_SCHEMA as unknown as Record<string, unknown>, effort: "medium", maxTokens: 24000 });
  return JSON.stringify(out);
}

// ─── 3. Synthesize ────────────────────────────────────────────────────────────

export interface Diagnosis {
  headline: string;
  noteToManager: string;
  scorecard: Array<{ metric: string; rep: string; team: string; verdict: "strength" | "watch" | "gap"; note: string }>;
  working: Array<{ title: string; detail: string; evidence: string }>;
  notWorking: Array<{ title: string; detail: string; evidence: string }>;
  vsTeam: string[];
  playbook: Array<{ channel: "Email" | "Call" | "Meeting" | "Text"; instead: string; tryThis: string; why: string }>;
  questions: string[];
}

export interface ActionPlan {
  templates: Array<{ situation: string; channel: string; message: string }>;
  partnerActions: Array<{ company: string; type: string; priority: string; stage: string; goal: string; action: string; opener: string; when: string }>;
  thirtyDays: Array<{ week: string; focus: string; actions: string[] }>;
}

export type CoachingPlan = Diagnosis & ActionPlan;

const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const str = { type: "string" };
const arr = (items: unknown) => ({ type: "array", items });

const DIAGNOSIS_SCHEMA = obj({
  headline: str,
  noteToManager: str,
  scorecard: arr(obj({ metric: str, rep: str, team: str, verdict: { type: "string", enum: ["strength", "watch", "gap"] }, note: str })),
  working: arr(obj({ title: str, detail: str, evidence: str })),
  notWorking: arr(obj({ title: str, detail: str, evidence: str })),
  vsTeam: arr(str),
  playbook: arr(obj({ channel: { type: "string", enum: ["Email", "Call", "Meeting", "Text"] }, instead: str, tryThis: str, why: str })),
  questions: arr(str),
});

const ACTIONS_SCHEMA = obj({
  templates: arr(obj({ situation: str, channel: str, message: str })),
  partnerActions: arr(obj({ company: str, type: str, priority: str, stage: str, goal: str, action: str, opener: str, when: str })),
  thirtyDays: arr(obj({ week: str, focus: str, actions: arr(str) })),
});

function statsBlock(r: RepStats, partnerLimit: number): string {
  const kv = (c: Counts) => Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
  const o = r.opportunities;
  const lines = [
    `REP: ${r.repName}`,
    `Partner companies owned: ${r.companies} | by type: ${kv(r.companiesByType)} | by priority: ${kv(r.companiesByPriority)}`,
    `Companies by furthest contact stage: ${kv(r.companiesByBestStage)} | contacts by stage: ${kv(r.contactsByStage)}`,
    `Stage moves (last 180d): ${r.stageMoves180.forward} forward, ${r.stageMoves180.backward} backward | ${kv(r.stageMoves180.transitions)}`,
    `Activity all-time: ${kv(r.activityAll)} | last 180d: ${kv(r.activity180)} | emails last 180d: ${r.emailsSent180} sent, ${r.emailsReceived180} replies logged`,
    `Monthly activity (last 6 months): ${r.monthly.map((m) => `${m.month}: ${kv(m.counts)}`).join(" | ")}`,
    `Partners touched last 30d: ${r.partnersTouched30}, last 90d: ${r.partnersTouched90}, never: ${r.partnersNeverTouched}; High/Medium partners untouched 90d+: ${r.highMediumUntouched90}`,
    `Referrals received from their partners: ${r.referralsAll} all-time, ${r.referrals180} last 180d | last 180d by partner type: ${kv(r.referralsByCompanyType180)}`,
    `Their client opportunities: ${o.won} won, ${o.lost} lost, ${o.open} open all-time | last 180d: ${o.won180} won, ${o.lost180} lost, win rate ${o.winRate ?? "n/a"}%, won value $${Math.round(o.wonValue180).toLocaleString("en-US")}`,
    `Lost reasons last 180d: ${o.lostReasons180.join("; ") || "none recorded"}`,
  ];
  if (partnerLimit > 0) {
    lines.push(`Partners (${Math.min(partnerLimit, r.partners.length)} of ${r.partners.length}, most referrals / furthest along first):`);
    for (const p of r.partners.slice(0, partnerLimit)) {
      lines.push(`- ${p.company} | ${p.type} | ${p.priority} | furthest: ${p.bestStage} | referrals ${p.referrals180} (180d) / ${p.referralsAll} all, ${p.won} won ${p.lost} lost | touches 180d: ${kv(p.touches180)} | last touch ${p.lastTouch ?? "never"} | contacts: ${p.contacts || "none"}`);
    }
  }
  return lines.join("\n");
}

function evidenceBlock(state: CoachingJobState): { target: RepStats; context: string } {
  const target = state.reps.find((r) => r.repId === state.repId)!;
  const peers = state.reps.filter((r) => r.repId !== state.repId);
  const digestText = (repId: string) => (state.digests[repId] ?? []).map((d, i) => `--- digest ${i + 1} ---\n${d}`).join("\n");
  const context = `Below: the numbers for ${target.repName} and for every other sales rep (computed exactly from the CRM; trust them), AI digests of ${target.repName}'s communications (every email in the last ${EMAIL_WINDOW_DAYS} days, every call, meeting, text and note ever), and the same digests for the other reps.

Today is ${ctToday()}.

=== ${target.repName.toUpperCase()}: NUMBERS ===
${statsBlock(target, 80)}

=== ${target.repName.toUpperCase()}: COMMUNICATION DIGESTS ===
${digestText(target.repId) || "(no digests: the communications couldn't be analyzed)"}

${peers.map((p) => `=== PEER: ${p.repName.toUpperCase()}: NUMBERS ===\n${statsBlock(p, 15)}\n\n=== PEER: ${p.repName.toUpperCase()}: COMMUNICATION DIGESTS ===\n${digestText(p.repId) || "(none)"}`).join("\n\n")}`;
  return { target, context };
}

function goal(name: string): string {
  return `The goal: help ${name} get more referral partners further down the funnel (Identified -> Met -> Agreed to Refer -> Shared Leads -> Active Referral) and get Active partners sending more and more referrals to Top Tier. Their manager will forward this to them, so address ${name.split(" ")[0]} directly as "you".`;
}

async function diagnose(state: CoachingJobState): Promise<Diagnosis> {
  const { target, context } = evidenceBlock(state);
  const first = target.repName.split(" ")[0];
  const prompt = `Write the diagnosis half of a coaching plan for ${target.repName}. ${goal(target.repName)} (noteToManager is the one part written to the manager.)

Compare holistically: what do the reps with more forward stage moves, referrals, and wins do differently in language, channel, cadence, partner types, and priorities? Ground every point in the data.

${context}

Write:
- headline: one sentence, the single biggest opportunity for ${first}.
- noteToManager: 2-3 sentences for the manager forwarding this: the overall read and what to reinforce.
- scorecard: 6-8 metrics comparing ${first} with the average of the other reps (forward stage moves, referrals 180d, partners touched 30d, High/Medium untouched 90d+, meeting share of activity, email reply rate, win rate, and similar). rep and team are short values; verdict strength|watch|gap; note under 15 words.
- working: 3-5 things that are working, with evidence.
- notWorking: 3-5 things that aren't, with evidence. Honest and specific.
- vsTeam: 3-5 sentences on what other reps do that's working and ${first} could adopt, or where ${first} is ahead of the team. Name a peer only when praising them.
- playbook: 8-12 "instead of / try this" language swaps across Email, Call, Meeting and Text, in ${first}'s voice, each with why it works for referral partners.
- questions: 4-6 coaching questions for the manager's next 1:1.
No emojis, no em dashes.`;
  return structuredCall<Diagnosis>({ prompt, schema: DIAGNOSIS_SCHEMA, effort: "high", maxTokens: 48000 });
}

async function planActions(state: CoachingJobState, diagnosis: Diagnosis): Promise<ActionPlan> {
  const { target, context } = evidenceBlock(state);
  const first = target.repName.split(" ")[0];
  const prompt = `Write the action half of a coaching plan for ${target.repName}. ${goal(target.repName)}

The diagnosis is already written (build on it, don't repeat it):
${JSON.stringify({ headline: diagnosis.headline, working: diagnosis.working, notWorking: diagnosis.notWorking, vsTeam: diagnosis.vsTeam })}

${context}

Write:
- templates: 4-6 ready-to-send messages for the most common situations in ${first}'s book (first outreach to a new partner, follow-up after a meeting, asking for the first referral, thanking a partner for a referral, reviving a cold partner, a text check-in). Short, warm, specific, with a clear ask, in ${first}'s voice. Use [Name] placeholders.
- partnerActions: 10-15 specific partner companies from ${first}'s book where action now moves them forward: High and Medium priority first, then ones with momentum or slipping. Use the company, type, priority and furthest stage exactly as in the numbers. goal = the next stage to reach; action = the specific move (who, what offer or ask); opener = the first line they'd say or write; when = this week | next 2 weeks | this month.
- thirtyDays: a 4-week plan (week, focus, 3-5 concrete actions each) that puts the diagnosis and partner actions on a calendar.
No emojis, no em dashes.`;
  return structuredCall<ActionPlan>({ prompt, schema: ACTIONS_SCHEMA, effort: "high", maxTokens: 48000 });
}

// ─── Job steps ────────────────────────────────────────────────────────────────

export async function continueCoachingJob(id: string, invocation: number): Promise<void> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const res = await fetch(`${appUrl}/api/cron/sales-coaching-continue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    body: JSON.stringify({ id, invocation }),
  });
  if (!res.ok) throw new Error(`Sales coaching continuation failed: ${res.status}`);
}

/**
 * One leg of the job: digest up to DIGEST_CONCURRENCY pending chunks, or —
 * once they're all done — synthesize and email. Hands off to the next leg.
 */
export async function stepCoachingJob(id: string): Promise<void> {
  const state = await loadJob(id);
  if (!state) throw new Error(`Sales coaching job ${id} not found (expired?)`);
  state.invocation++;

  if (state.pendingChunks.length > 0 && state.invocation <= MAX_INVOCATIONS) {
    const batch = state.pendingChunks.splice(0, DIGEST_CONCURRENCY);
    const results = await Promise.all(batch.map(async (c) => {
      try {
        return { c, digest: await digestChunk(state, c) };
      } catch (e) {
        const rep = state.reps.find((r) => r.repId === c.repId)?.repName ?? c.repId;
        console.error(`[sales-coaching] digest failed for ${rep} part ${c.index + 1}:`, e);
        state.digestErrors.push(`${rep}, part ${c.index + 1}: ${e instanceof Error ? e.message : "failed"}`);
        return { c, digest: null };
      }
    }));
    for (const { c, digest } of results) if (digest) state.digests[c.repId].push(digest);

    // A rep whose every chunk is done: save their digests (30 days)
    const r = redis();
    for (const repId of new Set(batch.map((c) => c.repId))) {
      if (!state.pendingChunks.some((c) => c.repId === repId) && state.digests[repId]?.length) {
        // Only a complete set — a failed chunk would leave a gap for 30 days
        if (!state.digestErrors.some((e) => e.startsWith(`${state.reps.find((x) => x.repId === repId)?.repName},`))) {
          const saved: SavedDigests = { at: state.digestsAsOf?.[repId] ?? new Date().toISOString(), digests: state.digests[repId] };
          await r.set(digestCacheKey(repId), saved, { ex: DIGEST_CACHE_TTL_S }).catch(() => {});
        }
      }
    }
    await saveJob(state);
    await continueCoachingJob(state.id, state.invocation);
    return;
  }

  // Diagnosis and actions are separate legs so each AI call stays well
  // inside the function time limit.
  let plan: CoachingPlan | null = null;
  let error: string | null = null;
  try {
    if (!state.diagnosis) {
      state.diagnosis = await diagnose(state);
      await saveJob(state);
      await continueCoachingJob(state.id, state.invocation);
      return;
    }
    plan = { ...state.diagnosis, ...(await planActions(state, state.diagnosis)) };
  } catch (e) {
    console.error("[sales-coaching] synthesis failed:", e);
    error = e instanceof Error ? e.message : "The analysis failed";
  }
  await sendCoachingEmail(state, plan, error);
  await redis().del(jobKey(state.id)).catch(() => {});
}

// ─── 4. Email ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function para(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

const GREEN = "#2d4a3e";
const GOLD = "#C9A96E";
const VERDICT: Record<string, { bg: string; fg: string; label: string }> = {
  strength: { bg: "#dcfce7", fg: "#15803d", label: "Strength" },
  watch: { bg: "#fef3c7", fg: "#b45309", label: "Watch" },
  gap: { bg: "#fee2e2", fg: "#b91c1c", label: "Gap" },
};

function section(title: string, body: string, subtitle?: string): string {
  return `<tr><td style="padding:26px 28px 0;">
    <p style="margin:0;font-size:11px;font-weight:700;color:${GREEN};text-transform:uppercase;letter-spacing:0.08em;">${esc(title)}</p>
    ${subtitle ? `<p style="margin:3px 0 0;font-size:12px;color:#6b7280;">${esc(subtitle)}</p>` : ""}
    <div style="margin-top:10px;">${body}</div>
  </td></tr>`;
}

export function buildCoachingEmail(state: CoachingJobState, plan: CoachingPlan | null, error: string | null): { subject: string; html: string } {
  const rep = state.reps.find((r) => r.repId === state.repId)!;
  const first = rep.repName.split(" ")[0];
  const generated = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const stat = (label: string, value: string, last = false) =>
    `<td style="padding:14px 12px;text-align:center;${last ? "" : "border-right:1px solid #e5e7eb;"}"><p style="margin:0;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">${label}</p><p style="margin:4px 0 0;font-size:20px;font-weight:700;color:${GREEN};">${value}</p></td>`;
  const a180 = rep.activity180;

  let body = "";
  if (!plan) {
    body = section("The analysis didn't finish", `<p style="margin:0;font-size:14px;color:#374151;">${esc(error ?? "Something went wrong.")} The numbers above are still accurate. Try running it again; if it fails twice, let the developer know.</p>`);
  } else {
    const card = (items: CoachingPlan["working"], color: string) => items.map((w) => `
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-left:4px solid ${color};border-radius:8px;margin-bottom:10px;"><tr><td style="padding:12px 14px;">
        <p style="margin:0;font-size:14px;font-weight:700;color:#1f2937;">${esc(w.title)}</p>
        <p style="margin:5px 0 0;font-size:13px;color:#374151;line-height:1.55;">${para(w.detail)}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#6b7280;font-style:italic;">${esc(w.evidence)}</p>
      </td></tr></table>`).join("");

    body += `<tr><td style="padding:24px 28px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ec;border-radius:10px;"><tr><td style="padding:16px 18px;">
        <p style="margin:0;font-size:11px;font-weight:700;color:#8a6d3b;text-transform:uppercase;letter-spacing:0.08em;">For you, before you forward</p>
        <p style="margin:6px 0 0;font-size:13px;color:#374151;line-height:1.55;">${para(plan.noteToManager)}</p>
      </td></tr></table>
    </td></tr>`;

    body += `<tr><td style="padding:24px 28px 0;">
      <p style="margin:0;font-size:12px;color:#6b7280;">Hi ${esc(first)},</p>
      <p style="margin:8px 0 0;font-size:18px;font-weight:700;color:#1f2937;line-height:1.4;">${esc(plan.headline)}</p>
    </td></tr>`;

    body += section("Scorecard", `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;font-size:13px;">
      <tr style="background:#f9fafb;"><td style="padding:8px 10px;font-size:11px;font-weight:700;color:#6b7280;">Metric</td><td style="padding:8px 10px;font-size:11px;font-weight:700;color:#6b7280;">You</td><td style="padding:8px 10px;font-size:11px;font-weight:700;color:#6b7280;">Team</td><td style="padding:8px 10px;"></td></tr>
      ${plan.scorecard.map((s) => {
        const v = VERDICT[s.verdict] ?? VERDICT.watch;
        return `<tr><td style="padding:9px 10px;border-top:1px solid #f3f4f6;color:#1f2937;"><strong>${esc(s.metric)}</strong><br><span style="font-size:11px;color:#6b7280;">${esc(s.note)}</span></td><td style="padding:9px 10px;border-top:1px solid #f3f4f6;font-weight:700;color:#1f2937;white-space:nowrap;">${esc(s.rep)}</td><td style="padding:9px 10px;border-top:1px solid #f3f4f6;color:#6b7280;white-space:nowrap;">${esc(s.team)}</td><td style="padding:9px 10px;border-top:1px solid #f3f4f6;text-align:right;"><span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:${v.bg};color:${v.fg};text-transform:uppercase;">${v.label}</span></td></tr>`;
      }).join("")}
    </table>`, "Compared with the average of the other sales reps");

    body += section("What's working", card(plan.working, "#16a34a"));
    body += section("What's holding you back", card(plan.notWorking, "#dc2626"));
    body += section("What's working for the team", `<ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.6;">${plan.vsTeam.map((v) => `<li style="margin-bottom:6px;">${esc(v)}</li>`).join("")}</ul>`);

    const byChannel = ["Email", "Call", "Meeting", "Text"].map((ch) => {
      const rows = plan.playbook.filter((p) => p.channel === ch);
      if (!rows.length) return "";
      return `<p style="margin:14px 0 6px;font-size:12px;font-weight:700;color:#1f2937;">${ch === "Text" ? "Texts" : `${ch}s`}</p>
        ${rows.map((p) => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;"><tr>
          <td style="padding:10px 12px;width:50%;vertical-align:top;background:#fef2f2;border-radius:8px 0 0 8px;"><p style="margin:0;font-size:10px;font-weight:700;color:#b91c1c;text-transform:uppercase;">Instead of</p><p style="margin:4px 0 0;font-size:13px;color:#374151;">${esc(p.instead)}</p></td>
          <td style="padding:10px 12px;width:50%;vertical-align:top;background:#f0fdf4;border-radius:0 8px 8px 0;"><p style="margin:0;font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;">Try</p><p style="margin:4px 0 0;font-size:13px;color:#1f2937;font-weight:600;">${esc(p.tryThis)}</p></td>
        </tr><tr><td colspan="2" style="padding:6px 12px 9px;font-size:12px;color:#6b7280;">${esc(p.why)}</td></tr></table>`).join("")}`;
    }).join("");
    body += section("Language playbook", byChannel, "Small wording changes that move partners to the next step");

    body += section("Ready-to-send messages", plan.templates.map((t) => `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;"><tr><td style="padding:12px 14px;">
        <p style="margin:0;font-size:12px;font-weight:700;color:${GREEN};">${esc(t.situation)} <span style="font-weight:500;color:#9ca3af;">&middot; ${esc(t.channel)}</span></p>
        <p style="margin:8px 0 0;font-size:13px;color:#374151;line-height:1.6;background:#f9fafb;border-radius:6px;padding:10px 12px;">${para(t.message)}</p>
      </td></tr></table>`).join(""));

    body += section("Your partner game plan", plan.partnerActions.map((p) => `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;"><tr><td style="padding:12px 14px;">
        <p style="margin:0;font-size:14px;font-weight:700;color:#1f2937;">${esc(p.company)}
          <span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:#eef2f0;color:${GREEN};margin-left:6px;">${esc(p.priority)}</span>
          <span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#b45309;margin-left:4px;">${esc(p.when)}</span></p>
        <p style="margin:3px 0 0;font-size:12px;color:#6b7280;">${esc(p.type)} &middot; ${esc(p.stage)} &rarr; <strong style="color:${GREEN};">${esc(p.goal)}</strong></p>
        <p style="margin:7px 0 0;font-size:13px;color:#374151;line-height:1.55;">${esc(p.action)}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#4b5563;font-style:italic;">&ldquo;${esc(p.opener)}&rdquo;</p>
      </td></tr></table>`).join(""), "Highest-priority partners first");

    body += section("Your next 30 days", plan.thirtyDays.map((w) => `
      <p style="margin:12px 0 4px;font-size:13px;font-weight:700;color:#1f2937;">${esc(w.week)} <span style="font-weight:500;color:#6b7280;">&middot; ${esc(w.focus)}</span></p>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.6;">${w.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`).join(""));

    body += `<tr><td style="padding:26px 28px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ec;border-radius:10px;"><tr><td style="padding:16px 18px;">
        <p style="margin:0;font-size:11px;font-weight:700;color:#8a6d3b;text-transform:uppercase;letter-spacing:0.08em;">For your next 1:1 (manager)</p>
        <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#374151;line-height:1.6;">${plan.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
      </td></tr></table>
    </td></tr>`;
  }

  const notes = [
    `Built from all ${Object.values(rep.activityAll).reduce((s, n) => s + n, 0).toLocaleString("en-US")} CRM activities ${esc(rep.repName)} has logged: every email in the last ${EMAIL_WINDOW_DAYS} days and every call, meeting, text and note, compared with ${state.reps.length - 1} other sales rep${state.reps.length === 2 ? "" : "s"}.`,
    "Numbers are computed directly from the CRM; the analysis and recommendations are AI-generated, so use judgment. Stage moves use each contact's most recent change.",
    `Communication analysis as of: ${state.reps.map((x) => `${esc(x.repName)} ${fmtDay(state.digestsAsOf?.[x.repId] ?? state.startedAt)}`).join(", ")} (the team baseline is reused for up to ${BASELINE_MAX_AGE_DAYS} days and the coached rep's for ${SUBJECT_MAX_AGE_DAYS}; numbers are always current).`,
    state.digestErrors.length ? `Some activity couldn't be analyzed: ${esc(state.digestErrors.join("; "))}.` : "",
  ].filter(Boolean).join(" ");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;">
    <tr><td align="center" style="padding:32px 12px;">
      <table width="100%" style="max-width:720px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);" cellpadding="0" cellspacing="0">
        <tr style="background:${GREEN};">
          <td style="padding:28px 28px;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;color:${GOLD};text-transform:uppercase;">Top Tier Transitions &middot; Sales Coaching</p>
            <h1 style="margin:6px 0 0;font-size:26px;font-weight:700;color:#ffffff;">${esc(rep.repName)}: Activity Analysis</h1>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">How your partner relationships are moving, what's working, and your plan for more referrals</p>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.5);">Generated ${generated} CT for ${esc(state.recipientName || "you")}</p>
          </td>
        </tr>
        <tr><td style="padding:0;border-bottom:1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            ${stat("Partners", String(rep.companies))}
            ${stat("Stage moves 180d", `${rep.stageMoves180.forward}&#9650; ${rep.stageMoves180.backward}&#9660;`)}
            ${stat("Referrals 180d", String(rep.referrals180))}
            ${stat("Meetings 180d", String(a180["Meeting"] ?? 0))}
            ${stat("Win rate 180d", rep.opportunities.winRate === null ? "n/a" : `${rep.opportunities.winRate}%`, true)}
          </tr></table>
        </td></tr>
        ${body}
        <tr><td style="padding:28px 0 0;"></td></tr>
        <tr style="background:#f9fafb;">
          <td style="padding:16px 28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;line-height:1.5;">
            Rightsize &middot; Top Tier Transitions &middot; Internal coaching. ${notes}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const subject = plan
    ? `Activity Analysis: ${rep.repName} — coaching plan to forward`
    : `Activity Analysis: ${rep.repName} — couldn't finish`;
  return { subject, html };
}

async function sendCoachingEmail(state: CoachingJobState, plan: CoachingPlan | null, error: string | null): Promise<void> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { subject, html } = buildCoachingEmail(state, plan, error);
  const { error: sendError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "hello@toptiertransitions.com",
    to: state.recipientEmail,
    subject,
    html,
  });
  if (sendError) throw new Error(`Resend: ${sendError.message}`);
}

/** A leg failed outright: email what we have (the numbers) and why. */
export async function failCoachingJob(id: string, message: string): Promise<void> {
  const state = await loadJob(id).catch(() => null);
  if (!state) return;
  await sendCoachingEmail(state, null, message).catch((e) => console.error("[sales-coaching] failure email failed:", e));
  await redis().del(jobKey(id)).catch(() => {});
}

/** The job couldn't even be built (before any state exists). */
export async function sendBuildFailureEmail(to: string, repName: string, message: string): Promise<void> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "hello@toptiertransitions.com",
    to,
    subject: `Activity Analysis: ${repName} — couldn't start`,
    html: `<p style="font-family:sans-serif;font-size:14px;color:#374151;">The Activity Analysis for ${esc(repName)} couldn't start: ${esc(message)}</p>`,
  });
}

/** Numbers and chunk sizes only, no AI and no Redis (for checking the data side). */
export async function dryRunCoachingData(): Promise<Array<{ rep: string; stats: RepStats; chunkSizes: number[] }>> {
  const d = await loadCrm();
  return d.reps.map((rep) => ({ rep: rep.displayName, stats: computeRepStats(rep, d), chunkSizes: buildCorpus(rep, d).map((c) => c.length) }));
}
