import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getTenantById, getPlanEntriesForTenant, getTenants } from "@/lib/airtable";

// GET /api/staff/project-context
//   ?q=search      → search active tenants by name (returns list for autocomplete)
//   ?tenantId=xxx  → return full project context for AI mapping

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || role === "TTTSales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const tenantId = searchParams.get("tenantId");

  // ── Autocomplete search ────────────────────────────────────────────────────
  if (q !== null) {
    try {
      const all = await getTenants();
      const active = all.filter(t => !t.isArchived);
      const lower = q.toLowerCase();
      const matches = active
        .filter(t => t.name.toLowerCase().includes(lower))
        .slice(0, 10)
        .map(t => ({
          id: t.id,
          name: t.name,
          address: t.address,
          city: t.city,
          state: t.state,
        }));
      return NextResponse.json({ tenants: matches });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  // ── Full project context ───────────────────────────────────────────────────
  if (tenantId) {
    try {
      const [tenant, entries] = await Promise.all([
        getTenantById(tenantId),
        getPlanEntriesForTenant(tenantId),
      ]);

      if (!tenant) return NextResponse.json({ error: "Project not found" }, { status: 404 });

      // Separate key dates from focus shifts
      const keyDates = entries.filter(e => e.entryType === "keydate");
      const focusShifts = entries.filter(e => e.entryType !== "keydate");

      // Upcoming entries only (from today)
      const today = new Date().toISOString().slice(0, 10);
      const upcomingKeyDates = keyDates
        .filter(e => e.date >= today)
        .map(e => ({
          date: e.date,
          activity: e.activity,
          notes: e.notes,
          address: e.address,
          startTime: e.startTime,
          endTime: e.endTime,
        }));

      const upcomingShifts = focusShifts
        .filter(e => e.date >= today)
        .map(e => ({
          date: e.date,
          activity: e.activity,
          notes: e.notes,
          address: e.address || tenant.address,
          startTime: e.startTime,
          endTime: e.endTime,
          helperCount: e.helpers?.length ?? 0,
        }));

      const teamLeadsNeeded = 1;
      const staffNeeded = 2;

      return NextResponse.json({
        project: {
          id: tenant.id,
          name: tenant.name,
          address: tenant.address,
          city: tenant.city,
          state: tenant.state,
          fullAddress: [tenant.address, tenant.city, tenant.state].filter(Boolean).join(", "),
          upcomingKeyDates,
          upcomingShifts,
          teamLeadsNeeded,
          staffNeeded,
        },
      });
    } catch (e) {
      console.error("[project-context GET]", e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Provide ?q= for search or ?tenantId= for full context" }, { status: 400 });
}
