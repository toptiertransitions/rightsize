import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";

function atFetch(table: string, path: string) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

async function getQuarterDates(quarterId: string): Promise<{ startDate: string; endDate: string } | null> {
  const res = await atFetch(AIRTABLE_TABLES.QUARTERS, `/${quarterId}`);
  if (!res.ok) return null;
  const r = await res.json() as { fields: Record<string, unknown> };
  return {
    startDate: String(r.fields["StartDate"] ?? "").trim(),
    endDate: String(r.fields["EndDate"] ?? "").trim(),
  };
}

async function getContactIds(companyId: string): Promise<string[]> {
  const formula = encodeURIComponent(`{ReferralCompanyId} = "${companyId}"`);
  const res = await atFetch(AIRTABLE_TABLES.CRM_CONTACTS, `?filterByFormula=${formula}`);
  if (!res.ok) return [];
  const data = await res.json() as { records: { id: string }[] };
  return data.records.map((r) => r.id);
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = req.nextUrl.searchParams.get("companyId");
  const quarterId = req.nextUrl.searchParams.get("quarterId");
  if (!companyId || !quarterId) return NextResponse.json({ error: "companyId and quarterId required" }, { status: 400 });

  const [quarter, contactIds] = await Promise.all([
    getQuarterDates(quarterId),
    getContactIds(companyId),
  ]);

  if (!quarter?.startDate || !quarter?.endDate) return NextResponse.json({ months: [] });

  const qStart = new Date(quarter.startDate + "T00:00:00.000Z");
  const qEnd = new Date(quarter.endDate + "T23:59:59.999Z");
  if (isNaN(qStart.getTime()) || isNaN(qEnd.getTime())) return NextResponse.json({ months: [] });

  // Build month buckets spanning the quarter
  const months: Array<{ key: string; label: string }> = [];
  let cur = new Date(Date.UTC(qStart.getUTCFullYear(), qStart.getUTCMonth(), 1));
  while (cur <= qEnd) {
    months.push({
      key: `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`,
      label: cur.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
    });
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }

  const counts: Record<string, { meetings: number; checkins: number }> = {};
  for (const m of months) counts[m.key] = { meetings: 0, checkins: 0 };

  if (contactIds.length > 0) {
    const orParts = contactIds.map((id) => `{ClientContactId} = "${id}"`);
    const orFormula = contactIds.length === 1 ? orParts[0] : `OR(${orParts.join(", ")})`;
    const formula = encodeURIComponent(orFormula);

    let offset: string | undefined;
    do {
      const qs = `?filterByFormula=${formula}${offset ? `&offset=${offset}` : ""}`;
      const res = await atFetch(AIRTABLE_TABLES.CRM_ACTIVITIES, qs);
      if (!res.ok) break;
      const data = await res.json() as { records: { fields: Record<string, unknown> }[]; offset?: string };
      for (const r of data.records) {
        const f = r.fields;
        const type = String(f["Type"] ?? "");
        const dateStr = String(f["ActivityDate"] ?? "").slice(0, 10);
        if (!dateStr) continue;
        const d = new Date(dateStr + "T12:00:00.000Z");
        if (d < qStart || d > qEnd) continue;
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        if (!counts[key]) continue;
        if (type === "Meeting") {
          counts[key].meetings++;
        } else if (type === "Call" || type === "Email" || type === "Text Message") {
          counts[key].checkins++;
        }
      }
      offset = data.offset;
    } while (offset);
  }

  return NextResponse.json({
    months: months.map((m) => ({
      key: m.key,
      label: m.label,
      meetings: counts[m.key]?.meetings ?? 0,
      checkins: counts[m.key]?.checkins ?? 0,
    })),
  });
}
