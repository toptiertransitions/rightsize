import { describe, it, expect } from "vitest";
import { isNonTTTClient } from "./tips-access";

describe("isNonTTTClient", () => {
  it("is true for a client with only self-serve projects", () => {
    expect(isNonTTTClient(null, [{ isTTT: false }])).toBe(true);
    expect(isNonTTTClient(null, [{ isTTT: undefined }, { isTTT: false }])).toBe(true);
  });

  it("is false for any TTT system role", () => {
    for (const role of ["TTTAdmin", "TTTManager", "TTTSales", "TTTStaff", "TTTTeamLead"]) {
      expect(isNonTTTClient(role, [{ isTTT: false }])).toBe(false);
    }
  });

  it("is false for a TTT client, including one whose project was upgraded", () => {
    expect(isNonTTTClient(null, [{ isTTT: true }])).toBe(false);
    expect(isNonTTTClient(null, [{ isTTT: false }, { isTTT: true }])).toBe(false);
  });

  it("is false with no projects (e.g. a partner, or a brand-new account)", () => {
    expect(isNonTTTClient(null, [])).toBe(false);
    expect(isNonTTTClient(null, [null])).toBe(false);
  });
});
