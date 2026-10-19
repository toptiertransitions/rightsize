import { describe, it, expect } from "vitest";
import { assessItem, buildConsignmentReport, forSaleStart, isExcludedProject, unsoldActionFor } from "./consignment-status-report";
import type { Item, Tenant } from "./types";

const TODAY = "2026-10-19";
const tenant = {} as Tenant;
const item = (over: Partial<Item>): Item => ({
  id: "recItem00000000001", tenantId: "recTenant000000001", itemName: "Lamp", status: "Listed",
  primaryRoute: "ProFoundFinds Consignment", valueMid: 100, createdAt: "2026-10-10T15:00:00.000Z", ...over,
} as Item);
const daysAgo = (n: number) => new Date(Date.parse(TODAY + "T12:00:00Z") - n * 86_400_000).toISOString().slice(0, 10);

describe("consignment status report", () => {
  it("starts the clock at delivery when set, otherwise at catalog add", () => {
    expect(forSaleStart({ deliveryDate: "2026-09-01", createdAt: "2026-10-01T00:00:00Z" })).toEqual({ day: "2026-09-01", source: "delivered" });
    expect(forSaleStart({ createdAt: "2026-10-01T15:00:00Z" })).toEqual({ day: "2026-10-01", source: "added" });
  });

  it("flags items that crossed a mark in the last 7 days", () => {
    expect(assessItem(item({ deliveryDate: daysAgo(30) }), tenant, TODAY)?.justHit).toBe(30);
    expect(assessItem(item({ deliveryDate: daysAgo(36) }), tenant, TODAY)?.justHit).toBe(30);
    expect(assessItem(item({ deliveryDate: daysAgo(37) }), tenant, TODAY)?.justHit).toBeNull();
    expect(assessItem(item({ deliveryDate: daysAgo(62) }), tenant, TODAY)?.justHit).toBe(60);
    expect(assessItem(item({ deliveryDate: daysAgo(90) }), tenant, TODAY)?.justHit).toBe(90);
    expect(assessItem(item({ deliveryDate: daysAgo(29) }), tenant, TODAY)?.justHit).toBeNull();
  });

  it("uses the project's own drop days", () => {
    const t = { priceDrop1Days: 21 } as Tenant;
    const r = assessItem(item({ deliveryDate: daysAgo(22) }), t, TODAY)!;
    expect(r.stage).toBe("drop1");
    expect(r.justHit).toBe(21);
  });

  it("checks price drops against the pre-drop price", () => {
    const at35 = daysAgo(35);
    expect(assessItem(item({ deliveryDate: at35, valueMid: 100 }), tenant, TODAY)?.priceCheck).toBe("drop1-due");
    expect(assessItem(item({ deliveryDate: at35, valueMid: 67, priceDropOriginalValue: 100 }), tenant, TODAY)?.priceCheck).toBe("ok");
    const at65 = daysAgo(65);
    expect(assessItem(item({ deliveryDate: at65, valueMid: 67, priceDropOriginalValue: 100 }), tenant, TODAY)?.priceCheck).toBe("drop2-due");
    expect(assessItem(item({ deliveryDate: at65, valueMid: 34, priceDropOriginalValue: 100 }), tenant, TODAY)?.priceCheck).toBe("ok");
    // Manual reduction tracked via originalValue counts too
    expect(assessItem(item({ deliveryDate: at35, valueMid: 60, originalValue: 100 }), tenant, TODAY)?.priceCheck).toBe("ok");
  });

  it("doesn't expect drops on items that aren't listed", () => {
    expect(assessItem(item({ deliveryDate: daysAgo(40), status: "Approved" }), tenant, TODAY)?.priceCheck).toBe("not-listed");
    expect(assessItem(item({ deliveryDate: daysAgo(10), status: "Approved" }), tenant, TODAY)?.priceCheck).toBe("n/a");
  });

  it("reports the unsold plan past 90 days", () => {
    expect(unsoldActionFor({ unsoldStandardPreference: "Donate" }, "x")).toBe("Donate");
    expect(unsoldActionFor({ unsoldStandardPreference: "Donate", unsoldSpecialSituations: [{ itemId: "x", itemName: "" }] }, "x")).toBe("Return to client (special)");
    expect(assessItem(item({ deliveryDate: daysAgo(120) }), { unsoldStandardPreference: "Return" } as Tenant, TODAY)?.unsoldAction).toBe("Return to client");
  });

  it("excludes internal catalogs", () => {
    expect(isExcludedProject("ProFound Finds")).toBe(true);
    expect(isExcludedProject("Profound Finds Consignment")).toBe(true);
    expect(isExcludedProject("bk consign")).toBe(true);
    expect(isExcludedProject("Kevin Blake Art")).toBe(true);
    expect(isExcludedProject("Lisa Crady")).toBe(false);
  });

  it("builds projects alphabetically, items oldest first, consignment projects only", () => {
    const tenants = [
      { id: "t2", name: "zeta", isConsignmentOnly: true },
      { id: "t1", name: "Alpha", isConsignmentOnly: true },
      { id: "t3", name: "Active Co" },
      { id: "t4", name: "ED Consign", isConsignmentOnly: true },
    ] as Tenant[];
    const items = [
      item({ id: "a", tenantId: "t1", deliveryDate: daysAgo(5) }),
      item({ id: "b", tenantId: "t1", deliveryDate: daysAgo(50) }),
      item({ id: "c", tenantId: "t1", status: "Sold" }),
      item({ id: "d", tenantId: "t2", primaryRoute: "FB/Marketplace" }),
      item({ id: "e", tenantId: "t3" }),
      item({ id: "f", tenantId: "t4" }),
      item({ id: "g", tenantId: "t2", primaryRoute: "Estate Sale" }),
    ];
    const r = buildConsignmentReport(tenants, items, [], new Date(TODAY + "T17:00:00Z"));
    expect(r.projects.map((p) => p.name)).toEqual(["Alpha", "zeta"]);
    expect(r.projects[0].items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(r.projects[0].soldCount).toBe(1);
    expect(r.projects[1].items.map((i) => i.id)).toEqual(["d"]);
  });
});
