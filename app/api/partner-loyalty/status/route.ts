import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { findReferralContactByClerkUserId, getReferralCompanyById } from "@/lib/airtable";
import { getLoyaltyRecord, getLedgerEntries } from "@/lib/airtable-loyalty";
import {
  getNextTier,
  getPointsToNextTier,
  getPercentToNextTier,
  getCurrentProgramYear,
  getProgramYearLabel,
} from "@/lib/loyalty";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // partnerId in the query string is always a Clerk user ID (from the partner's own session)
  const clerkId = req.nextUrl.searchParams.get("partnerId") ?? userId;
  if (clerkId !== userId) {
    // Cross-user lookup: only allow staff (handled downstream if needed).
    // For now, partners can only view themselves.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Resolve to company-level loyalty key ──────────────────────────────────
  const contact = await findReferralContactByClerkUserId(clerkId).catch(() => null);
  const companyId = contact?.referralCompanyId || null;
  const company = companyId ? await getReferralCompanyById(companyId).catch(() => null) : null;
  const loyaltyKey = companyId || clerkId;
  const companyName = company?.name || contact?.name || "";

  const programYear = getCurrentProgramYear();
  const { start, end } = getProgramYearLabel(programYear);

  const record = await getLoyaltyRecord(loyaltyKey);
  const recentActivity = record ? await getLedgerEntries(loyaltyKey, 10) : [];

  if (!record) {
    return NextResponse.json({
      partnerId: loyaltyKey,
      companyName,
      partnerName: contact?.name ?? "",
      currentTier: "None",
      currentYearPoints: 0,
      currentMultiplier: 1,
      lifetimePoints: 0,
      programYear,
      programYearStartDate: start,
      programYearEndDate: end,
      nextTier: "Silver",
      pointsToNextTier: 10,
      percentToNextTier: 0,
      recentActivity: [],
      isNew: true,
    });
  }

  const nextTierData = getNextTier(record.currentTier);

  return NextResponse.json({
    partnerId: loyaltyKey,
    companyName: record.companyName,
    partnerName: record.partnerName,
    currentTier: record.currentTier,
    currentYearPoints: record.currentYearPoints,
    currentMultiplier: record.currentMultiplier,
    lifetimePoints: record.lifetimePoints,
    programYear,
    programYearStartDate: start,
    programYearEndDate: end,
    nextTier: nextTierData?.name ?? null,
    pointsToNextTier: getPointsToNextTier(record.currentYearPoints, record.currentTier),
    percentToNextTier: getPercentToNextTier(record.currentYearPoints, record.currentTier),
    recentActivity,
    isNew: false,
  });
}
