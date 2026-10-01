import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DateTime } from "luxon";
import {
  shiftStartUTC,
  shiftEndUTC,
  reminderWindowStartUTC,
  formatShiftDateTime,
  formatShiftStartTime,
  formatShiftDateLong,
  formatShiftTimeRange,
  isShiftInPast,
  isReminderDue,
} from "./shift-time";

describe("shiftStartUTC / reminderWindowStartUTC — DST correctness", () => {
  it("fall-back (Nov 1 2026): reminder is exactly 120 real minutes before an 8:00 AM Chicago shift", () => {
    const entry = { date: "2026-11-01", startTime: "08:00" };
    const start = shiftStartUTC(entry)!;
    const reminder = reminderWindowStartUTC(entry)!;
    expect(start.isValid).toBe(true);
    // Clocks fall back at 2:00 AM local, well before 8:00 AM — so by the
    // shift's start, CST (UTC-6) is already in effect: 8:00 AM CST = 14:00 UTC.
    expect(start.toUTC().toISO()).toBe("2026-11-01T14:00:00.000Z");
    // Exactly 120 minutes earlier in absolute time, regardless of what the
    // local wall clock reads at that earlier instant.
    expect(start.diff(reminder, "minutes").minutes).toBeCloseTo(120, 5);
    expect(reminder.toUTC().toISO()).toBe("2026-11-01T12:00:00.000Z");
  });

  it("spring-forward (Mar 14 2027): reminder is exactly 120 real minutes before an 8:00 AM Chicago shift", () => {
    const entry = { date: "2027-03-14", startTime: "08:00" };
    const start = shiftStartUTC(entry)!;
    const reminder = reminderWindowStartUTC(entry)!;
    expect(start.isValid).toBe(true);
    // CDT (UTC-5) is already in effect by 8:00 AM Mar 14 2027 (clocks spring
    // forward at 2:00 AM local) — so 8:00 AM CDT = 13:00 UTC.
    expect(start.toUTC().toISO()).toBe("2027-03-14T13:00:00.000Z");
    expect(start.diff(reminder, "minutes").minutes).toBeCloseTo(120, 5);
    // The reminder window (11:00 UTC = 6:00 AM CDT) falls entirely after
    // the 2:00 AM local transition, so no nonexistent-local-time edge case
    // here — just confirms the duration math stays exact across the day.
    expect(reminder.toUTC().toISO()).toBe("2027-03-14T11:00:00.000Z");
  });

  it("a shift starting just after local midnight: reminder window falls on the previous calendar day", () => {
    const entry = { date: "2026-06-15", startTime: "00:30" };
    const start = shiftStartUTC(entry)!;
    const reminder = reminderWindowStartUTC(entry)!;
    const reminderChicago = reminder.setZone("America/Chicago");
    // 00:30 minus 2h = 22:30 the PREVIOUS day, in Chicago wall-clock terms.
    expect(reminderChicago.toFormat("yyyy-MM-dd HH:mm")).toBe("2026-06-14 22:30");
  });

  it("midnight boundary shift (00:00) parses and computes a valid reminder", () => {
    const entry = { date: "2026-06-15", startTime: "00:00" };
    const start = shiftStartUTC(entry)!;
    const reminder = reminderWindowStartUTC(entry)!;
    expect(start.isValid).toBe(true);
    expect(reminder.setZone("America/Chicago").toFormat("yyyy-MM-dd HH:mm")).toBe("2026-06-14 22:00");
  });

  it("a shift with no startTime has no computable start or reminder window", () => {
    expect(shiftStartUTC({ date: "2026-06-15", startTime: undefined })).toBeNull();
    expect(reminderWindowStartUTC({ date: "2026-06-15", startTime: undefined })).toBeNull();
  });
});

describe("shiftEndUTC — crosses midnight", () => {
  it("rolls to the next day when endTime <= startTime", () => {
    const entry = { date: "2026-06-15", startTime: "22:00", endTime: "01:00" };
    const end = shiftEndUTC(entry)!;
    expect(end.setZone("America/Chicago").toFormat("yyyy-MM-dd HH:mm")).toBe("2026-06-16 01:00");
  });
});

