import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getOpportunities,
  getClientContacts,
  getStaffMembers,
  getReferralContacts,
  getReferralCompanies,
} from "@/lib/airtable";
import { buildClientPipelineEmail, type ClientPipelineRow } from "@/lib/email";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const userEmail = clerkUser.emailAddresses[0]?.emailAddress;
  if (!userEmail) return NextResponse.json({ error: "No email on account" }, { status: 400 });

  const [allOpps, clientContacts, staffMembers, referralContacts, referralCompanies] =
    await Promise.all([
      getOpportunities(),
      getClientContacts(),
      getStaffMembers(),
      getReferralContacts(),
      getReferralCompanies(),
    ]);

  const contactMap = new Map(clientContacts.map((c) => [c.id, c]));
  const staffMap = new Map(staffMembers.map((s) => [s.clerkUserId, s.displayName]));
  const referralContactMap = new Map(referralContacts.map((r) => [r.id, r]));
  const referralCompanyMap = new Map(referralCompanies.map((c) => [c.id, c]));

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  function toRow(opp: (typeof allOpps)[number]): ClientPipelineRow {
    const contact = contactMap.get(opp.clientContactId);
    const location = [opp.city, opp.state].filter(Boolean).join(", ");
    const owner = staffMap.get(opp.assignedToClerkId) ?? "—";

    let referralSource = contact?.source || "—";
    if (contact?.referralPartnerId) {
      const refContact = referralContactMap.get(contact.referralPartnerId);
      if (refContact) {
        const company = referralCompanyMap.get(refContact.referralCompanyId);
        referralSource = company
          ? `${refContact.name} (${company.name})`
          : refContact.name;
      }
    }

    return {
      clientName: contact?.name ?? "Unknown",
      location,
      value: opp.estimatedValue,
      referralSource,
      ownerName: owner,
      expectedCloseDate: opp.expectedCloseDate,
      nextStepDate: opp.nextStepDate,
      nextStepNote: opp.nextStepNote,
      wonAt: opp.wonAt,
      createdAt: opp.createdAt,
      notes: opp.notes || undefined,
    };
  }

  const wonRows = allOpps
    .filter((o) => o.stage === "Won" && o.wonAt && o.wonAt >= sevenDaysAgo)
    .sort((a, b) => b.estimatedValue - a.estimatedValue)
    .map(toRow);

  const proposingRows = allOpps
    .filter((o) => o.stage === "Proposing")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toRow);

  const qualifyingRows = allOpps
    .filter((o) => o.stage === "Qualifying")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toRow);

  const leadRows = allOpps
    .filter((o) => o.stage === "Lead")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toRow);

  const generatedAt = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const html = buildClientPipelineEmail({
    wonRows,
    proposingRows,
    qualifyingRows,
    leadRows,
    generatedAt,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: "hello@toptiertransitions.com",
    to: userEmail,
    subject: `Client Pipeline Report — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    html,
  });

  if (error) {
    console.error("[client-pipeline-email]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  return NextResponse.json({ success: true, sentTo: userEmail });
}
