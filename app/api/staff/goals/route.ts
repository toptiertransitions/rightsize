import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";

const STAFF_ROLES_TABLE = process.env.STAFF_ROLES_TABLE_ID || "StaffRoles";
const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${STAFF_ROLES_TABLE}`;

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

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

export interface StaffGoalRow {
  id: string;
  displayName: string;
  email: string;
  role: string;
  hireDate?: string;
  roleType?: "Staff" | "Team Lead";
  minWeeklyHours?: number;
  targetWeeklyHours?: number;
  maxWeeklyHours?: number;
  skillIds: string[];
  updatedAt?: string;
}

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  return "";
}

function mapRecord(record: AirtableRecord): StaffGoalRow {
  const f = record.fields;
  // Skills is a linked record field — Airtable returns an array of record IDs
  let skillIds: string[] = [];
  if (Array.isArray(f["Skills"])) {
    skillIds = (f["Skills"] as unknown[]).filter((v): v is string => typeof v === "string");
  }
  return {
    id: record.id,
    displayName: toStr(f["DisplayName"]),
    email: toStr(f["Email"]),
    role: toStr(f["Role"]) || "TTTStaff",
    hireDate: toStr(f["HireDate"]) || undefined,
    roleType:
      f["RoleType"] === "Staff" || f["RoleType"] === "Team Lead"
        ? (f["RoleType"] as "Staff" | "Team Lead")
        : undefined,
    minWeeklyHours: typeof f["MinWeeklyHours"] === "number" ? f["MinWeeklyHours"] : undefined,
    targetWeeklyHours: typeof f["TargetWeeklyHours"] === "number" ? f["TargetWeeklyHours"] : undefined,
    maxWeeklyHours: typeof f["MaxWeeklyHours"] === "number" ? f["MaxWeeklyHours"] : undefined,
    skillIds,
    updatedAt: toStr(f["LastModifiedTime"]) || toStr(f["LastModifiedAt"]) || undefined,
  };
}

// ─── GET — fetch all active TTTStaff + TTTManager with goals fields ────────────
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Fetch all active staff (TTTStaff and TTTManager) — no fields[] restriction
    // so all fields including newly added ones come back gracefully
    const formula = encodeURIComponent(
      `AND({IsActive}=TRUE(),OR({Role}="TTTStaff",{Role}="TTTManager"))`
    );
    const qs = `?filterByFormula=${formula}&sort[0][field]=DisplayName&sort[0][direction]=asc`;

    const records: AirtableRecord[] = [];
    let offset: string | undefined;

    do {
      const url = qs + (offset ? `&offset=${offset}` : "");
      const res = await staffFetch(url);
      if (!res.ok) {
        const text = await res.text();
        console.error("[staff/goals GET] Airtable error:", text);
        throw new Error(text);
      }
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

// ─── PATCH — update goals fields for a single staff member ────────────────────
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
  if (rest.hireDate !== undefined) fields["HireDate"] = rest.hireDate || null;
  if (rest.roleType !== undefined) fields["RoleType"] = rest.roleType || null;
  if (rest.minWeeklyHours !== undefined) fields["MinWeeklyHours"] = rest.minWeeklyHours ?? null;
  if (rest.targetWeeklyHours !== undefined) fields["TargetWeeklyHours"] = rest.targetWeeklyHours ?? null;
  if (rest.maxWeeklyHours !== undefined) fields["MaxWeeklyHours"] = rest.maxWeeklyHours ?? null;

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
