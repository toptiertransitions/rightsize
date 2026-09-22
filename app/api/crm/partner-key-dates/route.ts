import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getPlanEntriesForTenants } from "@/lib/airtable";

// Key Dates for a set of active projects, for the CRM Partner Spotlight's
// "Active Projects and Timelines" calendar — lets Sales reps answer a
// partner's "what's the status / when's the move" call without leaving the
// CRM to go dig through each project's Plan tab individually.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const idsParam = req.nextUrl.searchParams.get("tenantIds") || "";
  const tenantIds = idsParam.split(",").map(s => s.trim()).filter(Boolean);
  if (tenantIds.length === 0) return NextResponse.json({ entries: [] });

  const entries = await getPlanEntriesForTenants(tenantIds).catch(() => []);
  const keyDates = entries.filter(e => e.entryType === "keydate");

  return NextResponse.json({ entries: keyDates });
}
