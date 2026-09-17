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

  // Group by loyaltyKey FIRST, then sum wonCount across every Active
  // Referral contact sharing that key — points are awarded at the company
  // level (see awardLoyaltyPoint in app/api/invoices/route.ts), so a
  // company's true historical total is the SUM across all its contacts,
  // not just whichever contact happens to be processed first. The previous
  // version created a record from the first contact's wonCount alone and
  // then skipped every other contact at that company as "already exists",
  // silently under-counting real historical referrals.
  type Group = { loyaltyKey: string; companyName: string; wonCount: number; contactNames: string[]; firstContactEmail: string };
  const groups = new Map<string, Group>();

  for (const contact of referralContacts.filter(c => c.stage === "Active Referral")) {
    const ccIds = refToClientContacts.get(contact.id) ?? [];
    const wonCount = ccIds.reduce((sum, ccId) => sum + (wonCountByClientContact.get(ccId) ?? 0), 0);
    if (wonCount === 0) continue;

    const companyId = contact.referralCompanyId || null;
    const company = companyId ? companyMap.get(companyId) : null;
    const loyaltyKey = companyId || contact.clerkUserId || contact.id;
    const companyName = company?.name || contact.name || loyaltyKey;

    const existing = groups.get(loyaltyKey);
    if (existing) {
      existing.wonCount += wonCount;
      existing.contactNames.push(contact.name);
    } else {
      groups.set(loyaltyKey, { loyaltyKey, companyName, wonCount, contactNames: [contact.name], firstContactEmail: contact.email });
    }
  }

  for (const group of groups.values()) {
    const { loyaltyKey, companyName, wonCount, contactNames, firstContactEmail } = group;
    const label = `${companyName} (${contactNames.join(", ")})`;

    if (existingKeys.has(loyaltyKey)) {
      skipped.push(`${label} — record already exists`);
      continue;
    }

    try {
      // Double-check live (in case of race or stale getAllLoyaltyRecords cache)
      const live = await getLoyaltyRecord(loyaltyKey);
      if (live) {
        skipped.push(`${label} — record already exists`);
        existingKeys.add(loyaltyKey);
        continue;
      }

      const tierData = getTierForPoints(wonCount);
      await createLoyaltyRecord({
        partnerId: loyaltyKey,
        partnerName: contactNames[0],
        partnerEmail: firstContactEmail,
        companyName,
        currentTier: tierData.name,
        currentYearPoints: wonCount,
        lifetimePoints: wonCount,
        currentProgramYear: programYear,
        currentMultiplier: tierData.multiplier,
        silverBonusApplied: false,
        notes: `Backfilled ${now.slice(0, 10)}: ${wonCount} historical won referral(s) across ${contactNames.length} contact(s)`,
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

      existingKeys.add(loyaltyKey);
      created.push(`${label} — ${wonCount} pt(s), tier: ${tierData.name}`);
    } catch (e) {
      errors.push(`${label}: ${String(e)}`);
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
