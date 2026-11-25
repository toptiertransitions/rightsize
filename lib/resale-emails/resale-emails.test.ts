import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Item, ItemSaleEvent, LocalVendor, Tenant } from "@/lib/types";
import { RESALE_TEMPLATES } from "./templates.generated";
import { renderResaleBody, renderResaleEmail, RESALE_EMAIL_ORDER, type ResaleMergeData } from "./render";
import { buildResaleData, computeAnchor, monthDay } from "./data";

const merge: ResaleMergeData = {
  contact_first_name: "Susan", pc_first_name: "The Top Tier Team",
  listed_count: 18, sales_channels: "ProFound Finds and eBay", sales_page_link: "https://app.example.com/sales?tenantId=rec1&x=1",
  day30_date: "January 8", day60_date: "February 7", window_end_date: "March 9", disposition_deadline: "March 2",
  blank_count: 3, donate_count: 9, return_count: 2, sold_since_last: 4,
  sold_total_count: 14, sold_total_amount: "$2,860", proceeds_to_date: "$1,890", payout_method: "",
};

describe("templates.generated.ts", () => {
  it("matches the HTML source files", () => {
    for (const t of Object.values(RESALE_TEMPLATES)) {
      const raw = readFileSync(join(__dirname, "../../email-templates/resale-updates", t.file), "utf8");
      expect(raw.endsWith(t.html)).toBe(true);
      expect(raw.startsWith(`<!-- Subject: ${t.subject} |`)).toBe(true);
    }
  });
});

describe("renderResaleBody", () => {
  it("leaves no fields or comments in any email, either way each IF goes", () => {
    for (const type of RESALE_EMAIL_ORDER) {
      for (const d of [merge, { ...merge, blank_count: 0, return_count: 0, sold_since_last: 0, payout_method: "Zelle" }]) {
        const html = renderResaleBody(type, d);
        expect(html).not.toMatch(/\{\{|<!--|—/);
      }
    }
  });
  it("keeps or drops IF blocks", () => {
    expect(renderResaleBody("hands-on", merge)).toContain("One quick ask");
    expect(renderResaleBody("hands-on", merge)).toContain("And one more");
    expect(renderResaleBody("hands-on", merge).match(/reply to this email/g)).toHaveLength(2);
    expect(renderResaleBody("day90", merge)).not.toMatch(/\(\d{3}\)|\| /);
    const none = renderResaleBody("hands-on", { ...merge, blank_count: 0, payout_method: "Check" });
    expect(none).not.toContain("One quick ask");
    expect(none).not.toContain("And one more");
    expect(renderResaleBody("day30", merge)).toContain("Good news!");
    expect(renderResaleBody("day30", { ...merge, sold_since_last: 0 })).toContain("Nothing new has sold");
    expect(renderResaleBody("day60", { ...merge, return_count: 0 })).not.toContain("returned to you");
    expect(renderResaleBody("day90", merge)).toContain("your 2 items");
  });
  it("escapes values", () => {
    const html = renderResaleBody("hands-on", { ...merge, contact_first_name: "<b>Sue</b>" });
    expect(html).toContain("Hi &lt;b&gt;Sue&lt;/b&gt;,");
    expect(html).toContain('href="https://app.example.com/sales?tenantId=rec1&amp;x=1"');
  });
  it("puts the banner above the client email and builds the subject", () => {
    const { subject, html } = renderResaleEmail("day30", merge, {
      projectName: "Smith Move", clientName: "Susan Smith", clientEmail: "s@example.com", signedAs: "The Top Tier Team",
      trigger: "Daily run", anchorDate: "2026-12-09", anchorSource: "computed", flags: ["No payout method on file"],
      projectUrl: "https://app/plan", salesUrl: "https://app/sales",
    });
    expect(subject).toBe("[Review & Forward] Susan Smith | 30-day update on your items");
    expect(html.indexOf("INTERNAL")).toBeLessThan(html.indexOf("Top Tier Transitions</div>"));
    expect(html).toContain("No payout method on file");
  });
});

const tenant = { id: "recT", name: "Smith Move", unsoldStandardPreference: "Donate", unsoldSpecialSituations: [{ itemId: "i2", itemName: "Lamp" }] } as Tenant;
const it_ = (id: string, f: Partial<Item>) => ({ id, tenantId: "recT", primaryRoute: "ProFoundFinds Consignment", status: "Listed", ...f }) as Item;

describe("computeAnchor", () => {
  it("is the earliest delivery date of a Listed ProFoundFinds item", () => {
    expect(computeAnchor([
      it_("a", { deliveryDate: "2026-10-05" }),
      it_("b", { deliveryDate: "2026-09-20", status: "Sold" }),
      it_("c", { deliveryDate: "2026-09-01", primaryRoute: "FB/Marketplace" }),
      it_("d", { deliveryDate: "2026-10-02" }),
      it_("e", {}),
    ])).toBe("2026-10-02");
    expect(computeAnchor([it_("a", { status: "Sold", deliveryDate: "2026-10-01" })])).toBeNull();
  });
});

describe("buildResaleData", () => {
  const items = [
    it_("i1", { deliveryDate: "2026-12-09" }),
    it_("i2", { primaryRoute: "Online Marketplace" }),
    it_("i3", { status: "Sold", salePrice: 300, saleDate: "2027-01-10", clientSharePercent: 67 }),
    it_("i4", { status: "Sold", salePrice: 100, saleDate: "2026-12-20" }),
    it_("i5", { status: "Sold", salePrice: 0, saleDate: "2027-01-12" }),
  ];
  const events = [{ itemId: "i4", tenantId: "recT", totalAmount: 100, clientPayout: 67, saleDate: "2026-12-20" }] as ItemSaleEvent[];
  const d = buildResaleData({
    type: "day30", tenant, items, saleEvents: events, localVendors: [] as LocalVendor[],
    contactName: "Susan Smith", anchor: "2026-12-09", sinceDay: "2026-12-31", appUrl: "https://app",
  });
  it("splits listed items by Donate / Return choice", () => {
    expect(d.merge.listed_count).toBe(2);
    expect(d.merge.donate_count).toBe(1);
    expect(d.merge.return_count).toBe(1);
    expect(d.merge.blank_count).toBe(0);
    expect(d.merge.sales_channels).toBe("ProFound Finds and eBay");
  });
  it("totals sales and proceeds, and counts sold since the last email", () => {
    expect(d.merge.sold_total_count).toBe(3);
    expect(d.merge.sold_total_amount).toBe("$400");
    expect(d.merge.proceeds_to_date).toBe("$268");
    expect(d.merge.sold_since_last).toBe(2);
  });
  it("works out the dates and signature", () => {
    expect(d.merge.day30_date).toBe("January 8");
    expect(d.merge.window_end_date).toBe("March 9");
    expect(d.merge.disposition_deadline).toBe("March 2");
    expect(d.merge.contact_first_name).toBe("Susan");
    expect(d.merge.pc_first_name).toBe("The Top Tier Team");
    expect(d.flags).toContain("No payout method on file (Zelle or check)");
  });
  it("flags blanks when there's no standard preference", () => {
    const blank = buildResaleData({
      type: "day60", tenant: { ...tenant, unsoldStandardPreference: undefined }, items, saleEvents: [], localVendors: [],
      anchor: "2026-12-09", sinceDay: "2026-12-09", appUrl: "https://app",
    });
    expect(blank.merge.blank_count).toBe(2);
    expect(blank.merge.contact_first_name).toBe("there");
  });
  it("formats month and day", () => {
    expect(monthDay("2027-01-08")).toBe("January 8");
  });
});
