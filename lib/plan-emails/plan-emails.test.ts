import { describe, it, expect } from "vitest";
import { buildPlanEmailContext } from "./context";
import { buildMoverQuoteEmail } from "./mover-quote";
import { buildTeamBriefEmail } from "./team-brief";
import { buildClientMoveWeekEmail } from "./client-move-week";
import type { Item, PlanEntry, Tenant, Vendor } from "@/lib/types";

const tenant = { id: "recT", name: "Pat Doe", address: "1 Main St", city: "Evanston", state: "IL", zip: "60201" } as Tenant;
const item = (id: string, route: string, extra: Partial<Item> = {}) => ({ id, itemName: `Item ${id}`, primaryRoute: route, ...extra } as Item);
const entry = (e: Partial<PlanEntry>) => ({ id: Math.random().toString(), tenantId: "recT", helpers: [], ...e } as PlanEntry);
const sender = { name: "Sam Sender", email: "sam@toptiertransitions.com" };

function ctx(over: { items?: Item[]; entries?: PlanEntry[]; vendors?: Vendor[]; t?: Partial<Tenant> } = {}) {
  return buildPlanEmailContext({
    tenant: { ...tenant, ...over.t }, entries: over.entries ?? [], vendors: over.vendors ?? [], opportunities: [],
    staff: [], items: over.items ?? [], rooms: [], settings: null, sender, today: "2026-10-23",
  });
}

describe("plan email-me templates", () => {
  it("inventory only includes To Be Moved items", () => {
    const c = ctx({ items: [item("a", "To Be Moved"), item("b", "Donate"), item("c", "Family to Take"), item("d", "To Be Moved", { quantity: 2 })] });
    expect(c.toBeMovedItems.map((i) => i.id)).toEqual(["a", "d"]);
    const { html } = buildMoverQuoteEmail(c);
    expect(html).toContain("Item a");
    expect(html).not.toContain("Item b");
    expect(html).not.toContain("Item c");
  });

  it("says so when nothing is To Be Moved", () => {
    expect(buildMoverQuoteEmail(ctx()).html).toContain("No catalog items are marked To Be Moved");
  });

  it("shows highlighted placeholders for missing data", () => {
    const { html, text } = buildMoverQuoteEmail(ctx());
    expect(text).toContain("[Move date]");
    expect(html).toMatch(/background:#FEF3C7[^>]*>\[Move date\]/);
  });

  it("fills dates and team from plan entries", () => {
    const c = ctx({ entries: [
      entry({ entryType: "keydate", activity: "Move Date", date: "2026-11-05" }),
      entry({ activity: "Packing to Move", date: "2026-11-04", startTime: "10:00", endTime: "13:00" }),
      entry({ activity: "Unpacking", date: "2026-11-05", startTime: "13:00", endTime: "17:30" }),
    ] });
    const brief = buildTeamBriefEmail(c);
    expect(brief.subject).toBe("Team Brief: Pat Doe | Wednesday Packing + Thursday Move Day. Please Read & Confirm");
    expect(brief.text).toContain("10:00 AM to 1:00 PM");
    expect(brief.text).toContain("by 5:30 PM");
  });

  it("hides empty OPTIONAL sections and shows them when there is data", () => {
    const empty = buildClientMoveWeekEmail(ctx());
    expect(empty.text).not.toContain("FINAL PACKING DAY");
    expect(empty.text).not.toContain("UNSOLD FURNITURE");
    expect(empty.text).not.toContain("AFTER MOVE DAY");
    const full = buildClientMoveWeekEmail(ctx({
      entries: [
        entry({ entryType: "keydate", activity: "Move Date", date: "2026-11-05" }),
        entry({ activity: "Packing to Move", date: "2026-11-04" }),
      ],
      vendors: [
        { vendorType: "Donation Org", vendorName: "Habitat ReStore", date1: "2026-11-07" } as Vendor,
        { vendorType: "Other", vendorName: "Sparkle Cleaning", date1: "2026-11-09" } as Vendor,
      ],
    }));
    expect(full.text).toContain("FINAL PACKING DAY");
    expect(full.text).toContain("Habitat ReStore");
    expect(full.text).toContain("Sparkle Cleaning");
  });

  it("never uses em or en dashes", () => {
    for (const fn of [buildMoverQuoteEmail, buildTeamBriefEmail, buildClientMoveWeekEmail]) {
      const e = fn(ctx());
      expect(e.subject + e.html + e.text).not.toMatch(/[–—]/);
    }
  });
});
