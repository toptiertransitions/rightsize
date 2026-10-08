// DEPLOY: Add AIStatus (Long text), AIStatusAt (Single line text), AIStatusHistory (Long text)
// to QuarterlyCompanyPlans table in Airtable before using this feature.

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";
import { generatePartnerAIStatus, fetchAllRecs, str } from "@/lib/partner-ai-status";

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

  const { status: newStatus, statusAt: newStatusAt } = await generatePartnerAIStatus(companyId, quarterId);
  return NextResponse.json({ status: newStatus, statusAt: newStatusAt });
}
