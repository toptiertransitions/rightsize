import type { Item, PrimaryRoute, StaffMember, Tenant } from "./types";
import { getProjectStatus } from "./project-status";

// "Consignment Status for Me" (admin Invoicing page): a weekly Ops briefing on
// every Post Move Consignment project's for-sale items, where each one is on
// the Sales page's price-drop schedule, and who just crossed 30 / 60 / 90 days.
//
// Mirrors the Sales page: the schedule is "Days from Delivery" using the
// project's Price Drop 1 / 2 settings (default 30 days -33%, 60 days -66%) and
// a fixed 90-day unsold mark. Drops apply to Listed items and are always taken
// off the pre-drop price (see app/api/sales/apply-price-drop/route.ts).

export const REPORT_ROUTES: PrimaryRoute[] = ["ProFoundFinds Consignment", "Online Marketplace", "FB/Marketplace"];
const ROUTE_LABEL: Record<string, string> = {
  "ProFoundFinds Consignment": "ProFoundFinds",
  "Online Marketplace": "eBay",
  "FB/Marketplace": "FB Marketplace",
};
/** Still for sale. Sold, Donated, Discarded and Rejected / Revisit are done. */
const FOR_SALE_STATUSES = new Set(["Pending Review", "Approved", "Listed", "In Cart"]);
/** Statuses the Sales page's bulk price drops apply to. */
const PRICED_STATUSES = new Set(["Listed", "In Cart"]);
const UNSOLD_DAYS = 90;
const WEEK_DAYS = 7;

// Internal catalogs, not client projects.
const EXCLUDED_PROJECTS = ["ProFound Finds", "ProFound Finds Consignment", "BK Consign", "ED Consign", "Kevin Blake Art"];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const EXCLUDED = new Set(EXCLUDED_PROJECTS.map(norm));
export const isExcludedProject = (name: string) => EXCLUDED.has(norm(name));

export type Stage = "under" | "drop1" | "drop2" | "unsold";
export type PriceCheck = "ok" | "drop1-due" | "drop2-due" | "no-price" | "not-listed" | "n/a";

export interface ReportItem {
  id: string;
  name: string;
  barcode?: string;
  route: string;
  status: string;
  /** YYYY-MM-DD the clock starts from. */
  forSaleDate: string;
  /** Where forSaleDate came from. */
  dateSource: "delivered" | "added";
  ageDays: number;
  stage: Stage;
  /** The threshold (in days) this item crossed in the last 7 days, if any. */
  justHit: number | null;
  price: number;
  basePrice: number;
  reductionPct: number;
  expectedPct: number;
  expectedPrice: number | null;
  priceCheck: PriceCheck;
  /** 90+ days: what the project's unsold preference says to do. */
  unsoldAction?: string;
}

export interface ReportProject {
  id: string;
  name: string;
  clientEmail?: string;
  clientPhone?: string;
  teamLeadName?: string;
  drop1Days: number;
  drop1Pct: number;
  drop2Days: number;
  drop2Pct: number;
  unsoldPreference?: string;
  items: ReportItem[];
  soldCount: number;
}

export interface ConsignmentReport {
  asOf: string;
  projects: ReportProject[];
  totals: { projects: number; items: number; hit30: number; hit60: number; hit90: number; past90: number; dropsDue: number; notListed: number };
}

/** YYYY-MM-DD in Chicago time. */
export function chicagoDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(toDay + "T00:00:00Z") - Date.parse(fromDay + "T00:00:00Z")) / 86_400_000);
}

export function forSaleStart(item: Pick<Item, "deliveryDate" | "createdAt">): { day: string; source: "delivered" | "added" } | null {
  const delivered = item.deliveryDate?.slice(0, 10);
  if (delivered && /^\d{4}-\d{2}-\d{2}$/.test(delivered)) return { day: delivered, source: "delivered" };
  const created = item.createdAt ? new Date(item.createdAt) : null;
  if (created && !Number.isNaN(created.getTime())) return { day: chicagoDay(created), source: "added" };
  return null;
}

export function unsoldActionFor(tenant: Pick<Tenant, "unsoldStandardPreference" | "unsoldSpecialSituations">, itemId: string): string {
  const pref = tenant.unsoldStandardPreference;
  const special = (tenant.unsoldSpecialSituations ?? []).some((s) => s.itemId === itemId);
  if (!pref) return special ? "Special situation, contact client" : "No unsold preference set";
  if (special) return pref === "Donate" ? "Return to client (special)" : "Donate (special)";
  return pref === "Donate" ? "Donate" : "Return to client";
}

