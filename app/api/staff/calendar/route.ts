import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getStaffMembers, getPlanEntriesForDateRange } from "@/lib/airtable";

const ALLOWED = ["TTTManager", "TTTAdmin", "TTTSales"] as const;

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !ALLOWED.includes(role as typeof ALLOWED[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to params" }, { status: 400 });
  }

  const [staff, entries] = await Promise.all([
    getStaffMembers(),
    getPlanEntriesForDateRange(from, to),
  ]);

  const dateCounts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.date] = (acc[e.date] ?? 0) + 1;
    return acc;
  }, {});
  const withHelpers = entries.filter(e => e.helpers?.length);
  console.log(`[staff/calendar] from=${from} to=${to} total=${entries.length} withHelpers=${withHelpers.length} dates=${JSON.stringify(dateCounts)}`);
  withHelpers.forEach(e => {
    console.log(`[staff/calendar] shift date=${e.date} helpers=[${e.helpers!.map(h => h.email).join(", ")}]`);
  });

  return NextResponse.json({ staff, entries });
}
