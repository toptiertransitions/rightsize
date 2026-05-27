import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getLoyaltyRecord, updateLoyaltyRecord, createLedgerEntry } from "@/lib/airtable-loyalty";
import { getTierForPoints, getTierIndex, getCurrentProgramYear } from "@/lib/loyalty";

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

  const newYearPoints = record.currentYearPoints + pointsDelta;
  const newLifetimePoints = record.lifetimePoints + pointsDelta;

  if (newLifetimePoints < 0) {
    return NextResponse.json({ error: "Redemption would result in negative balance" }, { status: 400 });
  }

  const tierBefore = record.currentTier;
  let newTier = record.currentTier;
  let newMultiplier = record.currentMultiplier;

  if (pointsDelta > 0) {
    // Bonus: only upgrade tier
    const newTierData = getTierForPoints(newYearPoints);
    if (getTierIndex(newTierData.name) > getTierIndex(record.currentTier)) {
      newTier = newTierData.name;
      newMultiplier = newTierData.multiplier;
    }
  } else {
    // Redemption: no tier change (tiers only move down at year reset)
  }

  const programYear = getCurrentProgramYear();

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
    createdAt: new Date().toISOString(),
    programYear,
  });

  await updateLoyaltyRecord(record.id, {
    currentTier: newTier,
    currentYearPoints: Math.max(0, newYearPoints),
    lifetimePoints: newLifetimePoints,
    currentMultiplier: newMultiplier,
  });

  return NextResponse.json({ success: true, newBalance: newLifetimePoints, tierAfter: newTier });
}
