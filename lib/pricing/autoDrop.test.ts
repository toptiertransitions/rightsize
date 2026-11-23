import { describe, it, expect } from "vitest";
import { autoDiscountPct, dropSettings } from "./autoDrop";

const s = dropSettings(null); // 30d → 33%, 60d → 66%
const item = (valueMid: number, deliveryDate = "2026-09-01", priceDropOriginalValue = 100) => ({ valueMid, deliveryDate, priceDropOriginalValue });

describe("autoDiscountPct", () => {
  it("is 0 before the first drop is due", () => {
    expect(autoDiscountPct(item(100), s, "2026-09-20")).toBe(0);
  });
  it("reports the drop the automated price reflects", () => {
    expect(autoDiscountPct(item(67), s, "2026-10-05")).toBe(33);
    expect(autoDiscountPct(item(34), s, "2026-11-05")).toBe(66);
    // drop 2 is due but the 7 AM job hasn't run yet: still drop 1's price
    expect(autoDiscountPct(item(67), s, "2026-10-31")).toBe(33);
  });
  it("ignores prices set by hand", () => {
    expect(autoDiscountPct(item(80), s, "2026-10-05")).toBe(0);  // lowered, but not to the drop price
    expect(autoDiscountPct(item(50), s, "2026-10-05")).toBe(0);  // lowered past drop 1
    expect(autoDiscountPct(item(90, "2026-09-01", 90), s, "2026-09-10")).toBe(0); // manual cut before any drop
  });
  it("is 0 without a delivery date", () => {
    expect(autoDiscountPct({ valueMid: 67, priceDropOriginalValue: 100 }, s, "2026-10-05")).toBe(0);
  });
});
