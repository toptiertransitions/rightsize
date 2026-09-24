import { describe, it, expect } from "vitest";
import { scoreAndRankPartners, getRequestLocation, introRequestCountRemaining, SCORING_WEIGHTS, MAX_INTRO_REQUESTS_PER_CATEGORY } from "./scoring";
import type { PartnerProfile } from "./types";
import type { PartnerRequest } from "@/lib/types";

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

function request(overrides: Partial<PartnerRequest>): PartnerRequest {
  return {
    id: "req1",
    airtableId: "req1",
    tenantId: "t1",
    category: "Mover",
    status: "draft",
    answers: {},
    introRequests: [],
    createdAt: "",
    updatedAt: "",
    createdBy: "",
    ...overrides,
  };
}

describe("SCORING_WEIGHTS", () => {
  // The originally-specified weights (fit 35 / seniorSpecialty 20 /
  // responsiveness 15 / reviews 10 / pastOutcomes 10 / adminOrder 5) sum to
  // 95%, not 100% — kept verbatim rather than silently rescaled, since
  // relative ranking between partners is unaffected either way (every
  // partner's score is scaled by the same weights). Flagging it here so a
  // future change to any one weight doesn't silently drift further.
  it("sums to the specified 0.95 (not 1.0 — see comment above)", () => {
    const total = Object.values(SCORING_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(Math.round(total * 100) / 100).toBe(0.95);
  });
});

describe("scoreAndRankPartners", () => {
  it("hard-filters out partners with no zip or state match", () => {
    const partners = [
      profile({ id: "a", zipCodesServed: "10001", state: "NY" }),
      profile({ id: "b", zipCodesServed: "60601", state: "IL" }),
    ];
    const result = scoreAndRankPartners(partners, "Mover", { zip: "60601", state: "IL" });
    expect(result.best?.partner.id).toBe("b");
    expect(result.alternates).toHaveLength(0);
  });

  it("returns best: null when nothing passes the hard filter", () => {
    const partners = [profile({ id: "a", zipCodesServed: "10001", state: "NY" })];
    const result = scoreAndRankPartners(partners, "Mover", { zip: "60601", state: "IL" });
    expect(result.best).toBeNull();
    expect(result.alternates).toHaveLength(0);
  });

  it("filters to the requested category only", () => {
    const partners = [
      profile({ id: "a", category: "Mover", zipCodesServed: "60601" }),
      profile({ id: "b", category: "Realtor", zipCodesServed: "60601" }),
    ];
    const result = scoreAndRankPartners(partners, "Mover", { zip: "60601" });
    expect(result.best?.partner.id).toBe("a");
  });

  it("ranks a zip match ('area') above a state-only match ('nearby') when other factors are equal", () => {
    const partners = [
      profile({ id: "nearby", zipCodesServed: "10001", state: "IL" }),
      profile({ id: "area", zipCodesServed: "60601", state: "IL" }),
    ];
    const result = scoreAndRankPartners(partners, "Mover", { zip: "60601", state: "IL" });
    expect(result.best?.partner.id).toBe("area");
    expect(result.best?.matchedLocation).toBe("area");
    expect(result.alternates[0]?.partner.id).toBe("nearby");
    expect(result.alternates[0]?.matchedLocation).toBe("nearby");
  });

  it("a strong senior-specialty + high-rated partner outranks a plain in-area one", () => {
    const partners = [
      profile({ id: "plain", zipCodesServed: "60601", avgRating: 3.5, reviewCount: 5 }),
      profile({ id: "senior", zipCodesServed: "60601", avgRating: 4.9, reviewCount: 40, seniorSpecialty: true, responsivenessScore: 5, projectsCompleted: 15 }),
    ];
    const result = scoreAndRankPartners(partners, "Mover", { zip: "60601" });
    expect(result.best?.partner.id).toBe("senior");
  });

  it("uses featuredRank as a tiebreaker when scores are otherwise identical", () => {
    const partners = [
      profile({ id: "unranked", zipCodesServed: "60601" }),
      profile({ id: "ranked", zipCodesServed: "60601", featuredRank: 1 }),
    ];
    const result = scoreAndRankPartners(partners, "Mover", { zip: "60601" });
    expect(result.best?.partner.id).toBe("ranked");
  });

  it("returns at most 1 best + 2 alternates even with more qualifying partners", () => {
    const partners = ["a", "b", "c", "d", "e"].map((id) => profile({ id, zipCodesServed: "60601" }));
    const result = scoreAndRankPartners(partners, "Mover", { zip: "60601" });
    expect(result.best).not.toBeNull();
    expect(result.alternates).toHaveLength(2);
  });

  it("includes a non-empty whyThisMatch for every match", () => {
    const partners = [profile({ id: "a", zipCodesServed: "60601", seniorSpecialty: true, avgRating: 4.8, reviewCount: 12 })];
    const result = scoreAndRankPartners(partners, "Mover", { zip: "60601" });
    expect(result.best?.whyThisMatch.length).toBeGreaterThan(0);
  });
});

describe("getRequestLocation", () => {
  it("uses the category-specific zip answer when present", () => {
    const loc = getRequestLocation("Mover", { fromZip: "60601" }, { zip: "10001", state: "IL" });
    expect(loc.zip).toBe("60601");
    expect(loc.state).toBe("IL");
  });

  it("falls back to the tenant zip when the category's question wasn't answered", () => {
    const loc = getRequestLocation("Mover", {}, { zip: "10001", state: "IL" });
    expect(loc.zip).toBe("10001");
  });
});

describe("introRequestCountRemaining", () => {
  it(`is ${MAX_INTRO_REQUESTS_PER_CATEGORY} with no request or no intros yet`, () => {
    expect(introRequestCountRemaining(undefined)).toBe(MAX_INTRO_REQUESTS_PER_CATEGORY);
    expect(introRequestCountRemaining(request({}))).toBe(MAX_INTRO_REQUESTS_PER_CATEGORY);
  });

  it("decrements per requested partner and floors at 0", () => {
    const r = request({ introRequests: [{ partnerId: "a", requestedAt: "" }] });
    expect(introRequestCountRemaining(r)).toBe(MAX_INTRO_REQUESTS_PER_CATEGORY - 1);

    const full = request({
      introRequests: Array.from({ length: MAX_INTRO_REQUESTS_PER_CATEGORY + 2 }, (_, i) => ({ partnerId: `p${i}`, requestedAt: "" })),
    });
    expect(introRequestCountRemaining(full)).toBe(0);
  });
});
