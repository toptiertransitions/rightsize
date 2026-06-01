import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";

const STAFF_ROLES_TABLE = process.env.STAFF_ROLES_TABLE_ID || "StaffRoles";
const BASE_ID = process.env.AIRTABLE_BASE_ID;

function staffFetch(path: string, init?: RequestInit) {
  return fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(STAFF_ROLES_TABLE)}${path}`,
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

// ─── PATCH — bulk assign or remove a skill from multiple staff ────────────────
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action: "assign" | "remove"; skillId: string; staffIds: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, skillId, staffIds } = body;
  if (!action || !skillId || !Array.isArray(staffIds) || staffIds.length === 0) {
    return NextResponse.json(
      { error: "action, skillId, and non-empty staffIds are required" },
      { status: 400 }
    );
  }
  if (action !== "assign" && action !== "remove") {
    return NextResponse.json({ error: "action must be 'assign' or 'remove'" }, { status: 400 });
  }

  const errors: string[] = [];
  let updated = 0;

  // Process sequentially to avoid Airtable rate limits
  for (const staffId of staffIds) {
    try {
      // GET current skills
      const getRes = await staffFetch(`/${staffId}?fields[]=Skills`);
      if (!getRes.ok) {
        errors.push(`Failed to fetch staff ${staffId}: ${await getRes.text()}`);
        continue;
      }
      const record = (await getRes.json()) as AirtableRecord;
      const currentSkills: string[] = Array.isArray(record.fields["Skills"])
        ? (record.fields["Skills"] as string[])
        : [];

      let nextSkills: string[];
      if (action === "assign") {
        nextSkills = currentSkills.includes(skillId)
          ? currentSkills
          : [...currentSkills, skillId];
      } else {
        nextSkills = currentSkills.filter(s => s !== skillId);
      }

      // Only patch if changed
      if (JSON.stringify(nextSkills.sort()) === JSON.stringify(currentSkills.slice().sort())) {
        updated++;
        continue;
      }

      const patchRes = await staffFetch(`/${staffId}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: { Skills: nextSkills } }),
      });
      if (!patchRes.ok) {
        errors.push(`Failed to update staff ${staffId}: ${await patchRes.text()}`);
        continue;
      }
      updated++;
    } catch (e) {
      errors.push(`Error processing staff ${staffId}: ${String(e)}`);
    }
  }

  return NextResponse.json({ updated, errors });
}
