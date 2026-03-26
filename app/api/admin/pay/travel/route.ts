import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getTimeEntriesInRange,
  getStaffMembers,
  bulkUpdateTimeEntries,
} from "@/lib/airtable";
import { calcPayableTravelTime } from "@/lib/pay-utils";

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
    const [entries, staffMembers] = await Promise.all([
      getTimeEntriesInRange(from, to, staffId),
      getStaffMembers(),
    ]);

    const rateByClerkId = new Map(staffMembers.map(s => [s.clerkUserId, s.hourlyRate ?? 0]));
    const travelRows = calcPayableTravelTime(entries);

    const annotated = travelRows.map(r => ({
      ...r,
      hourlyRate: rateByClerkId.get(r.clerkUserId) ?? 0,
      pay: (r.payableMinutes / 60) * (rateByClerkId.get(r.clerkUserId) ?? 0),
    }));

    let filtered = annotated;
    if (paidFilter === "true") filtered = annotated.filter(r => !!r.travelPaidAt);
    if (paidFilter === "false") filtered = annotated.filter(r => !r.travelPaidAt);

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

  let body: { ids: string[]; travelPaidAt: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { ids, travelPaidAt } = body;
  if (!ids?.length || !travelPaidAt) return NextResponse.json({ error: "Missing ids or travelPaidAt" }, { status: 400 });

  try {
    await bulkUpdateTimeEntries(ids, { travelPaidAt });
    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
