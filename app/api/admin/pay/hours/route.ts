import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getTimeEntriesInRange,
  getStaffMembers,
  bulkUpdateTimeEntries,
} from "@/lib/airtable";

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
  const paidFilter = searchParams.get("paid") || "all"; // "all" | "true" | "false"
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "25", 10);

  try {
    const [entries, staffMembers] = await Promise.all([
      getTimeEntriesInRange(from, to, staffId),
      getStaffMembers(),
    ]);

    const rateByClerkId = new Map(staffMembers.map(s => [s.clerkUserId, s.hourlyRate ?? 0]));

    let filtered = entries;
    if (paidFilter === "true") filtered = entries.filter(e => !!e.hoursPaidAt);
    if (paidFilter === "false") filtered = entries.filter(e => !e.hoursPaidAt);

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    const rows = paged.map(e => ({
      id: e.id,
      date: e.date,
      clerkUserId: e.clerkUserId,
      staffName: e.staffName,
      projectName: e.projectName,
      focusArea: e.focusArea,
      durationMinutes: e.durationMinutes,
      hourlyRate: rateByClerkId.get(e.clerkUserId) ?? 0,
      pay: (e.durationMinutes / 60) * (rateByClerkId.get(e.clerkUserId) ?? 0),
      hoursPaidAt: e.hoursPaidAt ?? null,
      nonBillable: e.nonBillable ?? false,
    }));

    return NextResponse.json({ rows, total, page, pageSize });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireManager(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { ids: string[]; hoursPaidAt: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { ids, hoursPaidAt } = body;
  if (!ids?.length || !hoursPaidAt) return NextResponse.json({ error: "Missing ids or hoursPaidAt" }, { status: 400 });

  try {
    await bulkUpdateTimeEntries(ids, { hoursPaidAt });
    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
