import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getReimbursableExpensesInRange,
  bulkUpdateExpenses,
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
  const paidFilter = searchParams.get("paid") || "all";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "25", 10);

  try {
    const expenses = await getReimbursableExpensesInRange(from, to, staffId);

    let filtered = expenses;
    if (paidFilter === "true") filtered = expenses.filter(e => !!e.paidAt);
    if (paidFilter === "false") filtered = expenses.filter(e => !e.paidAt);

    // Sort descending so page 1 shows most recent entries
    filtered = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    const rows = paged.map(e => ({
      id: e.id,
      date: e.date,
      clerkUserId: e.clerkUserId,
      staffName: e.staffName,
      vendor: e.vendor,
      category: e.category,
      description: e.description,
      total: e.total,
      paidAt: e.paidAt ?? null,
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

  let body: { ids: string[]; paidAt: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { ids, paidAt } = body;
  if (!ids?.length || !paidAt) return NextResponse.json({ error: "Missing ids or paidAt" }, { status: 400 });

  try {
    await bulkUpdateExpenses(ids, { paidAt });
    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
