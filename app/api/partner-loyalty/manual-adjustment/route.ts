import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getLoyaltyRecord, updateLoyaltyRecord, createLedgerEntry } from "@/lib/airtable-loyalty";
import { getTierForPoints, getTierIndex, getCurrentProgramYear, TIERS } from "@/lib/loyalty";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    partnerId: string;
    pointsDelta: number;
    eventType: "manual_bonus" | "manual_redemption";
    note: string;
  };
  const { partnerId, pointsDelta, eventType, note } = body;

  if (!partnerId || typeof pointsDelta !== "number" || !eventType || !note) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const record = await getLoyaltyRecord(partnerId);
  if (!record) return NextResponse.json({ error: "Loyalty record not found" }, { status: 404 });

  let newYearPoints = record.currentYearPoints + pointsDelta;
  let newLifetimePoints = record.lifetimePoints + pointsDelta;

  if (newLifetimePoints < 0) {
    return NextResponse.json({ error: "Adjustment would result in a negative balance" }, { status: 400 });
  }

  const tierBefore = record.currentTier;
  let newTier = record.currentTier;
  let newMultiplier = record.currentMultiplier;
  const programYear = getCurrentProgramYear();
  const now = new Date().toISOString();
  let statusEarnedYear = record.statusEarnedYear;

  if (pointsDelta > 0) {
    // Upward adjustment: only upgrade tier, same rule as an earned point
    const newTierData = getTierForPoints(newYearPoints);
    if (getTierIndex(newTierData.name) > getTierIndex(record.currentTier)) {
      newTier = newTierData.name;
      newMultiplier = newTierData.multiplier;
      statusEarnedYear = programYear;
    }
  } else {
    // Downward adjustment: no tier change (tiers only move down at year reset)
  }

  await createLedgerEntry({
    partnerId,
    companyName: record.companyName,
    eventType,
    pointsDelta,
    pointsBalanceAfter: newLifetimePoints,
    tierBefore,
    tierAfter: newTier,
    adminUserId: userId,
    note,
    createdAt: now,
    programYear,
  });

  // Same one-time Silver milestone bonus (+5 pts) the live award path
  // applies — an upward adjustment that crosses the Silver threshold
  // should trigger it too, not just points earned from a completed project.
  let silverBonusApplied = record.silverBonusApplied;
  if (!silverBonusApplied && newYearPoints >= TIERS[1].threshold) {
    const balanceAfterBonus = newLifetimePoints + 5;
    newYearPoints += 5;
    newLifetimePoints += 5;
    silverBonusApplied = true;
    const bonusTier = getTierForPoints(newYearPoints);
    if (getTierIndex(bonusTier.name) > getTierIndex(newTier)) {
      newTier = bonusTier.name;
      newMultiplier = bonusTier.multiplier;
      statusEarnedYear = programYear;
    }
    await createLedgerEntry({
      partnerId, companyName: record.companyName, eventType: "silver_one_time_bonus",
      pointsDelta: 5, pointsBalanceAfter: balanceAfterBonus,
      tierBefore, tierAfter: newTier,
      note: "One-time Silver milestone bonus", createdAt: now, programYear,
    });
  }

  await updateLoyaltyRecord(record.id, {
    currentTier: newTier,
    currentYearPoints: Math.max(0, newYearPoints),
    lifetimePoints: newLifetimePoints,
    currentMultiplier: newMultiplier,
    silverBonusApplied,
    statusEarnedYear,
  });

  return NextResponse.json({ success: true, newBalance: newLifetimePoints, tierAfter: newTier });
}
