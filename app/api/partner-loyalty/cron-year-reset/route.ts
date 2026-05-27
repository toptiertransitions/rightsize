import { NextRequest, NextResponse } from "next/server";
import { getAllLoyaltyRecords, updateLoyaltyRecord, createLedgerEntry } from "@/lib/airtable-loyalty";
import { getTierForPoints, getCurrentProgramYear } from "@/lib/loyalty";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const programYear = getCurrentProgramYear();
  const now = new Date().toISOString();
  const records = await getAllLoyaltyRecords();

  const results: { partnerId: string; tierBefore: string; tierAfter: string; pointsReset: number }[] = [];

  for (const record of records) {
    if (record.currentProgramYear >= programYear) continue; // Already reset

    // Determine carried tier based on year-end points
    const finalTierData = getTierForPoints(record.currentYearPoints);

    await createLedgerEntry({
      partnerId: record.partnerId,
      companyName: record.companyName,
      eventType: "year_reset",
      pointsDelta: -record.currentYearPoints,
      pointsBalanceAfter: record.lifetimePoints,
      tierBefore: record.currentTier,
      tierAfter: finalTierData.name,
      note: `Annual reset: year ${record.currentProgramYear} ended. Carried tier: ${finalTierData.name}.`,
      createdAt: now,
      programYear,
    });

    await updateLoyaltyRecord(record.id, {
      currentYearPoints: 0,
      currentTier: finalTierData.name,
      currentMultiplier: finalTierData.multiplier,
      currentProgramYear: programYear,
      statusEarnedYear: finalTierData.name !== "None" ? record.currentProgramYear : record.statusEarnedYear,
    });

    results.push({
      partnerId: record.partnerId,
      tierBefore: record.currentTier,
      tierAfter: finalTierData.name,
      pointsReset: record.currentYearPoints,
    });
  }

  return NextResponse.json({
    success: true,
    partnersReset: results.length,
    programYear,
    results,
  });
}

// Also allow GET for Vercel cron (Vercel calls via GET by default)
export async function GET(req: NextRequest) {
  return POST(req);
}
