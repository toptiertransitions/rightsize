// Home Pickup sales: one-off sales of FB/Marketplace-route items picked up
// from a single home address, on one or more days, each with its own window
// (pickupWindowsJson; the single-window fields hold the first and last day). Client-safe helpers shared
// by the storefront API, the auto-close cron, and admin.
import type { Estate, Item } from "./types";

export const HOME_PICKUP_ROUTE = "FB/Marketplace";

/** Parses "10:00 AM" / "2:30 pm" / "14:00" into minutes after midnight. */
export function parseTimeMinutes(t?: string): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** UTC ms for a wall-clock date + time in America/Chicago (DST-aware). */
export function chicagoToUtcMs(date: string, minutes: number): number {
  const [y, mo, d] = date.slice(0, 10).split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
  // Find Chicago's UTC offset at that moment, then shift.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asChicago = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return guess + (guess - asChicago);
}

export interface PickupWindow { date: string; startTime: string; endTime: string }

type WindowFields = Pick<Estate, "pickupWindowStart" | "pickupWindowEnd" | "pickupWindowStartTime" | "pickupWindowEndTime"> & { pickupWindowsJson?: string };

/** Every pickup day with its window, in date order. Uses the multi-day list
 * when present, else the single-window fields. */
export function homePickupWindows(estate: WindowFields): PickupWindow[] {
  if (estate.pickupWindowsJson) {
    try {
      const parsed = JSON.parse(estate.pickupWindowsJson) as PickupWindow[];
      const days = (Array.isArray(parsed) ? parsed : []).filter((w) => w && w.date);
      if (days.length > 0) return [...days].sort((a, b) => a.date.localeCompare(b.date));
    } catch { /* fall through to the single window */ }
  }
  if (!estate.pickupWindowStart) return [];
  return [{ date: estate.pickupWindowStart.slice(0, 10), startTime: estate.pickupWindowStartTime ?? "", endTime: estate.pickupWindowEndTime ?? "" }];
}

/** When the last pickup window closes. Falls back to end of that day when no
 * end time is set; null when there's no pickup date at all. */
export function homePickupEndsAtMs(estate: WindowFields): number | null {
  const days = homePickupWindows(estate);
  const last = days[days.length - 1];
  if (!last) return null;
  const end = parseTimeMinutes(last.endTime) ?? 24 * 60 - 1;
  return chicagoToUtcMs(last.date, end);
}

/** Live = published (Active) and the pickup window hasn't ended. */
export function isHomePickupLive(
  estate: Pick<Estate, "saleType" | "status"> & WindowFields,
  now = Date.now()
): boolean {
  if (estate.saleType !== "Home Pickup" || estate.status !== "Active") return false;
  const endsAt = homePickupEndsAtMs(estate);
  return endsAt === null || now < endsAt;
}

/** An item can be shown/bought through a Home Pickup sale. */
export function isHomePickupItem(item: Pick<Item, "primaryRoute" | "estateSaleId">, estate: Pick<Estate, "id" | "saleType"> | null): boolean {
  return !!estate && estate.saleType === "Home Pickup" && item.primaryRoute === HOME_PICKUP_ROUTE && item.estateSaleId === estate.id;
}

/** Fields that must never reach the public site before purchase: the street
 * address and pickup instructions go out only in the confirmation email. */
export function stripHomePickupPrivateFields<T extends Partial<Estate>>(estate: T): T {
  if (estate.saleType !== "Home Pickup") return estate;
  return { ...estate, pickupAddress: "", pickupNotes: "", pickupZip: "" };
}
