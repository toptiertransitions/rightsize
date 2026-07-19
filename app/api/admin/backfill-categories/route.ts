export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Airtable from "airtable";
import { getSystemRole } from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";
import { isValidCategory, LEGACY_CATEGORY_MAP, migrateCategoryByKeyword } from "@/lib/categories";

function getBase() {
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_TOKEN! });
  return Airtable.base(process.env.AIRTABLE_BASE_ID!);
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const base = getBase();

  // Fetch all items — only need Category and Name fields
  const records = await base(AIRTABLE_TABLES.ITEMS)
    .select({ fields: ["Category", "ItemName"] })
    .all();

  type ChangeLog = { id: string; name: string; oldCat: string; newCat: string };
  const changes: ChangeLog[] = [];
  const skipped: string[] = [];
  const tally: Record<string, number> = {};

  for (const record of records) {
    const oldCat = typeof record.fields["Category"] === "string" ? record.fields["Category"] : "";
    const itemName = typeof record.fields["ItemName"] === "string" ? record.fields["ItemName"] : "";

    if (isValidCategory(oldCat)) {
      // Already valid — tally but don't touch
      tally[oldCat] = (tally[oldCat] ?? 0) + 1;
      continue;
    }

    // Try legacy direct mapping first, then keyword rules
    let newCat = LEGACY_CATEGORY_MAP[oldCat] ?? migrateCategoryByKeyword(itemName);

    changes.push({ id: record.id, name: itemName, oldCat, newCat });
    tally[newCat] = (tally[newCat] ?? 0) + 1;
    if (newCat === "Other" && !LEGACY_CATEGORY_MAP[oldCat]) skipped.push(itemName || record.id);
  }

  // Batch update in chunks of 10 (Airtable limit)
  const BATCH = 10;
  for (let i = 0; i < changes.length; i += BATCH) {
    const chunk = changes.slice(i, i + BATCH);
    await base(AIRTABLE_TABLES.ITEMS).update(
      chunk.map(c => ({ id: c.id, fields: { Category: c.newCat } }))
    );
  }

  console.log("[backfill-categories] Changes:", JSON.stringify(changes, null, 2));

  return NextResponse.json({
    totalRecords: records.length,
    alreadyValid: records.length - changes.length,
    updated: changes.length,
    flaggedAsOther: skipped.length,
    categoryTally: tally,
    changes,
    needsManualReview: skipped,
  });
}