describe("formatting is independent of the host/test-runner's own timezone", () => {
  const originalTZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = "Asia/Tokyo"; });
  afterAll(() => { process.env.TZ = originalTZ; });

  it("still renders the correct Chicago time and 'CT' label from a Tokyo-zoned process", () => {
    const entry = { date: "2026-07-04", startTime: "09:00" };
    expect(formatShiftStartTime(entry)).toBe("9:00 AM CT");
    expect(formatShiftDateTime(entry)).toBe("Sat, Jul 4 · 9:00 AM CT");
  });
});

describe("display formatters", () => {
  it("formatShiftDateLong", () => {
    expect(formatShiftDateLong({ date: "2026-10-05" })).toBe("Monday, October 5, 2026");
  });

  it("formatShiftTimeRange with both start and end", () => {
    expect(formatShiftTimeRange({ date: "2026-10-05", startTime: "09:00", endTime: "11:00" })).toBe("9:00 AM – 11:00 AM CT");
  });

  it("formatShiftTimeRange with only a start time", () => {
    expect(formatShiftTimeRange({ date: "2026-10-05", startTime: "09:00", endTime: undefined })).toBe("9:00 AM CT");
  });
});

describe("isReminderDue — cron eligibility + idempotency", () => {
  // A fixed "now" 90 minutes before this shift's start — squarely inside
  // its 2h reminder window.
  const entry = { date: "2026-08-10", startTime: "14:00" }; // 14:00 CDT = 19:00 UTC
  const now = DateTime.fromISO("2026-08-10T17:30:00.000Z"); // 90 min before start

  it("is due for an accepted helper with no reminder sent yet", () => {
    expect(isReminderDue(entry, { status: "accepted" }, now)).toBe(true);
  });

  it("is NOT due once reminderSentAt is set — the idempotency guard", () => {
    expect(isReminderDue(entry, { status: "accepted", reminderSentAt: "2026-08-10T17:25:00.000Z" }, now)).toBe(false);
  });

  it("is NOT due for a declined helper", () => {
    expect(isReminderDue(entry, { status: "declined" }, now)).toBe(false);
  });

  it("is NOT due for a still-pending helper (spec default: no reminder on pending)", () => {
    expect(isReminderDue(entry, { status: "pending" }, now)).toBe(false);
  });

  it("is NOT due more than 2 hours before the shift", () => {
    const tooEarly = DateTime.fromISO("2026-08-10T16:00:00.000Z"); // 3h before start
    expect(isReminderDue(entry, { status: "accepted" }, tooEarly)).toBe(false);
  });

  it("is NOT due once the shift has already started", () => {
    const afterStart = DateTime.fromISO("2026-08-10T19:30:00.000Z");
    expect(isReminderDue(entry, { status: "accepted" }, afterStart)).toBe(false);
  });

  it("simulated overlapping cron ticks only fire once: second check after the first 'send' sees reminderSentAt and skips", () => {
    const helper: { status: "accepted" | "pending" | "declined"; reminderSentAt?: string } = { status: "accepted" };
    expect(isReminderDue(entry, helper, now)).toBe(true);
    // ...cron "sends" the reminder and sets reminderSentAt...
    helper.reminderSentAt = now.toISO()!;
    // A second, overlapping tick a moment later must not re-send.
    const secondTick = now.plus({ seconds: 30 });
    expect(isReminderDue(entry, helper, secondTick)).toBe(false);
  });
});

describe("isShiftInPast", () => {
  it("a far-future shift is not in the past", () => {
    expect(isShiftInPast({ date: "2099-01-01", startTime: "09:00" })).toBe(false);
  });

  it("a far-past shift is in the past", () => {
    expect(isShiftInPast({ date: "2020-01-01", startTime: "09:00" })).toBe(true);
  });
});
