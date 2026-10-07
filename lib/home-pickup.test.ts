import { describe, it, expect } from "vitest";
import { parseTimeMinutes, chicagoToUtcMs, homePickupEndsAtMs, isHomePickupLive, isHomePickupItem, stripHomePickupPrivateFields } from "./home-pickup";
import type { Estate } from "./types";

const sale = (over: Partial<Estate> = {}) => ({
  id: "recSale", saleType: "Home Pickup", status: "Active",
  pickupWindowStart: "2026-10-18", pickupWindowEndTime: "2:00 PM", ...over,
}) as Estate;

describe("home pickup timing (America/Chicago)", () => {
  it("parses time strings", () => {
    expect(parseTimeMinutes("10:00 AM")).toBe(600);
    expect(parseTimeMinutes("2:30 pm")).toBe(870);
    expect(parseTimeMinutes("12:00 AM")).toBe(0);
    expect(parseTimeMinutes("14:00")).toBe(840);
    expect(parseTimeMinutes("nope")).toBeNull();
  });

  it("converts Chicago wall time to UTC across DST", () => {
    expect(new Date(chicagoToUtcMs("2026-10-18", 14 * 60)).toISOString()).toBe("2026-10-18T19:00:00.000Z"); // CDT
    expect(new Date(chicagoToUtcMs("2026-12-05", 14 * 60)).toISOString()).toBe("2026-12-05T20:00:00.000Z"); // CST
  });

  it("is live until the window ends, then not", () => {
    const end = homePickupEndsAtMs(sale())!;
    expect(isHomePickupLive(sale(), end - 1)).toBe(true);
    expect(isHomePickupLive(sale(), end)).toBe(false);
  });

  it("is never live as Draft or Closed or another sale type", () => {
    expect(isHomePickupLive(sale({ status: "Draft" }), 0)).toBe(false);
    expect(isHomePickupLive(sale({ status: "Closed" }), 0)).toBe(false);
    expect(isHomePickupLive(sale({ saleType: "Online" }), 0)).toBe(false);
  });
});

describe("item matching", () => {
  it("needs FB route, the exact sale id, and a Home Pickup sale", () => {
    expect(isHomePickupItem({ primaryRoute: "FB/Marketplace", estateSaleId: "recSale" }, sale())).toBe(true);
    expect(isHomePickupItem({ primaryRoute: "Estate Sale", estateSaleId: "recSale" }, sale())).toBe(false);
    expect(isHomePickupItem({ primaryRoute: "FB/Marketplace", estateSaleId: "recSale2" }, sale())).toBe(false);
    expect(isHomePickupItem({ primaryRoute: "FB/Marketplace", estateSaleId: "recSale" }, sale({ saleType: "Online" }))).toBe(false);
    expect(isHomePickupItem({ primaryRoute: "FB/Marketplace", estateSaleId: "recSale" }, null)).toBe(false);
  });

  it("keeps the street address and instructions out of public payloads", () => {
    const pub = stripHomePickupPrivateFields(sale({ pickupAddress: "1 Main St", pickupNotes: "side door", pickupCity: "Evanston" }));
    expect(pub.pickupAddress).toBe("");
    expect(pub.pickupNotes).toBe("");
    expect(pub.pickupCity).toBe("Evanston");
  });
});
