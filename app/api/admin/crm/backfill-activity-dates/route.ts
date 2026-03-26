import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getAllActivities,
  getReferralContacts,
  getReferralCompanies,
  batchUpdateReferralLastActivity,
  batchUpdateCompanyLastActivity,
} from "@/lib/airtable";

/**
 * POST /api/admin/crm/backfill-activity-dates
 *
 * One-time (idempotent) backfill that scans every activity record and
 * sets the correct LastActivityDate on each referral contact and company.
 *
 * Algorithm:
 *   1. Fetch all activities, all referral contacts, all referral companies.
 *   2. Build contactId → maxActivityDate map from activities.
 *   3. Patch every contact whose current LastActivityDate differs (or is missing).
 *   4. Build companyId → maxActivityDate map by taking the max date across
 *      all contacts that belong to each company.
 *   5. Patch every company whose current LastActivityDate differs (or is missing).
 */
export async function POST(req: NextRequest) {
  void req;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin") return NextResponse.json({ error: "Forbidden — TTTAdmin only" }, { status: 403 });

  try {
    // ── 1. Fetch all data in parallel ────────────────────────────────────────
    const [activities, contacts, companies] = await Promise.all([
      getAllActivities(),
      getReferralContacts(),      // all contacts, paginated
      getReferralCompanies(),
    ]);

    // ── 2. Build contactId → max activityDate ────────────────────────────────
    // ActivityDate values are ISO date strings — lexicographic max works correctly.
    const contactMaxDate = new Map<string, string>();
    for (const act of activities) {
      const cid = act.clientContactId;
      if (!cid || !act.activityDate) continue;
      const current = contactMaxDate.get(cid);
      if (!current || act.activityDate > current) {
        contactMaxDate.set(cid, act.activityDate);
      }
    }

    // ── 3. Determine which contacts need updating ────────────────────────────
    const contactUpdates: Array<{ id: string; lastActivityDate: string }> = [];
    for (const contact of contacts) {
      const maxDate = contactMaxDate.get(contact.id);
      if (!maxDate) continue; // no activities for this contact
      if (contact.lastActivityDate === maxDate) continue; // already correct
      contactUpdates.push({ id: contact.id, lastActivityDate: maxDate });
    }

    // ── 4. Build companyId → max activityDate ────────────────────────────────
    // Use the corrected dates (contactMaxDate) rather than what's currently stored,
    // so the company always reflects the true latest activity across all contacts.
    const companyMaxDate = new Map<string, string>();

    // Build a lookup of contactId → referralCompanyId from the contacts we fetched
    const contactCompanyMap = new Map<string, string>();
    for (const contact of contacts) {
      if (contact.referralCompanyId) {
        contactCompanyMap.set(contact.id, contact.referralCompanyId);
      }
    }

    for (const [contactId, maxDate] of contactMaxDate.entries()) {
      const companyId = contactCompanyMap.get(contactId);
      if (!companyId) continue;
      const current = companyMaxDate.get(companyId);
      if (!current || maxDate > current) {
        companyMaxDate.set(companyId, maxDate);
      }
    }

    // Build company id → current lastActivityDate lookup
    const companyCurrentDate = new Map<string, string | undefined>();
    for (const company of companies) {
      companyCurrentDate.set(company.id, company.lastActivityDate);
    }

    const companyUpdates: Array<{ id: string; lastActivityDate: string }> = [];
    for (const [companyId, maxDate] of companyMaxDate.entries()) {
      const current = companyCurrentDate.get(companyId);
      if (current === maxDate) continue; // already correct
      companyUpdates.push({ id: companyId, lastActivityDate: maxDate });
    }

    // ── 5. Apply batch updates ────────────────────────────────────────────────
    await Promise.all([
      batchUpdateReferralLastActivity(contactUpdates),
      batchUpdateCompanyLastActivity(companyUpdates),
    ]);

    return NextResponse.json({
      ok: true,
      stats: {
        activitiesScanned: activities.length,
        contactsWithActivities: contactMaxDate.size,
        contactsUpdated: contactUpdates.length,
        companiesUpdated: companyUpdates.length,
      },
    });
  } catch (e) {
    console.error("[backfill-activity-dates] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
