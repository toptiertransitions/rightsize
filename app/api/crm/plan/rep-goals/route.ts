import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";

function atFetch(table: string, path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

// PATCH: upsert a rep's quarterly goal (admin only)
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { quarterId: string; clerkUserId: string; goal: number };
  const { quarterId, clerkUserId, goal } = body;
  if (!quarterId || !clerkUserId || goal == null) {
    return NextResponse.json({ error: "quarterId, clerkUserId, goal required" }, { status: 400 });
  }

  // Find existing record for this rep + quarter
  const formula = encodeURIComponent(`AND({QuarterId} = "${quarterId}", {ClerkUserId} = "${clerkUserId}")`);
  const findRes = await atFetch(AIRTABLE_TABLES.REP_QUARTERLY_GOALS, `?filterByFormula=${formula}`);
  if (!findRes.ok) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  const findData = await findRes.json() as { records: { id: string }[] };
  const existing = findData.records?.[0];

  if (existing) {
    const res = await atFetch(AIRTABLE_TABLES.REP_QUARTERLY_GOALS, `/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Goal: goal } }),
    });
    if (!res.ok) return NextResponse.json({ error: "Failed to update goal" }, { status: 500 });
  } else {
    const res = await atFetch(AIRTABLE_TABLES.REP_QUARTERLY_GOALS, "", {
      method: "POST",
      body: JSON.stringify({
        fields: {
          QuarterId: quarterId,
          ClerkUserId: clerkUserId,
          Goal: goal,
          SetByClerkId: userId,
          SetAt: new Date().toISOString(),
        },
      }),
    });
    if (!res.ok) return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
