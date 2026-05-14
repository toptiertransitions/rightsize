import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getReferralCompanies,
  getReferralContacts,
  getAllActivitiesWithContactId,
  getStaffMembers,
  getOpportunities,
  getClientContacts,
} from "@/lib/airtable";
import { buildActiveReferralEmail, type ActiveReferralContactRow } from "@/lib/email";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!sysRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const userEmail = clerkUser.emailAddresses[0]?.emailAddress;
  if (!userEmail) return NextResponse.json({ error: "No email on your account" }, { status: 400 });

  const [companies, allContacts, activities, staffMembers, opportunities, clientContacts] = await Promise.all([
    getReferralCompanies(),
    getReferralContacts(),
    getAllActivitiesWithContactId(),
    getStaffMembers(),
    getOpportunities(),
    getClientContacts(),
  ]);

  // Only Active Referral contacts
  const activeContacts = allContacts.filter(c => c.stage === "Active Referral");

  // Build lookup maps
  const companyMap = new Map(companies.map(c => [c.id, c]));
  const staffNameByClerkId = new Map(staffMembers.map(s => [s.clerkUserId, s.displayName]));

  // Activity stats per referral contact
  const referralContactIds = new Set(allContacts.map(c => c.id));
  const referralActivities = activities.filter(a => a.clientContactId && referralContactIds.has(a.clientContactId));
  const activityCountByContact = new Map<string, number>();
  const latestActivityByContact = new Map<string, string>();
  for (const act of referralActivities) {
    const cid = act.clientContactId!;
    activityCountByContact.set(cid, (activityCountByContact.get(cid) ?? 0) + 1);
    const existing = latestActivityByContact.get(cid);
    const date = act.activityDate || act.createdAt;
    if (!existing || date > existing) latestActivityByContact.set(cid, date.slice(0, 10));
  }

  // Referral stats: client contacts link referralPartnerId → referral contact
  // Opportunities link clientContactId → client contact
  const oppsByClientContactId = new Map<string, typeof opportunities[number][]>();
  for (const opp of opportunities) {
    const arr = oppsByClientContactId.get(opp.clientContactId) ?? [];
    arr.push(opp);
    oppsByClientContactId.set(opp.clientContactId, arr);
  }

  // For each referral contact, find client contacts that credit them
  const refContactToClientContacts = new Map<string, string[]>();
  for (const cc of clientContacts) {
    if (!cc.referralPartnerId) continue;
    const arr = refContactToClientContacts.get(cc.referralPartnerId) ?? [];
    arr.push(cc.id);
    refContactToClientContacts.set(cc.referralPartnerId, arr);
  }

  const rows: ActiveReferralContactRow[] = activeContacts.map(contact => {
    const company = companyMap.get(contact.referralCompanyId);
    const ownerClerkId = company?.assignedToClerkId;
    const ownerName = ownerClerkId ? (staffNameByClerkId.get(ownerClerkId) ?? "") : "";

    // Aggregate opp stats via referred client contacts
    const ccIds = refContactToClientContacts.get(contact.id) ?? [];
    const contactOpps = ccIds.flatMap(ccId => oppsByClientContactId.get(ccId) ?? []);
    const wonOpps = contactOpps.filter(o => o.stage === "Won");
    const lostCount = contactOpps.filter(o => o.stage === "Lost").length;
    const activeCount = contactOpps.filter(o => !["Won", "Lost"].includes(o.stage)).length;
    const wonValue = wonOpps.reduce((s, o) => s + o.estimatedValue, 0);

    return {
      contactName: contact.name,
      contactTitle: contact.title || undefined,
      contactEmail: contact.email || undefined,
      contactPhone: contact.phone || undefined,
      companyName: company?.name ?? "Unknown Company",
      companyType: company?.type || undefined,
      priority: company?.priority || "",
      ownerName,
      lastActivityDate: latestActivityByContact.get(contact.id) || contact.lastActivityDate,
      activityCount: activityCountByContact.get(contact.id) ?? 0,
      dateIntroduced: contact.dateIntroduced,
      nextStepDate: contact.nextStepDate,
      nextStepNote: contact.nextStepNote,
      interests: contact.interests,
      coffeeOrder: contact.coffeeOrder,
      orgsGroups: contact.orgsGroups,
      notes: contact.notes || undefined,
      totalReferred: contactOpps.length,
      wonCount: wonOpps.length,
      lostCount,
      activeCount,
      wonValue,
    };
  });

  // Sort: priority (High → Medium → Low → other), then by contact name
  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  rows.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 3;
    const pb = priorityOrder[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return a.contactName.localeCompare(b.contactName);
  });

  const generatedAt = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const html = buildActiveReferralEmail({ rows, generatedAt });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: "hello@toptiertransitions.com",
    to: userEmail,
    subject: `Active Referral Report — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (${rows.length} partner${rows.length !== 1 ? "s" : ""})`,
    html,
  });

  if (error) {
    console.error("[active-referral-report] resend error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  return NextResponse.json({ success: true, sentTo: userEmail, count: rows.length });
}
