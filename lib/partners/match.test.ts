import { describe, it, expect } from "vitest";
import { computeBayesianRating, matchPartnersForCategory } from "./match";
import type { PartnerProfile } from "./types";

function profile(overrides: Partial<PartnerProfile>): PartnerProfile {
  return {
    id: "rec1",
    vendorName: "Test Partner",
    category: "Mover",
    zipCodesServed: "",
    city: "",
    state: "IL",
    avgRating: 0,
    rawAvgRating: 0,
    reviewCount: 0,
    projectsCompleted: 0,
    ...overrides,
  };
}

describe("computeBayesianRating", () => {
  it("returns 0 for no reviews", () => {
    expect(computeBayesianRating(5, 0, 4.5, 5)).toBe(0);
  });

  it("pulls a single 5.0 review toward the prior mean", () => {
    const result = computeBayesianRating(5.0, 1, 4.5, 5);
    // (5*4.5 + 1*5) / 6 = 4.583... -> 4.6
    expect(result).toBe(4.6);
    expect(result).toBeLessThan(5.0);
  });

  it("lets a well-reviewed partner's raw average dominate", () => {
    const result = computeBayesianRating(4.8, 40, 4.5, 5);
    // (5*4.5 + 40*4.8) / 45 = 4.7666... -> 4.8
    expect(result).toBe(4.8);
  });

  it("a single 5.0 does not outrank a well-established 4.8", () => {
    const singleReview = computeBayesianRating(5.0, 1, 4.5, 5);
    const established = computeBayesianRating(4.8, 40, 4.5, 5);
    expect(established).toBeGreaterThan(singleReview);
  });
});

describe("matchPartnersForCategory", () => {
  it("filters to the requested category only", () => {
    const partners = [
      profile({ id: "a", category: "Mover", avgRating: 4.9, reviewCount: 10, zipCodesServed: "60601" }),
      profile({ id: "b", category: "Realtor", avgRating: 4.9, reviewCount: 10, zipCodesServed: "60601" }),
    ];
    const results = matchPartnersForCategory(partners, "Mover", { zip: "60601" }, 3);
    expect(results).toHaveLength(1);
    expect(results[0].partner.id).toBe("a");
  });

  it("prefers in-service-area partners over out-of-area ones", () => {
    const partners = [
      profile({ id: "far", category: "Mover", avgRating: 5.0, reviewCount: 50, zipCodesServed: "10001" }),
      profile({ id: "near", category: "Mover", avgRating: 3.5, reviewCount: 2, zipCodesServed: "60601" }),
    ];
    const results = matchPartnersForCategory(partners, "Mover", { zip: "60601" }, 3);
    expect(results[0].partner.id).toBe("near");
    expect(results[0].matchedLocation).toBe("area");
    expect(results[1].partner.id).toBe("far");
    expect(results[1].matchedLocation).toBe("nearby");
  });

  it("fills remaining slots from outside the area when fewer than topN match", () => {
    const partners = [
      profile({ id: "near1", category: "Mover", avgRating: 4.0, reviewCount: 5, zipCodesServed: "60601" }),
      profile({ id: "far1", category: "Mover", avgRating: 4.9, reviewCount: 30, zipCodesServed: "90210" }),
      profile({ id: "far2", category: "Mover", avgRating: 4.2, reviewCount: 10, zipCodesServed: "10001" }),
    ];
    const results = matchPartnersForCategory(partners, "Mover", { zip: "60601" }, 3);
    expect(results).toHaveLength(3);
    expect(results[0].partner.id).toBe("near1");
    expect(results[0].matchedLocation).toBe("area");
    expect(results[1].partner.id).toBe("far1"); // higher-rated of the two "nearby" candidates
    expect(results[1].matchedLocation).toBe("nearby");
    expect(results[2].partner.id).toBe("far2");
  });

  it("sorts featured-rank partners ahead of higher-rated ones", () => {
    const partners = [
      profile({ id: "top-rated", category: "Realtor", avgRating: 5.0, reviewCount: 100, zipCodesServed: "60601" }),
      profile({ id: "featured", category: "Realtor", avgRating: 3.0, reviewCount: 2, featuredRank: 1, zipCodesServed: "60601" }),
    ];
    const results = matchPartnersForCategory(partners, "Realtor", { zip: "60601" }, 3);
    expect(results[0].partner.id).toBe("featured");
    expect(results[1].partner.id).toBe("top-rated");
  });

  it("orders multiple featured partners by their rank number", () => {
    const partners = [
      profile({ id: "rank2", category: "Hauler", featuredRank: 2, zipCodesServed: "60601" }),
      profile({ id: "rank1", category: "Hauler", featuredRank: 1, zipCodesServed: "60601" }),
    ];
    const results = matchPartnersForCategory(partners, "Hauler", { zip: "60601" }, 3);
    expect(results.map((r) => r.partner.id)).toEqual(["rank1", "rank2"]);
  });

  it("breaks ties by projects completed, then falls back to name", () => {
    const partners = [
      profile({ id: "z-fewer", vendorName: "Zephyr Movers", category: "Mover", avgRating: 4.5, reviewCount: 10, projectsCompleted: 3, zipCodesServed: "60601" }),
      profile({ id: "a-more", vendorName: "Ace Movers", category: "Mover", avgRating: 4.5, reviewCount: 10, projectsCompleted: 20, zipCodesServed: "60601" }),
    ];
    const results = matchPartnersForCategory(partners, "Mover", { zip: "60601" }, 3);
    expect(results[0].partner.id).toBe("a-more"); // more projects completed wins the rating tie
  });

  it("matches by state when the client has no zip", () => {
    const partners = [
      profile({ id: "in-state", category: "Community", state: "IL", zipCodesServed: "" }),
      profile({ id: "out-state", category: "Community", state: "CA", zipCodesServed: "" }),
    ];
    const results = matchPartnersForCategory(partners, "Community", { state: "IL" }, 3);
    expect(results[0].partner.id).toBe("in-state");
    expect(results[0].matchedLocation).toBe("area");
  });

  it("returns an empty array when no partners exist in the category", () => {
    const results = matchPartnersForCategory([], "Donation", { zip: "60601" }, 3);
    expect(results).toEqual([]);
  });
});
