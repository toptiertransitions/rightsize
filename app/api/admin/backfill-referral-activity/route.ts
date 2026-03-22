import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReferralContacts, getAllActivitiesWithContactId, batchUpdateReferralLastActivity } from "@/lib/airtable";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Fetch all referral contacts (paginated)
  const referralContacts = await getReferralContacts();
  const referralContactIds = new Set(referralContacts.map(c => c.id));

  // 2. Fetch all activities that have a ClientContactId (paginated)
  const activities = await getAllActivitiesWithContactId();

  // 3. Filter to past 120 days and match to referral contacts
  const since = new Date();
  since.setDate(since.getDate() - 120);
  const sinceStr = since.toISOString().slice(0, 10);

  const maxDateByContact = new Map<string, string>();
  for (const a of activities) {
    if (!a.clientContactId || !referralContactIds.has(a.clientContactId)) continue;
    const date = (a.activityDate || "").slice(0, 10);
    if (!date || date < sinceStr) continue;
    const current = maxDateByContact.get(a.clientContactId);
    if (!current || date > current) {
      maxDateByContact.set(a.clientContactId, date);
    }
  }

  // 4. Build update list: only update contacts where computed date differs from stored
  const updates: Array<{ id: string; lastActivityDate: string }> = [];
  for (const contact of referralContacts) {
    const computed = maxDateByContact.get(contact.id);
    if (!computed) continue;
    const stored = contact.lastActivityDate?.slice(0, 10);
    if (computed !== stored) {
      updates.push({ id: contact.id, lastActivityDate: computed });
    }
  }

  // 5. Batch update Airtable
  if (updates.length > 0) {
    await batchUpdateReferralLastActivity(updates);
  }

  return NextResponse.json({
    ok: true,
    activitiesScanned: activities.length,
    contactsMatched: maxDateByContact.size,
    contactsUpdated: updates.length,
  });
}
