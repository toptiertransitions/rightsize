import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReferralCompanies, getReferralContacts, getClientContacts, getStaffMembers } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";
import type { ReferralContactStage, ReferralPriority } from "@/lib/types";

const ACTIVE_PARTNER_QUARTERLY_GOAL: Record<ReferralPriority, number> = {
  High: 3, Medium: 1, Low: 0, "": 0,
};
const CONVERSION_TARGET_QUARTERLY_GOAL: Record<ReferralPriority, number> = {
  High: 2, Medium: 1, Low: 1, "": 1,
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

interface ConversionTargetRecord { id: string; companyId: string; quarterId: string; selectedByClerkId: string; }

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
      id: r.id, companyId: r.fields["CompanyId"] ?? "", quarterId: r.fields["QuarterId"] ?? "", selectedByClerkId: r.fields["SelectedByClerkId"] ?? "",
    })));
    offset = data.offset as string | undefined;
  } while (offset);
  return all;
}

async function getQuarterById(quarterId: string) {
  const res = await atFetch(AIRTABLE_TABLES.QUARTERS, `/${quarterId}`);
  if (!res.ok) return null;
  const r = await res.json() as { id: string; fields: Record<string, unknown> };
  // Log raw fields to diagnose field name mismatches
  console.log("[plan/route] quarter raw fields:", JSON.stringify(r.fields));
  return {
    id: r.id,
    label: String(r.fields["Label"] ?? ""),
    startDate: String(r.fields["StartDate"] ?? "").trim(),
    endDate: String(r.fields["EndDate"] ?? "").trim(),
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

  const quarter = await getQuarterById(quarterId);
  if (!quarter) return NextResponse.json({ error: "Quarter not found" }, { status: 404 });

  console.log("[plan/route] quarter:", quarter);

  const [companies, referralContacts, clientContacts, staffMembers, conversionTargets] = await Promise.all([
    getReferralCompanies(),
    getReferralContacts(),
    getClientContacts(),
    getStaffMembers().catch(() => []),
    getConversionTargets(quarterId),
  ]);

  console.log(`[plan/route] loaded: ${companies.length} companies, ${referralContacts.length} refContacts, ${clientContacts.length} clientContacts`);

  // bestStage per company
  const companyBestStage = new Map<string, ReferralContactStage>();
  for (const rc of referralContacts) {
    if (!rc.referralCompanyId) continue;
    const current = companyBestStage.get(rc.referralCompanyId);
    if (!current || STAGE_PRIORITY[rc.stage] > STAGE_PRIORITY[current]) {
      companyBestStage.set(rc.referralCompanyId, rc.stage);
    }
  }

  // Set of referral contact IDs per company (exactly matching active-referral-report pattern)
  const refContactIdsByCompany = new Map<string, Set<string>>();
  for (const rc of referralContacts) {
    if (!rc.referralCompanyId) continue;
    const s = refContactIdsByCompany.get(rc.referralCompanyId) ?? new Set<string>();
    s.add(rc.id);
    refContactIdsByCompany.set(rc.referralCompanyId, s);
  }

  // Parse quarter date range — match active-referral-report's use of Date objects
  const qStartDate = new Date(quarter.startDate + "T00:00:00.000Z");
  const qEndDate = new Date(quarter.endDate + "T23:59:59.999Z");

  console.log(`[plan/route] quarter window: ${qStartDate.toISOString()} → ${qEndDate.toISOString()}`);

  // Diagnostic: how many client contacts have referralPartnerId and valid dates
  const ccWithPartner = clientContacts.filter(cc => !!cc.referralPartnerId);
  console.log(`[plan/route] clientContacts with referralPartnerId: ${ccWithPartner.length}`);
  if (ccWithPartner.length > 0) {
    // Log first few to inspect
    console.log("[plan/route] sample cc:", JSON.stringify(ccWithPartner.slice(0, 3).map(cc => ({
      id: cc.id, referralPartnerId: cc.referralPartnerId, createdAt: cc.createdAt,
    }))));
  }

  // Count referrals per company — mirror active-referral-report's inner loop exactly
  const referralCountByCompany = new Map<string, number>();
  for (const company of companies) {
    const refContactIds = refContactIdsByCompany.get(company.id) ?? new Set<string>();
    if (refContactIds.size === 0) continue;
    let count = 0;
    for (const cc of clientContacts) {
      if (!cc.referralPartnerId || !refContactIds.has(cc.referralPartnerId)) continue;
      if (!cc.createdAt) continue;
      const d = new Date(cc.createdAt);
      if (isNaN(d.getTime())) continue;
      if (d >= qStartDate && d <= qEndDate) count++;
    }
    if (count > 0) {
      referralCountByCompany.set(company.id, count);
      console.log(`[plan/route] company "${company.name}" got ${count} referrals in quarter`);
    }
  }

  console.log(`[plan/route] total companies with referrals: ${referralCountByCompany.size}`);

  // Conversion targets
  const conversionTargetMap = new Map<string, string>();
  for (const ct of conversionTargets) {
    conversionTargetMap.set(`${ct.companyId}::${ct.selectedByClerkId}`, ct.id);
  }

  const salesReps = staffMembers.filter((s) => s.role === "TTTSales");
  console.log(`[plan/route] TTTSales reps: ${salesReps.map(r => r.displayName).join(", ")}`);

  const reps = salesReps.map((rep) => {
    const myCompanies = companies.filter((c) => c.assignedToClerkId === rep.clerkUserId);
    console.log(`[plan/route] rep "${rep.displayName}" (${rep.clerkUserId}): ${myCompanies.length} assigned companies`);

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
      .map((c) => ({
        companyId: c.id, companyName: c.name,
        priority: c.priority as ReferralPriority,
        goal: CONVERSION_TARGET_QUARTERLY_GOAL[c.priority as ReferralPriority] ?? 1,
        actual: referralCountByCompany.get(c.id) ?? 0,
        targetId: conversionTargetMap.get(`${c.id}::${rep.clerkUserId}`) ?? "",
        bestStage: companyBestStage.get(c.id) ?? "Identified",
      }));

    const availableToConvert = myCompanies
      .filter((c) => companyBestStage.get(c.id) !== "Active Referral" && !conversionTargetMap.has(`${c.id}::${rep.clerkUserId}`))
      .map((c) => ({
        companyId: c.id, companyName: c.name,
        priority: c.priority as ReferralPriority,
        bestStage: companyBestStage.get(c.id) ?? "No contacts yet",
      }));

    const goal = activePartners.reduce((s, p) => s + p.goal, 0) + conversionTargetRows.reduce((s, p) => s + p.goal, 0);
    const actual = activePartners.reduce((s, p) => s + p.actual, 0) + conversionTargetRows.reduce((s, p) => s + p.actual, 0);

    return { clerkUserId: rep.clerkUserId, displayName: rep.displayName, goal, actual, activePartners, conversionTargets: conversionTargetRows, availableToConvert };
  });

  return NextResponse.json({ quarter, reps });
}
