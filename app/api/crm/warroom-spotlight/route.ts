import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";

// Per-user Discussion Spotlight picks (up to 3 companies) for the CRM War
// Room, keyed by rep + quarter. Previously stored in browser localStorage
// only — moved to Airtable so it reliably persists across devices/browsers
// and doesn't silently disappear when a browser evicts local storage.

function atFetch(path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(AIRTABLE_TABLES.WAR_ROOM_SPOTLIGHT)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

async function requireCRMAccess(userId: string) {
  const sysRole = await getSystemRole(userId);
  return ["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "");
}

async function findRecord(clerkUserId: string, quarterId: string): Promise<{ id: string; companyIds: string[] } | null> {
  const formula = encodeURIComponent(`AND({ClerkUserId} = "${clerkUserId}", {QuarterId} = "${quarterId}")`);
  const res = await atFetch(`?filterByFormula=${formula}&maxRecords=1`);
  if (!res.ok) return null;
  const data = await res.json();
  const record = data.records?.[0];
  if (!record) return null;
  let companyIds: string[] = [];
  try {
    const raw = record.fields["CompanyIds"];
    if (raw) companyIds = JSON.parse(raw);
  } catch { /* leave empty on malformed JSON */ }
  return { id: record.id, companyIds };
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const quarterId = req.nextUrl.searchParams.get("quarterId");
  if (!quarterId) return NextResponse.json({ error: "Missing quarterId" }, { status: 400 });

  const record = await findRecord(userId, quarterId);
  return NextResponse.json({ companyIds: record?.companyIds ?? [] });
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { quarterId?: string; companyIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { quarterId, companyIds } = body;
  if (!quarterId || !Array.isArray(companyIds)) {
    return NextResponse.json({ error: "Missing quarterId or companyIds" }, { status: 400 });
  }
  if (companyIds.length > 3) {
    return NextResponse.json({ error: "Spotlight is limited to 3 companies" }, { status: 400 });
  }

  const existing = await findRecord(userId, quarterId);
  const fields = { CompanyIds: JSON.stringify(companyIds), UpdatedAt: new Date().toISOString() };

  const res = existing
    ? await atFetch(`/${existing.id}`, { method: "PATCH", body: JSON.stringify({ fields }) })
    : await atFetch("", {
        method: "POST",
        body: JSON.stringify({ fields: { ClerkUserId: userId, QuarterId: quarterId, ...fields } }),
      });

  if (!res.ok) return NextResponse.json({ error: "Failed to save spotlight" }, { status: 500 });

  return NextResponse.json({ companyIds });
}
