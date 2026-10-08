import { describe, it, expect } from "vitest";
import { getPartnerCriteria, readMatchCriteria, criteriaProgress, currentCriteriaValues } from "./criteria";
import { getPartnerQuestions } from "./questions";
import { scoreAndRankPartners } from "./scoring";
import type { PartnerProfile } from "./types";

function companion(id: string, matchCriteria?: Record<string, string[]>): PartnerProfile {
  return {
    id,
    vendorName: id,
    category: "Companion Care",
    zipCodesServed: "60601",
    city: "",
    state: "IL",
    avgRating: 0,
    rawAvgRating: 0,
    reviewCount: 0,
    projectsCompleted: 0,
    attributes: matchCriteria ? { matchCriteria } : {},
  };
}

describe("getPartnerCriteria", () => {
  it("turns every client select question into a partner criterion, skipping whoFor and timeline", () => {
    const ids = getPartnerCriteria("Companion Care").map((c) => c.questionId);
    expect(ids).toEqual(["careNeeds", "daysPerWeek", "hoursPerVisit", "payment"]);
  });

  it("uses the same options as the client question, minus 'not sure'", () => {
    const client = getPartnerQuestions("Companion Care").find((q) => q.id === "payment")!;
    const partner = getPartnerCriteria("Companion Care").find((c) => c.questionId === "payment")!;
    expect(partner.options.map((o) => o.value)).toEqual(client.options!.map((o) => o.value).filter((v) => v !== "not_sure"));
  });

  it("skips questions marked as describing the client, not the partner", () => {
    const ids = getPartnerCriteria("Estate Attorney").map((c) => c.questionId);
    expect(ids).toContain("serviceType");
    expect(ids).not.toContain("hasExistingDocuments");
  });

  it("has nothing for a category without a guided flow", () => {
    expect(getPartnerCriteria("Move Manager")).toEqual([]);
  });
});

describe("readMatchCriteria / progress", () => {
  it("tolerates missing or malformed data", () => {
    expect(readMatchCriteria(undefined)).toEqual({});
    expect(readMatchCriteria({ matchCriteria: "oops" })).toEqual({});
    expect(readMatchCriteria({ matchCriteria: { payment: ["private_pay", 3] } })).toEqual({ payment: ["private_pay"] });
  });

  it("drops saved picks for options that no longer exist", () => {
    const c = getPartnerCriteria("Companion Care").find((x) => x.questionId === "payment")!;
    expect(currentCriteriaValues(c, { payment: ["private_pay", "retired_option"] })).toEqual(["private_pay"]);
  });

  it("counts answered criteria", () => {
    expect(criteriaProgress("Companion Care", { matchCriteria: { payment: ["private_pay"], careNeeds: [] } })).toEqual({ answered: 1, total: 4 });
  });
});

describe("scoring with exact criteria", () => {
  const location = { zip: "60601", state: "IL" };

  it("ranks the partner that serves the client's answers above one that doesn't", () => {
    const fits = companion("fits", { hoursPerVisit: ["live_in"], payment: ["ltc_insurance"] });
    const misses = companion("misses", { hoursPerVisit: ["under_2"], payment: ["private_pay"] });
    const result = scoreAndRankPartners([misses, fits], "Companion Care", location, { hoursPerVisit: "live_in", payment: ["ltc_insurance"] });
    expect(result.best?.partner.id).toBe("fits");
    expect(result.best?.whyThisMatch.toLowerCase()).toContain("offers what you're looking for");
  });

  it("ignores 'not sure' answers rather than counting them as a mismatch", () => {
    const a = companion("a", { payment: ["private_pay"] });
    const b = companion("b");
    const result = scoreAndRankPartners([a, b], "Companion Care", location, { payment: ["not_sure"] });
    const scores = Object.fromEntries([result.best!, ...result.alternates].map((m) => [m.partner.id, m.score]));
    expect(scores.a).toBe(scores.b);
  });
});
