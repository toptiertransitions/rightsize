import { describe, it, expect } from "vitest";
import { isReviewableCategory, partnerIdResolver, summarizeReviewsByPartner } from "./reviews";

describe("partner reviews", () => {
  const resolve = partnerIdResolver([{ id: "recNew", localVendorId: "recLegacy" }, { id: "recOther" }]);

  it("counts reviews under either the marketplace or legacy id", () => {
    const summary = summarizeReviewsByPartner(
      [
        { partnerId: "recNew", score: 5, status: "Published" },
        { partnerId: "recLegacy", score: 4, status: "Published" },
        { partnerId: "recNew", score: 1, status: "Hidden" },
        { partnerId: "recUnknown", score: 3, status: "Published" },
      ],
      resolve
    );
    expect(summary.get("recNew")).toEqual({ avg: 4.5, count: 2, hiddenCount: 1 });
    expect(summary.has("recUnknown")).toBe(false);
    expect(summary.has("recOther")).toBe(false);
  });

  it("never reviews senior communities", () => {
    expect(isReviewableCategory("Community")).toBe(false);
    expect(isReviewableCategory("Mover")).toBe(true);
  });
});
