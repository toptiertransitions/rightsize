import { describe, it, expect } from "vitest";
import { weekStartOf, weeklyHours, goalStreak, normalizeMonthDay, nextBirthday, nextAnniversary, yearsOfService, dayOfWeek } from "./about-me";

describe("weekly hours", () => {
  it("weeks start on Monday", () => {
    expect(weekStartOf("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26"); // Sunday
    expect(weekStartOf("2026-10-28")).toBe("2026-10-26");
    expect(dayOfWeek("2026-10-28")).toBe(3);
  });

  it("buckets entries into the last N weeks and ignores older ones", () => {
    const w = weeklyHours(
      [
        { date: "2026-10-27", durationMinutes: 120 },
        { date: "2026-10-26", durationMinutes: 60 },
        { date: "2026-10-25", durationMinutes: 30 }, // previous week (Sunday)
        { date: "2026-01-01", durationMinutes: 999 }, // too old
      ],
      "2026-10-28",
      4,
    );
    expect(w.map((x) => x.weekStart)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(w.map((x) => x.minutes)).toEqual([0, 0, 30, 180]);
  });

  it("streak counts completed weeks at or above target, skipping the current week", () => {
    const weeks = [600, 1200, 1300, 1200, 10].map((minutes, i) => ({ weekStart: String(i), minutes }));
    expect(goalStreak(weeks, 20)).toBe(3);
    expect(goalStreak(weeks, undefined)).toBe(0);
  });
});

describe("celebrations", () => {
  it("normalizes month-day birthdays", () => {
    expect(normalizeMonthDay("3-7")).toBe("03-07");
    expect(normalizeMonthDay("1985-12-25")).toBe("12-25");
    expect(normalizeMonthDay("02-30")).toBeNull();
    expect(normalizeMonthDay("")).toBeNull();
  });

  it("birthday countdown rolls to next year once passed", () => {
    expect(nextBirthday("10-26", "2026-10-26")).toMatchObject({ date: "2026-10-26", daysAway: 0 });
    expect(nextBirthday("10-25", "2026-10-26")).toMatchObject({ date: "2027-10-25", daysAway: 364 });
    expect(nextBirthday("02-29", "2026-10-26")?.date).toBe("2027-02-28");
  });

  it("anniversary counts the years being completed", () => {
    expect(nextAnniversary("2023-11-05", "2026-10-26")).toMatchObject({ date: "2026-11-05", daysAway: 10, years: 3 });
    expect(nextAnniversary("2023-10-26", "2026-10-26")).toMatchObject({ daysAway: 0, years: 3 });
    expect(nextAnniversary("2026-10-26", "2026-10-26")).toMatchObject({ date: "2027-10-26", years: 1 });
    expect(nextAnniversary("2027-01-01", "2026-10-26")).toBeNull();
    expect(yearsOfService("2023-11-05", "2026-10-26")).toBe(2);
    expect(yearsOfService("2023-10-26", "2026-10-26")).toBe(3);
  });
});
