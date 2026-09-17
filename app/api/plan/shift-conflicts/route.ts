import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPlanEntriesForDateRange, getTenants } from "@/lib/airtable";

// For the Plan page's Add/Edit Daily Focus Shift modal: given a date, which
// TTT team members are already helpers on ANOTHER project's shift that same
// day (so a manager doesn't accidentally double-book someone). This is
// separate from the weekly-availability/time-off check, which only looks at
// a person's own declared schedule, not what they're already assigned to.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });
  const excludeEntryId = req.nextUrl.searchParams.get("excludeEntryId") || undefined;
  const excludeTenantId = req.nextUrl.searchParams.get("excludeTenantId") || undefined;

  const [entries, tenants] = await Promise.all([
    getPlanEntriesForDateRange(date, date).catch(() => []),
    getTenants().catch(() => []),
  ]);
  const tenantNameMap = new Map(tenants.map((t) => [t.id, t.name]));

  const conflicts: Record<string, { projectName: string; startTime?: string; endTime?: string }[]> = {};
  for (const e of entries) {
    if (e.entryType === "keydate") continue; // key dates aren't a crew assignment
    if (excludeEntryId && e.id === excludeEntryId) continue; // the shift being edited isn't a conflict with itself
    if (excludeTenantId && e.tenantId === excludeTenantId) continue; // other shifts on the SAME project aren't a double-booking
    for (const h of e.helpers ?? []) {
      if (h.status === "declined") continue;
      const key = h.email.toLowerCase();
      if (!conflicts[key]) conflicts[key] = [];
      conflicts[key].push({
        projectName: tenantNameMap.get(e.tenantId) ?? "Unknown Project",
        startTime: e.startTime,
        endTime: e.endTime,
      });
    }
  }

  return NextResponse.json({ conflicts });
}
