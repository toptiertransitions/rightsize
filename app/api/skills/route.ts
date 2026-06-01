import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";

const SKILLS_TABLE = "Skills";
const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(SKILLS_TABLE)}`;

function skillsFetch(path: string, init?: RequestInit) {
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

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface Skill {
  id: string;
  skillName: string;
  skillCategory: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
}

function mapRecord(record: AirtableRecord): Skill {
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

// ─── GET — fetch all active skills ───────────────────────────────────────────
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Any authenticated TTT user can read skills
  const role = await getSystemRole(userId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const records: AirtableRecord[] = [];
    let offset: string | undefined;

    do {
      const qs =
        `?sort[0][field]=SkillCategory&sort[0][direction]=asc` +
        `&sort[1][field]=SkillName&sort[1][direction]=asc` +
        (offset ? `&offset=${offset}` : "");
      const res = await skillsFetch(qs);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      records.push(...(data.records as AirtableRecord[]));
      offset = data.offset;
    } while (offset);

    const skills = records.map(mapRecord);
    return NextResponse.json({ skills });
  } catch (e) {
    console.error("[skills GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ─── POST — create a new skill (TTTAdmin only) ────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { skillName: string; skillCategory: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { skillName, skillCategory, description } = body;
  if (!skillName || !skillCategory) {
    return NextResponse.json({ error: "skillName and skillCategory are required" }, { status: 400 });
  }

  try {
    const fields: Record<string, unknown> = {
      SkillName: skillName,
      SkillCategory: skillCategory,
      IsActive: true,
      CreatedAt: new Date().toISOString(),
    };
    if (description) fields["Description"] = description;

    const res = await skillsFetch("", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(await res.text());
    const record = (await res.json()) as AirtableRecord;
    return NextResponse.json({ skill: mapRecord(record) }, { status: 201 });
  } catch (e) {
    console.error("[skills POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
