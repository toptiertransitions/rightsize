import { describe, it, expect, vi, beforeEach } from "vitest";
import { completeness } from "./completeness";
import { buildCommunityMergeData, renderTemplate, COMMUNITY_MERGE_TOKENS } from "./mergeFields";
import { bestPhone, formatPhone, parsePhones } from "./phones";
import { EMPTY_FILTERS, filterCommunities, findLikelyDuplicates, sortCommunities } from "./search";
import {
  cleanDashes, firstNamedPerson, isUnknownCell, matchCommunityName, normalizeCoi, normalizeType, parseFloorPlans, roleFromTitle, splitOperator, splitOtherRules,
} from "./seedNormalize";
import { emptyRules, ruleStatus, type Community, type CommunityContact, type CommunityWithContacts } from "./types";

const community = (over: Partial<Community> = {}): Community => ({
  id: "recCOMMUNITY000001", name: "The Roosevelt at Salt Creek", type: "Senior Living", operator: "", street: "400 W Butterfield Rd",
  city: "Elmhurst", state: "IL", zip: "60126", website: "", linkedCompanyId: "", status: "Active",
  rules: { ...emptyRules(), checkin: "Front desk", parking: "West garage", coi_required: "No" },
  ruleStatus: { coi_details: "not_applicable" },
  floorPlansOnFile: false, floorPlansNotes: "", openItems: "", sourceNotes: "", lastVerified: "", lastVerifiedBy: "", internalNotes: "",
  archived: false, createdAt: "", updatedAt: "", updatedBy: "", ...over,
});
const contact = (over: Partial<CommunityContact> = {}): CommunityContact => ({
  id: "recCONTACT00000001", communityId: "recCOMMUNITY000001", name: "Dariela Garcia", title: "Move-in Coordinator", role: "Move-In Coordinator",
  email: "dg@example.com", phones: [{ label: "Office", number: "(630) 994-3104" }, { label: "Mobile", number: "(708) 323-5229" }],
  isPrimaryMoveIn: true, notes: "", linkedContactId: "", sortOrder: 0, archived: false, createdAt: "", updatedAt: "", updatedBy: "", ...over,
});

describe("phones", () => {
  it("formats 10-digit numbers and keeps anything else as entered", () => {
    expect(formatPhone("630.851.1880")).toBe("(630) 851-1880");
    expect(formatPhone("+1 773 878 6039")).toBe("(773) 878-6039");
    expect(formatPhone("312-555-0100 x12")).toBe("(312) 555-0100 x12");
    expect(formatPhone("ext 4 at the desk")).toBe("ext 4 at the desk");
  });
  it("parses labeled phone strings from the sheet", () => {
    expect(parsePhones("D 630-960-4400; M 331-625-4760").phones).toEqual([{ label: "Direct", number: "(630) 960-4400" }, { label: "Mobile", number: "(331) 625-4760" }]);
    expect(parsePhones("t 708-686-2573; m 630-442-3404").phones.map((p) => p.label)).toEqual(["Office", "Mobile"]);
    expect(parsePhones("847-430-4121 (text)").phones).toEqual([{ label: "Text", number: "(847) 430-4121" }]);
    expect(parsePhones("(630) 994-3104; cell (708) 323-5229").phones.map((p) => p.label)).toEqual(["Office", "Mobile"]);
    expect(parsePhones("24/7 877.999.6491").phones[0].label).toBe("24/7");
    const messy = parsePhones("call the desk");
    expect(messy.phones).toEqual([]);
    expect(messy.clean).toBe(false);
  });
  it("picks the best number for a call button", () => {
    expect(bestPhone([{ label: "Office", number: "1" }, { label: "Direct", number: "2" }])?.number).toBe("2");
  });
});

