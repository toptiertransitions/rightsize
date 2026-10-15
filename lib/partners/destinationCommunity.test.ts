import { describe, it, expect } from "vitest";
import { findDestinationCommunityPartner } from "./destinationCommunity";
import type { PartnerProfile } from "./types";

const community = (id: string, vendorName: string, state = "IL", localVendorId?: string): PartnerProfile => ({
  id, vendorName, category: "Community", localVendorId, zipCodesServed: "", city: "", state,
  avgRating: 0, rawAvgRating: 0, reviewCount: 0, projectsCompleted: 0,
});

const directory = [
  community("woodlands", "The Woodlands at Canterfield", "IL", "lvWoodlands"),
  community("brookElgin", "Brookdale Elgin"),
  community("brookEdgin", "Brookdale Edgin"),
  community("sunriseWI", "Sunrise of Lake Geneva", "WI"),
];
const find = (name: string, destState?: string, destinationCommunity?: string) =>
  findDestinationCommunityPartner({ destState, destinationCommunity }, { communityName: name }, directory)?.id ?? null;

describe("findDestinationCommunityPartner", () => {
  it("matches the linked community record first", () => {
    expect(find("anything", "IL", "lvWoodlands")).toBe("woodlands");
  });

  it("matches the name exactly, ignoring case, punctuation and a leading 'the'", () => {
    expect(find("woodlands at canterfield")).toBe("woodlands");
  });

  it("matches a small typo (the 'Centerfield' bug)", () => {
    expect(find("The Woodlands at Centerfield", "IL")).toBe("woodlands");
  });

  it("refuses an ambiguous typo between two real communities", () => {
    expect(find("Brookdale Edlin", "IL")).toBeNull();
  });

  it("never fuzzy-matches a community in another state", () => {
    expect(find("Sunrise of Lake Genava", "IL")).toBeNull();
    expect(find("Sunrise of Lake Genava", "WI")).toBe("sunriseWI");
  });

  it("doesn't match an unrelated name", () => {
    expect(find("Friendship Village", "IL")).toBeNull();
  });
});
