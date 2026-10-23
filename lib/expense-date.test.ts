import { describe, it, expect } from "vitest";
import { normalizeReceiptDate } from "./expense-date";

const TODAY = "2026-10-22";

describe("normalizeReceiptDate", () => {
  it("keeps dates within the last year", () => {
    expect(normalizeReceiptDate("2026-10-22", TODAY)).toBe("2026-10-22");
    expect(normalizeReceiptDate("2026-01-15", TODAY)).toBe("2026-01-15");
    expect(normalizeReceiptDate("2025-11-01", TODAY)).toBe("2025-11-01");
  });

  it("fixes a misread year to the most recent past occurrence", () => {
    expect(normalizeReceiptDate("2020-10-23", "2026-10-23")).toBe("2026-10-23");
    expect(normalizeReceiptDate("2024-10-01", TODAY)).toBe("2026-10-01");
    expect(normalizeReceiptDate("2020-11-15", TODAY)).toBe("2025-11-15");
  });

  it("treats a date a few days ahead as today", () => {
    expect(normalizeReceiptDate("2020-10-23", TODAY)).toBe(TODAY);
    expect(normalizeReceiptDate("2026-10-25", TODAY)).toBe(TODAY);
  });

  it("pulls future dates back", () => {
    expect(normalizeReceiptDate("2027-10-01", TODAY)).toBe("2026-10-01");
    expect(normalizeReceiptDate("2026-12-01", TODAY)).toBe("2025-12-01");
  });

  it("falls back to today for unusable dates", () => {
    expect(normalizeReceiptDate("2020-02-29", "2026-03-10")).toBe("2026-03-10");
    expect(normalizeReceiptDate("garbage", TODAY)).toBe(TODAY);
  });
});
