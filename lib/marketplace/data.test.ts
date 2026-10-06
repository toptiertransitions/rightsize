import { describe, it, expect } from "vitest";
import { toPublicListing } from "./data";
import type { MarketplaceListing } from "./types";

function listing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    id: "rec1",
    partnerId: "recPartner1",
    categoryId: "recCategory1",
    isPrimary: true,
    status: "Live",
    attributes: { feeStructure: "Flat fee" },
    feeType: "percent",
    feeValue: 15,
    creditToSeniorPercent: 5,
    referralNotes: "Internal note: negotiated rate",
    agreementOnFile: true,
    agreementDate: "2026-01-01",
    completenessPercent: 100,
    introNotificationMethod: "TTTAdmin",
    introNotificationValue: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("toPublicListing", () => {
  it("never includes any referral-terms field", () => {
    const full = listing();
    const pub = toPublicListing(full);
    expect(pub).not.toHaveProperty("feeType");
    expect(pub).not.toHaveProperty("feeValue");
    expect(pub).not.toHaveProperty("creditToSeniorPercent");
    expect(pub).not.toHaveProperty("referralNotes");
    expect(pub).not.toHaveProperty("agreementOnFile");
    expect(pub).not.toHaveProperty("agreementDate");
    expect(pub).not.toHaveProperty("introNotificationMethod");
    expect(pub).not.toHaveProperty("introNotificationValue");
  });

  it("keeps every non-referral-terms field intact", () => {
    const full = listing();
    const pub = toPublicListing(full);
    expect(pub.id).toBe(full.id);
    expect(pub.partnerId).toBe(full.partnerId);
    expect(pub.categoryId).toBe(full.categoryId);
    expect(pub.status).toBe(full.status);
    expect(pub.attributes).toEqual(full.attributes);
    expect(pub.completenessPercent).toBe(full.completenessPercent);
  });

  it("strips referral terms even when every value is non-default", () => {
    const full = listing({ feeType: "flat", feeValue: 500, creditToSeniorPercent: 50, agreementOnFile: true });
    const serialized = JSON.stringify(toPublicListing(full));
    expect(serialized).not.toContain("feeValue");
    expect(serialized).not.toContain("creditToSeniorPercent");
    expect(serialized).not.toContain("500");
  });
});