describe("seed normalization", () => {
  it("turns spaced dashes into commas but keeps ranges", () => {
    expect(cleanDashes("Confirm in advance – they check. 9am–1pm")).toBe("Confirm in advance, they check. 9am–1pm");
  });
  it("treats empty and UNKNOWN cells as unknown", () => {
    expect(isUnknownCell("")).toBe(true);
    expect(isUnknownCell("UNKNOWN – ask")).toBe(true);
    expect(isUnknownCell("Unknown")).toBe(true);
    expect(isUnknownCell("Freight elevator")).toBe(false);
  });
  it("normalizes COI", () => {
    expect(normalizeCoi("NO")).toEqual({ coi: "No", details: "" });
    expect(normalizeCoi("No COI needed")).toEqual({ coi: "No", details: "" });
    expect(normalizeCoi("UNKNOWN – ask")).toEqual({ coi: "Unknown", details: "" });
    expect(normalizeCoi("YES – mover COI: General Liability")).toEqual({ coi: "Yes", details: "Mover COI: General Liability" });
    expect(normalizeCoi(cleanDashes("YES – mover COI"))).toEqual({ coi: "Yes", details: "Mover COI" });
    const confirm = normalizeCoi("No (per Data Sheet) – but a COI came up on the Hanley move; confirm per move");
    expect(confirm.coi).toBe("Confirm Per Move");
    expect(confirm.details).toContain("Hanley");
  });
  it("splits the operator out of names and maps types", () => {
    expect(splitOperator("The Breakers at Edgewater Beach (Senior Lifestyle)")).toEqual({ name: "The Breakers at Edgewater Beach", operator: "Senior Lifestyle" });
    expect(splitOperator("Plymouth Place")).toEqual({ name: "Plymouth Place", operator: "" });
    expect(normalizeType("Senior living (CCRC)")).toBe("CCRC");
    expect(normalizeType("Condo building")).toBe("Condo / Association");
    expect(normalizeType("Senior living")).toBe("Senior Living");
  });
  it("reads floor plans, roles and the first-named person", () => {
    expect(parseFloorPlans("Yes – Drive: Dartmouth, Bristol, York")).toEqual({ onFile: true, notes: "Drive: Dartmouth, Bristol, York" });
    expect(parseFloorPlans("Floor plan from Lisa on request")).toEqual({ onFile: false, notes: "Floor plan from Lisa on request" });
    expect(roleFromTitle("Move In Coordinator")).toBe("Move-In Coordinator");
    expect(roleFromTitle("Asst. Community Assoc. Manager, RealManage")).toBe("Association Manager");
    expect(roleFromTitle("General Manager, FirstService Residential")).toBe("Property Manager");
    expect(roleFromTitle("Marketing Coordinator")).toBe("Marketing");
    expect(firstNamedPerson("Jo Idstrom, Move-In Coordinator – jidstrom@x.com")).toBe("Jo Idstrom");
    expect(firstNamedPerson("UNKNOWN – ask")).toBe("");
  });
  it("moves TTT history out of Other Rules & Tips", () => {
    const out = splitOtherRules("TTT move: Knachel (Jun 2026). Formerly Brookdale. No rules found in email");
    expect(out.internal).toBe("TTT move: Knachel (Jun 2026). No rules found in email");
    expect(out.rules).toBe("Formerly Brookdale.");
  });
  it("matches shortened community names", () => {
    const list = ["1550 N Lake Shore Dr Condominium", "Fountain Square II Condominium", "Ascension Living Bethlehem Woods Village", "Brookdale Oak Park", "The Woodlands at Canterfield", "StoryPoint Naperville", "StoryPoint Bolingbrook"].map((name) => ({ name }));
    expect(matchCommunityName("1550 N Lake Shore Dr Condo", list)?.name).toBe("1550 N Lake Shore Dr Condominium");
    expect(matchCommunityName("Fountain Square II Condo", list)?.name).toBe("Fountain Square II Condominium");
    expect(matchCommunityName("Bethlehem Woods", list)?.name).toBe("Ascension Living Bethlehem Woods Village");
    expect(matchCommunityName("Brookdale OP", list)?.name).toBe("Brookdale Oak Park");
    expect(matchCommunityName("The Woodlands at Canterfield (West Dundee)", list)?.name).toBe("The Woodlands at Canterfield");
    expect(matchCommunityName("StoryPoint", list)).toBeNull(); // ambiguous
  });
});

