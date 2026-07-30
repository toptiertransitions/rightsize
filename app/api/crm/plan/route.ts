import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReferralCompanies, getReferralContacts, getClientContacts, getOpportunities, getStaffMembers } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";
import type { ReferralContactStage, ReferralPriority } from "@/lib/types";

// ─── Quarterly goal constants ─────────────────────────────────────────────────
// Per-quarter referral goal for Active partners, indexed by company priority
const ACTIVE_PARTNER_QUARTERLY_GOAL: Record<ReferralPriority, number> = {
  High: 3,
  Medium: 1,
  Low: 0,
  "": 0,
};
// Per-quarter referral goal for companies being converted this quarter
const CONVERSION_TARGET_QUARTERLY_GOAL: Record<ReferralPriority, number> = {
  High: 2,
  Medium: 1,
  Low: 1,
  "": 1,
};

// Stage priority: higher = better
const STAGE_PRIORITY: Record<ReferralContactStage, number> = {
  "Inactive Referral": 0,
  "Identified": 1,
  "Met": 2,
  "Agreed to Refer": 3,
  "Shared Leads": 4,
  "Active Referral": 5,
};

function atFetch(table: string, path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

interface ConversionTargetRecord {
  id: string;
  companyId: string;
  quarterId: string;
  selectedByClerkId: string;
}

async function getConversionTargets(quarterId: string): Promise<ConversionTargetRecord[]> {
  const formula = encodeURIComponent(`{QuarterId} = "${quarterId}"`);
  const all: ConversionTargetRecord[] = [];
  let offset: string | undefined;
  do {
    const qs = `?filterByFormula=${formula}${offset ? `&offset=${offset}` : ""}`;
    const res = await atFetch(AIRTABLE_TABLES.QUARTERLY_CONVERSION_TARGETS, qs);
    if (!res.ok) break;
    const data = await res.json();
    all.push(
      ...(data.records as { id: string; fields: Record<string, string> }[]).map((r) => ({
        id: r.id,
        companyId: r.fields["CompanyId"] ?? "",
        quarterId: r.fields["QuarterId"] ?? "",
        selectedByClerkId: r.fields["SelectedByClerkId"] ?? "",
      }))
    );
    offset = data.offset;
  } while (offset);
  return all;
}

async function getQuarterById(quarterId: string) {
  const res = await atFetch(AIRTABLE_TABLES.QUARTERS, `/${quarterId}`);
  if (!res.ok) return null;
  const r = await res.json() as { id: string; fields: Record<string, string> };
  return {
    id: r.id,
    label: r.fields["Label"] ?? "",
    startDate: r.fields["StartDate"] ?? "",
    endDate: r.fields["EndDate"] ?? "",
  };
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const quarterId = req.nextUrl.searchParams.get("quarterId");
  if (!quarterId) return NextResponse.json({ error: "quarterId required" }, { status: 400 });

  const [quarter, companies, referralContacts, clientContacts, opportunities, staffMembers, conversionTargets] =
    await Promise.all([
      getQuarterById(quarterId),
      getReferralCompanies(),
      getReferralContacts(),
      getClientContacts(),
      getOpportunities(),
      getStaffMembers().catch(() => []),
      getConversionTargets(quarterId),
    ]);

  if (!quarter) return NextResponse.json({ error: "Quarter not found" }, { status: 404 });

  const qStart = new Date(quarter.startDate);
  const qEnd = new Date(quarter.endDate);
  qEnd.setHours(23, 59, 59, 999);

  // bestStage per company: highest stage across all its contacts
  const companyBestStage = new Map<string, ReferralContactStage>();
  for (const contact of referralContacts) {
    if (!contact.referralCompanyId) continue;
    const current = companyBestStage.get(contact.referralCompanyId);
    if (!current || STAGE_PRIORITY[contact.stage] > STAGE_PRIORITY[current]) {
      companyBestStage.set(contact.referralCompanyId, contact.stage);
    }
  }

  // Map: referralContactId → referralCompanyId
  const contactToCompany = new Map<string, string>();
  for (const rc of referralContacts) {
    contactToCompany.set(rc.id, rc.referralCompanyId);
  }

  // Map: clientContactId → referralCompanyId (via referralPartnerId)
  const clientToReferralCompany = new Map<string, string>();
  for (const cc of clientContacts) {
    if (cc.referralPartnerId) {
      const companyId = contactToCompany.get(cc.referralPartnerId);
      if (companyId) clientToReferralCompany.set(cc.id, companyId);
    }
  }

  // Opps in quarter date range
  const oppsInQuarter = opportunities.filter((opp) => {
    if (!opp.createdAt) return false;
    const d = new Date(opp.createdAt);
    return d >= qStart && d <= qEnd;
  });

  // Count referrals per company (opps in quarter where source = this company)
  const referralCountByCompany = new Map<string, number>();
  for (const opp of oppsInQuarter) {
    const companyId = clientToReferralCompany.get(opp.clientContactId ?? "");
    if (companyId) {
      referralCountByCompany.set(companyId, (referralCountByCompany.get(companyId) ?? 0) + 1);
    }
  }

  // Conversion targets lookup: (companyId + clerkUserId) → targetId
  const conversionTargetMap = new Map<string, string>(); // `${companyId}::${clerkUserId}` → targetId
  for (const ct of conversionTargets) {
    conversionTargetMap.set(`${ct.companyId}::${ct.selectedByClerkId}`, ct.id);
  }

  // Build per-rep data
  const salesReps = staffMembers.filter((s) => s.role === "TTTSales" || s.role === "TTTAdmin" || s.role === "TTTManager");

  const reps = salesReps.map((rep) => {
    const myCompanies = companies.filter((c) => c.assignedToClerkId === rep.clerkUserId);

    const activePartners = myCompanies
      .filter((c) => companyBestStage.get(c.id) === "Active Referral")
      .map((c) => {
        const priority = c.priority as ReferralPriority;
        const goal = ACTIVE_PARTNER_QUARTERLY_GOAL[priority] ?? 0;
        const actual = referralCountByCompany.get(c.id) ?? 0;
        return { companyId: c.id, companyName: c.name, priority, goal, actual };
      });

    const conversionTargetCompanies = myCompanies.filter((c) => {
      const targetId = conversionTargetMap.get(`${c.id}::${rep.clerkUserId}`);
      return !!targetId && companyBestStage.get(c.id) !== "Active Referral";
    });

    const conversionTargetRows = conversionTargetCompanies.map((c) => {
      const priority = c.priority as ReferralPriority;
      const goal = CONVERSION_TARGET_QUARTERLY_GOAL[priority] ?? 1;
      const actual = referralCountByCompany.get(c.id) ?? 0;
      const targetId = conversionTargetMap.get(`${c.id}::${rep.clerkUserId}`) ?? "";
      return { companyId: c.id, companyName: c.name, priority, goal, actual, targetId, bestStage: companyBestStage.get(c.id) ?? "Identified" };
    });

    const availableToConvert = myCompanies
      .filter((c) => {
        const stage = companyBestStage.get(c.id);
        if (!stage || stage === "Active Referral" || stage === "Inactive Referral") return false;
        return !conversionTargetMap.has(`${c.id}::${rep.clerkUserId}`);
      })
      .map((c) => ({
        companyId: c.id,
        companyName: c.name,
        priority: c.priority as ReferralPriority,
        bestStage: companyBestStage.get(c.id) ?? "Identified",
      }));

    const goal = activePartners.reduce((s, p) => s + p.goal, 0) + conversionTargetRows.reduce((s, p) => s + p.goal, 0);
    const actual = activePartners.reduce((s, p) => s + p.actual, 0) + conversionTargetRows.reduce((s, p) => s + p.actual, 0);

    return {
      clerkUserId: rep.clerkUserId,
      displayName: rep.displayName,
      goal,
      actual,
      activePartners,
      conversionTargets: conversionTargetRows,
      availableToConvert,
    };
  });

  return NextResponse.json({ quarter, reps });
}
