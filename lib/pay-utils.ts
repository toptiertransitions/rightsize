import type { TimeEntry } from "./types";

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
