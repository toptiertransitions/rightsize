// Airtable access for CommunityChecklistItems and ResidentChecklistStatus.
// Server-only; rules live in ./service.ts.
import "server-only";
import { AIRTABLE_TABLES } from "@/lib/config";
import type { ChecklistActorRole, ChecklistDueType, ChecklistItem, ChecklistItemState } from "./shared";

type Rec = { id: string; fields: Record<string, unknown> };

function at(table: string, path: string, options?: RequestInit) {
  return fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${path}`, {
    ...options,
    cache: "no-store",
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

async function select(table: string, formula?: string): Promise<Rec[]> {
  const out: Rec[] = [];
  let offset: string | undefined;
  do {
    const q = new URLSearchParams();
    if (formula) q.set("filterByFormula", formula);
    if (offset) q.set("offset", offset);
    const res = await at(table, `?${q}`);
    const data = await res.json();
    if (!res.ok) throw new Error(`${table} fetch failed: ${JSON.stringify(data)}`);
    out.push(...data.records);
    offset = data.offset;
  } while (offset);
  return out;
}

const str = (v: unknown) => (v != null ? String(v) : "");
const esc = (s: string) => s.replace(/"/g, '\\"');
const anyOf = (field: string, ids: string[]) => ids.length === 1 ? `{${field}} = "${esc(ids[0])}"` : `OR(${ids.map((id) => `{${field}} = "${esc(id)}"`).join(",")})`;

const DUE_TO_DB: Record<ChecklistDueType, string> = { none: "None", before: "Before move", after: "After move", date: "Date" };
const DUE_FROM_DB: Record<string, ChecklistDueType> = { "None": "none", "Before move": "before", "After move": "after", "Date": "date" };

function mapItem(r: Rec): ChecklistItem & { archived: boolean } {
  const f = r.fields;
  return {
    id: r.id,
    brandId: str(f.BrandId),
    title: str(f.Title),
    details: str(f.Details),
    dueType: DUE_FROM_DB[str(f.DueType)] ?? "none",
    dueDays: typeof f.DueDays === "number" ? f.DueDays : undefined,
    dueDate: str(f.DueDate) || undefined,
    sortOrder: typeof f.SortOrder === "number" ? f.SortOrder : 0,
    archived: f.Archived === true,
  };
}

function mapState(r: Rec): ChecklistItemState {
  const f = r.fields;
  return {
    itemId: str(f.ItemId),
    tenantId: str(f.TenantId),
    done: f.Done === true,
    doneAt: str(f.DoneAt) || undefined,
    doneByName: str(f.DoneByName) || undefined,
    doneByRole: (str(f.DoneByRole) || undefined) as ChecklistActorRole | undefined,
  };
}

/** Live (not archived) items for these brands, in order. */
export async function getChecklistItems(brandIds: string[]): Promise<ChecklistItem[]> {
  if (brandIds.length === 0) return [];
  const rows = await select(AIRTABLE_TABLES.COMMUNITY_CHECKLIST_ITEMS, `AND(NOT({Archived}), ${anyOf("BrandId", brandIds)})`);
  return rows.map(mapItem).filter((i) => !i.archived).map(({ archived: _a, ...i }) => i).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getChecklistItemById(id: string): Promise<(ChecklistItem & { archived: boolean }) | null> {
  const res = await at(AIRTABLE_TABLES.COMMUNITY_CHECKLIST_ITEMS, `/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return mapItem(await res.json());
}

export interface ItemWrite {
  title: string;
  details: string;
  dueType: ChecklistDueType;
  dueDays?: number;
  dueDate?: string;
}

function itemFields(data: ItemWrite, actorName: string) {
  return {
    Title: data.title,
    Details: data.details,
    DueType: DUE_TO_DB[data.dueType],
    DueDays: data.dueType === "before" || data.dueType === "after" ? Math.max(0, Math.round(data.dueDays ?? 0)) : null,
    DueDate: data.dueType === "date" ? data.dueDate ?? "" : "",
    UpdatedAt: new Date().toISOString(),
    UpdatedByName: actorName,
  };
}

