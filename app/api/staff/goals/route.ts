import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getSuspendedOrDeletedClerkUserIds } from "@/lib/staff-visibility";
import { normalizeMonthDay } from "@/lib/about-me";

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
  clerkUserId: string;
  displayName: string;
  email: string;
  role: string;
  hireDate?: string;
  birthday?: string; // "MM-DD"
  headshot?: string; // Cloudinary URL; shown on client Partners page when this person is the Team Lead
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
    clerkUserId: toStr(f["ClerkUserId"]),
    displayName: toStr(f["DisplayName"]),
    email: toStr(f["Email"]),
    role: toStr(f["Role"]) || "TTTStaff",
    hireDate: toStr(f["HireDate"]) || undefined,
    birthday: normalizeMonthDay(toStr(f["Birthday"])) ?? undefined,
    headshot: toStr(f["Headshot"]) || undefined,
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

// ─── GET — fetch all active TTTStaff + TTTManager (+ TTTTeamLead on request) with goals fields
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Fetch all active staff (TTTStaff and TTTManager) — no fields[] restriction
    // so all fields including newly added ones come back gracefully.
    // ?includeTeamLeads=1 (Staff Goals tab only) adds TTTTeamLead; the AI
    // Staff Mapping and Skills tabs keep their existing roster.
    const includeTeamLeads = req.nextUrl.searchParams.get("includeTeamLeads") === "1";
    const formula = encodeURIComponent(
      `AND({IsActive}=TRUE(),OR({Role}="TTTStaff",{Role}="TTTManager"${includeTeamLeads ? ',{Role}="TTTTeamLead"' : ""}))`
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

    const allStaff = records.map(mapRecord);
    // Hide suspended/deleted staff (Clerk-side; Airtable's IsActive doesn't track this)
    const excludedIds = await getSuspendedOrDeletedClerkUserIds(allStaff.map((s) => s.clerkUserId));
    const staff = allStaff.filter((s) => !excludedIds.has(s.clerkUserId));
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
    birthday?: string | null;
    headshot?: string | null;
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
  if (rest.birthday !== undefined) {
    const md = rest.birthday ? normalizeMonthDay(rest.birthday) : null;
    if (rest.birthday && !md) return NextResponse.json({ error: "Birthday must be a valid month and day" }, { status: 400 });
    fields["Birthday"] = md ?? "";
  }
  if (rest.headshot !== undefined) {
    const url = (rest.headshot ?? "").trim();
    if (url && !/^https:\/\/res\.cloudinary\.com\//.test(url)) return NextResponse.json({ error: "Headshot must be an uploaded image" }, { status: 400 });
    fields["Headshot"] = url || null;
  }
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
    revalidateTag("staff-members"); // home page About Me reads goals/birthday/hire date via getStaffMembers
    return NextResponse.json({ staff: mapRecord(record) });
  } catch (e) {
    console.error("[staff/goals PATCH]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
