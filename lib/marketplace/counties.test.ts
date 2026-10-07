import { describe, it, expect } from "vitest";
import { IL_COUNTY_OPTIONS, isKnownCounty, zipsForCounties, countyKey } from "./counties";
import { matchesLocation } from "./serviceArea";

describe("Illinois county ZIP lookup", () => {
  it("covers all 102 Illinois counties", () => {
    expect(IL_COUNTY_OPTIONS).toHaveLength(102);
    expect(isKnownCounty("Cook, IL")).toBe(true);
    expect(isKnownCounty("Cook")).toBe(false);
    expect(isKnownCounty("Narnia, IL")).toBe(false);
  });

  it("expands counties to their ZIPs, deduped and sorted", () => {
    const cook = zipsForCounties([countyKey("Cook")]);
    expect(cook).toContain("60614");
    expect(cook).not.toContain("60187"); // Wheaton — DuPage
    const both = zipsForCounties([countyKey("Cook"), countyKey("Lake")]);
    expect(new Set(both).size).toBe(both.length);
    expect(both).toEqual([...both].sort());
    expect(both).toContain("60010"); // Barrington straddles Lake/Cook
  });

  it("ignores unknown counties", () => {
    expect(zipsForCounties(["Narnia, IL"])).toEqual([]);
  });

  it("a partner saved with Cook County matches a Cook client ZIP", () => {
    const serviceArea = { zips: zipsForCounties([countyKey("Cook")]), counties: [countyKey("Cook")], statewide: false, nationwide: false };
    expect(matchesLocation(serviceArea, { zip: "60614", state: "IL" }, "IL", "In-person")).toBe(true);
    expect(matchesLocation(serviceArea, { zip: "60187", state: "IL" }, "IL", "In-person")).toBe(false);
  });
});