export async function createChecklistItem(brandId: string, data: ItemWrite, sortOrder: number, actorName: string): Promise<ChecklistItem> {
  const now = new Date().toISOString();
  const res = await at(AIRTABLE_TABLES.COMMUNITY_CHECKLIST_ITEMS, "", {
    method: "POST",
    body: JSON.stringify({ fields: { BrandId: brandId, SortOrder: sortOrder, CreatedAt: now, ...itemFields(data, actorName) }, typecast: true }),
  });
  if (!res.ok) throw new Error(`Checklist item create failed: ${await res.text()}`);
  return mapItem(await res.json());
}

export async function updateChecklistItem(id: string, data: ItemWrite, actorName: string): Promise<void> {
  const res = await at(AIRTABLE_TABLES.COMMUNITY_CHECKLIST_ITEMS, `/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: itemFields(data, actorName), typecast: true }),
  });
  if (!res.ok) throw new Error(`Checklist item update failed: ${await res.text()}`);
}

/** Archived, not deleted, so residents' history isn't lost. */
export async function archiveChecklistItem(id: string, actorName: string): Promise<void> {
  const res = await at(AIRTABLE_TABLES.COMMUNITY_CHECKLIST_ITEMS, `/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { Archived: true, UpdatedAt: new Date().toISOString(), UpdatedByName: actorName } }),
  });
  if (!res.ok) throw new Error(`Checklist item archive failed: ${await res.text()}`);
}

export async function setChecklistOrder(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i += 10) {
    const records = orderedIds.slice(i, i + 10).map((id, j) => ({ id, fields: { SortOrder: (i + j + 1) * 10 } }));
    const res = await at(AIRTABLE_TABLES.COMMUNITY_CHECKLIST_ITEMS, "", { method: "PATCH", body: JSON.stringify({ records }) });
    if (!res.ok) throw new Error(`Checklist reorder failed: ${await res.text()}`);
  }
}

export async function getChecklistStates(tenantIds: string[]): Promise<ChecklistItemState[]> {
  if (tenantIds.length === 0) return [];
  const out: ChecklistItemState[] = [];
  // Keep formulas a sensible length
  for (let i = 0; i < tenantIds.length; i += 40) {
    const rows = await select(AIRTABLE_TABLES.RESIDENT_CHECKLIST_STATUS, anyOf("TenantId", tenantIds.slice(i, i + 40)));
    out.push(...rows.map(mapState));
  }
  return out;
}

export async function upsertChecklistState(input: {
  tenantId: string;
  itemId: string;
  brandId: string;
  done: boolean;
  actorName: string;
  actorRole: ChecklistActorRole;
}): Promise<ChecklistItemState> {
  const key = `${input.tenantId}:${input.itemId}`;
  const existing = (await select(AIRTABLE_TABLES.RESIDENT_CHECKLIST_STATUS, `{Key} = "${esc(key)}"`))[0];
  const now = new Date().toISOString();
  const fields = {
    Key: key,
    TenantId: input.tenantId,
    ItemId: input.itemId,
    BrandId: input.brandId,
    Done: input.done,
    DoneAt: input.done ? now : "",
    DoneByName: input.done ? input.actorName : "",
    DoneByRole: input.done ? input.actorRole : null,
    UpdatedAt: now,
  };
  const res = existing
    ? await at(AIRTABLE_TABLES.RESIDENT_CHECKLIST_STATUS, `/${existing.id}`, { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) })
    : await at(AIRTABLE_TABLES.RESIDENT_CHECKLIST_STATUS, "", { method: "POST", body: JSON.stringify({ fields, typecast: true }) });
  if (!res.ok) throw new Error(`Checklist status save failed: ${await res.text()}`);
  return mapState(await res.json());
}
