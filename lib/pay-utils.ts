import type { TimeEntry } from "./types";

export interface PayableTravelEntry {
  entryId: string;
  clerkUserId: string;
  staffName: string;
  date: string;
  projectName: string;
  totalTravelMinutes: number;
  commuteMinutes: number;   // first 30 — unpaid
  payableMinutes: number;   // beyond 30 — paid at hourly rate
  travelPaidAt: string | null;
}

/**
 * Returns one row per time entry that has travelMinutes > 0.
 * First 30 minutes per entry = commute (unpaid). Anything beyond = payable.
 */
export function calcPayableTravelTime(entries: TimeEntry[]): PayableTravelEntry[] {
  return entries
    .filter(e => (e.travelMinutes ?? 0) > 0)
    .map(e => {
      const total = e.travelMinutes!;
      const commute = Math.min(total, 30);
      const payable = Math.max(0, total - 30);
      return {
        entryId: e.id,
        clerkUserId: e.clerkUserId,
        staffName: e.staffName,
        date: e.date,
        projectName: e.projectName,
        totalTravelMinutes: total,
        commuteMinutes: commute,
        payableMinutes: payable,
        travelPaidAt: e.travelPaidAt ?? null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface DailyMileage {
  clerkUserId: string;
  staffName: string;
  date: string;
  totalMiles: number;
  reimbursableMiles: number;
  entryIds: string[];
}

/**
 * Groups time entries by clerkUserId + date, sums travelMiles for each day,
 * applies the 20-mile daily deduction, and returns only days with reimbursable miles.
 */
export function calcReimbursableMiles(entries: TimeEntry[]): DailyMileage[] {
  const map = new Map<string, DailyMileage>();

  for (const entry of entries) {
    if (!entry.travelMiles || entry.travelMiles <= 0) continue;
    const key = `${entry.clerkUserId}::${entry.date}`;
    const existing = map.get(key);
    if (existing) {
      existing.totalMiles += entry.travelMiles;
      existing.entryIds.push(entry.id);
    } else {
      map.set(key, {
        clerkUserId: entry.clerkUserId,
        staffName: entry.staffName,
        date: entry.date,
        totalMiles: entry.travelMiles,
        reimbursableMiles: 0, // calculated below
        entryIds: [entry.id],
      });
    }
  }

  const results: DailyMileage[] = [];
  for (const row of map.values()) {
    row.reimbursableMiles = Math.max(0, row.totalMiles - 20);
    results.push(row);
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}
