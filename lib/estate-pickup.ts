import type { Estate } from "./types";

/**
 * In-person estate sales have one pickup window: the sale itself. Online
 * buyers pick up during the sale dates and hours — the same promise
 * ProFoundFinds makes on the item pop-up and in the purchase confirmation
 * email. Returns a copy of the estate whose pickup windows are the sale
 * days (one per day, at the sale hours), so the pickup tools (Email
 * Details, Shopper Blast) can't drift from that. Online estates are
 * returned unchanged. Client-safe — no Airtable imports.
 */
export function withInPersonPickupWindow<T extends Pick<Estate, "saleType" | "saleStartDate" | "saleEndDate" | "saleStartTime" | "saleEndTime" | "pickupWindowsJson" | "pickupWindowStart" | "pickupWindowEnd" | "pickupWindowStartTime" | "pickupWindowEndTime">>(estate: T): T {
  if (estate.saleType !== "In-Person") return estate;
  const start = (estate.saleStartDate || estate.saleEndDate || "").slice(0, 10);
  const end = (estate.saleEndDate || estate.saleStartDate || "").slice(0, 10);
  if (!start) return estate;

  const days: { date: string; startTime: string; endTime: string }[] = [];
  const [y, m, d] = start.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  // Capped at 14 days so a bad end date can't produce a runaway list.
  for (let i = 0; i < 14; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    if (end && iso > end) break;
    days.push({ date: iso, startTime: estate.saleStartTime || "", endTime: estate.saleEndTime || "" });
    if (!end) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    ...estate,
    pickupWindowsJson: JSON.stringify(days),
    pickupWindowStart: "",
    pickupWindowEnd: "",
    pickupWindowStartTime: "",
    pickupWindowEndTime: "",
  };
}
