import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";
import Anthropic from "@anthropic-ai/sdk";

function atFetch(table: string, path: string, options?: RequestInit) {
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  return fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

async function fetchAllActivities(contactIds: string[]): Promise<string[]> {
  if (contactIds.length === 0) return [];
  const orParts = contactIds.map((id) => `{ClientContactId} = "${id}"`);
  const formula = contactIds.length === 1 ? orParts[0] : `OR(${orParts.join(", ")})`;
  const all: string[] = [];
  let offset: string | undefined;
  do {
    const qs = `?filterByFormula=${encodeURIComponent(formula)}${offset ? `&offset=${offset}` : ""}`;
    const res = await atFetch(AIRTABLE_TABLES.CRM_ACTIVITIES, qs);
    if (!res.ok) break;
    const data = await res.json();
    for (const r of data.records) {
      const f = r.fields as Record<string, unknown>;
      const type = String(f["ActivityType"] ?? f["Type"] ?? "");
      const notes = String(f["Notes"] ?? f["Description"] ?? "");
      const date = String(f["ActivityDate"] ?? f["CreatedAt"] ?? "").slice(0, 10);
      all.push([date, type, notes].filter(Boolean).join(" | "));
    }
    offset = data.offset;
  } while (offset);
  return all;
}

async function fetchContactIds(companyId: string): Promise<string[]> {
  const formula = `{ReferralCompanyId} = "${companyId}"`;
  const res = await atFetch(AIRTABLE_TABLES.CRM_CONTACTS, `?filterByFormula=${encodeURIComponent(formula)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records as { id: string }[]).map((r) => r.id);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { companyId, companyName, meetings, resources } = await req.json() as {
    companyId: string;
    companyName: string;
    meetings: string[];
    resources: string[];
    quarterId: string;
  };

  const contactIds = await fetchContactIds(companyId);
  const activities = await fetchAllActivities(contactIds);

  const planItems = [
    ...meetings.filter(Boolean).map((m: string, i: number) => `Meeting ${i + 1}: ${m}`),
    ...resources.filter(Boolean).map((r: string, i: number) => `Resource ${i + 1}: ${r}`),
  ];

  if (planItems.length === 0) {
    return NextResponse.json({ results: [], summary: "No plan items to compare against." });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are a sales coaching assistant. A sales rep has a quarterly plan for their relationship with ${companyName}. Compare the plan items against the logged activities to determine progress.

QUARTERLY PLAN:
${planItems.map((p, i) => `${i + 1}. ${p}`).join("\n")}

LOGGED ACTIVITIES (date | type | notes):
${activities.length > 0 ? activities.slice(-50).join("\n") : "(no activities logged yet)"}

For each plan item, return a JSON object with:
- "item": the plan item text (exactly as provided)
- "status": one of "done", "in-progress", or "not-started"
- "note": 1 short sentence explaining your assessment

Return ONLY valid JSON in this format:
{
  "results": [
    { "item": "...", "status": "done" | "in-progress" | "not-started", "note": "..." }
  ],
  "summary": "one sentence overall assessment"
}`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { results: [], summary: "Could not parse response." };
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ results: [], summary: "Could not parse AI response." });
  }
}
