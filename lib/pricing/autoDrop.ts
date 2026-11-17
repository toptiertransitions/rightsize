// ProFoundFinds automated pricing. A ProFoundFinds Consignment item that's
// Listed drops automatically, counted from its Delivery Date (stamped the day
// it's listed): drop 1 at 30 days (33% off), drop 2 at 60 days (66% off).
// A project's own Price Drop settings, when set, replace those defaults.
//
// Every drop is taken off the item's listed price (PriceDropOriginalValue),
// never off a price someone lowered by hand: the item sells at whichever is
// lower, the scheduled price or the price staff set. Prices only ever go
// down. Shared by the daily cron, the automated price labels and the Sales
// page, so a printed tag always matches what Square charges. Client-safe.
import type { Item, Tenant } from "@/lib/types";

export const AUTO_DROP_ROUTE = "ProFoundFinds Consignment";

export interface DropSettings {
  drop1Days: number;
  drop1Pct: number;
  drop2Days: number;
  drop2Pct: number;
}

type TenantDropFields = Pick<Tenant, "priceDrop1Days" | "priceDrop1Percent" | "priceDrop2Days" | "priceDrop2Percent">;

export function dropSettings(tenant?: Partial<TenantDropFields> | null): DropSettings {
  const pos = (n: number | undefined, d: number) => (n != null && n > 0 ? n : d);
  return {
    drop1Days: pos(tenant?.priceDrop1Days, 30),
    drop1Pct: pos(tenant?.priceDrop1Percent, 33),
    drop2Days: pos(tenant?.priceDrop2Days, 60),
    drop2Pct: pos(tenant?.priceDrop2Percent, 66),
  };
}

/** Today in Chicago as YYYY-MM-DD. */
export function chicagoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

/** Whole dollars, never below $1 — the same rounding as the manual drops. */
export function dropPrice(base: number, pct: number): number {
  return Math.max(1, Math.round(base * (1 - pct / 100)));
}

/** YYYY-MM-DD from a stored Delivery Date, or null. */
export function deliveryDay(item: Pick<Item, "deliveryDate">): string | null {
  const d = item.deliveryDate?.slice(0, 10);
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/** The listed price the drops come off: the stored one, or the current
 * price when there's none yet or staff have raised the price above it. */
export function listedPrice(item: Pick<Item, "valueMid" | "priceDropOriginalValue">): number {
  return Math.max(item.priceDropOriginalValue ?? 0, item.valueMid ?? 0);
}

export interface ScheduleStep {
  step: 1 | 2;
  day: string;
  pct: number;
  price: number;
}

/** Both drop dates and prices for an item, starting from its delivery date
 * (or `fallbackStart` when it hasn't been listed yet, e.g. printing a label
 * before listing). */
export function priceSchedule(
  item: Pick<Item, "valueMid" | "priceDropOriginalValue" | "deliveryDate">,
  settings: DropSettings,
  fallbackStart?: string
): { start: string; base: number; current: number; steps: ScheduleStep[] } | null {
  const start = deliveryDay(item) ?? fallbackStart ?? null;
  const base = listedPrice(item);
  if (!start || base <= 0) return null;
  const current = item.valueMid > 0 ? item.valueMid : base;
  return {
    start,
    base,
    current,
    steps: [
      { step: 1, day: addDays(start, settings.drop1Days), pct: settings.drop1Pct, price: Math.min(current, dropPrice(base, settings.drop1Pct)) },
      { step: 2, day: addDays(start, settings.drop2Days), pct: settings.drop2Pct, price: Math.min(current, dropPrice(base, settings.drop2Pct)) },
    ],
  };
}

/** What the item should cost on `today`, and which drop that is (0 = none
 * due yet). Never more than its current price. */
export function scheduledPriceOn(
  item: Pick<Item, "valueMid" | "priceDropOriginalValue" | "deliveryDate">,
  settings: DropSettings,
  today: string
): { price: number; step: 0 | 1 | 2; base: number } | null {
  const start = deliveryDay(item);
  const base = listedPrice(item);
  if (!start || base <= 0 || !(item.valueMid > 0)) return null;
  const age = daysBetween(start, today);
  const step: 0 | 1 | 2 = age >= settings.drop2Days ? 2 : age >= settings.drop1Days ? 1 : 0;
  if (step === 0) return { price: item.valueMid, step, base };
  const pct = step === 2 ? settings.drop2Pct : settings.drop1Pct;
  return { price: Math.min(item.valueMid, dropPrice(base, pct)), step, base };
}
