import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReferralCompanies, getReferralContacts, getClientContacts, getStaffMembers } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";
import type { ReferralContactStage, ReferralPriority } from "@/lib/types";

// Quarterly goals per company by priority
const ACTIVE_PARTNER_QUARTERLY_GOAL: Record<ReferralPriority, number> = {
  High: 9, Medium: 3, Low: 0, "": 0,
};
const CONVERSION_TARGET_QUARTERLY_GOAL: Record<ReferralPriority, number> = {
  High: 6, Medium: 3, Low: 3, "": 3,
};
const STAGE_PRIORITY: Record<ReferralContactStage, number> = {
  "Inactive Referral": 0, "Identified": 1, "Met": 2,
  "Agreed to Refer": 3, "Shared Leads": 4, "Active Referral": 5,
};

function atFetch(table: string, path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

interface ConversionTargetRecord {
  id: string;
  companyId: string;
  quarterId: string;
  selectedByClerkId: string;
  startingStage: string;
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
    all.push(...(data.records as { id: string; fields: Record<string, string> }[]).map((r) => ({
      id: r.id,
      companyId: r.fields["CompanyId"] ?? "",
      quarterId: r.fields["QuarterId"] ?? "",
      selectedByClerkId: r.fields["SelectedByClerkId"] ?? "",
      startingStage: r.fields["StartingStage"] ?? "",
    })));
    offset = data.offset as string | undefined;
  } while (offset);
  return all;
}

interface RepGoalRecord { clerkUserId: string; goal: number; }

async function getRepQuarterlyGoals(quarterId: string): Promise<RepGoalRecord[]> {
  const formula = encodeURIComponent(`{QuarterId} = "${quarterId}"`);
  const all: RepGoalRecord[] = [];
  let offset: string | undefined;
  do {
    const qs = `?filterByFormula=${formula}${offset ? `&offset=${offset}` : ""}`;
    const res = await atFetch(AIRTABLE_TABLES.REP_QUARTERLY_GOALS, qs);
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.records as { id: string; fields: Record<string, unknown> }[]).map((r) => ({
      clerkUserId: String(r.fields["ClerkUserId"] ?? ""),
      goal: Number(r.fields["Goal"] ?? 0),
    })));
    offset = data.offset as string | undefined;
  } while (offset);
  return all;
}