export function assessItem(
  item: Item,
  tenant: Pick<Tenant, "priceDrop1Days" | "priceDrop1Percent" | "priceDrop2Days" | "priceDrop2Percent" | "unsoldStandardPreference" | "unsoldSpecialSituations">,
  today: string
): ReportItem | null {
  const start = forSaleStart(item);
  if (!start) return null;
  const d1 = tenant.priceDrop1Days ?? 30;
  const p1 = tenant.priceDrop1Percent ?? 33;
  const d2 = tenant.priceDrop2Days ?? 60;
  const p2 = tenant.priceDrop2Percent ?? 66;

  const age = Math.max(0, daysBetween(start.day, today));
  const stage: Stage = age >= UNSOLD_DAYS ? "unsold" : age >= d2 ? "drop2" : age >= d1 ? "drop1" : "under";
  // Crossed in the last 7 days (today included): age is in [T, T + 7).
  const justHit = [UNSOLD_DAYS, d2, d1].find((t) => age >= t && age < t + WEEK_DAYS) ?? null;

  const price = item.valueMid || 0;
  const basePrice = item.priceDropOriginalValue || item.originalValue || price;
  const reductionPct = basePrice > 0 && price > 0 ? Math.max(0, Math.round((1 - price / basePrice) * 100)) : 0;
  const expectedPct = age >= d2 ? p2 : age >= d1 ? p1 : 0;
  const expectedPrice = expectedPct > 0 && basePrice > 0 ? Math.max(1, Math.round(basePrice * (1 - expectedPct / 100))) : null;

  let priceCheck: PriceCheck;
  if (!PRICED_STATUSES.has(item.status)) priceCheck = age >= d1 ? "not-listed" : "n/a";
  else if (price <= 0) priceCheck = "no-price";
  else if (expectedPrice === null || price <= expectedPrice + 1) priceCheck = "ok"; // $1 slack for rounding
  else priceCheck = expectedPct === p2 ? "drop2-due" : "drop1-due";

  return {
    id: item.id,
    name: item.itemName,
    barcode: item.barcodeNumber,
    route: ROUTE_LABEL[item.primaryRoute] ?? item.primaryRoute,
    status: item.status,
    forSaleDate: start.day,
    dateSource: start.source,
    ageDays: age,
    stage,
    justHit,
    price,
    basePrice,
    reductionPct,
    expectedPct,
    expectedPrice,
    priceCheck,
    unsoldAction: stage === "unsold" ? unsoldActionFor(tenant, item.id) : undefined,
  };
}

export function buildConsignmentReport(tenants: Tenant[], items: Item[], staff: StaffMember[], now = new Date()): ConsignmentReport {
  const today = chicagoDay(now);
  const projects = tenants
    .filter((t) => !t.isLostDeal && getProjectStatus(t) === "consignment" && !isExcludedProject(t.name))
    .map((t): ReportProject => {
      const mine = items.filter((i) => i.tenantId === t.id && REPORT_ROUTES.includes(i.primaryRoute));
      const forSale = mine
        .filter((i) => FOR_SALE_STATUSES.has(i.status))
        .map((i) => assessItem(i, t, today))
        .filter((i): i is ReportItem => !!i)
        .sort((a, b) => a.forSaleDate.localeCompare(b.forSaleDate) || a.name.localeCompare(b.name));
      const lead = t.teamLeadClerkId ? staff.find((s) => s.clerkUserId === t.teamLeadClerkId) : undefined;
      return {
        id: t.id,
        name: t.name,
        clientEmail: t.clientEmail,
        clientPhone: t.clientPhone,
        teamLeadName: lead?.displayName,
        drop1Days: t.priceDrop1Days ?? 30,
        drop1Pct: t.priceDrop1Percent ?? 33,
        drop2Days: t.priceDrop2Days ?? 60,
        drop2Pct: t.priceDrop2Percent ?? 66,
        unsoldPreference: t.unsoldStandardPreference,
        items: forSale,
        soldCount: mine.filter((i) => i.status === "Sold").length,
      };
    })
    .filter((p) => p.items.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const all = projects.flatMap((p) => p.items.map((i) => ({ i, p })));
  return {
    asOf: today,
    projects,
    totals: {
      projects: projects.length,
      items: all.length,
      hit30: all.filter(({ i, p }) => i.justHit === p.drop1Days).length,
      hit60: all.filter(({ i, p }) => i.justHit === p.drop2Days).length,
      hit90: all.filter(({ i }) => i.justHit === UNSOLD_DAYS).length,
      past90: all.filter(({ i }) => i.stage === "unsold").length,
      dropsDue: all.filter(({ i }) => i.priceCheck === "drop1-due" || i.priceCheck === "drop2-due").length,
      notListed: all.filter(({ i }) => i.priceCheck === "not-listed").length,
    },
  };
}

// ─── Email ────────────────────────────────────────────────────────────────────
// Item rows use the classes in <style> rather than inline styles: a few
// hundred items with inline styles runs past Gmail's ~100KB clipping limit.

const GREEN = "#2d4a3e";
const GOLD = "#C9A96E";

function esc(s: string | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const fmtDay = (day: string, year = true) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });

