import { describe, it, expect } from "vitest";
import { getCrossCategoryAnswers, getVisibleQuestions, getPrefillAnswers } from "./questions";

const EMPTY_TENANT = {
  currentZip: "",
  destinationZip: "",
  destinationType: undefined,
  destinationCommunity: undefined,
  destinationCommunityOther: "",
  timelineType: undefined,
  timelineValue: "",
  sqftRange: undefined,
  homeDensity: undefined,
  bedrooms: undefined,
} as any;

describe("getCrossCategoryAnswers", () => {
  it("pulls whoFor/zip/timeline from another category's saved answers", () => {
    const result = getCrossCategoryAnswers("Companion Care", {
      "Care Manager": { whoFor: "parent", zip: "60601", timeline: "asap", careNeeds: ["care_assessment"] },
    });
    expect(result).toEqual({ whoFor: "parent", zip: "60601", timeline: "asap" });
  });

  it("never pulls a category-specific question id across categories", () => {
    const result = getCrossCategoryAnswers("Companion Care", {
      "Care Manager": { careNeeds: ["care_assessment"], notes: "some note" },
    });
    expect(result).toEqual({});
  });

  it("skips the category being excluded", () => {
    const result = getCrossCategoryAnswers("Care Manager", {
      "Care Manager": { whoFor: "self" },
    });
    expect(result).toEqual({});
  });

  it("is deterministic when more than one other category has an answer — first in PARTNER_CATEGORIES order wins", () => {
    const result = getCrossCategoryAnswers("After Loss Support", {
      "Financial Advisory": { whoFor: "spouse" },
      "Estate Attorney": { whoFor: "parent" },
    });
    // Financial Advisory precedes Estate Attorney in PARTNER_CATEGORIES.
    expect(result.whoFor).toBe("spouse");
  });

  it("ignores empty-string and missing values", () => {
    const result = getCrossCategoryAnswers("Companion Care", {
      "Care Manager": { whoFor: "", zip: "60601" },
    });
    expect(result).toEqual({ zip: "60601" });
  });
});

describe("getVisibleQuestions — cross-category skip", () => {
  it("hides whoFor when another category already answered it, even though whoFor has no skipIfPrefilled flag", () => {
    const withoutCross = getVisibleQuestions("Companion Care", EMPTY_TENANT);
    expect(withoutCross.some((q) => q.id === "whoFor")).toBe(true);

    const withCross = getVisibleQuestions("Companion Care", EMPTY_TENANT, { whoFor: "parent" });
    expect(withCross.some((q) => q.id === "whoFor")).toBe(false);
  });

  it("hides zip when another category already answered it", () => {
    const withCross = getVisibleQuestions("Companion Care", EMPTY_TENANT, { zip: "60601" });
    expect(withCross.some((q) => q.id === "zip")).toBe(false);
  });

  it("leaves category-specific questions untouched", () => {
    const withCross = getVisibleQuestions("Companion Care", EMPTY_TENANT, { whoFor: "parent", zip: "60601" });
    expect(withCross.some((q) => q.id === "careNeeds")).toBe(true);
    expect(withCross.some((q) => q.id === "frequency")).toBe(true);
  });

  it("does not affect Mover's fromZip/toZip, which use a different id than the shared 'zip'", () => {
    const withCross = getVisibleQuestions("Mover", EMPTY_TENANT, { zip: "60601" });
    expect(withCross.some((q) => q.id === "fromZip")).toBe(true);
    expect(withCross.some((q) => q.id === "toZip")).toBe(true);
  });
});

describe("getPrefillAnswers — cross-category precedence", () => {
  it("prefers a cross-category answer over an inferred onboarding guess", () => {
    const tenantWithZip = { ...EMPTY_TENANT, currentZip: "10001" };
    const prefill = getPrefillAnswers("Companion Care", tenantWithZip, { zip: "60601" });
    expect(prefill.zip).toBe("60601");
  });

  it("falls back to the onboarding guess when there's no cross-category answer", () => {
    const tenantWithZip = { ...EMPTY_TENANT, currentZip: "10001" };
    const prefill = getPrefillAnswers("Companion Care", tenantWithZip, {});
    expect(prefill.zip).toBe("10001");
  });
});
