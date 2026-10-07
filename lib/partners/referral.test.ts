import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/airtable", () => ({}));
vi.mock("@/lib/marketplace/data", () => ({}));

import { buildReferralPartner } from "./referral";
import { matchesQuery, unlistedReferralId } from "./referralShared";
import type { PartnerProfile } from "./types";
import type { PartnerSelection } from "@/lib/types";

const listing: PartnerProfile = {
  id: "recListing", vendorName: "Compass Realty", category: "Realtor", zipCodesServed: "", city: "Chicago", state: "IL",
  avgRating: 4.8, rawAvgRating: 4.9, reviewCount: 12, projectsCompleted: 3, phone: "312-555-0100",
};

function sel(overrides: Partial<PartnerSelection>): PartnerSelection {
  return { id: "s", airtableId: "s", tenantId: "t", category: "Realtor", partnerId: "recListing", selectedAt: "", selectedBy: "u", referralLocked: true, ...overrides };
}

describe("buildReferralPartner", () => {
  it("uses the live marketplace listing when one matches", () => {
    const p = buildReferralPartner(sel({ referralContactName: "Jane Doe" }), [listing]);
    expect(p.vendorName).toBe("Compass Realty");
    expect(p.reviewCount).toBe(12);
    expect(p.isReferral).toBe(true);
    expect(p.referralContactName).toBe("Jane Doe");
  });

  it("builds a card from stored details for an unlisted partner", () => {
    const p = buildReferralPartner(
      sel({ partnerId: unlistedReferralId("Realtor"), referralName: "Baird & Warner", referralContactName: "Sam Lee", referralEmail: "sam@bw.com" }),
      [listing]
    );
    expect(p.id).toBe("referral-unlisted-realtor");
    expect(p.vendorName).toBe("Baird & Warner");
    expect(p.referralContactName).toBe("Sam Lee");
    expect(p.email).toBe("sam@bw.com");
    expect(p.reviewCount).toBe(0);
  });

  it("falls back to stored details when the listing is no longer live", () => {
    const p = buildReferralPartner(sel({ referralName: "Compass Realty" }), []);
    expect(p.vendorName).toBe("Compass Realty");
    expect(p.isReferral).toBe(true);
  });

  it("shows the contact as the name when only a person was given", () => {
    const p = buildReferralPartner(sel({ partnerId: unlistedReferralId("Community"), category: "Community", referralName: "", referralContactName: "Pat Kim" }), []);
    expect(p.vendorName).toBe("Pat Kim");
    expect(p.referralContactName).toBeUndefined();
  });
});

describe("matchesQuery", () => {
  it("ignores case and punctuation", () => {
    expect(matchesQuery("Baird & Warner", "baird warner")).toBe(true);
    expect(matchesQuery("The Clare", "CLARE")).toBe(true);
    expect(matchesQuery("Compass", "coldwell")).toBe(false);
    expect(matchesQuery("Anything", "  ")).toBe(true);
  });
});
