/**
 * Dutch auction price computation and estate helpers.
 * Re-exports Airtable functions for convenience.
 */

import type { Estate } from "./types";

export {
  getEstatesForStorefront,
  getEstateWithItems,
  getItemsForEstateSale,
} from "./airtable";

export interface DutchPricing {
  currentPrice: number;
  startingPrice: number;
  nextDropAt: string | null; // ISO timestamp or null if at floor
  atFloor: boolean;
}

/**
 * Parse a sale date (YYYY-MM-DD) + optional CST time string ("H:MM AM/PM") into UTC ms.
 * All estate times are treated as America/Chicago (CDT = UTC-5 Apr–Oct, CST = UTC-6 Nov–Mar).
 */
function parseCSTDateTime(dateStr: string, timeStr?: string): number {
  if (!dateStr) return 0;
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  let hours = 0;
  let minutes = 0;
  if (timeStr) {
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      hours = parseInt(match[1]);
      minutes = parseInt(match[2]);
      const isPM = match[3].toUpperCase() === "PM";
      if (isPM && hours !== 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
    }
  }
  const utcOffset = month >= 4 && month <= 10 ? 5 : 6; // CDT or CST
  return Date.UTC(year, month - 1, day, hours + utcOffset, minutes, 0);
}

/**
 * Compute the current Dutch auction price for an item.
 * @param startingPrice  item.valueMid
 * @param estate         the estate record
 * @param nowMs          current time in milliseconds (Date.now())
 */
export function computeDutchPrice(
  startingPrice: number,
  estate: Estate,
  nowMs: number
): DutchPricing {
  const saleStart = parseCSTDateTime(estate.saleStartDate, estate.saleStartTime);
  const intervalMs = estate.dropIntervalHours * 3_600_000;
  const dropFactor = 1 - estate.dropPercent / 100;
  const floorPrice = Math.round(startingPrice * (estate.floorPercent / 100) * 100) / 100;

  let currentPrice = startingPrice;
  let atFloor = false;
  let nextDropAt: string | null = null;

  if (nowMs >= saleStart && intervalMs > 0) {
    const n = Math.floor((nowMs - saleStart) / intervalMs);
    const raw = startingPrice * Math.pow(dropFactor, n);
    currentPrice = Math.max(Math.round(raw * 100) / 100, floorPrice);
    atFloor = currentPrice <= floorPrice;

    if (!atFloor) {
      nextDropAt = new Date(saleStart + (n + 1) * intervalMs).toISOString();
    }
  } else if (nowMs < saleStart) {
    // Sale hasn't started yet — price stays at full starting price.
    // nextDropAt stays null; first drop occurs at saleStart + 1 interval
    // once the sale is live.
  }

  return { currentPrice, startingPrice, nextDropAt, atFloor };
}