const STYLE = `
body{margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
.it{width:100%;border-collapse:collapse;font-size:12px;color:#1f2937;}
.it td{padding:7px 8px;border-top:1px solid #f3f4f6;vertical-align:top;}
.it .h td{background:#f9fafb;border-top:0;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;}
.it .n{font-size:13px;font-weight:600;}
.it i{font-size:11px;color:#6b7280;font-weight:400;font-style:normal;}
.it .d{white-space:nowrap;color:#374151;}
.it .a{text-align:right;font-weight:700;white-space:nowrap;}
.it .p{text-align:right;white-space:nowrap;}
.it tr.g td{background:#f0f7f3;}
.it tr.g td.n{border-left:4px solid ${GREEN};}
.it tr.r td{background:#fef2f2;}
.it tr.r td.n{border-left:4px solid #dc2626;}
.it tr.r .a{color:#b91c1c;}
b.t{display:inline-block;margin-top:3px;font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;text-transform:uppercase;white-space:nowrap;}
.tg{background:${GREEN};color:#fff;}
.tr{background:#fee2e2;color:#b91c1c;}
.ta{background:#fef3c7;color:#b45309;}
.tk{background:#dcfce7;color:#15803d;}
.x{color:#b91c1c;font-weight:700;}
`;

function tag(text: string, cls: string): string {
  return `<b class="t ${cls}">${esc(text)}</b>`;
}

function itemTags(i: ReportItem, p: ReportProject): string {
  const tags: string[] = [];
  if (i.justHit !== null) tags.push(tag(`Hit ${i.justHit} days this week`, "tg"));
  if (i.stage === "unsold") tags.push(tag(`${UNSOLD_DAYS}+ days`, "tr"));
  if (i.priceCheck === "drop1-due") tags.push(tag("Drop 1 missing", "tr"));
  if (i.priceCheck === "drop2-due") tags.push(tag("Drop 2 missing", "tr"));
  if (i.priceCheck === "no-price") tags.push(tag("No price", "ta"));
  if (i.priceCheck === "not-listed") tags.push(tag("Not listed yet", "ta"));
  if (i.priceCheck === "ok" && i.expectedPct > 0) tags.push(tag("Drop done", "tk"));
  return tags.length ? `<br>${tags.join(" ")}` : "";
}

function itemRow(i: ReportItem, p: ReportProject, year: boolean): string {
  const cls = i.stage === "unsold" ? ' class="r"' : i.justHit !== null ? ' class="g"' : "";
  const name = i.name.length > 60 ? i.name.slice(0, 58) + "…" : i.name;
  const due = (i.priceCheck === "drop1-due" || i.priceCheck === "drop2-due") && i.expectedPrice;
  const price = i.price > 0
    ? `${money(i.price)}${i.reductionPct > 0 ? `<br><i>-${i.reductionPct}% of ${money(i.basePrice)}</i>` : ""}${due ? `<br><span class="x">&rarr; ${money(i.expectedPrice!)}</span>` : ""}`
    : `<i>&mdash;</i>`;
  return `<tr${cls}><td class="n">${esc(name)}<br><i>${esc(i.route)}${i.status === "Listed" ? "" : ` &middot; ${esc(i.status)}`}</i>${itemTags(i, p)}</td><td class="d">${fmtDay(i.forSaleDate, year)}${i.dateSource === "delivered" ? "<br><i>delivered</i>" : ""}</td><td class="a">${i.ageDays}d</td><td class="p">${price}</td></tr>`;
}

