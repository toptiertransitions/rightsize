import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";

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
  const { label, startDate, endDate } = body as { label: string; startDate: string; endDate: string };
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
  return NextResponse.json({ quarter: mapQuarter(data) });
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
