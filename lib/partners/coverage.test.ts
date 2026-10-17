import { describe, it, expect } from "vitest";
import { isIllinoisZip, isNonIllinoisZip } from "./coverage";

describe("partner coverage", () => {
  it("knows Illinois zips", () => {
    expect(isIllinoisZip("60091")).toBe(true);
    expect(isIllinoisZip("62901")).toBe(true);
    expect(isIllinoisZip("53202")).toBe(false);
    expect(isIllinoisZip("63101")).toBe(false);
  });

  it("flags only full non-Illinois zips", () => {
    expect(isNonIllinoisZip("33480")).toBe(true);
    expect(isNonIllinoisZip("60614")).toBe(false);
    expect(isNonIllinoisZip("331")).toBe(false);
    expect(isNonIllinoisZip("")).toBe(false);
    expect(isNonIllinoisZip(undefined)).toBe(false);
  });
});
