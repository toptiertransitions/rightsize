import { describe, it, expect } from "vitest";
import { computeSeniorCredit } from "./seniorCredit";

describe("computeSeniorCredit", () => {
  it("computes a flat-fee credit correctly", () => {
    expect(computeSeniorCredit("flat", 500, 20)).toBe(100);
  });

  it("returns 0 for a percent fee (unknown transaction value)", () => {
    expect(computeSeniorCredit("percent", 10, 20)).toBe(0);
  });

  it("returns 0 when no credit percent is configured", () => {
    expect(computeSeniorCredit("flat", 500, 0)).toBe(0);
  });

  it("returns 0 when there's no fee value", () => {
    expect(computeSeniorCredit("flat", 0, 20)).toBe(0);
  });

  it("returns 0 for feeType none", () => {
    expect(computeSeniorCredit("none", 0, 20)).toBe(0);
  });

  it("rounds to the nearest cent", () => {
    expect(computeSeniorCredit("flat", 333, 33)).toBe(109.89);
  });
});