describe("rule status and completeness", () => {
  it("empty text and an Unknown COI are unknown; N/A counts as complete", () => {
    const c = community({ rules: { ...emptyRules(), checkin: "Front desk", coi_required: "Unknown" }, ruleStatus: { elevator: "not_applicable" } });
    expect(ruleStatus(c, "checkin")).toBe("known");
    expect(ruleStatus(c, "parking")).toBe("unknown");
    expect(ruleStatus(c, "coi_required")).toBe("unknown");
    expect(ruleStatus(c, "elevator")).toBe("not_applicable");
    const score = completeness(c);
    expect(score.total).toBe(8);
    expect(score.known).toBe(2);
    expect(score.missingKeys).toContain("parking");
    expect(score.percent).toBe(25);
  });
});

describe("merge fields", () => {
  const data = buildCommunityMergeData(community(), [contact(), contact({ id: "recCONTACT00000002", name: "Fiona Krakow", isPrimaryMoveIn: false, sortOrder: 1, phones: [] })]);
  it("resolves community, rule and contact tokens", () => {
    expect(data["community.name"]).toBe("The Roosevelt at Salt Creek");
    expect(data["community.address"]).toBe("400 W Butterfield Rd, Elmhurst, IL 60126");
    expect(data["community.rules.checkin"]).toBe("Front desk");
    expect(data["community.rules.coi_required"]).toBe("No");
    expect(data["community.contacts.move_in.name"]).toBe("Dariela Garcia");
    expect(data["community.contacts.move_in.phone"]).toBe("(708) 323-5229");
    expect(data["community.contacts.primary.email"]).toBe("dg@example.com");
  });
  it("never leaks unknown rules", () => {
    expect(data["community.rules.elevator"]).toBe("");
    const unknownCoi = buildCommunityMergeData(community({ rules: { ...emptyRules(), coi_required: "Unknown" } }), []);
    expect(unknownCoi["community.rules.coi_required"]).toBe("");
    expect(Object.values(unknownCoi).join(" ")).not.toMatch(/unknown/i);
  });
  it("builds the move-day block from known rules only", () => {
    expect(data["community.move_day_instructions"]).toBe("Check-in on Arrival: Front desk\nTruck Parking / Entrance: West garage\nCOI Required: No");
  });
  it("falls back to the first contact for primary when none is marked", () => {
    const d = buildCommunityMergeData(community(), [contact({ isPrimaryMoveIn: false })]);
    expect(d["community.contacts.move_in.name"]).toBe("");
    expect(d["community.contacts.primary.name"]).toBe("Dariela Garcia");
  });
  it("every registered token resolves", () => {
    for (const t of COMMUNITY_MERGE_TOKENS) expect(data).toHaveProperty([t.token]);
  });
  it("renders templates and reports missing tokens", () => {
    const tpl = "Park: {{community.rules.parking}}. Elevator: {{ community.rules.elevator }}. {{community.nope}}";
    expect(renderTemplate(tpl, data, { onMissing: "blank" })).toEqual({ text: "Park: West garage. Elevator: . ", missing: ["community.nope"] });
    expect(renderTemplate(tpl, data, { onMissing: "flag" }).missing).toEqual(["community.rules.elevator", "community.nope"]);
  });
});

