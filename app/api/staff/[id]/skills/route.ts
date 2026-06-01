import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";

const STAFF_ROLES_TABLE = process.env.STAFF_ROLES_TABLE_ID || "StaffRoles";
const SKILLS_TABLE = "Skills";
const BASE_ID = process.env.AIRTABLE_BASE_ID;

function airtableFetch(table: string, path: string, init?: RequestInit) {
  return fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}${path}`,
    {
      cache: "no-store",
      ...init,
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    }
  );
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

const ALLOWED_ROLES = ["TTTManager", "TTTAdmin"] as const;

// ─── GET — get skills for a staff member ─────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    // Fetch the staff record to get skill IDs
    const staffRes = await airtableFetch(
      STAFF_ROLES_TABLE,
      `/${id}?fields[]=DisplayName&fields[]=Skills`
    );
    if (!staffRes.ok) {
      if (staffRes.status === 404) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      throw new Error(await staffRes.text());
    }
    const staffRecord = (await staffRes.json()) as AirtableRecord;
    const skillIds: string[] = Array.isArray(staffRecord.fields["Skills"])
      ? (staffRecord.fields["Skills"] as string[])
      : [];

    if (skillIds.length === 0) {
      return NextResponse.json({ skillIds: [], skills: [] });
    }

    // Resolve skill names
    const skillPromises = skillIds.map(sid =>
      airtableFetch(SKILLS_TABLE, `/${sid}?fields[]=SkillName&fields[]=SkillCategory&fields[]=IsActive`)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
    );
    const skillResults = await Promise.all(skillPromises);
    const skills = skillResults
      .filter((r): r is AirtableRecord => r != null)
      .map(r => ({
        id: r.id,
        skillName: typeof r.fields["SkillName"] === "string" ? r.fields["SkillName"] : "",
        skillCategory: typeof r.fields["SkillCategory"] === "string" ? r.fields["SkillCategory"] : "",
        isActive: r.fields["IsActive"] === true,
      }));

    return NextResponse.json({ skillIds, skills });
  } catch (e) {
    console.error("[staff/[id]/skills GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ─── PATCH — update skills for a staff member ────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: { skillIds: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.skillIds)) {
    return NextResponse.json({ error: "skillIds must be an array" }, { status: 400 });
  }

  try {
    const res = await airtableFetch(STAFF_ROLES_TABLE, `/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          // Airtable linked record field accepts array of record IDs
          Skills: body.skillIds,
        },
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const record = (await res.json()) as AirtableRecord;
    const updatedSkillIds: string[] = Array.isArray(record.fields["Skills"])
      ? (record.fields["Skills"] as string[])
      : [];
    return NextResponse.json({ skillIds: updatedSkillIds });
  } catch (e) {
    console.error("[staff/[id]/skills PATCH]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
