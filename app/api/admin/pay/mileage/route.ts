import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getTimeEntriesInRange,
  bulkUpdateTimeEntries,
} from "@/lib/airtable";
import { calcReimbursableMiles } from "@/lib/pay-utils";

async function requireManager(userId: string) {
  const role = await getSystemRole(userId);
  return role === "TTTManager" || role === "TTTAdmin";
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireManager(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const from = searchParams.get("from") || firstOfMonth;
  const to = searchParams.get("to") || today;
  const staffId = searchParams.get("staffId") || undefined;
  const paidFilter = searchParams.get("paid") || "all";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "25", 10);

  try {
    const entries = await getTimeEntriesInRange(from, to, staffId);
    // Only entries that have travelMiles
    const travelEntries = entries.filter(e => (e.travelMiles ?? 0) > 0);
    const dailyRows = calcReimbursableMiles(travelEntries);

    // Annotate each row with paid status — a day is "paid" if ALL its entries have mileagePaidAt
    const annotated = dailyRows.map(row => {
      const rowEntries = travelEntries.filter(e => row.entryIds.includes(e.id));
      const paidAt = rowEntries.every(e => !!e.mileagePaidAt) ? rowEntries[0]?.mileagePaidAt : null;
      return { ...row, mileagePaidAt: paidAt ?? null };
    });

    let filtered = annotated;
    if (paidFilter === "true") filtered = annotated.filter(r => !!r.mileagePaidAt);
    if (paidFilter === "false") filtered = annotated.filter(r => !r.mileagePaidAt);

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return NextResponse.json({ rows: paged, total, page, pageSize });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireManager(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { entryIds: string[]; mileagePaidAt: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { entryIds, mileagePaidAt } = body;
  if (!entryIds?.length || !mileagePaidAt) return NextResponse.json({ error: "Missing entryIds or mileagePaidAt" }, { status: 400 });

  try {
    await bulkUpdateTimeEntries(entryIds, { mileagePaidAt });
    return NextResponse.json({ ok: true, updated: entryIds.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
