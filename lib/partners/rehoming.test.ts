import { describe, it, expect } from "vitest";
import { canSeeRehoming, tokenToBucket, itemCategoryToBucket, toRehomingResource, filterRehomingResources, letterFor, type RehomingFilters } from "./rehoming";
import type { LocalVendor } from "@/lib/types";

function vendor(over: Partial<LocalVendor>): LocalVendor {
  return {
    id: "rec1", airtableId: "rec1", vendorType: "Donation Org", vendorName: "Test", pocName: "", email: "", phone: "",
    address: "", city: "", state: "", zip: "", website: "", itemCategories: "", consignmentTake: 0, zipCodesServed: "",
    notes: "", isActive: true, createdAt: "", prefCategories: [], ...over,
  };
}

const base: RehomingFilters = { query: "", types: [], buckets: [], radiusMiles: 15, originZip: "60010", includeOnline: true };

describe("canSeeRehoming", () => {
  it("allows the four TTT staff roles only", () => {
    for (const r of ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"]) expect(canSeeRehoming(r)).toBe(true);
    expect(canSeeRehoming("TTTSales")).toBe(false);
    expect(canSeeRehoming(null)).toBe(false);
    expect(canSeeRehoming("Owner")).toBe(false);
  });
});

describe("accept buckets", () => {
  it("maps the free-text tokens in use today", () => {
    expect(tokenToBucket("Home Décor")).toBe("Home Décor & Art");
    expect(tokenToBucket("Household Goods")).toBe("Kitchen & Housewares");
    expect(tokenToBucket("Home Goods")).toBe("Kitchen & Housewares");
    expect(tokenToBucket("Luxury Furniture")).toBe("Furniture");
    expect(tokenToBucket("Fashion")).toBe("Clothing & Shoes");
    expect(tokenToBucket("Vintage")).toBe("Antiques, Vintage & Collectibles");
    expect(tokenToBucket("Cabinetry")).toBe("Building Materials & Fixtures");
    expect(tokenToBucket("Small Appliances")).toBe("Appliances & Electronics");
    expect(tokenToBucket("Teacher")).toBeNull();
  });
  it("maps item-taxonomy categories used in collector preferences", () => {
    expect(itemCategoryToBucket("Seating")).toBe("Furniture");
    expect(itemCategoryToBucket("Jewelry & Watches")).toBe("Jewelry & Accessories");
    expect(itemCategoryToBucket("Glassware & Crystal")).toBe("Kitchen & Housewares");
  });
});

describe("filterRehomingResources", () => {
  const near = toRehomingResource(vendor({ id: "a", vendorName: "Near", itemCategories: "Furniture, Clothing", zip: "60010" }), true);
  const far = toRehomingResource(vendor({ id: "b", vendorName: "Far", vendorType: "Consignment Store", itemCategories: "Jewelry", zip: "60601" }), true);
  const pickup = toRehomingResource(vendor({ id: "c", vendorName: "Pickup", zip: "60601", zipCodesServed: "60010, 60011" }), true);
  const online = toRehomingResource(vendor({ id: "d", vendorName: "Online", vendorType: "Collector/Reseller", prefCategories: [{ category: "Jewelry & Watches", minPrice: 100, maxPrice: 0 }] }), false);
  const all = [near, far, pickup, online];
  const distances = { a: 0, b: 35, c: 35 };

  it("applies the radius, keeps resources serving the zip and online ones", () => {
    expect(filterRehomingResources(all, base, distances).map((r) => r.id)).toEqual(["a", "c", "d"]);
    expect(filterRehomingResources(all, { ...base, includeOnline: false }, distances).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterRehomingResources(all, { ...base, radiusMiles: null }, distances)).toHaveLength(4);
  });
  it("filters by type, accepted items and search text", () => {
    expect(filterRehomingResources(all, { ...base, radiusMiles: null, types: ["Consignment Store"] }, distances).map((r) => r.id)).toEqual(["b"]);
    expect(filterRehomingResources(all, { ...base, radiusMiles: null, buckets: ["Jewelry & Accessories"] }, distances).map((r) => r.id)).toEqual(["b", "d"]);
    expect(filterRehomingResources(all, { ...base, radiusMiles: null, query: "clothing" }, distances).map((r) => r.id)).toEqual(["a"]);
  });
  it("ignores the radius until distances are known", () => {
    expect(filterRehomingResources(all, base, null)).toHaveLength(4);
  });
});

describe("letterFor", () => {
  it("ignores a leading 'The'", () => {
    expect(letterFor("The Economy Shop")).toBe("E");
    expect(letterFor("4 Paws Resale")).toBe("#");
  });
});
