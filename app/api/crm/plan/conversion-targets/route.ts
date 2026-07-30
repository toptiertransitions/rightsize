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

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    quarterId: string;
    companyId: string;
    startingStage?: string;
    forClerkUserId?: string;
  };
  const { quarterId, companyId, startingStage, forClerkUserId } = body;
  if (!quarterId || !companyId) return NextResponse.json({ error: "quarterId and companyId required" }, { status: 400 });

  // Only admin/manager can add on behalf of another rep
  const selectedByClerkId =
    forClerkUserId && (sysRole === "TTTAdmin" || sysRole === "TTTManager")
      ? forClerkUserId
      : userId;

  const res = await atFetch(AIRTABLE_TABLES.QUARTERLY_CONVERSION_TARGETS, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        QuarterId: quarterId,
        CompanyId: companyId,
        SelectedByClerkId: selectedByClerkId,
        SelectedAt: new Date().toISOString(),
        StartingStage: startingStage ?? "",
      },
    }),
  });
  if (!res.ok) return NextResponse.json({ error: "Failed to create target" }, { status: 500 });
  const data = await res.json() as { id: string; fields: Record<string, string> };
  return NextResponse.json({
    target: {
      id: data.id,
      quarterId: data.fields["QuarterId"] ?? "",
      companyId: data.fields["CompanyId"] ?? "",
      selectedByClerkId: data.fields["SelectedByClerkId"] ?? "",
      startingStage: data.fields["StartingStage"] ?? "",
    },
  });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetId = req.nextUrl.searchParams.get("id");
  if (!targetId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const res = await atFetch(AIRTABLE_TABLES.QUARTERLY_CONVERSION_TARGETS, `/${targetId}`, { method: "DELETE" });
  if (!res.ok) return NextResponse.json({ error: "Failed to delete target" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
