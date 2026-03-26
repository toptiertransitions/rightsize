import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getStaffMember,
  getTimeEntriesInRange,
  getSoldItemsForCommission,
  getReimbursableExpensesInRange,
} from "@/lib/airtable";
import { calcReimbursableMiles } from "@/lib/pay-utils";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || (role !== "TTTStaff" && role !== "TTTManager" && role !== "TTTAdmin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const from = searchParams.get("from") || firstOfMonth;
  const to = searchParams.get("to") || today;

  try {
    const [staffMember, timeEntries, soldItems, expenses] = await Promise.all([
      getStaffMember(userId),
      getTimeEntriesInRange(from, to, userId),
      getSoldItemsForCommission(from, to, userId),
      getReimbursableExpensesInRange(from, to, userId),
    ]);

    const hourlyRate = staffMember?.hourlyRate ?? 0;
    const totalMinutes = timeEntries.reduce((s, e) => s + e.durationMinutes, 0);
    const hourlyPay = (totalMinutes / 60) * hourlyRate;

    const commissionEarned = soldItems.reduce((s, item) => {
      const pct = item.staffCommissionPercent ?? 0;
      const price = item.salePrice ?? item.valueMid ?? 0;
      return s + price * (pct / 100);
    }, 0);

    const dailyMileage = calcReimbursableMiles(timeEntries);
    const reimbursableMiles = dailyMileage.reduce((s, d) => s + d.reimbursableMiles, 0);

    const reimbursableExpensesTotal = expenses.reduce((s, e) => s + e.total, 0);
    const totalPretaxPay = hourlyPay + commissionEarned + reimbursableExpensesTotal;

    // ── Line items for accordion detail ───────────────────────────────────────
    const lineItems = [
      // Hours — one row per time entry
      ...timeEntries.map(e => ({
        type: "hours" as const,
        date: e.date,
        description: e.projectName,
        minutes: e.durationMinutes,
        value: (e.durationMinutes / 60) * hourlyRate,
      })),
      // Commission — one row per sold item
      ...soldItems.map(item => ({
        type: "commission" as const,
        date: item.saleDate ?? "",
        description: item.itemName,
        minutes: null as number | null,
        value: (item.salePrice ?? item.valueMid ?? 0) * ((item.staffCommissionPercent ?? 0) / 100),
      })),
      // Mileage — one row per day
      ...dailyMileage.filter(d => d.reimbursableMiles > 0).map(d => ({
        type: "mileage" as const,
        date: d.date,
        description: "Travel",
        minutes: null as number | null,
        value: d.reimbursableMiles,
      })),
      // Expenses — one row per expense
      ...expenses.map(e => ({
        type: "expense" as const,
        date: e.date,
        description: e.vendor,
        minutes: null as number | null,
        value: e.total,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      from,
      to,
      totalMinutes,
      hourlyRate,
      hourlyPay,
      commissionEarned,
      reimbursableMiles,
      reimbursableExpensesTotal,
      totalPretaxPay,
      lineItems,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