function projectSection(p: ReportProject, appUrl: string, year: string): string {
  const hits = p.items.filter((i) => i.justHit !== null).length;
  const past = p.items.filter((i) => i.stage === "unsold").length;
  const due = p.items.filter((i) => i.priceCheck === "drop1-due" || i.priceCheck === "drop2-due").length;
  const salesUrl = `${appUrl}/sales?tenantId=${p.id}`;
  const contact = [esc(p.clientPhone), p.clientEmail && `<a href="mailto:${esc(p.clientEmail)}" style="color:${GREEN};">${esc(p.clientEmail)}</a>`, p.teamLeadName && `Lead: ${esc(p.teamLeadName)}`].filter(Boolean).join(" &middot; ");
  const flags = [
    hits ? tag(`${hits} hit a mark this week`, "tg") : "",
    past ? tag(`${past} past ${UNSOLD_DAYS} days`, "tr") : "",
    due ? tag(`${due} price drop${due === 1 ? "" : "s"} missing`, "tr") : "",
  ].filter(Boolean).join(" ");
  return `<tr><td style="padding:26px 28px 0;">
<p style="margin:0;font-size:16px;font-weight:700;"><a href="${salesUrl}" style="color:#1f2937;text-decoration:none;">${esc(p.name)}</a> <a href="${salesUrl}" style="font-size:12px;font-weight:600;color:${GREEN};">Sales page &rarr;</a></p>
${contact ? `<p style="margin:3px 0 0;font-size:12px;color:#6b7280;">${contact}</p>` : ""}
<p style="margin:3px 0 0;font-size:11px;color:#9ca3af;">${p.items.length} for sale &middot; ${p.soldCount} sold &middot; Drops: ${p.drop1Days}d -${p.drop1Pct}%, ${p.drop2Days}d -${p.drop2Pct}% &middot; Unsold plan: ${esc(p.unsoldPreference ?? "not set")}</p>
${flags ? `<p style="margin:4px 0 0;">${flags}</p>` : ""}
<table class="it" cellpadding="0" cellspacing="0" style="margin-top:10px;border:1px solid #e5e7eb;">
<tr class="h"><td>Item</td><td>For sale since</td><td style="text-align:right;">Age</td><td style="text-align:right;">Price</td></tr>
${p.items.map((i) => itemRow(i, p, !i.forSaleDate.startsWith(year))).join("\n")}
</table>
</td></tr>`;
}

function thisWeekSection(report: ConsignmentReport): string {
  const rows = report.projects
    .map((p) => {
      const by = (t: number) => p.items.filter((i) => i.justHit === t).length;
      const parts = [
        by(p.drop1Days) ? `${by(p.drop1Days)} hit ${p.drop1Days} days (Drop 1, -${p.drop1Pct}%)` : "",
        by(p.drop2Days) ? `${by(p.drop2Days)} hit ${p.drop2Days} days (Drop 2, -${p.drop2Pct}%)` : "",
        by(UNSOLD_DAYS) ? `${by(UNSOLD_DAYS)} hit ${UNSOLD_DAYS} days (unsold plan: ${p.unsoldPreference ?? "not set"})` : "",
      ].filter(Boolean);
      return parts.length ? { p, parts } : null;
    })
    .filter((r): r is { p: ReportProject; parts: string[] } => !!r);
  const body = rows.length
    ? rows.map(({ p, parts }) => `<tr><td style="padding:9px 12px;border-top:1px solid #f3f4f6;">
<p style="margin:0;font-size:13px;font-weight:700;color:#1f2937;">${esc(p.name)}</p>
<p style="margin:2px 0 0;font-size:12px;color:#374151;">${parts.map(esc).join(" &middot; ")}</p>
${p.clientPhone || p.clientEmail || p.teamLeadName ? `<p style="margin:2px 0 0;font-size:11px;color:#6b7280;">${[esc(p.clientPhone), esc(p.clientEmail), p.teamLeadName && `Lead: ${esc(p.teamLeadName)}`].filter(Boolean).join(" &middot; ")}</p>` : ""}
</td></tr>`).join("")
    : `<tr><td style="padding:12px;font-size:13px;color:#6b7280;">No items crossed the 30, 60 or 90 day mark this week.</td></tr>`;
  return `<tr><td style="padding:26px 28px 0;">
<p style="margin:0;font-size:11px;font-weight:700;color:${GREEN};text-transform:uppercase;letter-spacing:0.08em;">Who to talk to this week</p>
<p style="margin:3px 0 0;font-size:12px;color:#6b7280;">Projects with items that crossed a price-drop or unsold mark in the last 7 days</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border:1px solid #e5e7eb;border-radius:8px;">${body}</table>
</td></tr>`;
}

