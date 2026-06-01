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

// ─── PATCH — bulk set skill lists for multiple staff members ─────────────────
// Accepts pre-computed skillIds per staff member from the client (no server-side
// GET required). The client holds current state and computes the delta itself.
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { patches: Array<{ staffId: string; skillIds: string[] }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { patches } = body;
  if (!Array.isArray(patches) || patches.length === 0) {
    return NextResponse.json({ error: "patches must be a non-empty array" }, { status: 400 });
  }

  const errors: string[] = [];
  let updated = 0;

  for (const { staffId, skillIds } of patches) {
    if (!staffId || !Array.isArray(skillIds)) {
      errors.push(`Invalid patch entry for staffId=${staffId}`);
      continue;
    }
    try {
      const patchRes = await staffFetch(`/${staffId}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: { Skills: skillIds } }),
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
