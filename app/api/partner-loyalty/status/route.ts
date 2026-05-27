import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPartnerContact } from "@/lib/partner";
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

  const partnerId = req.nextUrl.searchParams.get("partnerId") ?? userId;

  // Partners can only view their own; staff can view any
  if (partnerId !== userId) {
    const contact = await getPartnerContact(userId).catch(() => null);
    if (!contact) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const programYear = getCurrentProgramYear();
  const { start, end } = getProgramYearLabel(programYear);

  const record = await getLoyaltyRecord(partnerId);
  const recentActivity = record ? await getLedgerEntries(partnerId, 10) : [];

  if (!record) {
    return NextResponse.json({
      partnerId,
      companyName: "",
      partnerName: "",
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
    partnerId,
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
