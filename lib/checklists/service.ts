// Community checklists: which community a resident belongs to, which
// residents a community sees, and reading/updating their progress.
// Server-only.
//
// A resident (a project) belongs to a community when either
//  - the project is tied to the community's brand (join link, community
//    code, or assigned in Tenant Config > Projects), or
//  - the community is the project's Community partner (set from the
//    destination community; see lib/partners/destinationCommunity.ts).
//
// Due dates count from the resident's move date: the Plan's "Move Date" key
// date, or else the target move date from their quote.
import "server-only";
import { AIRTABLE_TABLES } from "@/lib/config";
import { getPlanEntriesForTenant, getTenantById, getTenants } from "@/lib/airtable";
import { getAllBrands } from "@/lib/brands/data";
import type { CommunityBrand } from "@/lib/brands/shared";
import type { Tenant } from "@/lib/types";
import { getChecklistItems, getChecklistStates } from "./data";
import { buildResidentChecklist, summarize, type ChecklistItem, type ChecklistSummary, type ResidentChecklistRow } from "./shared";

/** tenantId -> partnerId of each project's Community partner selection */
async function communitySelections(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let offset: string | undefined;
  do {
    const q = new URLSearchParams({ filterByFormula: `{Category} = "Community"` });
    q.append("fields[]", "TenantId");
    q.append("fields[]", "PartnerId");
    if (offset) q.set("offset", offset);
    const res = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLES.PARTNER_SELECTIONS)}?${q}`, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}` },
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`PartnerSelections fetch failed: ${JSON.stringify(data)}`);
    for (const r of data.records as Array<{ fields: Record<string, unknown> }>) {
      const t = String(r.fields.TenantId ?? "");
      const p = String(r.fields.PartnerId ?? "");
      if (t && p) map.set(t, p);
    }
    offset = data.offset;
  } while (offset);
  return map;
}

async function communitySelectionForTenant(tenantId: string): Promise<string | null> {
  const q = new URLSearchParams({ filterByFormula: `AND({Category} = "Community", {TenantId} = "${tenantId.replace(/"/g, "")}")`, maxRecords: "1" });
  const res = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLES.PARTNER_SELECTIONS)}?${q}`, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rec = ((await res.json()) as { records: Array<{ fields: Record<string, unknown> }> }).records[0];
  return rec ? String(rec.fields.PartnerId ?? "") || null : null;
}

/** The community a project belongs to, if any. */
export async function getResidentBrand(tenant: Pick<Tenant, "id" | "communityBrandId">): Promise<CommunityBrand | null> {
  const brands = await getAllBrands();
  if (tenant.communityBrandId) {
    const b = brands.find((x) => x.id === tenant.communityBrandId);
    if (b) return b;
  }
  const partnerId = await communitySelectionForTenant(tenant.id).catch(() => null);
  return partnerId ? brands.find((b) => b.marketplacePartnerId === partnerId) ?? null : null;
}

/** Community brands that belong to a marketplace partner company. */
export async function getBrandsForPartner(partnerId: string): Promise<CommunityBrand[]> {
  return (await getAllBrands()).filter((b) => b.marketplacePartnerId === partnerId);
}

/** The resident's move date (YYYY-MM-DD), if known. */
export async function getMoveDate(tenant: Pick<Tenant, "id" | "quoteTargetMoveDate">): Promise<string | undefined> {
  const entries = await getPlanEntriesForTenant(tenant.id).catch(() => []);
  const moves = entries.filter((e) => e.entryType === "keydate" && e.activity === "Move Date").map((e) => e.date).sort();
  return moves[moves.length - 1] || tenant.quoteTargetMoveDate || undefined;
}

export interface ResidentChecklist {
  brand: CommunityBrand;
  moveDate?: string;
  rows: ResidentChecklistRow[];
  summary: ChecklistSummary;
}

/** One resident's checklist, or null if they aren't with a community that has one. */
export async function getResidentChecklist(tenantId: string): Promise<ResidentChecklist | null> {
  const tenant = await getTenantById(tenantId).catch(() => null);
  if (!tenant) return null;
  const brand = await getResidentBrand(tenant);
  if (!brand) return null;
  const items = await getChecklistItems([brand.id]);
  if (items.length === 0) return null;
  const [states, moveDate] = await Promise.all([getChecklistStates([tenantId]), getMoveDate(tenant)]);
  const rows = buildResidentChecklist(items, states, moveDate);
  return { brand, moveDate, rows, summary: summarize(rows) };
}

export interface ResidentOverview {
  tenantId: string;
  name: string;
  brandId: string;
  moveDate?: string;
  isArchived: boolean;
  rows: ResidentChecklistRow[];
  summary: ChecklistSummary;
}

/** Every resident of these communities with their checklist progress. */
export async function getResidentsOverview(brands: CommunityBrand[], opts: { includeArchived?: boolean } = {}): Promise<{ residents: ResidentOverview[]; itemsByBrand: Record<string, ChecklistItem[]> }> {
  if (brands.length === 0) return { residents: [], itemsByBrand: {} };
  const brandIds = new Set(brands.map((b) => b.id));
  const brandByPartner = new Map(brands.map((b) => [b.marketplacePartnerId, b.id]));

  const [tenants, selections, items] = await Promise.all([
    getTenants(),
    communitySelections().catch(() => new Map<string, string>()),
    getChecklistItems([...brandIds]),
  ]);

  const mine = tenants
    .filter((t) => !t.isLostDeal && (opts.includeArchived || !t.isArchived))
    .map((t) => {
      const brandId = t.communityBrandId && brandIds.has(t.communityBrandId)
        ? t.communityBrandId
        : brandByPartner.get(selections.get(t.id) ?? "") ?? "";
      return { t, brandId };
    })
    .filter((x) => x.brandId);

  const itemsByBrand: Record<string, ChecklistItem[]> = {};
  for (const i of items) (itemsByBrand[i.brandId] ??= []).push(i);

  const [states, moveDates] = await Promise.all([
    getChecklistStates(mine.map((x) => x.t.id)),
    Promise.all(mine.map((x) => getMoveDate(x.t))),
  ]);

  const residents = mine.map(({ t, brandId }, i) => {
    const rows = buildResidentChecklist(itemsByBrand[brandId] ?? [], states.filter((s) => s.tenantId === t.id), moveDates[i]);
    return { tenantId: t.id, name: t.name, brandId, moveDate: moveDates[i], isArchived: !!t.isArchived, rows, summary: summarize(rows) };
  }).sort((a, b) => b.summary.pastDue - a.summary.pastDue || (a.moveDate ?? "9999").localeCompare(b.moveDate ?? "9999") || a.name.localeCompare(b.name));

  return { residents, itemsByBrand };
}

/** Whether this project is a resident of one of these communities. */
export async function isResidentOf(tenantId: string, brands: CommunityBrand[]): Promise<CommunityBrand | null> {
  const tenant = await getTenantById(tenantId).catch(() => null);
  if (!tenant) return null;
  const brand = await getResidentBrand(tenant);
  return brand && brands.some((b) => b.id === brand.id) ? brand : null;
}
