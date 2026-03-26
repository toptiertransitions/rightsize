import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getSoldItemsForCommission,
  bulkUpdateItems,
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
    const items = await getSoldItemsForCommission(from, to, staffId);

    let filtered = items;
    if (paidFilter === "true") filtered = items.filter(i => !!i.commissionPaidAt);
    if (paidFilter === "false") filtered = items.filter(i => !i.commissionPaidAt);

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    const rows = paged.map(item => ({
      id: item.id,
      itemName: item.itemName,
      primaryRoute: item.primaryRoute,
      staffSellerId: item.staffSellerId,
      staffSellerName: item.staffSellerName,
      saleDate: item.saleDate,
      salePrice: item.salePrice ?? item.valueMid ?? 0,
      staffCommissionPercent: item.staffCommissionPercent ?? 0,
      commissionAmount: (item.salePrice ?? item.valueMid ?? 0) * ((item.staffCommissionPercent ?? 0) / 100),
      commissionPaidAt: item.commissionPaidAt ?? null,
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

  let body: { ids: string[]; commissionPaidAt: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { ids, commissionPaidAt } = body;
  if (!ids?.length || !commissionPaidAt) return NextResponse.json({ error: "Missing ids or commissionPaidAt" }, { status: 400 });

  try {
    await bulkUpdateItems(ids, { commissionPaidAt });
    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
