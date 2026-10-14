import { describe, it, expect } from "vitest";
import { matchPartnersForCategory } from "./match";
import { scoreAndRankPartners } from "./scoring";
import type { PartnerProfile } from "./types";

function profile(overrides: Partial<PartnerProfile>): PartnerProfile {
  return {
    id: "rec1",
    vendorName: "Test Partner",
    category: "Realtor",
    zipCodesServed: "60601",
    city: "",
    state: "IL",
    avgRating: 0,
    rawAvgRating: 0,
    reviewCount: 0,
    projectsCompleted: 0,
    deliveryMode: "In-person",
    ...overrides,
  } as PartnerProfile;
}

const star = profile({ id: "star", vendorName: "Star Realty", avgRating: 5, reviewCount: 40, projectsCompleted: 30 });
const good = profile({ id: "good", vendorName: "Good Realty", avgRating: 4.5, reviewCount: 10 });
const pref = profile({ id: "pref", vendorName: "XXX Realty", avgRating: 3, reviewCount: 2 });
const farPref = profile({ id: "far", vendorName: "Far Realty", zipCodesServed: "90210", state: "CA" });
const dir = [star, good, pref, farPref];

describe("preferred partners: TTT matching", () => {
  it("puts an in-area preferred partner first", () => {
    const r = matchPartnersForCategory(dir, "Realtor", { zip: "60601", state: "IL" }, 3, new Set(["pref"]));
    expect(r.map((m) => m.partner.id)).toEqual(["pref", "star", "good"]);
  });

  it("doesn't pull in a preferred partner who doesn't serve the client's area", () => {
    const r = matchPartnersForCategory(dir, "Realtor", { zip: "60601", state: "IL" }, 3, new Set(["far"]));
    expect(r.map((m) => m.partner.id)).not.toContain("far");
  });

  it("is unchanged with no preferred partners", () => {
    const r = matchPartnersForCategory(dir, "Realtor", { zip: "60601", state: "IL" }, 3);
    expect(r[0].partner.id).toBe("star");
  });
});

describe("preferred partners: self-serve scoring", () => {
  it("makes a qualifying preferred partner the best match", () => {
    const r = scoreAndRankPartners(dir, "Realtor", { zip: "60601", state: "IL" }, {}, new Set(["pref"]));
    expect(r.best?.partner.id).toBe("pref");
    expect(r.alternates.map((m) => m.partner.id)).toEqual(["star", "good"]);
  });

  it("supports several preferred partners, best score first", () => {
    const r = scoreAndRankPartners(dir, "Realtor", { zip: "60601", state: "IL" }, {}, new Set(["pref", "good"]));
    expect([r.best?.partner.id, ...r.alternates.map((m) => m.partner.id)]).toEqual(["good", "pref", "star"]);
  });

  it("never adds a preferred partner who fails the location filter", () => {
    const r = scoreAndRankPartners(dir, "Realtor", { zip: "60601", state: "IL" }, {}, new Set(["far"]));
    expect([r.best?.partner.id, ...r.alternates.map((m) => m.partner.id)]).not.toContain("far");
  });
});
