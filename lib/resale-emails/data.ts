// Resale update emails: the anchor date and every merge field, worked out
// from one project's live data. Pure (no Airtable calls) so it can be tested.
import type { Item, ItemSaleEvent, LocalVendor, Tenant } from "@/lib/types";
import { AUTO_DROP_ROUTE, addDays, deliveryDay } from "@/lib/pricing/autoDrop";
import { unsoldActionFor } from "@/lib/consignment-status-report";
import { computeCalcPayout } from "@/lib/sales/payout";
import { DAY_OFFSET, type ResaleEmailType, type ResaleMergeData } from "./render";

export const SIGNED_AS = "The Top Tier Team";
/** Window end minus this many days. */
export const DISPOSITION_LEAD_DAYS = 7;

/** Earliest delivery date among the project's Listed ProFoundFinds
 * Consignment items: the same items and date the automated pricing uses. */
export function computeAnchor(items: Pick<Item, "primaryRoute" | "status" | "deliveryDate">[]): string | null {
  const days = items
    .filter((i) => i.primaryRoute === AUTO_DROP_ROUTE && i.status === "Listed")
    .map((i) => deliveryDay(i))
    .filter((d): d is string => !!d)
    .sort();
  return days[0] ?? null;
}

/** "January 8" */
export function monthDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** "(847) 322-5488" for a 10-digit US number, otherwise as stored. */
export function formatPhone(raw?: string): string {
  const digits = (raw ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : (raw ?? "").trim();
}

const CHANNEL_LABEL: Partial<Record<Item["primaryRoute"], string>> = {
  "ProFoundFinds Consignment": "ProFound Finds",
  "FB/Marketplace": "Facebook Marketplace",
  "Online Marketplace": "eBay",
};

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export interface ResaleDataInput {
  type: ResaleEmailType;
  tenant: Tenant;
  items: Item[];
  saleEvents: ItemSaleEvent[];
  localVendors: LocalVendor[];
  contactName?: string;
  companyPhone?: string;
  anchor: string;
  /** Day the previous email in the sequence went out (or the anchor). */
  sinceDay: string;
  appUrl: string;
}

export interface ResaleData {
  merge: ResaleMergeData;
  flags: string[];
  salesUrl: string;
  projectUrl: string;
}

export function buildResaleData(input: ResaleDataInput): ResaleData {
  const { tenant, items, saleEvents, localVendors, anchor, sinceDay, appUrl } = input;
  const mine = items.filter((i) => i.tenantId === tenant.id);
  const flags: string[] = [];

  // Still for sale: currently Listed. Their Donate / Return choice comes from
  // the project's standard preference plus its Special Situations.
  const listed = mine.filter((i) => i.status === "Listed");
  let donate = 0, ret = 0, blank = 0;
  for (const item of listed) {
    const action = unsoldActionFor(tenant, item.id);
    if (action.startsWith("Donate")) donate++;
    else if (action.startsWith("Return")) ret++;
    else blank++;
  }

  const channels = [...new Set(listed.map((i) => CHANNEL_LABEL[i.primaryRoute]).filter((c): c is string => !!c))];
  const ordered = ["ProFound Finds", "Facebook Marketplace", "eBay"].filter((c) => channels.includes(c));

  // Sold: Square sale events when there are any (same as the Sales page),
  // otherwise the item's sale price and the Sales page's payout calculation.
  const eventsByItem = new Map<string, ItemSaleEvent[]>();
  for (const e of saleEvents) {
    if (e.tenantId && e.tenantId !== tenant.id) continue;
    eventsByItem.set(e.itemId, [...(eventsByItem.get(e.itemId) ?? []), e]);
  }
  const sold = mine.filter((i) => i.status === "Sold");
  let salesTotal = 0, proceeds = 0, noPayout = 0, noDate = 0, sinceLast = 0;
  for (const item of sold) {
    const events = eventsByItem.get(item.id) ?? [];
    const amount = events.length ? events.reduce((s, e) => s + e.totalAmount, 0) : item.salePrice ?? 0;
    const payout = events.length
      ? events.reduce((s, e) => s + e.clientPayout, 0)
      : computeCalcPayout(item, localVendors)?.amount ?? item.consignorPayout ?? 0;
    salesTotal += amount;
    proceeds += payout;
    if (amount > 0 && !(payout > 0)) noPayout++;
    const soldDay = item.saleDate?.slice(0, 10) || events.map((e) => e.saleDate?.slice(0, 10)).filter(Boolean).sort().pop();
    if (!soldDay) noDate++;
    else if (soldDay > sinceDay) sinceLast++;
  }

  const window = addDays(anchor, DAY_OFFSET.day90);
  const salesUrl = `${appUrl}/sales?tenantId=${tenant.id}`;
  const firstName = input.contactName?.trim().split(/\s+/)[0] ?? "";

  if (!tenant.payoutMethod) flags.push("No payout method on file (Zelle or check)");
  if (blank > 0) flags.push(`${blank} listed item${blank === 1 ? "" : "s"} with no Donate or Return choice`);
  if (listed.length === 0) flags.push("All items sold: zero items still listed. Decide whether this email still makes sense.");
  if (!firstName) flags.push('No client contact name found, so the greeting reads "Hi there,"');
  if (!tenant.clientEmail) flags.push("No client email on the project");
  if (noPayout > 0) flags.push(`${noPayout} sold item${noPayout === 1 ? " has" : "s have"} no payout amount, so proceeds may read low`);
  if (noDate > 0) flags.push(`${noDate} sold item${noDate === 1 ? " has" : "s have"} no sale date and ${noDate === 1 ? "isn't" : "aren't"} counted in "sold since last"`);
  if (!input.companyPhone) flags.push("No company phone in Invoice Settings, so the signature has no phone number");

  return {
    merge: {
      contact_first_name: firstName || "there",
      pc_first_name: SIGNED_AS,
      pc_phone: formatPhone(input.companyPhone),
      listed_count: listed.length,
      sales_channels: joinList(ordered.length ? ordered : ["ProFound Finds"]),
      sales_page_link: salesUrl,
      day30_date: monthDay(addDays(anchor, DAY_OFFSET.day30)),
      day60_date: monthDay(addDays(anchor, DAY_OFFSET.day60)),
      window_end_date: monthDay(window),
      disposition_deadline: monthDay(addDays(window, -DISPOSITION_LEAD_DAYS)),
      blank_count: blank,
      donate_count: donate,
      return_count: ret,
      sold_since_last: sinceLast,
      sold_total_count: sold.length,
      sold_total_amount: money(salesTotal),
      proceeds_to_date: money(proceeds),
      payout_method: tenant.payoutMethod ?? "",
    },
    flags,
    salesUrl,
    projectUrl: `${appUrl}/plan?tenantId=${tenant.id}`,
  };
}
