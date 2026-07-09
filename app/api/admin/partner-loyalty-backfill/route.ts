import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getReferralContacts,
  getReferralCompanies,
  getClientContacts,
  getOpportunities,
} from "@/lib/airtable";
import {
  getLoyaltyRecord,
  createLoyaltyRecord,
  createLedgerEntry,
  getAllLoyaltyRecords,
} from "@/lib/airtable-loyalty";
import { getTierForPoints, getCurrentProgramYear } from "@/lib/loyalty";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch everything in parallel
  const [referralContacts, companies, clientContacts, allOpportunities, existingLoyalty] = await Promise.all([
    getReferralContacts(),
    getReferralCompanies(),
    getClientContacts(),
    getOpportunities(),
    getAllLoyaltyRecords(),
  ]);

  const companyMap = new Map(companies.map(c => [c.id, c]));
  const existingKeys = new Set(existingLoyalty.map(r => r.partnerId));

  // Build referralContact → client contacts map
  const refToClientContacts = new Map<string, string[]>();
  for (const cc of clientContacts) {
    if (!cc.referralPartnerId) continue;
    const arr = refToClientContacts.get(cc.referralPartnerId) ?? [];
    arr.push(cc.id);
    refToClientContacts.set(cc.referralPartnerId, arr);
  }

  // Build clientContactId → won opportunities count
  const wonCountByClientContact = new Map<string, number>();
  for (const opp of allOpportunities) {
    if (opp.stage !== "Won") continue;
    wonCountByClientContact.set(opp.clientContactId, (wonCountByClientContact.get(opp.clientContactId) ?? 0) + 1);
  }

  const programYear = getCurrentProgramYear();
  const now = new Date().toISOString();
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // Deduplicate by loyaltyKey — multiple contacts at the same company share one loyalty record
  const processedKeys = new Set<string>();

  for (const contact of referralContacts.filter(c => c.stage === "Active Referral")) {
    const ccIds = refToClientContacts.get(contact.id) ?? [];
    const wonCount = ccIds.reduce((sum, ccId) => sum + (wonCountByClientContact.get(ccId) ?? 0), 0);

    if (wonCount === 0) continue;

    const companyId = contact.referralCompanyId || null;
    const company = companyId ? companyMap.get(companyId) : null;
    const loyaltyKey = companyId || contact.clerkUserId || contact.id;
    const companyName = company?.name || contact.name || loyaltyKey;

    if (existingKeys.has(loyaltyKey) || processedKeys.has(loyaltyKey)) {
      skipped.push(`${contact.name} (${companyName}) — record already exists`);
      continue;
    }

    try {
      // Double-check live (in case of race or stale getAllLoyaltyRecords cache)
      const live = await getLoyaltyRecord(loyaltyKey);
      if (live) {
        skipped.push(`${contact.name} (${companyName}) — record already exists`);
        processedKeys.add(loyaltyKey);
        continue;
      }

      const tierData = getTierForPoints(wonCount);
      const record = await createLoyaltyRecord({
        partnerId: loyaltyKey,
        partnerName: contact.name,
        partnerEmail: contact.email,
        companyName,
        currentTier: tierData.name,
        currentYearPoints: wonCount,
        lifetimePoints: wonCount,
        currentProgramYear: programYear,
        currentMultiplier: tierData.multiplier,
        silverBonusApplied: false,
        notes: `Backfilled ${now.slice(0, 10)}: ${wonCount} historical won referral(s)`,
      });

      await createLedgerEntry({
        partnerId: loyaltyKey,
        companyName,
        eventType: "manual_bonus",
        pointsDelta: wonCount,
        pointsBalanceAfter: wonCount,
        tierBefore: "None",
        tierAfter: tierData.name,
        note: `Historical backfill: ${wonCount} won referral(s) prior to loyalty program`,
        createdAt: now,
        programYear,
        adminUserId: userId,
      });

      processedKeys.add(loyaltyKey);
      existingKeys.add(loyaltyKey);
      created.push(`${contact.name} (${companyName}) — ${wonCount} pt(s), tier: ${tierData.name}`);
    } catch (e) {
      errors.push(`${contact.name}: ${String(e)}`);
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
