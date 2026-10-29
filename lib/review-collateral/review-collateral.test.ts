import { describe, expect, it } from "vitest";
import { clientTypeFor, firstNameLastInitial, parseCollateralDetails, townLabel } from "./shared";
import { quoteFontSize, quoteParagraphs } from "./pdf";

describe("review collateral details", () => {
  it("prints first name and last initial", () => {
    expect(firstNameLastInitial("Jim Kowalski")).toBe("Jim K.");
    expect(firstNameLastInitial("  mary ann  de la cruz ")).toBe("mary C.");
    expect(firstNameLastInitial("Cher")).toBe("Cher");
    expect(firstNameLastInitial("")).toBe("");
  });

  it("spells the state out like the originals", () => {
    expect(townLabel("Oak Park", "IL")).toBe("Oak Park, Illinois");
    expect(townLabel("La Grange", "Illinois")).toBe("La Grange, Illinois");
    expect(townLabel("", "WI")).toBe("Wisconsin");
    expect(townLabel(undefined, undefined)).toBe("");
  });

  it("guesses the client type from the estimate", () => {
    const svc = (...names: string[]) => ({ estimatedServiceHours: names.map((serviceName) => ({ serviceId: "x", serviceName, hours: 4 })) });
    expect(clientTypeFor({ isEstateSale: true })).toBe("Estate Sale Client");
    expect(clientTypeFor(svc("Estate Sale Execution (Day of Staffing, Promotion)"))).toBe("Estate Sale Client");
    expect(clientTypeFor(svc("Packing to Move", "Unpacking"))).toBe("Relocation Client");
    expect(clientTypeFor(svc("Rightsizing"))).toBe("Downsizing Client");
    expect(clientTypeFor(svc("Unpacking", "Setting Up Your Space"))).toBe("Unpacking Client");
    expect(clientTypeFor({})).toBe("Relocation Client");
  });

  it("needs a name to make a PDF and trims what the form sent", () => {
    expect(parseCollateralDetails({ displayName: "  ", clientType: "x" })).toBeNull();
    expect(parseCollateralDetails(null)).toBeNull();
    expect(parseCollateralDetails({ displayName: " Jim   K. ", clientType: 3, town: "Oak Park,  Illinois" }))
      .toEqual({ displayName: "Jim K.", clientType: "", town: "Oak Park, Illinois" });
  });
});

describe("review collateral layout", () => {
  it("keeps the review word for word, adding curly quotes once", () => {
    expect(quoteParagraphs("Great team.")).toEqual(["“Great team.”"]);
    expect(quoteParagraphs("“Already quoted.”")).toEqual(["“Already quoted.”"]);
    expect(quoteParagraphs("First.\n\nSecond.\nThird.")).toEqual(["“First.", "Second.", "Third.”"]);
  });

  it("uses the full 16.5pt size for short reviews and shrinks long ones", () => {
    expect(quoteFontSize(quoteParagraphs("The company was a pleasure to work with."))).toBe(16.5);
    const long = quoteParagraphs("Mark and his team were wonderful. ".repeat(30));
    const size = quoteFontSize(long);
    expect(size).toBeLessThan(13);
    expect(size).toBeGreaterThanOrEqual(9);
  });
});
