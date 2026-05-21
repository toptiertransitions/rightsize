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

  // ── Monthly referral goal calculations ────────────────────────────────────────
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth(); // 0-indexed
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();

  const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
  const lastMonthYear = lastMonthDate.getFullYear();
  const lastMonthMonth = lastMonthDate.getMonth();

  const thisMonthLabel = now.toLocaleString("en-US", { month: "short", year: "numeric" });
  const lastMonthLabel = lastMonthDate.toLocaleString("en-US", { month: "short", year: "numeric" });

  const MONTHLY_GOALS: Record<string, number> = { High: 3, Medium: 1, Low: 0 };

  // Company-level referral stats: count client contacts (=referrals) created this/last month
  // group all contacts by company so we can aggregate across all referral contacts at a firm
  const contactIdsByCompany = new Map<string, Set<string>>();
  for (const contact of allContacts) {
    const s = contactIdsByCompany.get(contact.referralCompanyId) ?? new Set();
    s.add(contact.id);
    contactIdsByCompany.set(contact.referralCompanyId, s);
  }

  const companyGoalStats = new Map<string, {
    monthlyGoal: number;
    pacingGoal: number;
    thisMonthCount: number;
    thisMonthValue: number;
    lastMonthCount: number;
    lastMonthValue: number;
    thisMonthReferrals: { clientName: string; city?: string; state?: string; value: number }[];
  }>();

  for (const company of companies) {
    const refContactIds = contactIdsByCompany.get(company.id) ?? new Set();
    const goal = MONTHLY_GOALS[company.priority ?? ""] ?? 0;
    const pacing = goal === 0 ? 0 : Math.ceil(goal * dayOfMonth / daysInMonth);

    let thisMonthCount = 0, thisMonthValue = 0, lastMonthCount = 0, lastMonthValue = 0;
    const thisMonthReferrals: { clientName: string; city?: string; state?: string; value: number }[] = [];

    for (const cc of clientContacts) {
      if (!cc.referralPartnerId || !refContactIds.has(cc.referralPartnerId)) continue;
      const d = new Date(cc.createdAt);
      const ccOpps = oppsByClientContactId.get(cc.id) ?? [];
      const oppsValue = ccOpps.reduce((s, o) => s + o.estimatedValue, 0);
      if (d.getFullYear() === thisYear && d.getMonth() === thisMonth) {
        thisMonthCount++;
        thisMonthValue += oppsValue;
        const oppWithCity = ccOpps.find(o => o.city);
        thisMonthReferrals.push({ clientName: cc.name, city: oppWithCity?.city, state: oppWithCity?.state, value: oppsValue });
      } else if (d.getFullYear() === lastMonthYear && d.getMonth() === lastMonthMonth) {
        lastMonthCount++;
        lastMonthValue += oppsValue;
      }
    }

    companyGoalStats.set(company.id, { monthlyGoal: goal, pacingGoal: pacing, thisMonthCount, thisMonthValue, lastMonthCount, lastMonthValue, thisMonthReferrals });
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

    const goalStats = companyGoalStats.get(contact.referralCompanyId);

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
      monthlyGoal: goalStats?.monthlyGoal ?? 0,
      pacingGoal: goalStats?.pacingGoal ?? 0,
      thisMonthCount: goalStats?.thisMonthCount ?? 0,
      thisMonthValue: goalStats?.thisMonthValue ?? 0,
      lastMonthCount: goalStats?.lastMonthCount ?? 0,
      lastMonthValue: goalStats?.lastMonthValue ?? 0,
      thisMonthReferrals: goalStats?.thisMonthReferrals ?? [],
      companyId: contact.referralCompanyId,
    };
  });

  // Sort: priority (High → Medium → Low → other), then Won Value desc, then Referred Count desc, then company name alpha, then contact name alpha
  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  rows.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 3;
    const pb = priorityOrder[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    if (b.wonValue !== a.wonValue) return b.wonValue - a.wonValue;
    if (b.totalReferred !== a.totalReferred) return b.totalReferred - a.totalReferred;
    const cc = a.companyName.localeCompare(b.companyName);
    if (cc !== 0) return cc;
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

  const html = buildActiveReferralEmail({ rows, generatedAt, thisMonthLabel, lastMonthLabel });

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
