import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";

function atFetchTable(table: string, path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

async function fetchAllForQuarter(table: string, quarterId: string) {
  const records: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  const formula = encodeURIComponent(`{QuarterId} = "${quarterId}"`);
  do {
    const qs = `?filterByFormula=${formula}${offset ? `&offset=${offset}` : ""}`;
    const res = await atFetchTable(table, qs);
    if (!res.ok) break;
    const data = await res.json();
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return records;
}

function atFetch(table: string, path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

export interface Quarter {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  createdByClerkId: string;
  createdAt: string;
}

function mapQuarter(r: { id: string; fields: Record<string, string> }): Quarter {
  return {
    id: r.id,
    label: r.fields["Label"] ?? "",
    startDate: r.fields["StartDate"] ?? "",
    endDate: r.fields["EndDate"] ?? "",
    createdByClerkId: r.fields["CreatedByClerkId"] ?? "",
    createdAt: r.fields["CreatedAt"] ?? "",
  };
}

async function requireCRMAccess(userId: string) {
  const sysRole = await getSystemRole(userId);
  return ["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "");
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const quarters: Quarter[] = [];
  let offset: string | undefined;
  do {
    const qs = `?sort[0][field]=StartDate&sort[0][direction]=desc${offset ? `&offset=${offset}` : ""}`;
    const res = await atFetch(AIRTABLE_TABLES.QUARTERS, qs);
    if (!res.ok) return NextResponse.json({ error: "Failed to fetch quarters" }, { status: 500 });
    const data = await res.json();
    quarters.push(...(data.records as { id: string; fields: Record<string, string> }[]).map(mapQuarter));
    offset = data.offset;
  } while (offset);

  return NextResponse.json({ quarters });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { label, startDate, endDate, copyFromQuarterId } = body as {
    label: string; startDate: string; endDate: string; copyFromQuarterId?: string;
  };
  if (!label || !startDate || !endDate) {
    return NextResponse.json({ error: "label, startDate, endDate required" }, { status: 400 });
  }

  const res = await atFetch(AIRTABLE_TABLES.QUARTERS, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Label: label,
        StartDate: startDate,
        EndDate: endDate,
        CreatedByClerkId: userId,
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) return NextResponse.json({ error: "Failed to create quarter" }, { status: 500 });
  const data = await res.json();
  const newQuarterId: string = data.id;

  const copiedCompanyIds: string[] = [];

  if (copyFromQuarterId) {
    const plansTable = AIRTABLE_TABLES.QUARTERLY_COMPANY_PLANS;
    const targetsTable = AIRTABLE_TABLES.QUARTERLY_CONVERSION_TARGETS;

    const [priorPlans, priorTargets] = await Promise.all([
      fetchAllForQuarter(plansTable, copyFromQuarterId),
      fetchAllForQuarter(targetsTable, copyFromQuarterId),
    ]);

    // Copy company plans (only those with actual data)
    const plansWithData = priorPlans.filter((p) => {
      const f = p.fields;
      return f["Meeting1"] || f["Meeting2"] || f["Meeting3"] ||
        f["Resource1"] || f["Resource2"] || f["Resource3"] ||
        Number(f["MonthlyInPersonMeetings"]) > 0 ||
        Number(f["MonthlyCheckins"]) > 0;
    });

    for (let i = 0; i < plansWithData.length; i += 10) {
      const batch = plansWithData.slice(i, i + 10);
      const records = batch.map((p) => ({
        fields: {
          CompanyId: p.fields["CompanyId"],
          QuarterId: newQuarterId,
          Meeting1: p.fields["Meeting1"] ?? "",
          Meeting2: p.fields["Meeting2"] ?? "",
          Meeting3: p.fields["Meeting3"] ?? "",
          Resource1: p.fields["Resource1"] ?? "",
          Resource2: p.fields["Resource2"] ?? "",
          Resource3: p.fields["Resource3"] ?? "",
          MonthlyInPersonMeetings: Number(p.fields["MonthlyInPersonMeetings"]) || 0,
          MonthlyCheckins: Number(p.fields["MonthlyCheckins"]) || 0,
          CreatedAt: new Date().toISOString(),
        },
      }));
      await atFetchTable(plansTable, "", { method: "POST", body: JSON.stringify({ records }) });
      copiedCompanyIds.push(...batch.map((p) => p.fields["CompanyId"] as string));
    }

    // Copy conversion targets (pipeline selections) — preserve per-rep assignment
    for (let i = 0; i < priorTargets.length; i += 10) {
      const batch = priorTargets.slice(i, i + 10);
      const records = batch.map((t) => ({
        fields: {
          QuarterId: newQuarterId,
          CompanyId: t.fields["CompanyId"],
          SelectedByClerkId: t.fields["SelectedByClerkId"],
          SelectedAt: new Date().toISOString(),
          StartingStage: t.fields["StartingStage"] ?? "",
        },
      }));
      await atFetchTable(targetsTable, "", { method: "POST", body: JSON.stringify({ records }) });
    }
  }

  return NextResponse.json({ quarter: mapQuarter(data), copiedCompanyIds });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, label, startDate, endDate } = body as { id: string; label: string; startDate: string; endDate: string };
  if (!id || !label || !startDate || !endDate) {
    return NextResponse.json({ error: "id, label, startDate, endDate required" }, { status: 400 });
  }

  const res = await atFetch(AIRTABLE_TABLES.QUARTERS, `/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { Label: label, StartDate: startDate, EndDate: endDate } }),
  });
  if (!res.ok) return NextResponse.json({ error: "Failed to update quarter" }, { status: 500 });
  const data = await res.json();
  return NextResponse.json({ quarter: mapQuarter(data) });
}
