// Loads everything the Plan page "Email Me" emails need for one project.
// buildPlanEmailContext is pure (raw records in, context out) so templates
// and tests never touch Airtable; loadPlanEmailContext does the fetching.
import {
  getTenantById,
  getPlanEntriesForTenant,
  getVendorsForTenant,
  getOpportunitiesForTenant,
  getStaffMembers,
  getItemsForTenant,
  getRoomsForTenant,
  getInvoiceSettings,
} from "@/lib/airtable";
import { ctToday } from "@/lib/date-ct";
import type { ClientOpportunity, InvoiceSettings, Item, PlanEntry, Room, StaffMember, Tenant, Vendor } from "@/lib/types";
import type { Sender } from "./render";

export interface Person {
  name: string;
  phone?: string;
  email?: string;
  relationship?: string;
}

export interface Shift {
  date: string;
  activity: string;
  start?: string; // "9:00 AM"
  end?: string;
  team: string[];
}

export interface InventoryRow {
  id: string;
  name: string;
  qty: number;
  room?: string;
  dims?: string;
  photo?: string;
}

export interface PlanEmailContext {
  today: string;
  clientName: string;
  clientFirstNames?: string;
  origin: { address?: string; typeLabel?: string; accessNotes?: string };
  dest: { address?: string; communityName?: string; typeLabel?: string };
  moveDate?: string;
  packing?: Shift;
  moveDayShifts: Shift[];
  moveDayEnd?: string;
  movers?: Person & { company: string };
  community?: Person & { company: string };
  teamLead?: Person;
  clientContacts: Person[];
  donation?: { names: string; date?: string };
  junk?: { names: string };
  /** Other project vendors scheduled after move day (e.g. a cleaner or estate sale). */
  afterMove: { name: string; date: string }[];
  unsoldPreference?: "Donate" | "Return";
  specialItems?: string;
  disposalNotes?: string;
  estimateTo: Person;
  sender: Sender;
  logoUrl?: string;
  inventory: InventoryRow[];
  /** Raw To Be Moved items, for the Mover PDF attachment. */
  toBeMovedItems: Item[];
  tenant: Tenant;
  settings: InvoiceSettings | null;
}

const DEST_TYPE_LABEL: Record<string, string> = {
  house: "Home",
  condo: "Condo",
  senior_community: "Senior Living",
  other: "Other",
};

const ROLE_TITLE: Record<string, string> = {
  TTTManager: "Project Coordinator",
  TTTTeamLead: "Team Lead",
  TTTStaff: "Specialist",
  TTTSales: "Sales",
};

