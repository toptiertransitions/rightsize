import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateItem } from "@/lib/airtable";
import type { Item } from "@/lib/types";

// Bulk "Price Drop?" from the catalog table view: turns the automated price
// drops off (NoPriceDrop) or back on for the ticked items. An item with drops
// off is skipped by the daily auto-drop cron and the project Drop 1/Drop 2
// buttons, and its automated price label leaves the drop schedule blank.
// Nothing else on the item changes.
export const maxDuration = 300;

const ALLOWED_ROLES = ["TTTTeamLead", "TTTManager", "TTTAdmin"];
const MAX_ITEMS = 500;
const CONCURRENCY = 4; // stays under Airtable's 5 requests/second
const ID_RE = /^rec[A-Za-z0-9]{14}$/;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { on?: unknown; ids?: unknown } | null;
  if (typeof body?.on !== "boolean") return NextResponse.json({ error: "Missing on/off" }, { status: 400 });
  const on = body.on;

  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).filter((id): id is string => typeof id === "string" && ID_RE.test(id)))];
  if (ids.length === 0) return NextResponse.json({ error: "No items selected" }, { status: 400 });
  if (ids.length > MAX_ITEMS) return NextResponse.json({ error: `Select ${MAX_ITEMS} items or fewer` }, { status: 400 });

  const updated: Item[] = [];
  const failed: string[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((id) => updateItem(id, { noPriceDrop: !on })));
    results.forEach((r, j) => {
      if (r.status === "fulfilled") updated.push(r.value);
      else {
        failed.push(batch[j]);
        console.error(`[bulk-price-drop] ${batch[j]} failed:`, r.reason);
      }
    });
    if (i + CONCURRENCY < ids.length) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[bulk-price-drop] user=${userId} on=${on} updated=${updated.length} failed=${failed.length}`);
  return NextResponse.json({ items: updated, failed });
}
