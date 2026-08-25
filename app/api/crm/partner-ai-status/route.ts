// DEPLOY: Add AIStatus (Long text), AIStatusAt (Single line text), AIStatusHistory (Long text)
// to QuarterlyCompanyPlans table in Airtable before using this feature.

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReviewsForTenant, getPartnerPointsByCompany } from "@/lib/airtable";
import { getLoyaltyRecord } from "@/lib/airtable-loyalty";
import { AIRTABLE_TABLES } from "@/lib/config";
import Anthropic from "@anthropic-ai/sdk";

function atFetch(table: string, path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

type Rec = { id: string; fields: Record<string, unknown> };
function str(v: unknown): string { return typeof v === "string" ? v : v == null ? "" : String(v); }
function num(v: unknown): number { return typeof v === "number" ? v : 0; }
function bool(v: unknown): boolean { return v === true || v === "true" || v === 1; }

function daysSince(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function fmtDays(n: number | null): string {
  if (n === null) return "unknown";
  if (n === 0) return "today";
  if (n === 1) return "1 day ago";
  if (n < 7) return `${n} days ago`;
  if (n < 30) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
}

async function fetchAllRecs(table: string, formula: string, extra = ""): Promise<Rec[]> {
  const all: Rec[] = [];
  let offset: string | undefined;
  do {
    const qs = `?filterByFormula=${encodeURIComponent(formula)}${extra}${offset ? `&offset=${offset}` : ""}`;
    const res = await atFetch(table, qs);
    if (!res.ok) break;
    const data = await res.json() as { records: Rec[]; offset?: string };
    all.push(...data.records);
    offset = data.offset;
  } while (offset);
  return all;
}

function orFilter(field: string, ids: string[]): string {
  if (ids.length === 0) return "FALSE()";
  if (ids.length === 1) return `{${field}} = "${ids[0]}"`;
  return `OR(${ids.map((id) => `{${field}} = "${id}"`).join(", ")})`;
}

// Quarter label from a YYYY-MM-DD date, e.g. "2026-02-15" → "Q1 2026"
function dateToQuarterLabel(dateStr: string): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
  if (isNaN(d.getTime())) return "Unknown";
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q} ${d.getUTCFullYear()}`;
}

// ─── GET: return most recent AIStatus across all quarters for a company ────────

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const records = await fetchAllRecs(AIRTABLE_TABLES.QUARTERLY_COMPANY_PLANS, `{CompanyId} = "${companyId}"`);

  let bestStatus: string | null = null;
  let bestStatusAt: string | null = null;
  for (const r of records) {
    const statusAt = str(r.fields["AIStatusAt"]) || null;
    const status = str(r.fields["AIStatus"]) || null;
    if (!statusAt || !status) continue;
    if (!bestStatusAt || statusAt > bestStatusAt) { bestStatusAt = statusAt; bestStatus = status; }
  }

  return NextResponse.json({ status: bestStatus, statusAt: bestStatusAt });
}

// ─── POST: generate and save new AI status ────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { companyId, quarterId } = await req.json().catch(() => ({})) as { companyId?: string; quarterId?: string };
  if (!companyId || !quarterId) return NextResponse.json({ error: "companyId and quarterId required" }, { status: 400 });

  // ── Step 1: Parallel fetch — company, contacts, plan records, quarter, points, loyalty tier ──

  const [companyRecs, contacts, allPlanRecs, quarterRec, partnerPoints, loyaltyRecord] = await Promise.all([
    fetchAllRecs(AIRTABLE_TABLES.CRM_COMPANIES, `RECORD_ID() = "${companyId}"`),
    fetchAllRecs(AIRTABLE_TABLES.CRM_CONTACTS, `{ReferralCompanyId} = "${companyId}"`),
    fetchAllRecs(AIRTABLE_TABLES.QUARTERLY_COMPANY_PLANS, `{CompanyId} = "${companyId}"`),
    atFetch(AIRTABLE_TABLES.QUARTERS, `/${quarterId}`).then((r) => r.ok ? r.json() as Promise<Rec> : Promise.resolve({ id: quarterId, fields: {} as Record<string, unknown> })),
    getPartnerPointsByCompany(companyId).catch(() => [] as import("@/lib/types").PartnerPoint[]),
    getLoyaltyRecord(companyId).catch(() => null),
  ]);

  const companyFields = companyRecs[0]?.fields ?? {};
  const contactIds = contacts.map((c) => c.id);
  const quarterFields = (quarterRec.fields ?? {}) as Record<string, unknown>;
  const quarterLabel = str(quarterFields["Label"] ?? quarterFields["Name"] ?? "");
  const quarterStart = str(quarterFields["StartDate"]).slice(0, 10);
  const quarterEnd = str(quarterFields["EndDate"]).slice(0, 10);

  // ── Step 2: Fetch activities + referred client contacts in parallel ────────────

  const [activities, clientContacts] = await Promise.all([
    contactIds.length === 0 ? Promise.resolve<Rec[]>([]) : fetchAllRecs(
      AIRTABLE_TABLES.CRM_ACTIVITIES,
      orFilter("ClientContactId", contactIds),
      "&sort[0][field]=ActivityDate&sort[0][direction]=desc&maxRecords=100"
    ),
    contactIds.length === 0 ? Promise.resolve<Rec[]>([]) : fetchAllRecs(
      AIRTABLE_TABLES.CRM_CLIENT_CONTACTS,
      orFilter("ReferralPartnerId", contactIds)
    ),
  ]);

  const clientContactIds = clientContacts.map((c) => c.id);

  // ── Step 3: Fetch opportunities ────────────────────────────────────────────────

  const opportunities = clientContactIds.length === 0 ? [] : await fetchAllRecs(
    AIRTABLE_TABLES.CRM_OPPORTUNITIES,
    `AND(NOT({Deleted}), ${orFilter("ClientContactId", clientContactIds)})`
  );

  // ── Step 4: Google reviews for won projects ────────────────────────────────────

  const wonTenantIds = [...new Set(
    opportunities
      .filter((o) => str(o.fields["Stage"]) === "Won" && str(o.fields["TenantId"]))
      .map((o) => str(o.fields["TenantId"]))
  )].slice(0, 8);
  const reviewGroups = await Promise.all(wonTenantIds.map((tid) => getReviewsForTenant(tid).catch(() => [])));
  const allReviews = reviewGroups.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ── Step 5: Monthly activity stats for this quarter ───────────────────────────

  const monthStats: { key: string; label: string; meetings: number; checkins: number; emails: number }[] = [];
  let qS: Date | null = null;
  let qE: Date | null = null;
  if (quarterStart && quarterEnd) {
    qS = new Date(quarterStart + "T00:00:00Z");
    qE = new Date(quarterEnd + "T23:59:59Z");
    if (!isNaN(qS.getTime()) && !isNaN(qE.getTime())) {
      let cur = new Date(Date.UTC(qS.getUTCFullYear(), qS.getUTCMonth(), 1));
      while (cur <= qE) {
        const mo = cur.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
        monthStats.push({ key: `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`, label: mo, meetings: 0, checkins: 0, emails: 0 });
        cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
      }
      const byKey = Object.fromEntries(monthStats.map((m) => [m.key, m]));
      for (const r of activities) {
        const type = str(r.fields["Type"]);
        const d = new Date(str(r.fields["ActivityDate"]).slice(0, 10) + "T12:00:00Z");
        if (isNaN(d.getTime()) || !qS || !qE || d < qS || d > qE) continue;
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const slot = byKey[key];
        if (!slot) continue;
        if (type === "Meeting") slot.meetings++;
        else if (type === "Email") slot.emails++;
        else if (type === "Call" || type === "Text Message") slot.checkins++;
      }
    }
  }

  const currentPlanRecord = allPlanRecs.find((r) => str(r.fields["QuarterId"]) === quarterId) ?? null;
  const planFields = currentPlanRecord?.fields ?? {};
  const monthlyMeetingGoal = num(planFields["MonthlyInPersonMeetings"]);
  const monthlyCheckinGoal = num(planFields["MonthlyCheckins"]);

  // ── Step 6: Extract prior AI statuses ─────────────────────────────────────────

  interface AIStatusEntry { status: string; statusAt: string }
  const priorStatuses: AIStatusEntry[] = [];
  for (const r of allPlanRecs) {
    const curStatus = str(r.fields["AIStatus"]) || null;
    const curStatusAt = str(r.fields["AIStatusAt"]) || null;
    if (curStatus && curStatusAt) priorStatuses.push({ status: curStatus, statusAt: curStatusAt });
    const histJson = str(r.fields["AIStatusHistory"]) || null;
    if (histJson) {
      try {
        const arr = JSON.parse(histJson) as AIStatusEntry[];
        if (Array.isArray(arr)) priorStatuses.push(...arr.filter((e) => e.status && e.statusAt));
      } catch { /* ignore */ }
    }
  }
  priorStatuses.sort((a, b) => b.statusAt.localeCompare(a.statusAt));

  // ── Step 7: Lookup maps ────────────────────────────────────────────────────────

  const ccById = new Map(clientContacts.map((c) => [c.id, {
    name: str(c.fields["Name"]),
    createdAt: str(c.fields["CreatedAt"]).slice(0, 10),
    referralPartnerId: str(c.fields["ReferralPartnerId"]),
  }]));

  const contactNameById = new Map(contacts.map((c) => [c.id, str(c.fields["Name"])]));

  // tenantId → { clientName, referralContactName } — connects reviews back to who referred the client
  const tenantToInfo = new Map<string, { clientName: string; referralContactName: string }>();
  for (const o of opportunities) {
    const tid = str(o.fields["TenantId"]);
    if (!tid || tenantToInfo.has(tid)) continue;
    const cc = ccById.get(str(o.fields["ClientContactId"]));
    const clientName = cc?.name ?? "Unknown client";
    const referralContactName = cc?.referralPartnerId ? (contactNameById.get(cc.referralPartnerId) ?? "Unknown contact") : "Unknown contact";
    tenantToInfo.set(tid, { clientName, referralContactName });
  }

  // ── Step 8: Pre-compute metrics ────────────────────────────────────────────────

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMo = todayStr.slice(0, 7);

  // Pipeline summary by stage group
  const stageGroups: Record<string, { count: number; totalValue: number }> = {
    Won: { count: 0, totalValue: 0 },
    Lost: { count: 0, totalValue: 0 },
    Active: { count: 0, totalValue: 0 },
    "No opportunity": { count: 0, totalValue: 0 },
  };
  for (const o of opportunities) {
    const stage = str(o.fields["Stage"]);
    const val = num(o.fields["EstimatedValue"]);
    if (stage === "Won") { stageGroups.Won.count++; stageGroups.Won.totalValue += val; }
    else if (stage === "Lost") { stageGroups.Lost.count++; stageGroups.Lost.totalValue += val; }
    else if (!stage) { stageGroups["No opportunity"].count++; }
    else { stageGroups.Active.count++; stageGroups.Active.totalValue += val; }
  }
  const clientsWithNoOpp = clientContacts.filter((c) => !opportunities.some((o) => str(o.fields["ClientContactId"]) === c.id)).length;
  stageGroups["No opportunity"].count += clientsWithNoOpp;

  const totalWonValue = stageGroups.Won.totalValue;
  const totalActiveValue = stageGroups.Active.totalValue;

  // Referral velocity — group referred clients by quarter
  const referralsByQuarter: Record<string, number> = {};
  for (const cc of clientContacts) {
    const qLabel = dateToQuarterLabel(str(cc.fields["CreatedAt"]));
    referralsByQuarter[qLabel] = (referralsByQuarter[qLabel] ?? 0) + 1;
  }
  const velocityLines = Object.entries(referralsByQuarter)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([q, n]) => `  ${q}: ${n} referral${n !== 1 ? "s" : ""}`)
    .join("\n");

  // Overall activity trend — all activities by month (last 6 months)
  const actByMonth: Record<string, { meetings: number; emails: number; other: number }> = {};
  for (const r of activities) {
    const mo = str(r.fields["ActivityDate"]).slice(0, 7);
    if (!mo || mo > todayMo) continue;
    if (!actByMonth[mo]) actByMonth[mo] = { meetings: 0, emails: 0, other: 0 };
    const type = str(r.fields["Type"]);
    if (type === "Meeting") actByMonth[mo].meetings++;
    else if (type === "Email") actByMonth[mo].emails++;
    else actByMonth[mo].other++;
  }
  const actTrendLines = Object.entries(actByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([mo, v]) => `  ${mo}: ${v.meetings} meetings, ${v.emails} emails, ${v.other} other`)
    .join("\n");

  // ── Step 9: Build prompt sections ─────────────────────────────────────────────

  // Company
  const companyName = str(companyFields["Name"] ?? companyFields["CompanyName"]) || "Unknown";
  const companySection = [
    `COMPANY: ${companyName} | Type: ${str(companyFields["Type"]) || "—"} | Priority: ${str(companyFields["Priority"]) || "—"}`,
    str(companyFields["Website"]) ? `Website: ${str(companyFields["Website"])}` : null,
    str(companyFields["Notes"]) ? `Company notes: ${str(companyFields["Notes"])}` : null,
    str(companyFields["Competitors"]) ? `Competitors/competing orgs: ${str(companyFields["Competitors"])}` : null,
  ].filter(Boolean).join("\n");

  // Loyalty tier
  const loyaltySection = loyaltyRecord
    ? `LOYALTY TIER: ${loyaltyRecord.currentTier} | Lifetime points: ${loyaltyRecord.lifetimePoints} | Current year: ${loyaltyRecord.currentYearPoints} | Multiplier: ${loyaltyRecord.currentMultiplier}x${loyaltyRecord.notes ? `\n  Notes: ${loyaltyRecord.notes}` : ""}`
    : "LOYALTY TIER: not yet enrolled in loyalty program";

  // Contacts — full profile with computed recency and stage duration
  const contactsSection = contacts.length === 0 ? "(no contacts)" : contacts.map((c) => {
    const f = c.fields;
    const name = str(f["Name"]);
    const title = str(f["Title"]);
    const stage = str(f["Stage"]);
    const stageChangedAt = str(f["StageChangedAt"]).slice(0, 10);
    const prevStage = str(f["PreviousStage"]);
    const dateIntroduced = str(f["DateIntroduced"]).slice(0, 10);
    const lastActivity = str(f["LastActivityDate"]).slice(0, 10);
    const isFormerEmployee = bool(f["IsFormerEmployee"]);
    const portalInviteSent = bool(f["PortalInviteSent"]);
    const usesPortal = !!(str(f["ClerkUserId"]));
    const tags = str(f["Tags"]);
    const stageDays = daysSince(stageChangedAt);
    const lastActDays = daysSince(lastActivity);

    const contactPoints = partnerPoints.filter((p) => p.referralContactId === c.id);
    const redeemedCount = contactPoints.filter((p) => p.redeemedAt).length;

    const contactActs = activities
      .filter((a) => str(a.fields["ClientContactId"]) === c.id)
      .slice(0, 20)
      .map((a) => {
        const date = str(a.fields["ActivityDate"]).slice(0, 10);
        const type = str(a.fields["Type"]);
        const note = str(a.fields["Note"]).slice(0, 250);
        const gmail = a.fields["IsGmailImported"] === true ? " [Gmail]" : "";
        return `    ${date} [${type}${gmail}]: ${note || "(no note)"}`;
      });

    const emailActs = activities.filter((a) => str(a.fields["ClientContactId"]) === c.id && str(a.fields["Type"]) === "Email");
    const gmailCount = emailActs.filter((a) => a.fields["IsGmailImported"] === true).length;

    // Portal status with nuance
    const portalStatus = usesPortal
      ? "Actively using the referral portal"
      : portalInviteSent
        ? "Invited to portal but hasn't activated"
        : "No portal access — never invited";

    return [
      `• ${name}${title ? ` (${title})` : ""}${isFormerEmployee ? " [FORMER TTT EMPLOYEE]" : ""}`,
      `  Stage: ${stage}${stageChangedAt ? ` since ${stageChangedAt} (${fmtDays(stageDays)} in this stage)` : ""}${prevStage ? ` | Previously: ${prevStage}` : ""}`,
      dateIntroduced ? `  Introduced: ${dateIntroduced}` : null,
      tags ? `  Tags: ${tags}` : null,
      str(f["Interests"]) ? `  Interests: ${str(f["Interests"])}` : null,
      str(f["CoffeeOrder"]) ? `  Coffee order: ${str(f["CoffeeOrder"])}` : null,
      str(f["OrgsGroups"]) ? `  Orgs/Groups: ${str(f["OrgsGroups"])}` : null,
      str(f["Notes"]) ? `  Notes: ${str(f["Notes"])}` : null,
      str(f["NextStepDate"]) ? `  Next step: ${str(f["NextStepDate"]).slice(0, 10)} — ${str(f["NextStepNote"]) || "(no note)"}` : "  Next step: (none set)",
      `  Last activity: ${lastActivity || "never"} (${fmtDays(lastActDays)})`,
      `  Portal: ${portalStatus}`,
      `  Points: ${contactPoints.length} earned, ${redeemedCount} redeemed`,
      `  Email interactions: ${emailActs.length} total (${gmailCount} via Gmail sync)`,
      contactActs.length > 0
        ? `  Activity log (newest first):\n${contactActs.join("\n")}`
        : "  Activity log: (none logged)",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  // Loyalty points detail
  const totalPoints = partnerPoints.length;
  const redeemedPoints = partnerPoints.filter((p) => p.redeemedAt).length;
  const pointsDetail = totalPoints > 0
    ? `LOYALTY POINTS EVENTS (${totalPoints} total, ${redeemedPoints} redeemed, ${totalPoints - redeemedPoints} outstanding):\n` +
      partnerPoints.slice(0, 12).map((p) =>
        `  • Earned ${p.earnedAt}${p.tenantName ? ` — ${p.tenantName}` : ""}${p.redeemedAt ? ` → REDEEMED ${p.redeemedAt}${p.redemptionNote ? ` (${p.redemptionNote})` : ""}` : " (unredeemed)"}`
      ).join("\n")
    : "LOYALTY POINTS EVENTS: none yet";

  // Pipeline summary
  const pipelineSummary = [
    `ALL-TIME PIPELINE SUMMARY (${clientContacts.length} referred clients):`,
    `  Won: ${stageGroups.Won.count} projects — $${totalWonValue.toLocaleString()} total value`,
    `  Active/In-progress: ${stageGroups.Active.count} — $${totalActiveValue.toLocaleString()} potential`,
    `  Lost: ${stageGroups.Lost.count}`,
    stageGroups["No opportunity"].count > 0 ? `  No opportunity created: ${stageGroups["No opportunity"].count}` : null,
  ].filter(Boolean).join("\n");

  // Referral velocity
  const velocitySection = `REFERRAL VELOCITY BY QUARTER:\n${velocityLines || "  (no referrals yet)"}`;

  // Full referral list
  const referralLines: string[] = [];
  for (const cc of clientContacts.sort((a, b) => str(b.fields["CreatedAt"]).localeCompare(str(a.fields["CreatedAt"])))) {
    const ccName = str(cc.fields["Name"]);
    const ccDate = str(cc.fields["CreatedAt"]).slice(0, 10);
    const ccOpps = opportunities.filter((o) => str(o.fields["ClientContactId"]) === cc.id);
    if (ccOpps.length === 0) {
      referralLines.push(`  • ${ccName} — referred ${ccDate} (no opportunity created)`);
    } else {
      for (const o of ccOpps) {
        const stage = str(o.fields["Stage"]) || "Unknown";
        const value = num(o.fields["EstimatedValue"]);
        const city = str(o.fields["City"]);
        const state = str(o.fields["State"]);
        const loc = [city, state].filter(Boolean).join(", ");
        const valStr = value > 0 ? `$${value.toLocaleString()}` : "no value";
        referralLines.push(`  • ${ccName}${loc ? ` (${loc})` : ""} — ${stage} — ${valStr} — referred ${ccDate}`);
      }
    }
  }

  // Quarterly plan
  const planMeetings = [str(planFields["Meeting1"]), str(planFields["Meeting2"]), str(planFields["Meeting3"])].filter(Boolean);
  const planResources = [str(planFields["Resource1"]), str(planFields["Resource2"]), str(planFields["Resource3"])].filter(Boolean);
  const actVsGoals = monthStats.length > 0
    ? monthStats.map((m) => m.key > todayMo
        ? `  ${m.label}: (future)`
        : `  ${m.label}: ${m.meetings} meetings (goal ${monthlyMeetingGoal}), ${m.checkins} calls/texts (goal ${monthlyCheckinGoal}), ${m.emails} emails`
      ).join("\n")
    : "  (no data)";

  // Google reviews with full attribution
  const reviewsSection = allReviews.length > 0
    ? allReviews.map((r) => {
        const info = tenantToInfo.get(r.tenantId);
        const attribution = info
          ? ` [client: ${info.clientName}, referred by: ${info.referralContactName}]`
          : "";
        return `  • ${r.stars}/5 stars${attribution} (${r.createdAt.slice(0, 10)}): "${r.text.slice(0, 350)}"`;
      }).join("\n")
    : "  (no reviews yet)";

  // Prior AI snapshots (last 3)
  const priorSection = priorStatuses.slice(0, 3).length > 0
    ? priorStatuses.slice(0, 3).map((s) => `[${s.statusAt.slice(0, 10)}]\n${s.status}`).join("\n\n---\n\n")
    : "(none yet)";

  // ── Step 10: Assemble prompt ───────────────────────────────────────────────────

  const prompt = `You are analyzing a referral partner relationship for Top Tier Transitions (TTT), a premium senior move management company. Use every specific data point below — names, numbers, dates, trends — in your response.

${companySection}

${loyaltySection}

CONTACTS:
${contactsSection}

${pointsDetail}

${pipelineSummary}

${velocitySection}

FULL REFERRAL LIST (newest first):
${referralLines.join("\n") || "  (none yet)"}

QUARTERLY PLAN (${quarterLabel || quarterId}):
Key Meetings: ${planMeetings.join("; ") || "(none set)"}
Key Resources: ${planResources.join("; ") || "(none set)"}
Goals: ${monthlyMeetingGoal} in-person meetings/month, ${monthlyCheckinGoal} other outreach/month
Activity vs Goals this quarter:
${actVsGoals}

ACTIVITY TREND (all contacts, last 6 months):
${actTrendLines || "  (no activities logged)"}

GOOGLE REVIEWS FROM CLIENTS THIS PARTNER REFERRED:
${reviewsSection}

PRIOR AI STATUS SNAPSHOTS (most recent first):
${priorSection}

---
Write 7-10 concise, specific bullet points for the TTT supporting team. Reference actual names, dollar amounts, dates, and trends — no vague generalities. Cover:
• Headline relationship status (health, momentum, tier)
• Won business summary (total value, count, trend)
• Referral velocity trend — is it growing, flat, or declining? Cite the quarterly numbers.
• Activity trend — are we meeting/emailing more or less recently? Any gaps?
• Stage-stuck alert — if a contact has been in the same stage too long, flag it with how long
• Portal engagement — who uses it, who was invited but hasn't activated, who has no access
• Loyalty points — what's outstanding, what's been redeemed, what does that signal about engagement
• Google review highlights — name the client and the referring contact when possible
• Key contact insight — what do we know about their interests/personality that could unlock more referrals?
• Top recommended next action — specific, not generic

Format: bullet points only, each starting with "•", 1-2 sentences. No headers, no preamble.`;

  // ── Step 11: Call Claude ───────────────────────────────────────────────────────

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1400,
    messages: [{ role: "user", content: prompt }],
  });
  const newStatus = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  const newStatusAt = new Date().toISOString();

  // ── Step 12: Save to Airtable (find or create plan record) ────────────────────

  let planRecordId = currentPlanRecord?.id ?? null;
  const existingStatus = currentPlanRecord ? (str(currentPlanRecord.fields["AIStatus"]) || null) : null;
  const existingStatusAt = currentPlanRecord ? (str(currentPlanRecord.fields["AIStatusAt"]) || null) : null;
  let historyArr: AIStatusEntry[] = [];
  if (currentPlanRecord) {
    const histJson = str(currentPlanRecord.fields["AIStatusHistory"]) || null;
    if (histJson) {
      try {
        const parsed = JSON.parse(histJson);
        if (Array.isArray(parsed)) historyArr = parsed;
      } catch { /* ignore */ }
    }
  }
  if (existingStatus && existingStatusAt) {
    historyArr = [{ status: existingStatus, statusAt: existingStatusAt }, ...historyArr];
  }

  const patchFields: Record<string, unknown> = {
    AIStatus: newStatus,
    AIStatusAt: newStatusAt,
    AIStatusHistory: JSON.stringify(historyArr),
  };

  if (planRecordId) {
    await atFetch(AIRTABLE_TABLES.QUARTERLY_COMPANY_PLANS, `/${planRecordId}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: patchFields }),
    });
  } else {
    const createRes = await atFetch(AIRTABLE_TABLES.QUARTERLY_COMPANY_PLANS, "", {
      method: "POST",
      body: JSON.stringify({ fields: { ...patchFields, CompanyId: companyId, QuarterId: quarterId, CreatedAt: new Date().toISOString() } }),
    });
    if (createRes.ok) {
      const created = await createRes.json() as Rec;
      planRecordId = created.id;
    }
  }

  return NextResponse.json({ status: newStatus, statusAt: newStatusAt });
}
