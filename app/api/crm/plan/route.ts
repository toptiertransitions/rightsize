import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReferralCompanies, getReferralContacts, getClientContacts, getStaffMembers } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";
import type { ReferralContactStage, ReferralPriority } from "@/lib/types";
// ReferralContactStage used for STAGE_PRIORITY keys and companyBestStage values

// ─── Quarterly goal constants ─────────────────────────────────────────────────
// Referrals/quarter expected from an Active Referral partner, by company priority
const ACTIVE_PARTNER_QUARTERLY_GOAL: Record<ReferralPriority, number> = {
  High: 3,
  Medium: 1,
  Low: 0,
  "": 0,
};
// Referrals/quarter hoped for from a company being converted this quarter
const CONVERSION_TARGET_QUARTERLY_GOAL: Record<ReferralPriority, number> = {
  High: 2,
  Medium: 1,
  Low: 1,
  "": 1,
};

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
    offset = data.offset as string | undefined;
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

  const quarter = await getQuarterById(quarterId);
  if (!quarter) return NextResponse.json({ error: "Quarter not found" }, { status: 404 });

  const [companies, referralContacts, clientContacts, staffMembers, conversionTargets] = await Promise.all([
    getReferralCompanies(),
    getReferralContacts(),
    getClientContacts(),
    getStaffMembers().catch(() => []),
    getConversionTargets(quarterId),
  ]);

  // ── bestStage per company: highest stage across all its contacts ──────────
  const companyBestStage = new Map<string, ReferralContactStage>();
  for (const rc of referralContacts) {
    if (!rc.referralCompanyId) continue;
    const current = companyBestStage.get(rc.referralCompanyId);
    if (!current || STAGE_PRIORITY[rc.stage] > STAGE_PRIORITY[current]) {
      companyBestStage.set(rc.referralCompanyId, rc.stage);
    }
  }

  // ── referral contact IDs per company (for counting) ───────────────────────
  // Matches the active referral report's logic exactly:
  //   a "referral received" = a ClientContact created in the quarter
  //   whose referralPartnerId belongs to one of this company's referral contacts
  const refContactIdsByCompany = new Map<string, Set<string>>();
  for (const rc of referralContacts) {
    if (!rc.referralCompanyId) continue;
    const s = refContactIdsByCompany.get(rc.referralCompanyId) ?? new Set<string>();
    s.add(rc.id);
    refContactIdsByCompany.set(rc.referralCompanyId, s);
  }

  // ── count client contacts (referrals) created in the quarter by company ───
  const qStart = quarter.startDate; // "YYYY-MM-DD" — string compare works for ISO dates
  const qEnd = quarter.endDate;

  const referralCountByCompany = new Map<string, number>();
  for (const cc of clientContacts) {
    if (!cc.referralPartnerId || !cc.createdAt) continue;
    // Slice to date portion only; createdAt may be full ISO datetime
    const dateStr = cc.createdAt.slice(0, 10);
    if (dateStr < qStart || dateStr > qEnd) continue;

    // Walk: cc.referralPartnerId → referral contact → company
    // Check every company to see if this referral contact belongs to it
    for (const [companyId, rcIds] of refContactIdsByCompany) {
      if (rcIds.has(cc.referralPartnerId)) {
        referralCountByCompany.set(companyId, (referralCountByCompany.get(companyId) ?? 0) + 1);
        break; // a referral contact only belongs to one company
      }
    }
  }

  // ── conversion targets lookup ─────────────────────────────────────────────
  const conversionTargetMap = new Map<string, string>(); // `${companyId}::${clerkUserId}` → targetId
  for (const ct of conversionTargets) {
    conversionTargetMap.set(`${ct.companyId}::${ct.selectedByClerkId}`, ct.id);
  }

  // ── only TTTSales users appear in the plan ────────────────────────────────
  const salesReps = staffMembers.filter((s) => s.role === "TTTSales");

  const reps = salesReps.map((rep) => {
    const myCompanies = companies.filter((c) => c.assignedToClerkId === rep.clerkUserId);

    const activePartners = myCompanies
      .filter((c) => companyBestStage.get(c.id) === "Active Referral")
      .map((c) => ({
        companyId: c.id,
        companyName: c.name,
        priority: c.priority as ReferralPriority,
        goal: ACTIVE_PARTNER_QUARTERLY_GOAL[c.priority as ReferralPriority] ?? 0,
        actual: referralCountByCompany.get(c.id) ?? 0,
      }));

    const conversionTargetRows = myCompanies
      .filter((c) => conversionTargetMap.has(`${c.id}::${rep.clerkUserId}`) && companyBestStage.get(c.id) !== "Active Referral")
      .map((c) => ({
        companyId: c.id,
        companyName: c.name,
        priority: c.priority as ReferralPriority,
        goal: CONVERSION_TARGET_QUARTERLY_GOAL[c.priority as ReferralPriority] ?? 1,
        actual: referralCountByCompany.get(c.id) ?? 0,
        targetId: conversionTargetMap.get(`${c.id}::${rep.clerkUserId}`) ?? "",
        bestStage: companyBestStage.get(c.id) ?? "Identified",
      }));

    // Available to convert: any company assigned to this rep that is NOT already
    // an Active Referral partner AND is NOT already a selected conversion target.
    // Includes companies with no stage yet and Inactive Referral (to reactivate).
    const availableToConvert = myCompanies
      .filter((c) => {
        if (companyBestStage.get(c.id) === "Active Referral") return false;
        if (conversionTargetMap.has(`${c.id}::${rep.clerkUserId}`)) return false;
        return true;
      })
      .map((c) => ({
        companyId: c.id,
        companyName: c.name,
        priority: c.priority as ReferralPriority,
        bestStage: companyBestStage.get(c.id) ?? "No contacts yet",
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
