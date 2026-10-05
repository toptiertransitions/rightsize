import { describe, it, expect } from "vitest";
import {
  computeListingCompleteness,
  missingRequiredFields,
  isListingReadyForLive,
  computeProfileFillRate,
  listingsByCategoryBelowThreshold,
} from "./completeness";
import type { MarketplaceFieldDef } from "./types";

const fields: MarketplaceFieldDef[] = [
  { key: "fiduciary", label: "Fiduciary", type: "boolean", required: true },
  { key: "credentials", label: "Credentials", type: "multiselect", required: true },
  { key: "custodian", label: "Custodian", type: "text" },
];
const category = { fieldSchema: fields };

describe("computeListingCompleteness", () => {
  it("is 100 when there are no required fields", () => {
    expect(computeListingCompleteness({}, { fieldSchema: [] })).toBe(100);
  });

  it("is 0 when no required fields are filled", () => {
    expect(computeListingCompleteness({}, category)).toBe(0);
  });

  it("is 50 when half the required fields are filled", () => {
    expect(computeListingCompleteness({ fiduciary: true }, category)).toBe(50);
  });

  it("is 100 when every required field is filled, ignoring optional fields", () => {
    expect(computeListingCompleteness({ fiduciary: true, credentials: ["CFP"] }, category)).toBe(100);
  });

  it("treats an empty array as not filled", () => {
    expect(computeListingCompleteness({ fiduciary: true, credentials: [] }, category)).toBe(50);
  });

  it("treats an empty string as not filled", () => {
    const f = { fieldSchema: [{ key: "name", label: "Name", type: "text" as const, required: true }] };
    expect(computeListingCompleteness({ name: "" }, f)).toBe(0);
    expect(computeListingCompleteness({ name: "  " }, f)).toBe(0);
  });

  it("treats false as filled for a required boolean", () => {
    const f = { fieldSchema: [{ key: "insured", label: "Insured", type: "boolean" as const, required: true }] };
    expect(computeListingCompleteness({ insured: false }, f)).toBe(100);
  });
});

describe("missingRequiredFields / isListingReadyForLive", () => {
  it("lists exactly the unfilled required fields", () => {
    const missing = missingRequiredFields({ fiduciary: true }, category);
    expect(missing.map((f) => f.key)).toEqual(["credentials"]);
  });

  it("is ready for Live only when nothing required is missing", () => {
    expect(isListingReadyForLive({}, category)).toBe(false);
    expect(isListingReadyForLive({ fiduciary: true, credentials: ["CFP"] }, category)).toBe(true);
  });
});

describe("computeProfileFillRate", () => {
  it("handles an empty partner list", () => {
    expect(computeProfileFillRate([])).toEqual({ logoPercent: 0, aboutUsPercent: 0 });
  });

  it("computes fill percentages correctly", () => {
    const partners = [
      { logo: "https://x/logo.png", aboutUs: "We do things." },
      { logo: "", aboutUs: "" },
      { logo: "", aboutUs: "Something." },
      { logo: "https://x/logo2.png", aboutUs: "" },
    ];
    expect(computeProfileFillRate(partners)).toEqual({ logoPercent: 50, aboutUsPercent: 50 });
  });
});

describe("listingsByCategoryBelowThreshold", () => {
  it("only returns categories under their minimum", () => {
    const categories = [
      { id: "cat1", label: "Mover", minLiveListings: 3 },
      { id: "cat2", label: "Realtor", minLiveListings: 3 },
    ];
    const listings = [
      { categoryId: "cat1", status: "Live" as const },
      { categoryId: "cat1", status: "Live" as const },
      { categoryId: "cat1", status: "Live" as const },
      { categoryId: "cat2", status: "Live" as const },
      { categoryId: "cat2", status: "Draft" as const },
    ];
    const result = listingsByCategoryBelowThreshold(listings, categories);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Realtor");
    expect(result[0].liveCount).toBe(1);
  });
});
