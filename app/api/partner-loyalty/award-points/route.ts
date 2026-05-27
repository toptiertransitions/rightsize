import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, findReferralContactByClerkUserId, getReferralCompanyById } from "@/lib/airtable";
import {
  getLoyaltyRecord,
  createLoyaltyRecord,
  updateLoyaltyRecord,
  createLedgerEntry,
} from "@/lib/airtable-loyalty";
import {
  TIERS,
  getTierForPoints,
  getTierIndex,
  getCurrentProgramYear,
  isProgramYearReset,
} from "@/lib/loyalty";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  const isStaff = sysRole && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole);
  if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { partnerId: string; projectId?: string; projectName?: string };
  const { partnerId, projectId = "", projectName = "" } = body;
  if (!partnerId) return NextResponse.json({ error: "Missing partnerId" }, { status: 400 });

  const programYear = getCurrentProgramYear();
  const now = new Date().toISOString();

  // ── Resolve partner info from CRM ─────────────────────────────────────────
  const contact = await findReferralContactByClerkUserId(partnerId).catch(() => null);
  const companyId = contact?.referralCompanyId || null;
  const company = companyId ? await getReferralCompanyById(companyId).catch(() => null) : null;
  const companyName = company?.name || contact?.name || partnerId;
  const partnerName = contact?.name || "";
  const partnerEmail = contact?.email || "";

  // ── Get or create loyalty record ──────────────────────────────────────────
  let record = await getLoyaltyRecord(partnerId);

  if (!record) {
    record = await createLoyaltyRecord({
      partnerId,
      partnerName,
      partnerEmail,
      companyName,
      currentTier: "None",
      currentYearPoints: 0,
      lifetimePoints: 0,
      currentProgramYear: programYear,
      currentMultiplier: 1,
      silverBonusApplied: false,
    });
  }

  // ── Inline year reset if program year changed ─────────────────────────────
  if (isProgramYearReset(record.currentProgramYear)) {
    const resetDelta = -record.currentYearPoints;
    await createLedgerEntry({
      partnerId,
      companyName: record.companyName,
      eventType: "year_reset",
      pointsDelta: resetDelta,
      pointsBalanceAfter: record.lifetimePoints + resetDelta,
      tierBefore: record.currentTier,
      tierAfter: record.currentTier,
      note: `Year reset: ${record.currentProgramYear} → ${programYear}`,
      createdAt: now,
      programYear,
    });
    record = await updateLoyaltyRecord(record.id, {
      currentYearPoints: 0,
      currentProgramYear: programYear,
    });
  }

  // ── Award points ──────────────────────────────────────────────────────────
  const tierBefore = record.currentTier;
  const pointsToAward = 1 * record.currentMultiplier;
  let newYearPoints = record.currentYearPoints + pointsToAward;
  let newLifetimePoints = record.lifetimePoints + pointsToAward;

  // Tier upgrades only go up during the year (no mid-year downgrades)
  let newTier = record.currentTier;
  let newMultiplier = record.currentMultiplier;
  const newTierData = getTierForPoints(newYearPoints);
  if (getTierIndex(newTierData.name) > getTierIndex(record.currentTier)) {
    newTier = newTierData.name;
    newMultiplier = newTierData.multiplier;
  }

  // ── Silver one-time bonus ─────────────────────────────────────────────────
  let bonusAwarded = 0;
  if (!record.silverBonusApplied && newYearPoints >= TIERS[1].threshold) {
    bonusAwarded = 5;
    const balanceAfterBonus = newLifetimePoints + bonusAwarded;
    newYearPoints += bonusAwarded;
    newLifetimePoints += bonusAwarded;

    // Re-evaluate tier after bonus
    const bonusTier = getTierForPoints(newYearPoints);
    if (getTierIndex(bonusTier.name) > getTierIndex(newTier)) {
      newTier = bonusTier.name;
      newMultiplier = bonusTier.multiplier;
    }

    await createLedgerEntry({
      partnerId,
      companyName,
      eventType: "silver_one_time_bonus",
      pointsDelta: bonusAwarded,
      pointsBalanceAfter: balanceAfterBonus,
      tierBefore,
      tierAfter: newTier,
      note: "One-time Silver milestone bonus",
      createdAt: now,
      programYear,
    });
  }

  const tieredUp = newTier !== tierBefore;
  const statusEarnedYear = tieredUp ? programYear : record.statusEarnedYear;

  // ── Write main ledger entry ───────────────────────────────────────────────
  await createLedgerEntry({
    partnerId,
    companyName,
    eventType: "project_completed",
    pointsDelta: pointsToAward,
    pointsBalanceAfter: newLifetimePoints,
    tierBefore,
    tierAfter: newTier,
    relatedProjectId: projectId,
    note: projectName ? `Project: ${projectName}` : "Completed project referral",
    createdAt: now,
    programYear,
  });

  // ── Persist updated loyalty record ────────────────────────────────────────
  record = await updateLoyaltyRecord(record.id, {
    partnerName,
    partnerEmail,
    companyName,
    currentTier: newTier,
    currentYearPoints: newYearPoints,
    lifetimePoints: newLifetimePoints,
    currentMultiplier: newMultiplier,
    silverBonusApplied: bonusAwarded > 0 ? true : record.silverBonusApplied,
    statusEarnedYear,
  });

  return NextResponse.json({
    success: true,
    pointsAwarded: pointsToAward,
    bonusAwarded,
    newBalance: newLifetimePoints,
    tierBefore,
    tierAfter: newTier,
    tieredUp,
  });
}
