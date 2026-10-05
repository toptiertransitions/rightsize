import { describe, it, expect } from "vitest";
import { matchesLocation, emptyServiceArea, addZipsFromCounty } from "./serviceArea";

describe("matchesLocation", () => {
  it("matches a zip in the service area regardless of delivery mode", () => {
    const area = { ...emptyServiceArea(), zips: ["60601", "60602"] };
    expect(matchesLocation(area, { zip: "60601" }, "IL", "In-person")).toBe(true);
    expect(matchesLocation(area, { zip: "60601" }, "IL", "Both")).toBe(true);
  });

  it("does not match a zip outside the service area", () => {
    const area = { ...emptyServiceArea(), zips: ["60601"] };
    expect(matchesLocation(area, { zip: "90210" }, "IL", "In-person")).toBe(false);
  });

  it("statewide only matches when delivery mode is not In-person", () => {
    const area = { ...emptyServiceArea(), statewide: true };
    expect(matchesLocation(area, { state: "IL" }, "IL", "In-person")).toBe(false);
    expect(matchesLocation(area, { state: "IL" }, "IL", "Virtual")).toBe(true);
    expect(matchesLocation(area, { state: "IL" }, "IL", "Both")).toBe(true);
  });

  it("statewide does not match a different state", () => {
    const area = { ...emptyServiceArea(), statewide: true };
    expect(matchesLocation(area, { state: "WI" }, "IL", "Virtual")).toBe(false);
  });

  it("nationwide only matches when delivery mode is not In-person", () => {
    const area = { ...emptyServiceArea(), nationwide: true };
    expect(matchesLocation(area, { zip: "90210" }, "IL", "In-person")).toBe(false);
    expect(matchesLocation(area, { zip: "90210" }, "IL", "Virtual")).toBe(true);
  });

  it("falls back to false with no zips, statewide, or nationwide set", () => {
    const area = emptyServiceArea();
    expect(matchesLocation(area, { zip: "60601", state: "IL" }, "IL", "Both")).toBe(false);
  });
});

describe("addZipsFromCounty", () => {
  it("merges and dedupes zips", () => {
    expect(addZipsFromCounty(["60601"], ["60601", "60602"])).toEqual(["60601", "60602"]);
  });

  it("returns an empty array when both inputs are empty", () => {
    expect(addZipsFromCounty([], [])).toEqual([]);
  });
});
