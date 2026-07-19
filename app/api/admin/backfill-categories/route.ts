export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Airtable from "airtable";
import Anthropic from "@anthropic-ai/sdk";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";
import {
  isValidCategory,
  LEGACY_CATEGORY_MAP,
  migrateCategoryByKeyword,
  ALL_CATEGORIES,
  CATEGORY_AI_HINT,
} from "@/lib/categories";

function getBase() {
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_TOKEN! });
  return Airtable.base(process.env.AIRTABLE_BASE_ID!);
}

type ChangeLog = {
  id: string;
  name: string;
  oldCat: string;
  newCat: string;
  method: "already-valid" | "legacy-map" | "keywords" | "ai" | "other-fallback";
};

// Batch-categorize items using Claude Haiku. Returns map of record id → new category.
async function aiCategorizeBatch(
  items: Array<{ id: string; name: string; oldCat: string }>
): Promise<Map<string, string>> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const prompt = `You are a professional estate sale categorizer.
For each item below, return the single best category from the 26-value taxonomy.

${CATEGORY_AI_HINT}

Items (JSON array, one per line):
${JSON.stringify(items.map(i => ({ id: i.id, name: i.name, previousCategory: i.oldCat })))}

Return ONLY a JSON array with this exact shape — no markdown, no explanation:
[{"id":"<id>","category":"<exact category value>"}]`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "[]";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: Array<{ id: string; category: string }> = [];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[backfill-categories] AI parse error:", cleaned.slice(0, 300));
    return new Map();
  }

  const result = new Map<string, string>();
  for (const entry of parsed) {
    if (entry.id && isValidCategory(entry.category)) {
      result.set(entry.id, entry.category);
    } else if (entry.id) {
      // Fuzzy-coerce: find closest valid category by substring match
      const coerced = ALL_CATEGORIES.find(c =>
        c.toLowerCase().includes((entry.category ?? "").toLowerCase()) ||
        (entry.category ?? "").toLowerCase().includes(c.toLowerCase())
      ) ?? "Other";
      result.set(entry.id, coerced);
    }
  }
  return result;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const statuses: string[] = body.statuses ?? ["Listed", "Approved", "Pending Review"];
  const dryRun: boolean = body.dryRun === true;
  const aiAssist: boolean = body.aiAssist !== false; // default true

  const base = getBase();

  // 1. Fetch all non-archived tenant IDs
  const tenantRecords = await base(AIRTABLE_TABLES.TENANTS)
    .select({ fields: ["IsArchived"], filterByFormula: `NOT({IsArchived})` })
    .all();
  const activeTenantIds = new Set(tenantRecords.map(r => r.id));

  // 2. Fetch items with target statuses
  const statusFormula = `OR(${statuses.map(s => `{Status} = "${s}"`).join(",")})`;
  const itemRecords = await base(AIRTABLE_TABLES.ITEMS)
    .select({
      fields: ["Category", "ItemName", "TenantId"],
      filterByFormula: statusFormula,
    })
    .all();

  // 3. Filter to active tenants only
  const inScopeRecords = itemRecords.filter(r => {
    const tid = typeof r.fields["TenantId"] === "string"
      ? r.fields["TenantId"]
      : Array.isArray(r.fields["TenantId"])
        ? (r.fields["TenantId"] as string[])[0]
        : "";
    return activeTenantIds.has(tid);
  });

  const changes: ChangeLog[] = [];
  const needsAI: Array<{ id: string; name: string; oldCat: string }> = [];

  // 4. First pass: legacy map + keyword rules
  for (const record of inScopeRecords) {
    const oldCat = typeof record.fields["Category"] === "string" ? record.fields["Category"] : "";
    const itemName = typeof record.fields["ItemName"] === "string" ? record.fields["ItemName"] : "";

    if (isValidCategory(oldCat)) {
      changes.push({ id: record.id, name: itemName, oldCat, newCat: oldCat, method: "already-valid" });
      continue;
    }

    // Direct legacy map
    if (LEGACY_CATEGORY_MAP[oldCat]) {
      changes.push({ id: record.id, name: itemName, oldCat, newCat: LEGACY_CATEGORY_MAP[oldCat], method: "legacy-map" });
      continue;
    }

    // Keyword rules
    const keywordResult = migrateCategoryByKeyword(itemName);
    if (keywordResult !== "Other") {
      changes.push({ id: record.id, name: itemName, oldCat, newCat: keywordResult, method: "keywords" });
      continue;
    }

    // Unresolved — queue for AI if enabled
    if (aiAssist) {
      needsAI.push({ id: record.id, name: itemName, oldCat });
    } else {
      changes.push({ id: record.id, name: itemName, oldCat, newCat: "Other", method: "other-fallback" });
    }
  }

  // 5. AI pass in batches of 30
  if (aiAssist && needsAI.length > 0) {
    const AI_BATCH = 30;
    for (let i = 0; i < needsAI.length; i += AI_BATCH) {
      const batch = needsAI.slice(i, i + AI_BATCH);
      let aiMap: Map<string, string>;
      try {
        aiMap = await aiCategorizeBatch(batch);
      } catch (err) {
        console.error("[backfill-categories] AI batch failed, falling back:", err);
        aiMap = new Map();
      }
      for (const item of batch) {
        const aiCat = aiMap.get(item.id);
        changes.push({
          id: item.id,
          name: item.name,
          oldCat: item.oldCat,
          newCat: aiCat ?? "Other",
          method: aiCat ? "ai" : "other-fallback",
        });
      }
    }
  }

  // 6. Summarize
  const toUpdate = changes.filter(c => c.method !== "already-valid");
  const tally: Record<string, number> = {};
  for (const c of changes) tally[c.newCat] = (tally[c.newCat] ?? 0) + 1;
  const needsManualReview = changes
    .filter(c => c.method === "other-fallback")
    .map(c => ({ id: c.id, name: c.name, oldCat: c.oldCat }));

  // 7. Write to Airtable (unless dryRun)
  if (!dryRun) {
    const BATCH = 10;
    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const chunk = toUpdate.slice(i, i + BATCH);
      await base(AIRTABLE_TABLES.ITEMS).update(
        chunk.map(c => ({ id: c.id, fields: { Category: c.newCat } }))
      );
    }
  }

  const byMethod = {
    alreadyValid: changes.filter(c => c.method === "already-valid").length,
    legacyMap: changes.filter(c => c.method === "legacy-map").length,
    keywords: changes.filter(c => c.method === "keywords").length,
    ai: changes.filter(c => c.method === "ai").length,
    otherFallback: changes.filter(c => c.method === "other-fallback").length,
  };

  return NextResponse.json({
    dryRun,
    statuses,
    activeTenants: activeTenantIds.size,
    totalInScope: inScopeRecords.length,
    byMethod,
    updated: dryRun ? 0 : toUpdate.length,
    categoryTally: tally,
    needsManualReview,
    changes: toUpdate, // excludes already-valid rows to keep response size down
  });
}
