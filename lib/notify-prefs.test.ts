import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { inQuietHours, defaultProjectLevel } from "./notify-prefs";

// Central Time is UTC-5 in October (CDT)
const at = (ctHour: number, ctMin = 0) => new Date(Date.UTC(2026, 9, 16, ctHour + 5, ctMin));

describe("quiet hours", () => {
  const overnight = { enabled: true, start: "21:00", end: "07:00" };

  it("covers a window that crosses midnight", () => {
    expect(inQuietHours(overnight, at(22))).toBe(true);
    expect(inQuietHours(overnight, at(2))).toBe(true);
    expect(inQuietHours(overnight, at(6, 59))).toBe(true);
    expect(inQuietHours(overnight, at(7))).toBe(false);
    expect(inQuietHours(overnight, at(12))).toBe(false);
  });

  it("covers a same-day window", () => {
    const lunch = { enabled: true, start: "12:00", end: "13:00" };
    expect(inQuietHours(lunch, at(12, 30))).toBe(true);
    expect(inQuietHours(lunch, at(13))).toBe(false);
  });

  it("does nothing when off", () => {
    expect(inQuietHours({ ...overnight, enabled: false }, at(23))).toBe(false);
  });
});

describe("default project level", () => {
  it("is everything for the project's Team Lead, mentions for everyone else", () => {
    expect(defaultProjectLevel("user_lead", { teamLeadClerkId: "user_lead" })).toBe("all");
    expect(defaultProjectLevel("user_crew", { teamLeadClerkId: "user_lead" })).toBe("mentions");
  });
});
