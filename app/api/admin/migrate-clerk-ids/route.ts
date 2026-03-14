import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";
import { AIRTABLE_TABLES } from "@/lib/config";

const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
const AT_HEADERS = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
  "Content-Type": "application/json",
};

// Tables where ClerkUserId belongs to an individual user
const CLERK_ID_TABLES = [
  AIRTABLE_TABLES.USERS,
  AIRTABLE_TABLES.MEMBERSHIPS,
  AIRTABLE_TABLES.LOCAL_VENDORS,
  AIRTABLE_TABLES.TIME_ENTRIES,
  AIRTABLE_TABLES.STAFF_ROLES,
  AIRTABLE_TABLES.GMAIL_TOKENS,
  AIRTABLE_TABLES.EXPENSES,
];

// Tables where AssignedToClerkId references a staff user
const ASSIGNED_ID_TABLES = [
  AIRTABLE_TABLES.CRM_COMPANIES,
  AIRTABLE_TABLES.CRM_OPPORTUNITIES,
];

async function findAndUpdate(
  table: string,
  field: string,
  oldId: string,
  newId: string
): Promise<number> {
  const formula = encodeURIComponent(`{${field}} = "${oldId}"`);
  let offset: string | undefined;
  let updated = 0;

  do {
    const qs = `?filterByFormula=${formula}${offset ? `&offset=${offset}` : ""}`;
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(table)}${qs}`, {
      headers: AT_HEADERS,
    });
    if (!res.ok) break;
    const data = await res.json();
    const records: { id: string }[] = data.records ?? [];
    offset = data.offset;

    for (const record of records) {
      const patchRes = await fetch(
        `${BASE_URL}/${encodeURIComponent(table)}/${record.id}`,
        {
          method: "PATCH",
          headers: AT_HEADERS,
          body: JSON.stringify({ fields: { [field]: newId } }),
        }
      );
      if (patchRes.ok) updated++;
    }
  } while (offset);

  return updated;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  // mappings: { "old_clerk_id": "new_clerk_id", ... }
  const { mappings } = body ?? {};
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) {
    return NextResponse.json({ error: "Body must be { mappings: { oldId: newId } }" }, { status: 400 });
  }

  const results: Record<string, Record<string, number>> = {};

  for (const [oldId, newId] of Object.entries(mappings) as [string, string][]) {
    if (!oldId || !newId || oldId === newId) continue;
    results[oldId] = {};

    for (const table of CLERK_ID_TABLES) {
      const count = await findAndUpdate(table, "ClerkUserId", oldId, newId);
      if (count > 0) results[oldId][table] = count;
    }
    for (const table of ASSIGNED_ID_TABLES) {
      const count = await findAndUpdate(table, "AssignedToClerkId", oldId, newId);
      if (count > 0) results[oldId][table] = count;
    }
  }

  return NextResponse.json({ results });
}