describe("list filtering, search and sorting", () => {
  const list: CommunityWithContacts[] = [
    { ...community(), contacts: [contact()] },
    { ...community({ id: "recCOMMUNITY000002", name: "Plymouth Place", type: "CCRC", city: "La Grange Park", rules: { ...emptyRules(), coi_required: "Unknown" }, ruleStatus: {}, lastVerified: "2026-01-02" }), contacts: [contact({ name: "Tula Menka", email: "tmenka@plymouthplace.org" })] },
    { ...community({ id: "recCOMMUNITY000003", name: "Éclair Towers", type: "Condo / Association", city: "Chicago", archived: true }), contacts: [] },
  ];
  it("hides archived unless asked", () => {
    expect(filterCommunities(list, EMPTY_FILTERS).map((c) => c.name)).toEqual(["The Roosevelt at Salt Creek", "Plymouth Place"]);
    expect(filterCommunities(list, { ...EMPTY_FILTERS, archived: true }).map((c) => c.name)).toEqual(["Éclair Towers"]);
  });
  it("searches names, contacts, emails and rule text, ignoring case and accents", () => {
    expect(filterCommunities(list, { ...EMPTY_FILTERS, q: "tula" }).map((c) => c.name)).toEqual(["Plymouth Place"]);
    expect(filterCommunities(list, { ...EMPTY_FILTERS, q: "plymouthplace.org" }).map((c) => c.name)).toEqual(["Plymouth Place"]);
    expect(filterCommunities(list, { ...EMPTY_FILTERS, q: "WEST gar" }).map((c) => c.name)).toEqual(["The Roosevelt at Salt Creek"]);
    expect(filterCommunities(list, { ...EMPTY_FILTERS, q: "eclair", archived: true })).toHaveLength(1);
  });
  it("filters by type, COI and completeness", () => {
    expect(filterCommunities(list, { ...EMPTY_FILTERS, type: ["CCRC"] }).map((c) => c.name)).toEqual(["Plymouth Place"]);
    expect(filterCommunities(list, { ...EMPTY_FILTERS, coi: ["Unknown"] }).map((c) => c.name)).toEqual(["Plymouth Place"]);
    expect(filterCommunities(list, { ...EMPTY_FILTERS, completeness: "complete" })).toHaveLength(0);
  });
  it("sorts with blanks last in either direction", () => {
    expect(sortCommunities(list, { key: "name", dir: "asc" }).map((c) => c.name)[0]).toBe("Éclair Towers");
    expect(sortCommunities(list, { key: "verified", dir: "desc" }).map((c) => c.name)[0]).toBe("Plymouth Place");
    expect(sortCommunities(list, { key: "verified", dir: "asc" }).map((c) => c.name)[0]).toBe("Plymouth Place");
  });
});

describe("duplicate detection", () => {
  const existing = [
    { id: "a", name: "The Roosevelt at Salt Creek", street: "400 W Butterfield Rd", archived: false },
    { id: "b", name: "1550 N Lake Shore Dr Condominium", street: "1550 N Lake Shore Dr", archived: false },
  ];
  it("catches the same name or address written differently", () => {
    expect(findLikelyDuplicates({ name: "Roosevelt at Salt Creek", street: "" }, existing).map((c) => c.id)).toEqual(["a"]);
    expect(findLikelyDuplicates({ name: "1550 N Lake Shore Drive Condo", street: "" }, existing).map((c) => c.id)).toEqual(["b"]);
    expect(findLikelyDuplicates({ name: "New Place", street: "400 West Butterfield Road" }, existing).map((c) => c.id)).toEqual(["a"]);
    expect(findLikelyDuplicates({ name: "Sunrise of Lombard", street: "" }, existing)).toEqual([]);
    expect(findLikelyDuplicates({ name: "The Roosevelt at Salt Creek", street: "" }, existing, "a")).toEqual([]);
  });
});

// ─── Primary contact enforcement (service layer, Airtable mocked) ────────────

const updates: { id: string; fields: Record<string, unknown> }[][] = [];
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }));
vi.mock("./airtable", async (orig) => {
  const real = await orig<typeof import("./airtable")>();
  return {
    ...real,
    listRecords: vi.fn(async () => [
      { id: "recCONTACT00000001", createdTime: "", fields: { Name: "A", "Community Record ID": "recCOMMUNITY000001", "Is Primary Move-In Contact": true } },
      { id: "recCONTACT00000002", createdTime: "", fields: { Name: "B", "Community Record ID": "recCOMMUNITY000001" } },
      { id: "recCONTACT00000003", createdTime: "", fields: { Name: "C", "Community Record ID": "recCOMMUNITY000001", "Is Primary Move-In Contact": true } },
    ]),
    updateRecords: vi.fn(async (_t: string, rows: { id: string; fields: Record<string, unknown> }[]) => { updates.push(rows); return []; }),
  };
});

describe("setPrimaryMoveInContact", () => {
  beforeEach(() => { updates.length = 0; });
  it("leaves exactly one primary per community", async () => {
    const { setPrimaryMoveInContact } = await import("./service");
    await setPrimaryMoveInContact("recCOMMUNITY000001", "recCONTACT00000002", "Test");
    const changes = Object.fromEntries(updates.flat().map((r) => [r.id, r.fields["Is Primary Move-In Contact"]]));
    expect(changes).toEqual({ recCONTACT00000001: false, recCONTACT00000002: true, recCONTACT00000003: false });
  });
});
