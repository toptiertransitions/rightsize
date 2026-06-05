import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getTimeEntriesInRange,
  getPlanEntriesForDateRange,
  getStaffMembers,
} from "@/lib/airtable";

async function requireManager(userId: string) {
  const role = await getSystemRole(userId);
  return role === "TTTManager" || role === "TTTAdmin";
}

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function fmtTime(t?: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export type AuditFlagType =
  | "outside_window"
  | "wrong_focus_area"
  | "missing_travel_time"
  | "missing_travel_miles";

export interface AuditFlag {
  type: AuditFlagType;
  label: string;
  detail: string;
}

export interface AuditRow {
  entryId: string;
  clerkUserId: string;
  staffName: string;
  date: string;
  projectName: string;
  startTime: string;
  endTime: string;
  focusArea: string;
  travelMiles?: number;
  travelMinutes?: number;
  nonBillable: boolean;
  flags: AuditFlag[];
  matchedShift?: {
    activity: string;
    startTime?: string;
    endTime?: string;
    address?: string;
  };
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
  const staffIdFilter = searchParams.get("staffId") || undefined;

  try {
    const [timeEntries, planEntries, staffMembers] = await Promise.all([
      getTimeEntriesInRange(from, to, staffIdFilter),
      getPlanEntriesForDateRange(from, to),
      getStaffMembers(),
    ]);

    // Build lookup maps
    const staffByEmail = new Map(staffMembers.map(s => [s.email.toLowerCase(), s]));
    const staffById = new Map(staffMembers.map(s => [s.clerkUserId, s]));

    // Index plan entries by "date::tenantId" for fast lookup, keeping only focus entries
    const plansByDateTenant = new Map<string, typeof planEntries>();
    for (const pe of planEntries) {
      if (pe.entryType === "keydate") continue;
      const key = `${pe.date}::${pe.tenantId}`;
      if (!plansByDateTenant.has(key)) plansByDateTenant.set(key, []);
      plansByDateTenant.get(key)!.push(pe);
    }

    // Pre-compute helper clerkUserIds per plan entry
    const helperIdsByPlan = new Map<string, Set<string>>();
    for (const pe of planEntries) {
      const ids = new Set<string>();
      for (const h of pe.helpers ?? []) {
        const staff = staffByEmail.get(h.email.toLowerCase());
        if (staff) ids.add(staff.clerkUserId);
      }
      helperIdsByPlan.set(pe.id, ids);
    }

    const auditRows: AuditRow[] = [];

    for (const entry of timeEntries) {
      const flags: AuditFlag[] = [];

      // Find the best-matching plan entry for this time entry
      const key = `${entry.date}::${entry.tenantId}`;
      const candidates = plansByDateTenant.get(key) ?? [];
      const matchedPlan = candidates.find(pe =>
        (helperIdsByPlan.get(pe.id) ?? new Set()).has(entry.clerkUserId)
      );

      if (matchedPlan) {
        // 1. Focus area mismatch
        if (
          matchedPlan.activity &&
          entry.focusArea &&
          !entry.nonBillable &&
          matchedPlan.activity !== entry.focusArea
        ) {
          flags.push({
            type: "wrong_focus_area",
            label: "Wrong Focus Area",
            detail: `Scheduled: ${matchedPlan.activity} · Logged: ${entry.focusArea}`,
          });
        }

        // 2. Outside shift window (with 15-min grace buffer)
        if (matchedPlan.startTime && matchedPlan.endTime && entry.startTime && entry.endTime) {
          const planStart = timeToMins(matchedPlan.startTime);
          const planEnd = timeToMins(matchedPlan.endTime);
          const logStart = timeToMins(entry.startTime);
          const logEnd = timeToMins(entry.endTime);
          const GRACE = 15;
          if (logStart < planStart - GRACE || logEnd > planEnd + GRACE) {
            flags.push({
              type: "outside_window",
              label: "Outside Shift Window",
              detail: `Scheduled ${fmtTime(matchedPlan.startTime)}–${fmtTime(matchedPlan.endTime)} · Logged ${fmtTime(entry.startTime)}–${fmtTime(entry.endTime)}`,
            });
          }
        }

        // 3 & 4. Missing travel data — only when shift has a distinct address
        const shiftAddress = matchedPlan.address;
        const staffAddress = staffById.get(entry.clerkUserId)?.address;
        if (shiftAddress && staffAddress && shiftAddress.trim() !== staffAddress.trim() && !entry.nonBillable) {
          if (!entry.travelMinutes) {
            flags.push({
              type: "missing_travel_time",
              label: "Missing Travel Time",
              detail: `Shift at "${shiftAddress}" — no travel time logged`,
            });
          }
          if (!entry.travelMiles) {
            flags.push({
              type: "missing_travel_miles",
              label: "Missing Travel Miles",
              detail: `Shift at "${shiftAddress}" — no travel miles logged`,
            });
          }
        }
      } else if (!entry.nonBillable) {
        // No matched plan entry — check for missing travel data generically
        // (only flag if travel is completely absent and a tenant is set)
        if (entry.tenantId && !entry.travelMinutes && !entry.travelMiles) {
          // Don't flag by default — too noisy without address context
          // Only surface if both are missing — user can tune this
        }

        // Still flag if travel miles present but no travel time (or vice versa)
        if (entry.travelMiles && entry.travelMiles > 0 && !entry.travelMinutes) {
          flags.push({
            type: "missing_travel_time",
            label: "Miles Without Travel Time",
            detail: `${entry.travelMiles} miles logged but no travel time`,
          });
        }
        if (entry.travelMinutes && entry.travelMinutes > 0 && !entry.travelMiles) {
          flags.push({
            type: "missing_travel_miles",
            label: "Travel Time Without Miles",
            detail: `${entry.travelMinutes} min travel logged but no miles`,
          });
        }
      }

      if (flags.length > 0) {
        auditRows.push({
          entryId: entry.id,
          clerkUserId: entry.clerkUserId,
          staffName: entry.staffName,
          date: entry.date,
          projectName: entry.projectName,
          startTime: entry.startTime,
          endTime: entry.endTime,
          focusArea: entry.focusArea,
          travelMiles: entry.travelMiles,
          travelMinutes: entry.travelMinutes,
          nonBillable: entry.nonBillable ?? false,
          flags,
          matchedShift: matchedPlan
            ? {
                activity: matchedPlan.activity,
                startTime: matchedPlan.startTime,
                endTime: matchedPlan.endTime,
                address: matchedPlan.address,
              }
            : undefined,
        });
      }
    }

    // Summary counts by flag type
    const summary: Record<AuditFlagType, number> = {
      outside_window: 0,
      wrong_focus_area: 0,
      missing_travel_time: 0,
      missing_travel_miles: 0,
    };
    for (const row of auditRows) {
      for (const f of row.flags) summary[f.type]++;
    }

    return NextResponse.json({ rows: auditRows, summary, total: auditRows.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
