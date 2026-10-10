import { describe, it, expect } from "vitest";
import { applyMirrors, setupDetailsFields, skipsAreaStep, inPersonOnly, realtorDisplayName, fieldScreensFor } from "./partnerScreens";
import type { MarketplaceFieldDef } from "./types";

const label = (_q: string, v: string) => ({ furniture: "Furniture", clothing: "Clothing & shoes" } as Record<string, string>)[v];

describe("applyMirrors", () => {
  it("fills a hidden required field from the matching criteria screen", () => {
    const out = applyMirrors("Donation", {}, { items: ["furniture", "clothing"], pickupOrDropoff: ["dropoff"] }, label);
    expect(out.acceptedItemTypes).toEqual(["Furniture", "Clothing & shoes"]);
    expect(out.pickupOffered).toBe(false);
  });

  it("uses the field's own wording where it differs (Community CCRC)", () => {
    const out = applyMirrors("Community", {}, { careType: ["continuing_care"] }, () => "Should not be used");
    expect(out.careLevelsOffered).toEqual(["CCRC"]);
  });

  it("leaves fields alone when that criteria screen hasn't been answered", () => {
    const out = applyMirrors("Donation", { acceptedItemTypes: ["Old"] }, {}, label);
    expect(out.acceptedItemTypes).toEqual(["Old"]);
  });

  it("derives SRES for realtors from specialties, defaulting to no", () => {
    expect(applyMirrors("Realtor", { realtorSpecialties: ["SRES (Seniors Real Estate Specialist)"] }, {}, label).sresCertified).toBe(true);
    expect(applyMirrors("Realtor", { realtorSpecialties: null }, {}, label).sresCertified).toBe(false);
    expect("sresCertified" in applyMirrors("Realtor", {}, {}, label)).toBe(false);
  });
});

describe("setupDetailsFields", () => {
  const f = (key: string): MarketplaceFieldDef => ({ key, label: key, type: "text" } as MarketplaceFieldDef);
  it("drops hidden fields and fields that have their own screen", () => {
    const schema = [f("acceptedItemTypes"), f("itemsNotAccepted"), f("pickupLeadTime"), f("taxReceiptProvided")];
    expect(setupDetailsFields(schema, "Donation")).toEqual([]);
    expect(fieldScreensFor("Donation").map((s) => s.key)).toEqual(["itemsNotAccepted", "pickupLeadTime"]);
  });
});

describe("area rules", () => {
  it("skips the area step only for community-only partners", () => {
    expect(skipsAreaStep(["Community"])).toBe(true);
    expect(skipsAreaStep(["Community", "Mover"])).toBe(false);
  });
  it("haulers and communities are always in person", () => {
    expect(inPersonOnly(["Hauler"])).toBe(true);
    expect(inPersonOnly(["Hauler", "Realtor"])).toBe(false);
  });
});

describe("realtorDisplayName", () => {
  it("joins brokerage, town and name or team", () => {
    expect(realtorDisplayName({ companyName: "Keller Williams", city: "Naperville", pocName: "Wolf Team" })).toBe("Keller Williams | Naperville | Wolf Team");
    expect(realtorDisplayName({ companyName: "Baird & Warner", city: "", pocName: "Ann Lee" })).toBe("Baird & Warner | Ann Lee");
  });
});