export function fmtTime(t?: string): string | undefined {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return undefined;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function fmtDay(d?: string): string | undefined {
  return d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : undefined;
}

export function fmtDate(d?: string): string | undefined {
  return d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : undefined;
}

function joinAddr(...p: Array<string | undefined>): string | undefined {
  return p.filter((x) => x && x.trim()).join(", ") || undefined;
}

function firstVendorDate(v: Vendor): string | undefined {
  return [v.date1, v.date2, v.date3].find((d) => d && /^\d{4}-\d{2}-\d{2}/.test(d))?.slice(0, 10);
}

const MOVE_DAY_ACTIVITIES = new Set(["Managing Moving Day", "Unpacking", "Setting Up Your Space"]);

export function buildPlanEmailContext(input: {
  tenant: Tenant;
  entries: PlanEntry[];
  vendors: Vendor[];
  opportunities: ClientOpportunity[];
  staff: StaffMember[];
  items: Item[];
  rooms: Room[];
  settings: InvoiceSettings | null;
  sender: Sender;
  today?: string;
}): PlanEmailContext {
  const { tenant, entries, vendors, opportunities, staff, items, rooms, settings, sender } = input;
  const today = input.today ?? ctToday();

  const staffByEmail = new Map(staff.filter((s) => s.email).map((s) => [s.email.toLowerCase(), s]));
  const teamFor = (e: PlanEntry) =>
    (e.helpers ?? [])
      .filter((h) => h.status !== "declined")
      .map((h) => staffByEmail.get(h.email.toLowerCase())?.displayName || h.email.split("@")[0]);
  const toShift = (e: PlanEntry): Shift => ({ date: e.date, activity: e.activity, start: fmtTime(e.startTime), end: fmtTime(e.endTime), team: teamFor(e) });

  // Move date: next upcoming "Move Date" key date, else the latest one, else the quote's target date
  const moveKeys = entries.filter((e) => e.entryType === "keydate" && e.activity === "Move Date").map((e) => e.date).sort();
  const moveDate = moveKeys.find((d) => d >= today) ?? moveKeys[moveKeys.length - 1] ?? tenant.quoteTargetMoveDate ?? undefined;

  const focus = entries.filter((e) => e.entryType !== "keydate");
  const packingEntry = focus
    .filter((e) => e.activity === "Packing to Move" && (!moveDate || e.date < moveDate))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const moveDayShifts = moveDate
    ? focus.filter((e) => e.date === moveDate && MOVE_DAY_ACTIVITIES.has(e.activity)).sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")).map(toShift)
    : [];
  const moveDayEndRaw = moveDate
    ? focus.filter((e) => e.date === moveDate && e.endTime).map((e) => e.endTime!).sort().pop()
    : undefined;

  const lead = tenant.teamLeadClerkId ? staff.find((s) => s.clerkUserId === tenant.teamLeadClerkId) : undefined;
  const opp = opportunities.find((o) => o.stage !== "Won" && o.stage !== "Lost") ?? opportunities.find((o) => o.stage === "Won") ?? opportunities[0];

  const clientContacts: Person[] = (opp?.keyPeople ?? [])
    .slice()
    .sort((a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary))
    .map((k) => ({ name: k.name, relationship: k.relationship || undefined, phone: k.phone || undefined, email: k.email || undefined }));
  if (clientContacts.length === 0 && (tenant.clientEmail || tenant.clientPhone)) {
    clientContacts.push({ name: tenant.name, phone: tenant.clientPhone, email: tenant.clientEmail });
  }
  const primary = clientContacts[0];

  const mover = vendors.find((v) => v.vendorType === "Mover");
  const communityVendor = vendors.find((v) => v.vendorType === "Future Home/Community");
  const donationVendors = vendors.filter((v) => v.vendorType === "Donation Org");
  const junkVendors = vendors.filter((v) => v.vendorType === "Junk Hauler");

  const jordan = staff.find((s) => s.displayName?.trim().toLowerCase() === "jordan emmons");

  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const toBeMovedItems = items.filter((i) => i.primaryRoute === "To Be Moved");
  const inventory: InventoryRow[] = toBeMovedItems
    .map((i) => {
      const dims = ([[i.widthInches, "W"], [i.depthInches, "D"], [i.heightInches, "H"]] as const)
        .filter(([n]) => n)
        .map(([n, l]) => `${n}" ${l}`)
        .join(" x ");
      return {
        id: i.id,
        name: i.itemName || "Item",
        qty: i.quantity && i.quantity > 0 ? i.quantity : 1,
        room: i.roomId ? roomName.get(i.roomId) : undefined,
        dims: dims || undefined,
        photo: i.photos?.[0]?.url || i.photoUrl || undefined,
      };
    })
    .sort((a, b) => (a.room ?? "~").localeCompare(b.room ?? "~") || a.name.localeCompare(b.name));

  return {
    today,
    clientName: tenant.name,
    clientFirstNames: primary?.name ? primary.name.split(/\s+/)[0] : undefined,
    origin: {
      address: joinAddr(tenant.address, tenant.addressUnitNumber ? `Unit ${tenant.addressUnitNumber}` : undefined, tenant.city, tenant.state, tenant.zip),
      accessNotes: opp?.originParkingNotes || undefined,
    },
    dest: {
      address: joinAddr(tenant.destAddress, tenant.destAddressUnitNumber ? `Unit ${tenant.destAddressUnitNumber}` : undefined, tenant.destCity, tenant.destState, tenant.destZip),
      communityName: tenant.seniorCommunityName || undefined,
      typeLabel: tenant.destinationType ? DEST_TYPE_LABEL[tenant.destinationType] : tenant.seniorCommunityName ? "Senior Living" : undefined,
    },
    moveDate,
    packing: packingEntry ? toShift(packingEntry) : undefined,
    moveDayShifts,
    moveDayEnd: fmtTime(moveDayEndRaw),
    movers: mover ? { company: mover.vendorName, name: mover.pocName, phone: mover.phone || undefined, email: mover.email || undefined } : undefined,
    community: communityVendor ? { company: communityVendor.vendorName, name: communityVendor.pocName, phone: communityVendor.phone || undefined, email: communityVendor.email || undefined } : undefined,
    teamLead: lead ? { name: lead.displayName, phone: lead.phone, email: lead.email } : undefined,
    clientContacts,
    donation: donationVendors.length ? { names: donationVendors.map((v) => v.vendorName).join(" and "), date: donationVendors.map(firstVendorDate).find(Boolean) } : undefined,
    afterMove: moveDate
      ? vendors
          .filter((v) => !["Mover", "Future Home/Community", "Move Manager"].includes(v.vendorType))
          .map((v) => ({ name: v.vendorName, date: firstVendorDate(v) ?? "" }))
          .filter((v) => v.date > moveDate)
      : [],
    junk: junkVendors.length ? { names: junkVendors.map((v) => v.vendorName).join(" and ") } : undefined,
    unsoldPreference: tenant.unsoldStandardPreference,
    specialItems: tenant.quoteSpecialItems || undefined,
    disposalNotes: tenant.quoteDisposalNotes || undefined,
    estimateTo: jordan ? { name: jordan.displayName, email: jordan.email, phone: jordan.phone } : { name: "Jordan Emmons", email: "jordan@toptiertransitions.com" },
    sender,
    logoUrl: settings?.logoUrl || undefined,
    inventory,
    toBeMovedItems,
    tenant,
    settings,
  };
}

export async function loadPlanEmailContext(tenantId: string, sender: Omit<Sender, "title" | "phone"> & { clerkUserId: string }): Promise<PlanEmailContext | null> {
  const tenant = await getTenantById(tenantId).catch(() => null);
  if (!tenant) return null;
  const [entries, vendors, opportunities, staff, items, rooms, settings] = await Promise.all([
    getPlanEntriesForTenant(tenantId).catch(() => []),
    getVendorsForTenant(tenantId).catch(() => []),
    getOpportunitiesForTenant(tenantId).catch(() => []),
    getStaffMembers().catch(() => []),
    getItemsForTenant(tenantId).catch(() => []),
    getRoomsForTenant(tenantId).catch(() => []),
    getInvoiceSettings().catch(() => null),
  ]);
  const me = staff.find((s) => s.clerkUserId === sender.clerkUserId);
  return buildPlanEmailContext({
    tenant, entries, vendors, opportunities, staff, items, rooms, settings,
    sender: {
      name: me?.displayName || sender.name,
      email: sender.email,
      phone: me?.phone || undefined,
      title: me?.role ? ROLE_TITLE[me.role] : undefined,
    },
  });
}
