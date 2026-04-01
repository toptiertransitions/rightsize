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

  console.log(`[staff/calendar] from=${from} to=${to} entries=${entries.length} dates=${[...new Set(entries.map(e => e.date))].sort().join(",")}`);
  entries.forEach(e => {
    if (e.helpers?.length) {
      console.log(`[staff/calendar] entry ${e.id} date=${e.date} helpers=${e.helpers.map(h => h.email).join(";")}`);
    }
  });

  return NextResponse.json({ staff, entries });
}
