/**
 * Guards against receipt dates the AI read with the wrong year (2-digit years
 * like "10/23/26" sometimes come back as 2020). A date in the future or more
 * than a year old keeps its month/day and moves to the most recent year that
 * isn't after today. A date up to a week ahead (e.g. a pickup date on an order
 * confirmation) becomes today. Dates are YYYY-MM-DD strings.
 */
export function normalizeReceiptDate(date: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return today;
  const t = Date.parse(today + "T00:00:00Z");
  const d = Date.parse(date + "T00:00:00Z");
  if (Number.isNaN(d)) return today;
  const yearAgo = t - 365 * 86_400_000;
  if (d <= t && d >= yearAgo) return date;

  const mmdd = date.slice(5);
  let year = Number(today.slice(0, 4));
  let candidate = `${year}-${mmdd}`;
  if (candidate > today) {
    const ahead = Date.parse(candidate + "T00:00:00Z") - t;
    if (ahead <= 7 * 86_400_000) return today;
    candidate = `${--year}-${mmdd}`;
  }
  // Feb 29 in a non-leap year, or a bogus month/day
  const check = new Date(candidate + "T00:00:00Z");
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== candidate) return today;
  return candidate;
}
