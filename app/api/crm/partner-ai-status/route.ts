// DEPLOY: Add AIStatus (Long text), AIStatusAt (Single line text), AIStatusHistory (Long text)
// to QuarterlyCompanyPlans table in Airtable before using this feature.

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReviewsForTenant, getPartnerPointsByCompany } from "@/lib/airtable";
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

  // ── Step 1: Parallel fetch of company, contacts, all plan records, quarter, partner points ──

  const [companyRecs, contacts, allPlanRecs, quarterRec, partnerPoints] = await Promise.all([
    fetchAllRecs(AIRTABLE_TABLES.CRM_COMPANIES, `RECORD_ID() = "${companyId}"`),
    fetchAllRecs(AIRTABLE_TABLES.CRM_CONTACTS, `{ReferralCompanyId} = "${companyId}"`),
    fetchAllRecs(AIRTABLE_TABLES.QUARTERLY_COMPANY_PLANS, `{CompanyId} = "${companyId}"`),
    atFetch(AIRTABLE_TABLES.QUARTERS, `/${quarterId}`).then((r) => r.ok ? r.json() as Promise<Rec> : Promise.resolve({ id: quarterId, fields: {} })),
    getPartnerPointsByCompany(companyId).catch(() => [] as import("@/lib/types").PartnerPoint[]),
  ]);

  const companyFields = companyRecs[0]?.fields ?? {};
  const contactIds = contacts.map((c) => c.id);
  const quarterFields = (quarterRec.fields ?? {}) as Record<string, unknown>;
  const quarterLabel = str(quarterFields["Label"] ?? quarterFields["Name"] ?? "");
  const quarterStart = str(quarterFields["StartDate"]).slice(0, 10);
  const quarterEnd = str(quarterFields["EndDate"]).slice(0, 10);

  // ── Step 2: Fetch activities + client contacts (referred clients) in parallel ──

  const [activities, clientContacts] = await Promise.all([
    contactIds.length === 0 ? Promise.resolve<Rec[]>([]) : fetchAllRecs(
      AIRTABLE_TABLES.CRM_ACTIVITIES,
      orFilter("ClientContactId", contactIds),
      "&sort[0][field]=ActivityDate&sort[0][direction]=desc&maxRecords=80"
    ),
    contactIds.length === 0 ? Promise.resolve<Rec[]>([]) : fetchAllRecs(
      AIRTABLE_TABLES.CRM_CLIENT_CONTACTS,
      // ReferralPartnerId on ClientContacts = the referral contact's Airtable record ID
      orFilter("ReferralPartnerId", contactIds)
    ),
  ]);

  const clientContactIds = clientContacts.map((c) => c.id); // use .id, NOT fields["RecordId"]

  // ── Step 3: Fetch opportunities for those referred clients ─────────────────────

  const opportunities = clientContactIds.length === 0 ? [] : await fetchAllRecs(
    AIRTABLE_TABLES.CRM_OPPORTUNITIES,
    `AND(NOT({Deleted}), ${orFilter("ClientContactId", clientContactIds)})`
  );

  // ── Step 4: Google reviews for won/active projects ─────────────────────────────

  const wonTenantIds = [...new Set(
    opportunities
      .filter((o) => str(o.fields["Stage"]) === "Won" && str(o.fields["TenantId"]))
      .map((o) => str(o.fields["TenantId"]))
  )].slice(0, 6);
  const reviewGroups = await Promise.all(wonTenantIds.map((tid) => getReviewsForTenant(tid).catch(() => [])));
  const allReviews = reviewGroups.flat();

  // ── Step 5: Build monthly activity stats for this quarter ──────────────────────

  const monthStats: { key: string; meetings: number; checkins: number; emails: number }[] = [];
  if (quarterStart && quarterEnd) {
    const qS = new Date(quarterStart + "T00:00:00Z");
    const qE = new Date(quarterEnd + "T23:59:59Z");
    if (!isNaN(qS.getTime()) && !isNaN(qE.getTime())) {
      let cur = new Date(Date.UTC(qS.getUTCFullYear(), qS.getUTCMonth(), 1));
      while (cur <= qE) {
        monthStats.push({ key: `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`, meetings: 0, checkins: 0, emails: 0 });
        cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
      }
      const byKey: Record<string, typeof monthStats[0]> = Object.fromEntries(monthStats.map((m) => [m.key, m]));
      for (const r of activities) {
        const type = str(r.fields["Type"]);
        const d = new Date(str(r.fields["ActivityDate"]).slice(0, 10) + "T12:00:00Z");
        if (isNaN(d.getTime()) || d < qS || d > qE) continue;
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

  // ── Step 7: Build lookup maps ─────────────────────────────────────────────────

  // clientContact.id → { name, createdAt, referralPartnerId }
  const ccById = new Map(clientContacts.map((c) => [c.id, {
    name: str(c.fields["Name"]),
    createdAt: str(c.fields["CreatedAt"]).slice(0, 10),
    referralPartnerId: str(c.fields["ReferralPartnerId"]),
  }]));

  // ── Step 8: Build AI prompt sections ──────────────────────────────────────────

  // Company info
  const companyName = str(companyFields["Name"] ?? companyFields["CompanyName"]) || "Unknown";
  const companyType = str(companyFields["Type"]);
  const companyPriority = str(companyFields["Priority"]);
  const companyWebsite = str(companyFields["Website"]);
  const companyNotes = str(companyFields["Notes"]);
  const companyCompetitors = str(companyFields["Competitors"]);

  const companySection = [
    `COMPANY: ${companyName} | Type: ${companyType || "—"} | Priority: ${companyPriority || "—"}`,
    companyWebsite ? `Website: ${companyWebsite}` : null,
    companyNotes ? `Company notes: ${companyNotes}` : null,
    companyCompetitors ? `Competitors/competing orgs: ${companyCompetitors}` : null,
  ].filter(Boolean).join("\n");

  // Contacts section — include portal status, notes, interests, activities, email engagement
  const contactsSection = contacts.length === 0 ? "(no contacts)" : contacts.map((c) => {
    const f = c.fields;
    const usesPortal = !!(str(f["ClerkUserId"]));
    const contactPointCount = partnerPoints.filter((p) => p.referralContactId === c.id).length;
    const redeemedCount = partnerPoints.filter((p) => p.referralContactId === c.id && p.redeemedAt).length;

    const contactActs = activities
      .filter((a) => str(a.fields["ClientContactId"]) === c.id)
      .slice(0, 18)
      .map((a) => {
        const date = str(a.fields["ActivityDate"]).slice(0, 10);
        const type = str(a.fields["Type"]);
        const note = str(a.fields["Note"]).slice(0, 220); // "Note" is the correct field name
        return `    ${date} [${type}]: ${note || "(no note)"}`;
      });

    // Email engagement: check how many emails, and whether notes suggest two-way conversation
    const emailActs = activities.filter((a) => str(a.fields["ClientContactId"]) === c.id && str(a.fields["Type"]) === "Email");
    const gmailImported = emailActs.filter((a) => a.fields["IsGmailImported"] === true).length;
    const emailEngagementNote = emailActs.length > 0
      ? `${emailActs.length} email interactions (${gmailImported} via Gmail sync)`
      : "no email interactions logged";

    return [
      `• ${str(f["Name"])}${str(f["Title"]) ? ` (${str(f["Title"])})` : ""} — Stage: ${str(f["Stage"])}${str(f["StageChangedAt"]) ? ` since ${str(f["StageChangedAt"]).slice(0, 10)}` : ""}${str(f["PreviousStage"]) ? ` (prev: ${str(f["PreviousStage"])})` : ""}`,
      `  Portal access: ${usesPortal ? "YES — actively uses the referral portal" : "No portal access"}`,
      `  Loyalty points: ${contactPointCount} earned, ${redeemedCount} redeemed`,
      str(f["Interests"]) ? `  Interests: ${str(f["Interests"])}` : null,
      str(f["CoffeeOrder"]) ? `  Coffee: ${str(f["CoffeeOrder"])}` : null,
      str(f["OrgsGroups"]) ? `  Orgs/Groups: ${str(f["OrgsGroups"])}` : null,
      str(f["Notes"]) ? `  Notes: ${str(f["Notes"])}` : null,
      str(f["NextStepDate"]) ? `  Next step: ${str(f["NextStepDate"]).slice(0, 10)} — ${str(f["NextStepNote"]) || "(no note)"}` : null,
      `  Email engagement: ${emailEngagementNote}`,
      contactActs.length > 0 ? `  Recent activities (newest first):\n${contactActs.join("\n")}` : "  Recent activities: (none logged)",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  // Partner loyalty points summary
  const totalPoints = partnerPoints.length;
  const redeemedPoints = partnerPoints.filter((p) => p.redeemedAt).length;
  const unredeemedPoints = totalPoints - redeemedPoints;
  const pointsSection = totalPoints > 0
    ? `PARTNER LOYALTY POINTS: ${totalPoints} total earned | ${unredeemedPoints} unredeemed | ${redeemedPoints} redeemed\n` +
      partnerPoints.slice(0, 10).map((p) => `  • Earned ${p.earnedAt}${p.tenantName ? ` for ${p.tenantName}` : ""}${p.redeemedAt ? ` → REDEEMED ${p.redeemedAt}${p.redemptionNote ? ` (${p.redemptionNote})` : ""}` : " (unredeemed)"}`).join("\n")
    : "PARTNER LOYALTY POINTS: none earned yet";

  // Referrals section — client contacts with their opportunities
  const referralLines: string[] = [];
  for (const cc of clientContacts) {
    const ccName = str(cc.fields["Name"]);
    const ccDate = str(cc.fields["CreatedAt"]).slice(0, 10);
    const ccOpps = opportunities.filter((o) => str(o.fields["ClientContactId"]) === cc.id);
    if (ccOpps.length === 0) {
      referralLines.push(`• ${ccName} — referred ${ccDate} (no opportunity yet)`);
    } else {
      for (const o of ccOpps) {
        const stage = str(o.fields["Stage"]) || "Unknown";
        const value = num(o.fields["EstimatedValue"]);
        const city = str(o.fields["City"]);
        const state = str(o.fields["State"]);
        const loc = [city, state].filter(Boolean).join(", ");
        const valStr = value > 0 ? `$${value.toLocaleString()}` : "no value";
        referralLines.push(`• ${ccName}${loc ? ` (${loc})` : ""} — ${stage} — ${valStr} — referred ${ccDate}`);
      }
    }
  }
  const referralsSection = referralLines.length > 0 ? referralLines.join("\n") : "(none yet)";

  // Quarterly plan + activity vs goals
  const planMeetings = [str(planFields["Meeting1"]), str(planFields["Meeting2"]), str(planFields["Meeting3"])].filter(Boolean);
  const planResources = [str(planFields["Resource1"]), str(planFields["Resource2"]), str(planFields["Resource3"])].filter(Boolean);
  const today = new Date().toISOString().slice(0, 7);
  const actVsGoals = monthStats.length > 0
    ? monthStats.map((m) => m.key > today
        ? `  ${m.key}: (future)`
        : `  ${m.key}: ${m.meetings} meetings (goal ${monthlyMeetingGoal}), ${m.checkins} calls/texts (goal ${monthlyCheckinGoal}), ${m.emails} emails`
      ).join("\n")
    : "  (no data)";

  // Google reviews
  const reviewsSection = allReviews.length > 0
    ? allReviews.map((r) => `• ${r.stars}/5 stars — "${r.text.slice(0, 300)}" (${r.createdAt.slice(0, 10)})`).join("\n")
    : "(no reviews yet from projects this partner referred)";

  // Prior AI statuses (last 3 to keep prompt manageable)
  const priorSection = priorStatuses.slice(0, 3).length > 0
    ? priorStatuses.slice(0, 3).map((s) => `[${s.statusAt.slice(0, 10)}]\n${s.status}`).join("\n\n---\n\n")
    : "(none yet)";

  // Email engagement trend across all contacts
  const allEmailActs = activities.filter((a) => str(a.fields["Type"]) === "Email");
  const emailMonthCounts: Record<string, number> = {};
  for (const e of allEmailActs) {
    const mo = str(e.fields["ActivityDate"]).slice(0, 7);
    if (mo) emailMonthCounts[mo] = (emailMonthCounts[mo] ?? 0) + 1;
  }
  const emailTrendLines = Object.entries(emailMonthCounts).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
    .map(([mo, cnt]) => `  ${mo}: ${cnt} emails`).join("\n");

  const prompt = `You are analyzing a referral partner relationship for Top Tier Transitions (TTT), a premium senior move management company. Use every data point below to write an accurate, specific status brief.

${companySection}

CONTACTS:
${contactsSection}

${pointsSection}

ALL-TIME REFERRALS (${clientContacts.length} referred clients, ${opportunities.length} opportunities):
${referralsSection}

QUARTERLY PLAN (${quarterLabel || quarterId}):
Key Meetings: ${planMeetings.join("; ") || "(none set)"}
Key Resources: ${planResources.join("; ") || "(none set)"}
Monthly goals: ${monthlyMeetingGoal} in-person meetings, ${monthlyCheckinGoal} other outreach
Activity vs Goals:
${actVsGoals}

EMAIL ENGAGEMENT TREND (last 6 months):
${emailTrendLines || "  (no emails logged)"}

GOOGLE REVIEWS FROM CLIENTS THIS PARTNER REFERRED:
${reviewsSection}

PRIOR AI STATUS SNAPSHOTS (most recent first):
${priorSection}

---
Write 6-9 concise bullet points for the TTT supporting team. Each bullet should be specific and actionable — reference actual names, numbers, dates, and trends from the data above. Cover:
• Overall relationship health and momentum
• Referral volume and trend (cite actual counts and dates)
• Portal/engagement level (are they actively using the partner portal?)
• Loyalty points status (earned, unredeemed, redeemed — and what that signals)
• Activity trend — are meetings/emails increasing, decreasing, or stalled?
• Google review signals (if any) — what do reviews say about client experience?
• Key contact-specific insights (personality, interests, what engages them)
• Concerns or risks worth flagging
• Specific recommended next action

Format: bullet points only, each starting with "•", 1-2 sentences. No headers, no preamble.`;

  // ── Step 9: Call Claude ───────────────────────────────────────────────────────

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });
  const newStatus = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  const newStatusAt = new Date().toISOString();

  // ── Step 10: Save to Airtable (find or create plan record) ───────────────────

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
