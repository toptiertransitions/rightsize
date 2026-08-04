/**
 * CT (America/Chicago) date utilities.
 *
 * Airtable stores CreatedAt / SignedAt / etc. as full ISO datetime strings written
 * with `new Date().toISOString()` (UTC).  A record created at 11 pm CT on July 31
 * is stored as "2026-08-01T04:00:00.000Z".  Naively slicing [:10] yields "2026-08-01"
 * — the WRONG calendar date for Chicago users.
 *
 * Date-only strings (YYYY-MM-DD) from Airtable date fields already represent the
 * CT calendar date set by the user; they must NOT be run through a Date constructor
 * (which would parse them as UTC midnight and shift them back a day).
 *
 * All server-side code should use these helpers instead of new Date() / .getMonth() /
 * .toISOString().slice(0,10).
 */

const TZ = "America/Chicago";

/**
 * Convert any Airtable date/datetime string → YYYY-MM-DD in CT.
 * Safe for both date-only and full ISO datetime inputs.
 */
export function ctDateStr(s: string | null | undefined): string {
  if (!s) return "";
  // Date-only strings represent the CT calendar date already — do not convert.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  // en-CA locale returns YYYY-MM-DD in the specified timezone.
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** YYYY-MM month key in CT for any Airtable date/datetime string. */
export function ctMonthKey(s: string | null | undefined): string {
  const d = ctDateStr(s);
  return d ? d.slice(0, 7) : "";
}

/** Today's date in CT as YYYY-MM-DD. */
export function ctToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * Current CT year, month (1-indexed), and day.
 * Use instead of new Date().getFullYear() / getMonth() on the server,
 * which return UTC values on Vercel.
 */
export function ctNow(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return {
    year:  Number(parts.find(p => p.type === "year")!.value),
    month: Number(parts.find(p => p.type === "month")!.value),
    day:   Number(parts.find(p => p.type === "day")!.value),
  };
}
