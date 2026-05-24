import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isTTTAdmin, AIRTABLE_TABLES } from "@/lib/config";
import { getMembershipsForUser } from "@/lib/airtable";

const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
const AT_HEADERS = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
  "Content-Type": "application/json",
};

async function atFetch(table: string, qs: string) {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(table)}${qs}`, { headers: AT_HEADERS });
  if (!res.ok) return { error: await res.text(), records: [] };
  return res.json();
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clerkUserId = req.nextUrl.searchParams.get("clerkUserId");
  if (!clerkUserId) return NextResponse.json({ error: "clerkUserId required" }, { status: 400 });

  const steps: Record<string, unknown> = {};

  // Step 1: find CRM referral contact
  const f1 = encodeURIComponent(`{ClerkUserId} = "${clerkUserId}"`);
  const contactData = await atFetch(AIRTABLE_TABLES.CRM_CONTACTS, `?filterByFormula=${f1}&maxRecords=1`);
  const contact = contactData.records?.[0];
  steps.step1_referralContact = contact
    ? { id: contact.id, fields: contact.fields }
    : { error: "No CRMReferralContact found with this ClerkUserId" };

  if (!contact) return NextResponse.json(steps);

  const contactId = contact.id;

  // Step 2: find client contacts where ReferralPartnerId = contactId
  const f2 = encodeURIComponent(`{ReferralPartnerId} = "${contactId}"`);
  const ccData = await atFetch(AIRTABLE_TABLES.CRM_CLIENT_CONTACTS, `?filterByFormula=${f2}`);
  steps.step2_clientContacts = {
    count: ccData.records?.length ?? 0,
    records: (ccData.records ?? []).map((r: { id: string; fields: Record<string, unknown> }) => ({
      id: r.id,
      name: r.fields["Name"],
      email: r.fields["Email"],
      referralPartnerId: r.fields["ReferralPartnerId"],
    })),
  };

  const clientContactIds: string[] = (ccData.records ?? []).map((r: { id: string }) => r.id);

  // Step 3: find opportunities for those client contacts
  if (clientContactIds.length > 0) {
    const clauses = clientContactIds.map(id => `{ClientContactId} = "${id}"`).join(", ");
    const f3 = encodeURIComponent(clientContactIds.length === 1 ? clauses : `OR(${clauses})`);
    const oppData = await atFetch(AIRTABLE_TABLES.CRM_OPPORTUNITIES, `?filterByFormula=${f3}`);
    steps.step3_opportunities = {
      count: oppData.records?.length ?? 0,
      records: (oppData.records ?? []).map((r: { id: string; fields: Record<string, unknown> }) => ({
        id: r.id,
        tenantId: r.fields["TenantId"],
        tenantIdRaw: JSON.stringify(r.fields["TenantId"]),
        clientContactId: r.fields["ClientContactId"],
        stage: r.fields["Stage"],
      })),
    };
  } else {
    steps.step3_opportunities = { skipped: "No client contacts found in step 2" };
  }

  // Step 4: email fallback — get client contact emails
  const emails: string[] = (ccData.records ?? [])
    .map((r: { fields: Record<string, unknown> }) => r.fields["Email"])
    .filter(Boolean) as string[];
  steps.step4_clientEmails = emails;

  // Step 5: look up Clerk users by email
  if (emails.length > 0) {
    const clerk = await clerkClient();
    const clerkResults: unknown[] = [];
    for (const email of emails) {
      const res = await clerk.users.getUserList({ emailAddress: [email] }).catch(() => ({ data: [] }));
      for (const u of res.data) {
        const memberships = await getMembershipsForUser(u.id).catch(() => []);
        clerkResults.push({
          email,
          clerkUserId: u.id,
          memberships: memberships.map((m) => ({ tenantId: m.tenantId, role: m.role })),
        });
      }
    }
    steps.step5_emailFallback = clerkResults;
  } else {
    steps.step5_emailFallback = { skipped: "No emails found in step 4" };
  }

  // Step 6: check if the partner Clerk user themselves has a membership in the target tenant
  const partnerMemberships = await getMembershipsForUser(clerkUserId).catch(() => []);
  steps.step6_partnerDirectMemberships = partnerMemberships.map((m) => ({ tenantId: m.tenantId, role: m.role }));

  return NextResponse.json(steps, { status: 200 });
}
