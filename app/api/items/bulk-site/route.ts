import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateItem } from "@/lib/airtable";
import type { Item } from "@/lib/types";

// Bulk "Site?" from the catalog table view: turns the profoundfinds.com
// toggle (StorefrontActive) on or off for the ticked items. Turning on also
// fills an empty Pickup Location with the project's city, same as the
// single-item toggle in the editor. Nothing else on the item changes.
export const maxDuration = 300;

const ALLOWED_ROLES = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"];
const MAX_ITEMS = 500;
const CONCURRENCY = 4; // stays under Airtable's 5 requests/second
const ID_RE = /^rec[A-Za-z0-9]{14}$/;

type Entry = { id: string; pickupLocation?: string };

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { on?: unknown; items?: unknown } | null;
  if (typeof body?.on !== "boolean") return NextResponse.json({ error: "Missing on/off" }, { status: 400 });
  const on = body.on;

  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const raw of Array.isArray(body.items) ? body.items : []) {
    const id = (raw as Entry)?.id;
    if (typeof id !== "string" || !ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    const loc = (raw as Entry).pickupLocation;
    entries.push({ id, pickupLocation: typeof loc === "string" && loc.trim() ? loc.trim().slice(0, 200) : undefined });
  }
  if (entries.length === 0) return NextResponse.json({ error: "No items selected" }, { status: 400 });
  if (entries.length > MAX_ITEMS) return NextResponse.json({ error: `Select ${MAX_ITEMS} items or fewer` }, { status: 400 });

  const updated: Item[] = [];
  const failed: string[] = [];
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((e) => updateItem(e.id, {
        storefrontActive: on,
        ...(on && e.pickupLocation ? { pickupLocation: e.pickupLocation } : {}),
      }))
    );
    results.forEach((r, j) => {
      if (r.status === "fulfilled") updated.push(r.value);
      else {
        failed.push(batch[j].id);
        console.error(`[bulk-site] ${batch[j].id} failed:`, r.reason);
      }
    });
    if (i + CONCURRENCY < entries.length) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[bulk-site] user=${userId} on=${on} updated=${updated.length} failed=${failed.length}`);
  return NextResponse.json({ items: updated, failed });
}
