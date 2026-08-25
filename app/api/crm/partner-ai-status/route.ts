// DEPLOY: Add AIStatus (Long text), AIStatusAt (Single line text), AIStatusHistory (Long text) to QuarterlyCompanyPlans table in Airtable first

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReviewsForTenant } from "@/lib/airtable";
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

  // Fetch ALL QuarterlyCompanyPlans records for this company
  const formula = encodeURIComponent(`{CompanyId} = "${companyId}"`);
  const res = await atFetch(AIRTABLE_TABLES.QUARTERLY_COMPANY_PLANS, `?filterByFormula=${formula}`);
  if (!res.ok) return NextResponse.json({ status: null, statusAt: null });

  const data = await res.json();
  const records: { fields: Record<string, unknown> }[] = data.records ?? [];

  // Find the record with the most recent AIStatusAt
  let bestStatus: string | null = null;
  let bestStatusAt: string | null = null;

  for (const r of records) {
    const f = r.fields;
    const statusAt = typeof f["AIStatusAt"] === "string" ? f["AIStatusAt"] : null;
    const status = typeof f["AIStatus"] === "string" ? f["AIStatus"] : null;
    if (!statusAt || !status) continue;
    if (!bestStatusAt || statusAt > bestStatusAt) {
      bestStatusAt = statusAt;
      bestStatus = status;
    }
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

  const { companyId, quarterId } = await req.json() as { companyId: string; quarterId: string };
  if (!companyId || !quarterId) {
    return NextResponse.json({ error: "companyId and quarterId required" }, { status: 400 });
  }

  // ── Step 1: Gather ALL data in parallel ──────────────────────────────────────

  const [companyRes, contactsRes, allPlansRes, quarterRes] = await Promise.all([
    atFetch(AIRTABLE_TABLES.CRM_COMPANIES, `?filterByFormula=${encodeURIComponent(`RECORD_ID() = "${companyId}"`)}&maxRecords=1`),
    atFetch(AIRTABLE_TABLES.CRM_CONTACTS, `?filterByFormula=${encodeURIComponent(`{ReferralCompanyId} = "${companyId}"`)}`),
    atFetch(AIRTABLE_TABLES.QUARTERLY_COMPANY_PLANS, `?filterByFormula=${encodeURIComponent(`{CompanyId} = "${companyId}"`)}`),
    atFetch(AIRTABLE_TABLES.QUARTERS, `/${quarterId}`),
  ]);

  const companyData = companyRes.ok ? await companyRes.json() : { records: [] };
  const contactsData = contactsRes.ok ? await contactsRes.json() : { records: [] };
  const allPlansData = allPlansRes.ok ? await allPlansRes.json() : { records: [] };
  const quarterData = quarterRes.ok ? await quarterRes.json() : { fields: {} };

  const companyRecord = companyData.records?.[0];
  const companyFields = companyRecord?.fields ?? {};

  interface ContactRecord { id: string; fields: Record<string, unknown> }
  const contacts: ContactRecord[] = contactsData.records ?? [];
  const contactIds: string[] = contacts.map((c: ContactRecord) => c.id);

  const quarterFields = quarterData.fields ?? {};
  const quarterLabel = String(quarterFields["Label"] ?? quarterFields["Name"] ?? "");
  const quarterStart = String(quarterFields["StartDate"] ?? "").slice(0, 10);
  const quarterEnd = String(quarterFields["EndDate"] ?? "").slice(0, 10);

  // ── Fetch activities, client contacts, opportunities in parallel ──────────────

  let activitiesData: { records: { fields: Record<string, unknown> }[] } = { records: [] };
  let clientContactsData: { records: { fields: Record<string, unknown> }[] } = { records: [] };

  if (contactIds.length > 0) {
    const orParts = contactIds.map((id) => `{ClientContactId} = "${id}"`);
    const contactFilter = contactIds.length === 1 ? orParts[0] : `OR(${orParts.join(", ")})`;
    const actFormula = encodeURIComponent(contactFilter);
    const ccFormula = encodeURIComponent(
      contactIds.length === 1
        ? `{ReferralPartnerId} = "${contactIds[0]}"`
        : `OR(${contactIds.map((id) => `{ReferralPartnerId} = "${id}"`).join(", ")})`
    );

    const [actRes, ccRes] = await Promise.all([
      atFetch(AIRTABLE_TABLES.CRM_ACTIVITIES, `?filterByFormula=${actFormula}&sort[0][field]=ActivityDate&sort[0][direction]=desc&maxRecords=60`),
      atFetch(AIRTABLE_TABLES.CRM_CLIENT_CONTACTS, `?filterByFormula=${ccFormula}`),
    ]);

    if (actRes.ok) activitiesData = await actRes.json();
    if (ccRes.ok) clientContactsData = await ccRes.json();
  }

  const clientContacts: { fields: Record<string, unknown> }[] = clientContactsData.records ?? [];
  const clientContactIds: string[] = clientContacts.map((c) => {
    const f = c.fields;
    return String(f["RecordId"] ?? "");
  }).filter(Boolean);

  // Fetch opportunities for referred clients
  let opportunitiesData: { records: { fields: Record<string, unknown> }[] } = { records: [] };
  if (clientContactIds.length > 0) {
    const oppFilter = clientContactIds.length === 1
      ? `{ClientContactId} = "${clientContactIds[0]}"`
      : `OR(${clientContactIds.map((id) => `{ClientContactId} = "${id}"`).join(", ")})`;
    const oppRes = await atFetch(
      AIRTABLE_TABLES.CRM_OPPORTUNITIES,
      `?filterByFormula=${encodeURIComponent(`AND(NOT({Deleted}), ${oppFilter})`)}`
    );
    if (oppRes.ok) opportunitiesData = await oppRes.json();
  } else {
    // Try by referral partner directly using the contact IDs
    if (contactIds.length > 0) {
      const directFilter = contactIds.length === 1
        ? `{ReferralPartnerId} = "${contactIds[0]}"`
        : `OR(${contactIds.map((id) => `{ReferralPartnerId} = "${id}"`).join(", ")})`;
      const oppRes = await atFetch(
        AIRTABLE_TABLES.CRM_OPPORTUNITIES,
        `?filterByFormula=${encodeURIComponent(`AND(NOT({Deleted}), ${directFilter})`)}`
      );
      if (oppRes.ok) opportunitiesData = await oppRes.json();
    }
  }

  const opportunities: { fields: Record<string, unknown> }[] = opportunitiesData.records ?? [];

  // ── Step 2: Get Google reviews for won/active tenants ────────────────────────

  const wonOpps = opportunities.filter((o) => {
    const stage = String(o.fields["Stage"] ?? "");
    return stage === "Won";
  });
  const uniqueTenantIds = [...new Set(wonOpps.map((o) => String(o.fields["TenantId"] ?? "").trim()).filter(Boolean))].slice(0, 5);
  const reviewsByTenant = await Promise.all(uniqueTenantIds.map((tid) => getReviewsForTenant(tid)));
  const allReviews = reviewsByTenant.flat();

  // ── Step 3: Current quarter's plan record ────────────────────────────────────

  interface PlanRecord { id: string; fields: Record<string, unknown> }
  const allPlanRecords: PlanRecord[] = allPlansData.records ?? [];
  const currentPlanRecord = allPlanRecords.find((r) => String(r.fields["QuarterId"] ?? "") === quarterId) ?? null;
  const planFields = currentPlanRecord?.fields ?? {};

  // Compute monthly activity stats for this quarter
  interface MonthStat { key: string; meetings: number; checkins: number }
  const monthStats: MonthStat[] = [];
  if (quarterStart && quarterEnd) {
    const qStartDate = new Date(quarterStart + "T00:00:00.000Z");
    const qEndDate = new Date(quarterEnd + "T23:59:59.999Z");
    if (!isNaN(qStartDate.getTime()) && !isNaN(qEndDate.getTime())) {
      let cur = new Date(Date.UTC(qStartDate.getUTCFullYear(), qStartDate.getUTCMonth(), 1));
      while (cur <= qEndDate) {
        const key = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`;
        monthStats.push({ key, meetings: 0, checkins: 0 });
        cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
      }
      const counts: Record<string, MonthStat> = {};
      for (const m of monthStats) counts[m.key] = m;

      const activities: { fields: Record<string, unknown> }[] = activitiesData.records ?? [];
      for (const r of activities) {
        const f = r.fields;
        const type = String(f["Type"] ?? "");
        const dateStr = String(f["ActivityDate"] ?? "").slice(0, 10);
        if (!dateStr) continue;
        const d = new Date(dateStr + "T12:00:00.000Z");
        if (isNaN(d.getTime()) || d < qStartDate || d > qEndDate) continue;
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        if (!counts[key]) continue;
        if (type === "Meeting") counts[key].meetings++;
        else if (type === "Call" || type === "Email" || type === "Text Message") counts[key].checkins++;
      }
    }
  }

  const monthlyMeetingGoal = typeof planFields["MonthlyInPersonMeetings"] === "number" ? planFields["MonthlyInPersonMeetings"] : 0;
  const monthlyCheckinGoal = typeof planFields["MonthlyCheckins"] === "number" ? planFields["MonthlyCheckins"] : 0;

  // ── Step 4: Extract prior AI statuses from all plan records ──────────────────

  interface AIStatusEntry { status: string; statusAt: string }
  const priorStatuses: AIStatusEntry[] = [];
  for (const r of allPlanRecords) {
    const f = r.fields;
    // Current AIStatus
    const curStatus = typeof f["AIStatus"] === "string" ? f["AIStatus"] : null;
    const curStatusAt = typeof f["AIStatusAt"] === "string" ? f["AIStatusAt"] : null;
    if (curStatus && curStatusAt) priorStatuses.push({ status: curStatus, statusAt: curStatusAt });
    // History
    const histJson = typeof f["AIStatusHistory"] === "string" ? f["AIStatusHistory"] : null;
    if (histJson) {
      try {
        const hist = JSON.parse(histJson) as AIStatusEntry[];
        if (Array.isArray(hist)) priorStatuses.push(...hist);
      } catch { /* ignore */ }
    }
  }
  // Sort by most recent first for display
  priorStatuses.sort((a, b) => b.statusAt.localeCompare(a.statusAt));

  // ── Step 5: Build AI prompt ───────────────────────────────────────────────────

  const cf = companyFields;
  const companyName = String(cf["Name"] ?? cf["CompanyName"] ?? "Unknown");
  const companyType = String(cf["Type"] ?? "");
  const companyPriority = String(cf["Priority"] ?? "");
  const companyWebsite = String(cf["Website"] ?? "");
  const companyNotes = String(cf["Notes"] ?? "");
  const companyCompetitors = String(cf["Competitors"] ?? "");

  const companyLine = `COMPANY: ${companyName} | Type: ${companyType} | Priority: ${companyPriority}`;
  const companyExtras = [
    companyWebsite ? `Website: ${companyWebsite}` : null,
    companyNotes ? `Notes: ${companyNotes}` : null,
    companyCompetitors ? `Competitors: ${companyCompetitors}` : null,
  ].filter(Boolean).join(" | ");

  // Build contacts section
  const activitiesArr: { fields: Record<string, unknown> }[] = activitiesData.records ?? [];

  const contactsSection = contacts.map((c: ContactRecord) => {
    const cf2 = c.fields;
    const cName = String(cf2["Name"] ?? "");
    const cTitle = String(cf2["Title"] ?? "");
    const cStage = String(cf2["Stage"] ?? "");
    const cStageChangedAt = String(cf2["StageChangedAt"] ?? "").slice(0, 10);
    const cPrevStage = String(cf2["PreviousStage"] ?? "");
    const cInterests = String(cf2["Interests"] ?? "");
    const cCoffee = String(cf2["CoffeeOrder"] ?? "");
    const cOrgs = String(cf2["OrgsGroups"] ?? "");
    const cNotes = String(cf2["Notes"] ?? "");
    const cNextStepDate = String(cf2["NextStepDate"] ?? "").slice(0, 10);
    const cNextStepNote = String(cf2["NextStepNote"] ?? "");

    const contactActs = activitiesArr
      .filter((a) => String(a.fields["ClientContactId"] ?? "") === c.id)
      .slice(0, 15)
      .map((a) => {
        const af = a.fields;
        const date = String(af["ActivityDate"] ?? "").slice(0, 10);
        const type = String(af["Type"] ?? "");
        const note = String(af["Notes"] ?? af["Description"] ?? "").slice(0, 200);
        return `    ${date} ${type}: ${note}`;
      }).join("\n");

    return [
      `• ${cName}${cTitle ? ` (${cTitle})` : ""} — Stage: ${cStage}${cStageChangedAt ? ` since ${cStageChangedAt}` : ""}${cPrevStage ? ` (prev: ${cPrevStage})` : ""}`,
      `  Interests: ${cInterests || "—"} | Coffee: ${cCoffee || "—"} | Orgs: ${cOrgs || "—"}`,
      `  Notes: ${cNotes || "—"}`,
      `  Next step: ${cNextStepDate || "—"} — ${cNextStepNote || "—"}`,
      contactActs ? `  Recent activities:\n${contactActs}` : "  Recent activities: (none)",
    ].join("\n");
  }).join("\n\n");

  // Build referrals section
  const referralsSection = opportunities.map((o) => {
    const of2 = o.fields;
    const clientName = String(of2["ClientName"] ?? of2["Name"] ?? "Unknown");
    const city = String(of2["City"] ?? "");
    const state = String(of2["State"] ?? "");
    const stage = String(of2["Stage"] ?? "");
    const value = typeof of2["Value"] === "number" ? `$${of2["Value"].toLocaleString()}` : "—";
    const referredAt = String(of2["CreatedAt"] ?? of2["ReferredAt"] ?? "").slice(0, 10);
    const loc = [city, state].filter(Boolean).join(", ");
    return `• ${clientName}${loc ? ` (${loc})` : ""} — ${stage} — ${value} — referred ${referredAt}`;
  }).join("\n");

  // Build plan section
  const planMeetings = [
    String(planFields["Meeting1"] ?? ""),
    String(planFields["Meeting2"] ?? ""),
    String(planFields["Meeting3"] ?? ""),
  ].filter(Boolean);
  const planResources = [
    String(planFields["Resource1"] ?? ""),
    String(planFields["Resource2"] ?? ""),
    String(planFields["Resource3"] ?? ""),
  ].filter(Boolean);

  const today = new Date().toISOString().slice(0, 7);
  const activityVsGoals = monthStats.map((m) => {
    const isFuture = m.key > today;
    if (isFuture) return `  ${m.key}: (future)`;
    return `  ${m.key}: ${m.meetings} meetings (goal ${monthlyMeetingGoal}), ${m.checkins} checkins (goal ${monthlyCheckinGoal})`;
  }).join("\n");

  // Build reviews section
  const reviewsSection = allReviews.length > 0
    ? allReviews.map((r) => `• ${r.stars} stars — "${r.text.slice(0, 300)}" (${r.createdAt})`).join("\n")
    : "(no reviews yet)";

  // Build prior AI status section
  const priorStatusSection = priorStatuses.length > 0
    ? priorStatuses.map((s) => `${s.statusAt}: ${s.status}`).join("\n\n---\n\n")
    : "(none yet)";

  const prompt = `You are analyzing a referral partner relationship for Top Tier Transitions (TTT), a premium senior move management company.

${companyLine}
${companyExtras}

CONTACTS:
${contactsSection || "(no contacts)"}

ALL-TIME REFERRALS (${opportunities.length} total):
${referralsSection || "(none yet)"}

QUARTERLY PLAN (${quarterLabel}):
Key Meetings: ${planMeetings.join("; ") || "(none set)"}
Key Resources: ${planResources.join("; ") || "(none set)"}
Monthly goals: ${monthlyMeetingGoal} in-person meetings, ${monthlyCheckinGoal} checkins
Activity vs Goals:
${activityVsGoals || "(no data)"}

GOOGLE REVIEWS FROM REFERRED CLIENTS:
${reviewsSection}

PRIOR AI STATUS SNAPSHOTS:
${priorStatusSection}

Based on ALL the above, write 5-8 bullet points for the TTT supporting team summarizing:
- Current relationship health and momentum
- Referral trends (increasing/decreasing/stalled)
- Progress vs quarterly plan goals
- Key contact insights (engagement level, interests, opportunities)
- Concerns or risks
- Suggested next actions

Format: bullet points only, each starting with "•", 1-2 sentences each. No headers, no preamble, no summary line.`;

  // ── Step 6: Call Claude ───────────────────────────────────────────────────────

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const newStatus = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  const newStatusAt = new Date().toISOString();

  // ── Step 7: Save to Airtable ─────────────────────────────────────────────────

  // Find or create current quarter plan record
  let planRecordId = currentPlanRecord?.id ?? null;

  // Build updated history: push existing AIStatus into history array
  const existingStatus = currentPlanRecord ? (typeof currentPlanRecord.fields["AIStatus"] === "string" ? currentPlanRecord.fields["AIStatus"] : null) : null;
  const existingStatusAt = currentPlanRecord ? (typeof currentPlanRecord.fields["AIStatusAt"] === "string" ? currentPlanRecord.fields["AIStatusAt"] : null) : null;
  let historyArr: AIStatusEntry[] = [];
  if (currentPlanRecord) {
    const histJson = typeof currentPlanRecord.fields["AIStatusHistory"] === "string" ? currentPlanRecord.fields["AIStatusHistory"] : null;
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
      body: JSON.stringify({
        fields: {
          ...patchFields,
          CompanyId: companyId,
          QuarterId: quarterId,
          CreatedAt: new Date().toISOString(),
        },
      }),
    });
    if (createRes.ok) {
      const created = await createRes.json();
      planRecordId = created.id;
    }
  }

  return NextResponse.json({ status: newStatus, statusAt: newStatusAt });
}
