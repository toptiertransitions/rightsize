import { DateTime } from "luxon";
import type { PlanEntry, PlanHelper } from "./types";

// Single source of truth for shift date/time math. PlanEntry.date/startTime/
// endTime are stored as naive strings ("YYYY-MM-DD" / "HH:MM") with no
// offset — they've only ever been implicitly America/Chicago (see
// lib/googleCalendar.ts, which hands Google the same naive string plus this
// zone name and lets Google's API do the interpretation). Nothing server-side
// previously computed a real UTC instant from them; this module is that.
//
// Never parse these fields with `new Date(...)` directly — that uses the
// server process's local zone (UTC in production), which would silently
// shift every shift time. Always go through here.
export const BUSINESS_TIMEZONE = "America/Chicago";

/**
 * The shift's start as a real instant, correct across DST. Returns null if
 * the shift has no startTime (e.g. an all-day/key-date entry) or the
 * date/time fails to parse.
 */
export function shiftStartUTC(entry: Pick<PlanEntry, "date" | "startTime">): DateTime | null {
  if (!entry.startTime) return null;
  const dt = DateTime.fromFormat(`${entry.date} ${entry.startTime}`, "yyyy-MM-dd HH:mm", {
    zone: BUSINESS_TIMEZONE,
  });
  return dt.isValid ? dt.toUTC() : null;
}

/** Same as shiftStartUTC but for endTime. Handles a shift that crosses midnight by rolling to the next day if end <= start. */
export function shiftEndUTC(entry: Pick<PlanEntry, "date" | "startTime" | "endTime">): DateTime | null {
  if (!entry.endTime) return null;
  let dt = DateTime.fromFormat(`${entry.date} ${entry.endTime}`, "yyyy-MM-dd HH:mm", {
    zone: BUSINESS_TIMEZONE,
  });
  if (!dt.isValid) return null;
  const start = shiftStartUTC(entry);
  if (start && dt.toUTC() <= start) dt = dt.plus({ days: 1 });
  return dt.toUTC();
}

/**
 * The instant a 2-hour-before reminder should fire, as a true UTC instant —
 * computed by subtracting a duration from the zoned start, which Luxon does
 * in absolute time, so this stays exactly 120 real minutes before the shift
 * even across a DST transition that falls in between.
 */
export function reminderWindowStartUTC(entry: Pick<PlanEntry, "date" | "startTime">): DateTime | null {
  const start = shiftStartUTC(entry);
  return start ? start.minus({ minutes: 120 }) : null;
}

/** "Mon, Oct 5 · 9:00 AM CT" — push notification body. */
export function formatShiftDateTime(entry: Pick<PlanEntry, "date" | "startTime">): string {
  const start = shiftStartUTC(entry);
  if (!start) return formatShiftDateLong(entry);
  const local = start.setZone(BUSINESS_TIMEZONE);
  return `${local.toFormat("ccc, LLL d")} · ${formatShiftStartTime(entry)}`;
}

/** "9:00 AM CT" alone — e.g. for a push body that already states the date/project separately. */
export function formatShiftStartTime(entry: Pick<PlanEntry, "date" | "startTime">): string {
  const start = shiftStartUTC(entry);
  if (!start) return "";
  return `${start.setZone(BUSINESS_TIMEZONE).toFormat("h:mm a")} CT`;
}

/** "Monday, October 5, 2026" — landing page header. */
export function formatShiftDateLong(entry: Pick<PlanEntry, "date">): string {
  const dt = DateTime.fromFormat(entry.date, "yyyy-MM-dd", { zone: BUSINESS_TIMEZONE });
  return dt.isValid ? dt.toFormat("cccc, LLLL d, yyyy") : entry.date;
}

/** "9:00 AM – 11:00 AM CT" — landing page time range. Falls back gracefully if endTime is missing. */
export function formatShiftTimeRange(entry: Pick<PlanEntry, "date" | "startTime" | "endTime">): string {
  const start = shiftStartUTC(entry);
  if (!start) return "";
  const startLocal = start.setZone(BUSINESS_TIMEZONE);
  const end = shiftEndUTC(entry);
  if (!end) return `${startLocal.toFormat("h:mm a")} CT`;
  const endLocal = end.setZone(BUSINESS_TIMEZONE);
  return `${startLocal.toFormat("h:mm a")} – ${endLocal.toFormat("h:mm a")} CT`;
}

/**
 * Pure eligibility check for the 2h-reminder cron (app/api/cron/shift-reminders)
 * — isolated from Airtable I/O so it's directly unit-testable. True only
 * when all of: the shift has a real start time, that start is still in the
 * future, the reminder window has arrived, the helper is "accepted" (not
 * declined, and not still "pending" — the spec default is no reminder on
 * an unanswered invite), and no reminder has been sent yet for this helper.
 */
export function isReminderDue(entry: Pick<PlanEntry, "date" | "startTime">, helper: Pick<PlanHelper, "status" | "reminderSentAt">, now: DateTime): boolean {
  if (helper.status !== "accepted") return false;
  if (helper.reminderSentAt) return false;
  const start = shiftStartUTC(entry);
  if (!start || start <= now) return false;
  const windowStart = reminderWindowStartUTC(entry);
  if (!windowStart || now < windowStart) return false;
  return true;
}

/** True once the shift's start instant has passed. */
export function isShiftInPast(entry: Pick<PlanEntry, "date" | "startTime">): boolean {
  const start = shiftStartUTC(entry);
  if (!start) {
    // No startTime recorded — fall back to end-of-day in the business zone.
    const dayEnd = DateTime.fromFormat(entry.date, "yyyy-MM-dd", { zone: BUSINESS_TIMEZONE }).endOf("day");
    return dayEnd.isValid ? DateTime.utc() > dayEnd.toUTC() : false;
  }
  return DateTime.utc() > start;
}