async function getQuarterById(quarterId: string) {
  const res = await atFetch(AIRTABLE_TABLES.QUARTERS, `/${quarterId}`);
  if (!res.ok) return null;
  const r = await res.json() as { id: string; fields: Record<string, unknown> };
  return {
    id: r.id,
    label: String(r.fields["Label"] ?? ""),
    startDate: String(r.fields["StartDate"] ?? "").trim(),
    endDate: String(r.fields["EndDate"] ?? "").trim(),
    _rawFields: r.fields,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sysRole = await getSystemRole(userId);
    if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const quarterId = req.nextUrl.searchParams.get("quarterId");
    if (!quarterId) return NextResponse.json({ error: "quarterId required" }, { status: 400 });

    const quarter = await getQuarterById(quarterId);
    if (!quarter) return NextResponse.json({ error: "Quarter not found" }, { status: 404 });

    const [companies, referralContacts, clientContacts, staffMembers, conversionTargets, repGoalRecords] = await Promise.all([
      getReferralCompanies().catch((e) => { console.error("getReferralCompanies failed", e); return []; }),
      getReferralContacts().catch((e) => { console.error("getReferralContacts failed", e); return []; }),
      getClientContacts().catch((e) => { console.error("getClientContacts failed", e); return []; }),
      getStaffMembers().catch((e) => { console.error("getStaffMembers failed", e); return []; }),
      getConversionTargets(quarterId).catch(() => []),
      getRepQuarterlyGoals(quarterId).catch(() => []),
    ]);

    // bestStage per company
    const companyBestStage = new Map<string, ReferralContactStage>();
    for (const rc of referralContacts) {
      if (!rc.referralCompanyId) continue;
      const current = companyBestStage.get(rc.referralCompanyId);
      if (!current || STAGE_PRIORITY[rc.stage] > STAGE_PRIORITY[current]) {
        companyBestStage.set(rc.referralCompanyId, rc.stage);
      }
    }

    // referral contact IDs per company
    const refContactIdsByCompany = new Map<string, Set<string>>();
    for (const rc of referralContacts) {
      if (!rc.referralCompanyId) continue;
      const s = refContactIdsByCompany.get(rc.referralCompanyId) ?? new Set<string>();
      s.add(rc.id);
      refContactIdsByCompany.set(rc.referralCompanyId, s);
    }

    // Parse quarter date range
    const qStartDate = new Date((quarter.startDate || "9999-01-01") + "T00:00:00.000Z");
    const qEndDate = new Date((quarter.endDate || "9999-01-01") + "T23:59:59.999Z");
    const datesValid = quarter.startDate && quarter.endDate &&
      !isNaN(qStartDate.getTime()) && !isNaN(qEndDate.getTime());

    // Count referrals per company within the quarter date range
    const referralCountByCompany = new Map<string, number>();
    if (datesValid) {
      for (const company of companies) {
        const refContactIds = refContactIdsByCompany.get(company.id) ?? new Set<string>();
        if (refContactIds.size === 0) continue;
        let count = 0;
        for (const cc of clientContacts) {
          if (!cc.referralPartnerId || !refContactIds.has(cc.referralPartnerId)) continue;
          if (!cc.createdAt) continue;
          const d = new Date(cc.createdAt);
          if (isNaN(d.getTime()) || d < qStartDate || d > qEndDate) continue;
          count++;
        }
        if (count > 0) referralCountByCompany.set(company.id, count);
      }
    }

    // Conversion targets: keyed by companyId::repClerkUserId
    const conversionTargetMap = new Map<string, string>();
    const startingStageMap = new Map<string, string>();
    for (const ct of conversionTargets) {
      const key = `${ct.companyId}::${ct.selectedByClerkId}`;
      conversionTargetMap.set(key, ct.id);
      startingStageMap.set(key, ct.startingStage);
    }

    // Rep quarterly goals
    const repGoalMap = new Map<string, number>();
    for (const rg of repGoalRecords) {
      if (rg.clerkUserId) repGoalMap.set(rg.clerkUserId, rg.goal);
    }

    const salesReps = staffMembers.filter((s) => s.role === "TTTSales");

    const reps = salesReps.map((rep) => {
      const myCompanies = companies.filter((c) => c.assignedToClerkId === rep.clerkUserId);

      const activePartners = myCompanies
        .filter((c) => companyBestStage.get(c.id) === "Active Referral")
        .map((c) => ({
          companyId: c.id, companyName: c.name,
          priority: c.priority as ReferralPriority,
          goal: ACTIVE_PARTNER_QUARTERLY_GOAL[c.priority as ReferralPriority] ?? 0,
          actual: referralCountByCompany.get(c.id) ?? 0,
        }));

      const conversionTargetRows = myCompanies
        .filter((c) => conversionTargetMap.has(`${c.id}::${rep.clerkUserId}`) && companyBestStage.get(c.id) !== "Active Referral")
        .map((c) => {
          const key = `${c.id}::${rep.clerkUserId}`;
          return {
            companyId: c.id, companyName: c.name,
            priority: c.priority as ReferralPriority,
            goal: CONVERSION_TARGET_QUARTERLY_GOAL[c.priority as ReferralPriority] ?? 3,
            actual: referralCountByCompany.get(c.id) ?? 0,
            targetId: conversionTargetMap.get(key) ?? "",
            bestStage: companyBestStage.get(c.id) ?? "Identified",
            startingStage: startingStageMap.get(key) ?? "",
          };
        });

      const availableToConvert = myCompanies
        .filter((c) => companyBestStage.get(c.id) !== "Active Referral" && !conversionTargetMap.has(`${c.id}::${rep.clerkUserId}`))
        .map((c) => ({
          companyId: c.id, companyName: c.name,
          priority: c.priority as ReferralPriority,
          bestStage: companyBestStage.get(c.id) ?? "No contacts yet",
        }));

      const computedGoal = activePartners.reduce((s, p) => s + p.goal, 0) + conversionTargetRows.reduce((s, p) => s + p.goal, 0);
      const repGoal = repGoalMap.has(rep.clerkUserId) ? repGoalMap.get(rep.clerkUserId)! : null;
      const goal = repGoal ?? computedGoal;
      const actual = activePartners.reduce((s, p) => s + p.actual, 0) + conversionTargetRows.reduce((s, p) => s + p.actual, 0);

      return {
        clerkUserId: rep.clerkUserId,
        displayName: rep.displayName,
        goal,
        actual,
        repGoal,
        activePartners,
        conversionTargets: conversionTargetRows,
        availableToConvert,
      };
    });

    const debug = {
      quarterStartDate: quarter.startDate,
      quarterEndDate: quarter.endDate,
      quarterRawFields: quarter._rawFields,
      datesValid,
      qStartParsed: datesValid ? qStartDate.toISOString() : "INVALID/MISSING",
      qEndParsed: datesValid ? qEndDate.toISOString() : "INVALID/MISSING",
      totalCompanies: companies.length,
      totalReferralContacts: referralContacts.length,
      totalClientContacts: clientContacts.length,
      referralCountByCompany: Object.fromEntries(referralCountByCompany),
      salesReps: salesReps.map(r => ({ displayName: r.displayName, clerkUserId: r.clerkUserId })),
    };

    return NextResponse.json({
      quarter: { id: quarter.id, label: quarter.label, startDate: quarter.startDate, endDate: quarter.endDate },
      reps,
      debug,
    });
  } catch (err) {
    console.error("[plan/route] unhandled error:", err);
    return NextResponse.json({ error: String(err), reps: [], quarter: null }, { status: 500 });
  }
}
