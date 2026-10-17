import { describe, it, expect } from "vitest";
import { isIllinoisZip, hasNonIllinoisZip } from "./coverage";

describe("partner coverage", () => {
  it("knows Illinois zips", () => {
    expect(isIllinoisZip("60091")).toBe(true);
    expect(isIllinoisZip("62901")).toBe(true);
    expect(isIllinoisZip("53202")).toBe(false);
    expect(isIllinoisZip("63101")).toBe(false);
  });

  it("flags any full non-Illinois zip from the tenant or request answers", () => {
    expect(hasNonIllinoisZip(["60091", undefined], {})).toBe(false);
    expect(hasNonIllinoisZip(["60091", "33480"], {})).toBe(true);
    expect(hasNonIllinoisZip([], { Realtor: { zip: "85251" } })).toBe(true);
    expect(hasNonIllinoisZip([], { Realtor: { zip: "60614" } })).toBe(false);
  });

  it("ignores partial or blank entries", () => {
    expect(hasNonIllinoisZip(["331", ""], { Realtor: { zip: "8525" } })).toBe(false);
  });
});
