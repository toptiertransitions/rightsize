// Communities service: the one place the app reads and writes community
// data. Routes, the PDF and future email/checklist features call these.
// Server only.
import { revalidateTag, unstable_cache } from "next/cache";
import {
  COMMUNITY_TABLES as T, CONTACT_FIELD, activityToFields, belongsTo, communityToFields, contactToFields,
  createRecords, getRecord, listRecords, mapActivity, mapCommunity, mapContact, updateRecords,
} from "./airtable";
import type { CreateCommunityInput, CreateContactInput, UpdateCommunityInput, UpdateContactInput } from "./schema";
import {
  RULE_DEFINITIONS, emptyRules,
  type ActivityAction, type Community, type CommunityActivity, type CommunityContact, type CommunityWithContacts,
} from "./types";

export const COMMUNITIES_TAG = "communities";
const nowIso = () => new Date().toISOString();

function bust() {
  try { revalidateTag(COMMUNITIES_TAG); } catch { /* outside a request (scripts) */ }
}

/** Every community (archived ones included, flagged) with its active contacts. */
export const listCommunities = unstable_cache(
  async (): Promise<CommunityWithContacts[]> => {
    const [communities, contacts] = await Promise.all([
      listRecords(T.COMMUNITIES),
      listRecords(T.CONTACTS, `filterByFormula=${encodeURIComponent(`NOT({${CONTACT_FIELD.archived}})`)}`),
    ]);
    const byCommunity = new Map<string, CommunityContact[]>();
    for (const c of contacts.map(mapContact)) {
      byCommunity.set(c.communityId, [...(byCommunity.get(c.communityId) ?? []), c]);
    }
    return communities.map(mapCommunity).map((c) => ({
      ...c,
      contacts: (byCommunity.get(c.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    }));
  },
  ["communities-list"],
  { revalidate: 300, tags: [COMMUNITIES_TAG] }
);

export interface CommunityDetail {
  community: Community;
  contacts: CommunityContact[];
  activity: CommunityActivity[];
}

export async function getCommunity(id: string): Promise<CommunityDetail | null> {
  const rec = await getRecord(T.COMMUNITIES, id);
  if (!rec) return null;
  const [contacts, activity] = await Promise.all([listContacts(id), listActivity(id, 10)]);
  return { community: mapCommunity(rec), contacts, activity };
}

export async function listContacts(communityId: string, includeArchived = false): Promise<CommunityContact[]> {
  const formula = includeArchived ? belongsTo(communityId) : `AND(${belongsTo(communityId)}, NOT({${CONTACT_FIELD.archived}}))`;
  const recs = await listRecords(T.CONTACTS, `filterByFormula=${encodeURIComponent(formula)}`);
  return recs.map(mapContact).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function listActivity(communityId: string, limit = 10): Promise<CommunityActivity[]> {
  const q = `filterByFormula=${encodeURIComponent(belongsTo(communityId))}&sort[0][field]=At&sort[0][direction]=desc&maxRecords=${limit}`;
  return (await listRecords(T.ACTIVITY, q)).map(mapActivity);
}

export async function logActivity(communityId: string, action: ActivityAction, summary: string, by: string): Promise<void> {
  try {
    await createRecords(T.ACTIVITY, [activityToFields({ communityId, action, summary, by, at: nowIso() })]);
  } catch (e) {
    // History is a convenience; never fail the user's change over it
    console.error("[communities] activity log failed:", e);
  }
}

export async function createCommunity(input: CreateCommunityInput, by: string): Promise<Community> {
  const now = nowIso();
  const community: Partial<Community> = {
    operator: "", street: "", city: "", state: "IL", zip: "", website: "", linkedCompanyId: "", status: "Active",
    floorPlansOnFile: false, floorPlansNotes: "", openItems: "", sourceNotes: "", lastVerified: "", lastVerifiedBy: "", internalNotes: "",
    ...input,
    rules: { ...emptyRules(), ...(input.rules ?? {}) },
    ruleStatus: input.ruleStatus ?? {},
    archived: false,
    createdAt: now,
    updatedAt: now,
    updatedBy: by,
  };
  const [rec] = await createRecords(T.COMMUNITIES, [communityToFields(community)]);
  const created = mapCommunity(rec);
  await logActivity(created.id, "Created", `Added ${created.name}`, by);
  bust();
  return created;
}

const FIELD_LABELS: Partial<Record<keyof Community, string>> = {
  name: "Name", type: "Type", operator: "Operator", street: "Street Address", city: "City", state: "State", zip: "ZIP",
  website: "Website", linkedCompanyId: "Linked Company", status: "Status", floorPlansOnFile: "Floor Plans On File",
  floorPlansNotes: "Floor Plans Notes", openItems: "Open Items", sourceNotes: "Source Notes", lastVerified: "Last Verified",
  internalNotes: "Internal Notes",
};

/** "Changed Elevator Rules, City" from what actually differs. */
export function describeChanges(before: Community, patch: UpdateCommunityInput): string {
  const changed: string[] = [];
  for (const [key, label] of Object.entries(FIELD_LABELS) as [keyof Community, string][]) {
    const v = (patch as Partial<Community>)[key];
    if (v !== undefined && v !== before[key]) changed.push(label);
  }
  for (const r of RULE_DEFINITIONS) {
    const text = patch.rules?.[r.key];
    const status = patch.ruleStatus ? patch.ruleStatus[r.key] : undefined;
    if ((text !== undefined && text !== before.rules[r.key]) || (patch.ruleStatus && status !== before.ruleStatus[r.key])) changed.push(r.label);
  }
  if (changed.length === 0) return "Saved with no changes";
  if (patch.lastVerified && changed.length === 1 && changed[0] === "Last Verified") return `Marked verified ${patch.lastVerified}`;
  return `Changed ${changed.slice(0, 6).join(", ")}${changed.length > 6 ? ` and ${changed.length - 6} more` : ""}`;
}

export async function updateCommunity(id: string, patch: UpdateCommunityInput, by: string): Promise<Community | null> {
  const rec = await getRecord(T.COMMUNITIES, id);
  if (!rec) return null;
  const before = mapCommunity(rec);
  const merged: Partial<Community> = {
    ...patch,
    rules: patch.rules ? { ...before.rules, ...patch.rules } : undefined,
    ruleStatus: patch.ruleStatus ? { ...patch.ruleStatus } : undefined,
    updatedAt: nowIso(),
    updatedBy: by,
  };
  const [out] = await updateRecords(T.COMMUNITIES, [{ id, fields: communityToFields(merged) }]);
  const after = mapCommunity(out);
  await logActivity(id, "Updated", describeChanges(before, patch), by);
  bust();
  return after;
}

export async function setCommunityArchived(id: string, archived: boolean, by: string): Promise<Community | null> {
  const rec = await getRecord(T.COMMUNITIES, id);
  if (!rec) return null;
  const [out] = await updateRecords(T.COMMUNITIES, [{ id, fields: communityToFields({ archived, updatedAt: nowIso(), updatedBy: by }) }]);
  const c = mapCommunity(out);
  await logActivity(id, archived ? "Archived" : "Restored", `${archived ? "Archived" : "Restored"} ${c.name}`, by);
  bust();
  return c;
}
export const archiveCommunity = (id: string, by: string) => setCommunityArchived(id, true, by);
export const restoreCommunity = (id: string, by: string) => setCommunityArchived(id, false, by);

/** Only one Primary Move-In Contact per community: clears the others. */
export async function setPrimaryMoveInContact(communityId: string, contactId: string | null, by: string): Promise<void> {
  const contacts = await listContacts(communityId);
  const changes = contacts
    .filter((c) => c.isPrimaryMoveIn !== (c.id === contactId))
    .map((c) => ({ id: c.id, fields: contactToFields({ isPrimaryMoveIn: c.id === contactId, updatedAt: nowIso(), updatedBy: by }) }));
  if (changes.length) await updateRecords(T.CONTACTS, changes);
}

export async function createContact(communityId: string, input: CreateContactInput, by: string): Promise<CommunityContact> {
  const existing = await listContacts(communityId);
  const now = nowIso();
  const [rec] = await createRecords(T.CONTACTS, [contactToFields({
    title: "", role: "", email: "", phones: [], notes: "", linkedContactId: "",
    sortOrder: existing.length ? Math.max(...existing.map((c) => c.sortOrder)) + 1 : 0,
    ...input,
    isPrimaryMoveIn: input.isPrimaryMoveIn ?? existing.length === 0,
    communityId, archived: false, createdAt: now, updatedAt: now, updatedBy: by,
  })]);
  const created = mapContact(rec);
  if (created.isPrimaryMoveIn) await setPrimaryMoveInContact(communityId, created.id, by);
  await logActivity(communityId, "Contact Added", `Added contact ${created.name}`, by);
  bust();
  return created;
}

export async function updateContact(communityId: string, contactId: string, patch: UpdateContactInput, by: string): Promise<CommunityContact | null> {
  const rec = await getRecord(T.CONTACTS, contactId);
  if (!rec || mapContact(rec).communityId !== communityId) return null;
  const [out] = await updateRecords(T.CONTACTS, [{ id: contactId, fields: contactToFields({ ...patch, updatedAt: nowIso(), updatedBy: by }) }]);
  const updated = mapContact(out);
  if (patch.isPrimaryMoveIn === true) await setPrimaryMoveInContact(communityId, contactId, by);
  await logActivity(communityId, "Contact Updated", `Updated contact ${updated.name}`, by);
  bust();
  return updated;
}

/** Remove = archive; nothing is hard-deleted. */
export async function removeContact(communityId: string, contactId: string, by: string): Promise<boolean> {
  const rec = await getRecord(T.CONTACTS, contactId);
  if (!rec || mapContact(rec).communityId !== communityId) return false;
  const [out] = await updateRecords(T.CONTACTS, [{ id: contactId, fields: contactToFields({ archived: true, isPrimaryMoveIn: false, updatedAt: nowIso(), updatedBy: by }) }]);
  await logActivity(communityId, "Contact Removed", `Removed contact ${mapContact(out).name}`, by);
  bust();
  return true;
}

export async function reorderContacts(communityId: string, order: string[], by: string): Promise<CommunityContact[]> {
  const contacts = await listContacts(communityId);
  const ids = new Set(contacts.map((c) => c.id));
  const ordered = [...order.filter((id) => ids.has(id)), ...contacts.map((c) => c.id).filter((id) => !order.includes(id))];
  const changes = ordered
    .map((id, i) => ({ id, i, c: contacts.find((x) => x.id === id)! }))
    .filter(({ c, i }) => c.sortOrder !== i)
    .map(({ id, i }) => ({ id, fields: contactToFields({ sortOrder: i, updatedAt: nowIso(), updatedBy: by }) }));
  if (changes.length) await updateRecords(T.CONTACTS, changes);
  bust();
  return listContacts(communityId);
}
