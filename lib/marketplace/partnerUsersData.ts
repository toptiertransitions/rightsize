// Data access for the PartnerUsers table (people who can sign in to a
// marketplace partner company). Same conventions as ./data.ts; nothing else
// should fetch this table directly. Business rules live in ./team.ts.
import { AIRTABLE_TABLES } from "../config";
import type { PartnerUser, PartnerUserRole, PartnerUserStatus, PartnerUserView } from "./types";

type AirtableRec = { id: string; fields: Record<string, unknown> };
const TABLE = AIRTABLE_TABLES.MARKETPLACE_PARTNER_USERS;

function usersFetch(path: string, options?: RequestInit) {
  return fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

const str = (v: unknown) => (v != null ? String(v) : "");
const opt = (v: unknown) => (v != null && String(v) !== "" ? String(v) : undefined);
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

function mapUser(rec: AirtableRec): PartnerUser {
  const f = rec.fields;
  return {
    id: rec.id,
    partnerId: str(f.PartnerId),
    email: str(f.Email).toLowerCase(),
    clerkUserId: opt(f.ClerkUserId),
    name: str(f.Name),
    title: opt(f.Title),
    phone: opt(f.Phone),
    role: (str(f.Role) || "Member") as PartnerUserRole,
    status: (str(f.Status) || "Invited") as PartnerUserStatus,
    inviteToken: opt(f.InviteToken),
    inviteExpiresAt: opt(f.InviteExpiresAt),
    invitedAt: opt(f.InvitedAt),
    invitedByName: opt(f.InvitedByName),
    invitedByClerkId: opt(f.InvitedByClerkId),
    lastInviteSentAt: opt(f.LastInviteSentAt),
    acceptedAt: opt(f.AcceptedAt),
    removedAt: opt(f.RemovedAt),
    removedByName: opt(f.RemovedByName),
    lastActiveAt: opt(f.LastActiveAt),
    notifyLeads: f.NotifyLeads === true,
    source: opt(f.Source),
    createdAt: str(f.CreatedAt),
  };
}

export function toPartnerUserView(u: PartnerUser): PartnerUserView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { inviteToken, ...rest } = u;
  return { ...rest, inviteExpired: u.status === "Invited" && !!u.inviteExpiresAt && new Date(u.inviteExpiresAt).getTime() < Date.now() };
}

async function select(formula?: string): Promise<PartnerUser[]> {
  const out: PartnerUser[] = [];
  let offset: string | undefined;
  do {
    const qs = new URLSearchParams();
    if (formula) qs.set("filterByFormula", formula);
    if (offset) qs.set("offset", offset);
    const res = await usersFetch(`?${qs.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(`PartnerUsers fetch failed: ${JSON.stringify(data)}`);
    out.push(...(data.records as AirtableRec[]).map(mapUser));
    offset = data.offset;
  } while (offset);
  return out;
}

export function getAllPartnerUsers(): Promise<PartnerUser[]> {
  return select();
}

export function getPartnerUsersForPartner(partnerId: string): Promise<PartnerUser[]> {
  return select(`{PartnerId} = "${esc(partnerId)}"`);
}

export function getPartnerUsersByClerkId(clerkUserId: string): Promise<PartnerUser[]> {
  return select(`{ClerkUserId} = "${esc(clerkUserId)}"`);
}

export function getPartnerUsersByEmail(email: string): Promise<PartnerUser[]> {
  return select(`LOWER({Email}) = "${esc(email.trim().toLowerCase())}"`);
}

export async function getPartnerUserByToken(token: string): Promise<PartnerUser | null> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const rows = await select(`{InviteToken} = "${esc(token)}"`);
  return rows[0] ?? null;
}

export async function getPartnerUserById(id: string): Promise<PartnerUser | null> {
  const res = await usersFetch(`/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PartnerUsers fetch failed: ${await res.text()}`);
  return mapUser(await res.json());
}

type Writable = Partial<Omit<PartnerUser, "id" | "createdAt">>;

const FIELD: Record<keyof Writable, string> = {
  partnerId: "PartnerId", email: "Email", clerkUserId: "ClerkUserId", name: "Name", title: "Title", phone: "Phone",
  role: "Role", status: "Status", inviteToken: "InviteToken", inviteExpiresAt: "InviteExpiresAt", invitedAt: "InvitedAt",
  invitedByName: "InvitedByName", invitedByClerkId: "InvitedByClerkId", lastInviteSentAt: "LastInviteSentAt",
  acceptedAt: "AcceptedAt", removedAt: "RemovedAt", removedByName: "RemovedByName", lastActiveAt: "LastActiveAt",
  notifyLeads: "NotifyLeads", source: "Source",
};

function toFields(data: Writable): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const name = FIELD[k as keyof Writable];
    if (!name) continue;
    // null clears a field
    fields[name] = v === null ? null : k === "email" ? String(v).trim().toLowerCase() : v;
  }
  return fields;
}

export async function createPartnerUser(data: Writable & { partnerId: string; email: string }): Promise<PartnerUser> {
  const res = await usersFetch("", {
    method: "POST",
    body: JSON.stringify({ fields: { ...toFields(data), CreatedAt: new Date().toISOString() }, typecast: true }),
  });
  if (!res.ok) throw new Error(`PartnerUsers create failed: ${await res.text()}`);
  return mapUser(await res.json());
}

export async function updatePartnerUser(id: string, data: { [K in keyof Writable]?: Writable[K] | null }): Promise<PartnerUser> {
  const res = await usersFetch(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: toFields(data as Writable), typecast: true }),
  });
  if (!res.ok) throw new Error(`PartnerUsers update failed: ${await res.text()}`);
  return mapUser(await res.json());
}
