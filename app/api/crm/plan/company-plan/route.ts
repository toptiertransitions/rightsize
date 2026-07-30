import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";

function atFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  const table = AIRTABLE_TABLES.QUARTERLY_COMPANY_PLANS;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

async function findRecord(companyId: string, quarterId: string) {
  const formula = encodeURIComponent(`AND({CompanyId} = "${companyId}", {QuarterId} = "${quarterId}")`);
  const res = await atFetch(`?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.records?.[0] ?? null;
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

  const record = await findRecord(companyId, quarterId);
  if (!record) {
    return NextResponse.json({ plan: { meeting1: "", meeting2: "", meeting3: "", resource1: "", resource2: "", resource3: "", monthlyMeetingGoal: 0, monthlyCheckinGoal: 0 } });
  }
  const f = record.fields;
  return NextResponse.json({
    plan: {
      recordId: record.id,
      meeting1: f["Meeting1"] ?? "",
      meeting2: f["Meeting2"] ?? "",
      meeting3: f["Meeting3"] ?? "",
      resource1: f["Resource1"] ?? "",
      resource2: f["Resource2"] ?? "",
      resource3: f["Resource3"] ?? "",
      monthlyMeetingGoal: typeof f["MonthlyInPersonMeetings"] === "number" ? f["MonthlyInPersonMeetings"] : 0,
      monthlyCheckinGoal: typeof f["MonthlyCheckins"] === "number" ? f["MonthlyCheckins"] : 0,
    }
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { companyId, quarterId, meeting1, meeting2, meeting3, resource1, resource2, resource3, monthlyMeetingGoal, monthlyCheckinGoal } = await req.json();
  if (!companyId || !quarterId) return NextResponse.json({ error: "companyId and quarterId required" }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (meeting1 !== undefined) fields["Meeting1"] = meeting1;
  if (meeting2 !== undefined) fields["Meeting2"] = meeting2;
  if (meeting3 !== undefined) fields["Meeting3"] = meeting3;
  if (resource1 !== undefined) fields["Resource1"] = resource1;
  if (resource2 !== undefined) fields["Resource2"] = resource2;
  if (resource3 !== undefined) fields["Resource3"] = resource3;
  if (monthlyMeetingGoal !== undefined) fields["MonthlyInPersonMeetings"] = Number(monthlyMeetingGoal) || 0;
  if (monthlyCheckinGoal !== undefined) fields["MonthlyCheckins"] = Number(monthlyCheckinGoal) || 0;

  const existing = await findRecord(companyId, quarterId);
  let res: Response;
  if (existing) {
    res = await atFetch(`/${existing.id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
  } else {
    res = await atFetch("", { method: "POST", body: JSON.stringify({ fields: { ...fields, CompanyId: companyId, QuarterId: quarterId, CreatedAt: new Date().toISOString() } }) });
  }
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 });
  const record = await res.json();
  const f = record.fields;
  return NextResponse.json({
    plan: {
      recordId: record.id,
      meeting1: f["Meeting1"] ?? "",
      meeting2: f["Meeting2"] ?? "",
      meeting3: f["Meeting3"] ?? "",
      resource1: f["Resource1"] ?? "",
      resource2: f["Resource2"] ?? "",
      resource3: f["Resource3"] ?? "",
      monthlyMeetingGoal: typeof f["MonthlyInPersonMeetings"] === "number" ? f["MonthlyInPersonMeetings"] : 0,
      monthlyCheckinGoal: typeof f["MonthlyCheckins"] === "number" ? f["MonthlyCheckins"] : 0,
    }
  });
}
