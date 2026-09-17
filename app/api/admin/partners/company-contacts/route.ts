import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReferralContacts } from "@/lib/airtable";
import { getPartnerPointsByCompany } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";
import type { ReferralContactStage } from "@/lib/types";

// Per-contact referral/points breakdown for one referral company, for the
// admin Partner Management page's expandable company rows. Adapted from
// app/api/crm/plan/company-contacts/route.ts (the War Room's Active Partner
// drill-down) minus the quarter-window scoping — this page reports all-time
// figures — plus points-earned per contact, since loyalty points are shared
// at the company level but every PartnerPoint record still knows which
// specific contact drove it.

const STAGE_PRIORITY: Record<ReferralContactStage, number> = {
  "Inactive Referral": 0, "Identified": 1, "Met": 2,
  "Agreed to Refer": 3, "Shared Leads": 4, "Active Referral": 5,
};

function atFetch(table: string, path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

function toStr(v: unknown): string { return typeof v === "string" ? v : v == null ? "" : String(v); }

type AirtableRec = { id: string; fields: Record<string, unknown> };

async function fetchAll<T>(table: string, formula: string, map: (r: AirtableRec) => T): Promise<T[]> {
  const all: T[] = [];
  let offset: string | undefined;
  do {
    const qs = `?filterByFormula=${encodeURIComponent(formula)}${offset ? `&offset=${offset}` : ""}`;
    const res = await atFetch(table, qs);
    if (!res.ok) break;
    const data = await res.json() as { records: AirtableRec[]; offset?: string };
    all.push(...data.records.map(map));
    offset = data.offset;
  } while (offset);
  return all;
}

function orFormula(field: string, ids: string[]): string {
  if (ids.length === 1) return `{${field}} = "${ids[0]}"`;
  return `OR(${ids.map((id) => `{${field}} = "${id}"`).join(", ")})`;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const [referralContacts, companyPoints] = await Promise.all([
    getReferralContacts(companyId),
    getPartnerPointsByCompany(companyId).catch(() => []),
  ]);

  if (referralContacts.length === 0) return NextResponse.json({ contacts: [] });

  const rcIds = referralContacts.map((rc) => rc.id);

  // Points earned by each specific contact, even though they all feed one
  // shared company-level balance.
  const pointsByContact = new Map<string, number>();
  for (const p of companyPoints) {
    if (!p.referralContactId) continue;
    pointsByContact.set(p.referralContactId, (pointsByContact.get(p.referralContactId) ?? 0) + 1);
  }

  // Fetch client contacts credited to these referral contacts (all time)
  const clientContacts = await fetchAll(
    AIRTABLE_TABLES.CRM_CLIENT_CONTACTS,
    orFormula("ReferralPartnerId", rcIds),
    (r) => ({
      id: r.id,
      name: toStr(r.fields["Name"]),
      referralPartnerId: toStr(r.fields["ReferralPartnerId"]) || null,
      createdAt: toStr(r.fields["CreatedAt"]),
    })
  );

  const ccIds = clientContacts.map((cc) => cc.id);

  // Fetch opportunities for all referred client contacts (value + stage)
  const allOpps = ccIds.length === 0 ? [] : await fetchAll(
    AIRTABLE_TABLES.CRM_OPPORTUNITIES,
    `AND(NOT({Deleted}), ${orFormula("ClientContactId", ccIds)})`,
    (r) => ({
      id: r.id,
      clientContactId: toStr(r.fields["ClientContactId"]),
      stage: toStr(r.fields["Stage"]) || "Lead",
      estimatedValue: typeof r.fields["EstimatedValue"] === "number" ? r.fields["EstimatedValue"] : 0,
    })
  );

  // Fetch activities for these referral contacts
  const allActivities = await fetchAll(
    AIRTABLE_TABLES.CRM_ACTIVITIES,
    orFormula("ClientContactId", rcIds),
    (r) => ({
      contactId: toStr(r.fields["ClientContactId"]),
      activityDate: toStr(r.fields["ActivityDate"]) || toStr(r.fields["CreatedAt"]),
    })
  );

  const oppsByClientContactId = new Map<string, typeof allOpps[number][]>();
  for (const opp of allOpps) {
    const arr = oppsByClientContactId.get(opp.clientContactId) ?? [];
    arr.push(opp);
    oppsByClientContactId.set(opp.clientContactId, arr);
  }

  const actCountByContact = new Map<string, number>();
  const actLastDateByContact = new Map<string, string>();
  for (const act of allActivities) {
    if (!act.contactId) continue;
    actCountByContact.set(act.contactId, (actCountByContact.get(act.contactId) ?? 0) + 1);
    const existing = actLastDateByContact.get(act.contactId);
    const dateStr = act.activityDate?.slice(0, 10) ?? "";
    if (dateStr && (!existing || dateStr > existing)) actLastDateByContact.set(act.contactId, dateStr);
  }

  const contacts = referralContacts
    .sort((a, b) => (STAGE_PRIORITY[b.stage] ?? 0) - (STAGE_PRIORITY[a.stage] ?? 0))
    .map((rc) => {
      const myClientContacts = clientContacts.filter((cc) => cc.referralPartnerId === rc.id);
      const allOppsForContact = myClientContacts.flatMap((cc) => oppsByClientContactId.get(cc.id) ?? []);
      const wonOpps = allOppsForContact.filter((o) => o.stage === "Won");

      return {
        id: rc.id,
        name: rc.name,
        title: rc.title || null,
        email: rc.email || null,
        phone: rc.phone || null,
        stage: rc.stage,
        lastActivityDate: actLastDateByContact.get(rc.id) ?? rc.lastActivityDate ?? null,
        activityCount: actCountByContact.get(rc.id) ?? 0,
        portalStatus: rc.clerkUserId ? "active" : rc.portalInviteSent ? "invited" : "none",
        allTimeTotalReferred: myClientContacts.length,
        allTimeWonCount: wonOpps.length,
        allTimeWonValue: wonOpps.reduce((s, o) => s + o.estimatedValue, 0),
        pointsEarned: pointsByContact.get(rc.id) ?? 0,
      };
    });

  return NextResponse.json({ contacts });
}
