import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";

const STAFF_ROLES_TABLE = process.env.STAFF_ROLES_TABLE_ID || "StaffRoles";
const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(STAFF_ROLES_TABLE)}`;

function staffFetch(path: string, init?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

const ALLOWED_ROLES = ["TTTManager", "TTTAdmin"] as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface StaffGoalRow {
  id: string;
  displayName: string;
  email: string;
  role: string;
  hireDate?: string;
  roleType?: "Staff" | "Team Lead";
  minWeeklyHours?: number;
  targetWeeklyHours?: number;
  maxWeeklyHours?: number;
  updatedAt?: string;
}

function mapRecord(record: AirtableRecord): StaffGoalRow {
  const f = record.fields;
  return {
    id: record.id,
    displayName: typeof f["DisplayName"] === "string" ? f["DisplayName"] : "",
    email: typeof f["Email"] === "string" ? f["Email"] : "",
    role: typeof f["Role"] === "string" ? f["Role"] : "TTTStaff",
    hireDate: typeof f["HireDate"] === "string" ? f["HireDate"] : undefined,
    roleType:
      f["RoleType"] === "Staff" || f["RoleType"] === "Team Lead"
        ? (f["RoleType"] as "Staff" | "Team Lead")
        : undefined,
    minWeeklyHours: typeof f["MinWeeklyHours"] === "number" ? f["MinWeeklyHours"] : undefined,
    targetWeeklyHours:
      typeof f["TargetWeeklyHours"] === "number" ? f["TargetWeeklyHours"] : undefined,
    maxWeeklyHours:
      typeof f["MaxWeeklyHours"] === "number" ? f["MaxWeeklyHours"] : undefined,
    updatedAt:
      typeof f["LastModifiedAt"] === "string"
        ? f["LastModifiedAt"]
        : typeof f["UpdatedAt"] === "string"
        ? f["UpdatedAt"]
        : undefined,
  };
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fields = [
      "DisplayName",
      "Email",
      "Role",
      "HireDate",
      "RoleType",
      "MinWeeklyHours",
      "TargetWeeklyHours",
      "MaxWeeklyHours",
      "IsActive",
      "LastModifiedAt",
      "UpdatedAt",
    ]
      .map(f => `fields[]=${encodeURIComponent(f)}`)
      .join("&");

    const formula = encodeURIComponent("{IsActive} = TRUE()");
    const qs = `?filterByFormula=${formula}&sort[0][field]=DisplayName&sort[0][direction]=asc&${fields}`;

    const records: AirtableRecord[] = [];
    let offset: string | undefined;

    do {
      const url = qs + (offset ? `&offset=${offset}` : "");
      const res = await staffFetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      records.push(...(data.records as AirtableRecord[]));
      offset = data.offset;
    } while (offset);

    const staff = records.map(mapRecord);
    return NextResponse.json({ staff });
  } catch (e) {
    console.error("[staff/goals GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    id: string;
    hireDate?: string;
    roleType?: string;
    minWeeklyHours?: number | null;
    targetWeeklyHours?: number | null;
    maxWeeklyHours?: number | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (rest.hireDate !== undefined) fields["HireDate"] = rest.hireDate;
  if (rest.roleType !== undefined) fields["RoleType"] = rest.roleType;
  if (rest.minWeeklyHours !== undefined)
    fields["MinWeeklyHours"] = rest.minWeeklyHours ?? null;
  if (rest.targetWeeklyHours !== undefined)
    fields["TargetWeeklyHours"] = rest.targetWeeklyHours ?? null;
  if (rest.maxWeeklyHours !== undefined)
    fields["MaxWeeklyHours"] = rest.maxWeeklyHours ?? null;

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const res = await staffFetch(`/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(await res.text());
    const record = (await res.json()) as AirtableRecord;
    return NextResponse.json({ staff: mapRecord(record) });
  } catch (e) {
    console.error("[staff/goals PATCH]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
