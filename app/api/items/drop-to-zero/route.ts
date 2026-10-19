import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateItem } from "@/lib/airtable";
import type { Item } from "@/lib/types";

// Bulk "Drop to $0" from the catalog table view. Deliberately narrow: it
// clears ValueMid and sets Status to Donated, and nothing else. It calls
// updateItem directly rather than going through PATCH /api/items, so none of
// that route's side effects (sold reversal, route/vendor/share recalcs,
// notifications) run.
export const maxDuration = 300;

const ALLOWED_ROLES = ["TTTTeamLead", "TTTManager", "TTTAdmin"];
const MAX_ITEMS = 500;
const CONCURRENCY = 4; // stays under Airtable's 5 requests/second

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && /^rec[A-Za-z0-9]{14}$/.test(id)))]
    : [];
  if (ids.length === 0) return NextResponse.json({ error: "No items selected" }, { status: 400 });
  if (ids.length > MAX_ITEMS) return NextResponse.json({ error: `Select ${MAX_ITEMS} items or fewer` }, { status: 400 });

  const updated: Item[] = [];
  const failed: string[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((id) => updateItem(id, { valueMid: null, status: "Donated" } as unknown as Partial<Item>))
    );
    results.forEach((r, j) => {
      if (r.status === "fulfilled") updated.push(r.value);
      else {
        failed.push(batch[j]);
        console.error(`[drop-to-zero] ${batch[j]} failed:`, r.reason);
      }
    });
    if (i + CONCURRENCY < ids.length) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[drop-to-zero] user=${userId} updated=${updated.length} failed=${failed.length}`);
  return NextResponse.json({ items: updated, failed });
}
