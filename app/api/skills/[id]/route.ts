import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";

const SKILLS_TABLE = "Skills";
const STAFF_ROLES_TABLE = process.env.STAFF_ROLES_TABLE_ID || "StaffRoles";
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

function mapSkill(record: AirtableRecord) {
  const f = record.fields;
  return {
    id: record.id,
    skillName: typeof f["SkillName"] === "string" ? f["SkillName"] : "",
    skillCategory: typeof f["SkillCategory"] === "string" ? f["SkillCategory"] : "",
    description: typeof f["Description"] === "string" ? f["Description"] : undefined,
    isActive: f["IsActive"] === true,
    createdAt: typeof f["CreatedAt"] === "string" ? f["CreatedAt"] : undefined,
  };
}

// ─── PATCH — update a skill (TTTAdmin only) ───────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: {
    skillName?: string;
    skillCategory?: string;
    description?: string;
    isActive?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fields: Record<string, unknown> = {};
  if (body.skillName !== undefined) fields["SkillName"] = body.skillName;
  if (body.skillCategory !== undefined) fields["SkillCategory"] = body.skillCategory;
  if (body.description !== undefined) fields["Description"] = body.description;
  if (body.isActive !== undefined) fields["IsActive"] = body.isActive;

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const res = await airtableFetch(SKILLS_TABLE, `/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(await res.text());
    const record = (await res.json()) as AirtableRecord;
    return NextResponse.json({ skill: mapSkill(record) });
  } catch (e) {
    console.error("[skills/[id] PATCH]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ─── DELETE — delete a skill (TTTAdmin only) ──────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Check if any staff have this skill assigned
  try {
    const formula = encodeURIComponent(`FIND("${id}", ARRAYJOIN({Skills}, ",")) > 0`);
    const staffRes = await airtableFetch(
      STAFF_ROLES_TABLE,
      `?filterByFormula=${formula}&maxRecords=1&fields[]=DisplayName`
    );
    if (!staffRes.ok) throw new Error(await staffRes.text());
    const staffData = await staffRes.json();
    if (staffData.records?.length > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete skill — it is currently assigned to one or more staff members. Remove it from all staff first.",
        },
        { status: 409 }
      );
    }
  } catch (e) {
    // If the check fails (e.g., formula not supported), still allow deletion
    console.warn("[skills/[id] DELETE] staff check failed:", e);
  }

  try {
    const res = await airtableFetch(SKILLS_TABLE, `/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ deleted: true });
  } catch (e) {
    console.error("[skills/[id] DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
