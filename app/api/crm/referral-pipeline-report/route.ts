import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, getReferralCompanies, getReferralContacts, getAllActivitiesWithContactId, getStaffMembers } from "@/lib/airtable";
import { buildReferralPipelineEmail, type ReferralPipelineRow } from "@/lib/email";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!sysRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const userEmail = clerkUser.emailAddresses[0]?.emailAddress;
  if (!userEmail) return NextResponse.json({ error: "No email on your account" }, { status: 400 });

  const [companies, allContacts, activities, staffMembers] = await Promise.all([
    getReferralCompanies(),
    getReferralContacts(),
    getAllActivitiesWithContactId(),
    getStaffMembers(),
  ]);

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

  const companyMap = new Map(companies.map(c => [c.id, c]));
  const staffNameByClerkId = new Map(staffMembers.map(s => [s.clerkUserId, s.displayName]));

  const rows: ReferralPipelineRow[] = allContacts.map(contact => {
    const company = companyMap.get(contact.referralCompanyId);
    const ownerClerkId = company?.assignedToClerkId;
    const ownerName = ownerClerkId ? (staffNameByClerkId.get(ownerClerkId) ?? ownerClerkId) : "";
    return {
      priority: company?.priority || "",
      ownerName,
      companyName: company?.name ?? "Unknown Company",
      contactName: contact.name,
      contactTitle: contact.title || undefined,
      stage: contact.stage,
      lastActivityDate: latestActivityByContact.get(contact.id),
      activityCount: activityCountByContact.get(contact.id) ?? 0,
      nextStepDate: contact.nextStepDate,
      nextStepNote: contact.nextStepNote,
    };
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

  const html = buildReferralPipelineEmail({ rows, generatedAt });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: "hello@toptiertransitions.com",
    to: userEmail,
    subject: `Referral Pipeline Report — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    html,
  });

  if (error) {
    console.error("[referral-pipeline-report] resend error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  return NextResponse.json({ success: true, sentTo: userEmail });
}