function past90Section(report: ConsignmentReport): string {
  const rows = report.projects
    .map((p) => ({ p, items: p.items.filter((i) => i.stage === "unsold") }))
    .filter((r) => r.items.length > 0);
  if (!rows.length) return "";
  return `<tr><td style="padding:26px 28px 0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:8px;"><tr><td style="padding:14px 16px;">
<p style="margin:0;font-size:12px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.06em;">Past ${UNSOLD_DAYS} days: needs a decision</p>
<p style="margin:4px 0 8px;font-size:12px;color:#7f1d1d;">${report.totals.past90} item${report.totals.past90 === 1 ? "" : "s"} still for sale after ${UNSOLD_DAYS} days. Follow each project's unsold plan (donate or return), or agree a new one with the client.</p>
${rows.map(({ p, items }) => `<p style="margin:6px 0 0;font-size:13px;color:#1f2937;"><strong>${esc(p.name)}</strong>: ${items.length} item${items.length === 1 ? "" : "s"}, oldest ${items[0].ageDays} days &middot; unsold plan: ${esc(p.unsoldPreference ?? "not set")}</p>`).join("")}
</td></tr></table>
</td></tr>`;
}

export function buildConsignmentStatusEmail(report: ConsignmentReport, recipientName: string, appUrl: string): { subject: string; html: string } {
  const t = report.totals;
  const year = report.asOf.slice(0, 4);
  const stat = (label: string, value: number, color = GREEN, last = false) =>
    `<td style="padding:14px 6px;text-align:center;${last ? "" : "border-right:1px solid #e5e7eb;"}"><p style="margin:0;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;">${label}</p><p style="margin:4px 0 0;font-size:20px;font-weight:700;color:${color};">${value}</p></td>`;
  const generated = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  const projects = report.projects.length
    ? report.projects.map((p) => projectSection(p, appUrl, year)).join("\n")
    : `<tr><td style="padding:26px 28px 0;font-size:14px;color:#6b7280;">No Post Move Consignment projects have items for sale right now.</td></tr>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${STYLE}</style></head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;">
<tr><td align="center" style="padding:32px 12px;">
<table width="100%" style="max-width:760px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);" cellpadding="0" cellspacing="0">
<tr style="background:${GREEN};"><td style="padding:28px;">
<p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;color:${GOLD};text-transform:uppercase;">Top Tier Transitions &middot; Ops Weekly</p>
<h1 style="margin:6px 0 0;font-size:26px;font-weight:700;color:#ffffff;">Consignment Status</h1>
<p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Every Post Move Consignment item for sale on ProFoundFinds, eBay and FB Marketplace: where it is on the price-drop schedule, and who just hit 30, 60 or 90 days</p>
<p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.5);">Generated ${generated} CT for ${esc(recipientName || "you")}</p>
</td></tr>
<tr><td style="padding:0;border-bottom:1px solid #e5e7eb;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
${stat("Projects", t.projects)}${stat("For sale", t.items)}${stat("Hit 30 this wk", t.hit30)}${stat("Hit 60 this wk", t.hit60)}${stat("Hit 90 this wk", t.hit90)}${stat("Past 90", t.past90, t.past90 ? "#b91c1c" : GREEN)}${stat("Drops missing", t.dropsDue, t.dropsDue ? "#b91c1c" : GREEN, true)}
</tr></table></td></tr>
${thisWeekSection(report)}
${past90Section(report)}
<tr><td style="padding:26px 28px 0;">
<p style="margin:0;font-size:11px;font-weight:700;color:${GREEN};text-transform:uppercase;letter-spacing:0.08em;">By project</p>
<p style="margin:3px 0 0;font-size:12px;color:#6b7280;">Alphabetical, items oldest to newest. "For sale since" is the catalog add date unless marked delivered. Status shows when not Listed. Green rows hit a mark this week; red rows are past ${UNSOLD_DAYS} days. "&rarr; $X" is the price after the missing drop. Red rows follow the project's unsold plan, shown under its name.</p>
</td></tr>
${projects}
<tr><td style="padding:28px 0 0;"></td></tr>
<tr style="background:#f9fafb;"><td style="padding:16px 28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;line-height:1.5;">
Rightsize &middot; Top Tier Transitions &middot; Internal. Ages count from the item's delivery date when it has one (the Sales page's "Days from Delivery"), otherwise from the day it was added to the catalog.
Price drops are checked against each project's Sales page settings, measured from the pre-drop price, for Listed and In Cart items (the ones the Sales page drops apply to).
Includes Pending Review, Approved, Listed and In Cart items. Excludes internal catalogs: ${EXCLUDED_PROJECTS.filter((n) => n !== "ProFound Finds Consignment").join(", ")}.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const marks = t.hit30 + t.hit60 + t.hit90;
  const flags = [marks ? `${marks} hit a mark this week` : "", t.past90 ? `${t.past90} past 90 days` : ""].filter(Boolean).join(", ");
  const subject = `Consignment Status: ${t.items} items across ${t.projects} projects${flags ? ` (${flags})` : ""}`;
  return { subject, html };
}
