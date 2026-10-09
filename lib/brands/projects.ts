// Data for Tenant Config > Projects: every active project (not archived, not
// a lost deal) with its brand, referring partner, linked users, and last
// activity. Server-only; admin pages only.
import "server-only";
import { AIRTABLE_TABLES } from "@/lib/config";
import { getTenants, getAllMemberships } from "@/lib/airtable";
import { getAllPartners } from "@/lib/marketplace/data";

export interface BrandProjectRow {
  id: string;
  name: string;
  location: string;
  kind: "TTT" | "Self-serve";
  signed: boolean;
  referringPartner: string;
  brandId: string;
  linkedUsers: number;
  /** Primary client (project owner) Clerk id, for "View as this client" */
  ownerClerkId: string;
  lastActivity: string;
  createdAt: string;
}

type Rec = { id: string; fields: Record<string, unknown> };

async function fetchAll(table: string, fields: string[], formula?: string): Promise<Rec[]> {
  const out: Rec[] = [];
  let offset: string | undefined;
  do {
    const q = new URLSearchParams();
    fields.forEach((f) => q.append("fields[]", f));
    if (formula) q.set("filterByFormula", formula);
    if (offset) q.set("offset", offset);
    const res = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${q}`, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${table} fetch failed (${res.status})`);
    const data = (await res.json()) as { records: Rec[]; offset?: string };
    out.push(...data.records);
    offset = data.offset;
  } while (offset);
  return out;
}

export async function getBrandProjectRows(): Promise<BrandProjectRow[]> {
  const [tenants, memberships, partners, selections, users] = await Promise.all([
    getTenants(),
    getAllMemberships().catch(() => []),
    getAllPartners().catch(() => []),
    fetchAll(AIRTABLE_TABLES.PARTNER_SELECTIONS, ["TenantId", "PartnerId", "ReferralName"], "{ReferralLocked}").catch(() => []),
    fetchAll(AIRTABLE_TABLES.USERS, ["ClerkUserId", "LastActivityAt"]).catch(() => []),
  ]);

  const partnerName = new Map(partners.map((p) => [p.id, p.companyName]));
  const referrer = new Map<string, string>();
  for (const s of selections) {
    const tid = String(s.fields.TenantId ?? "");
    if (!tid || referrer.has(tid)) continue;
    const name = partnerName.get(String(s.fields.PartnerId ?? "")) || String(s.fields.ReferralName ?? "");
    if (name) referrer.set(tid, name);
  }
  const lastSeen = new Map(users.map((u) => [String(u.fields.ClerkUserId ?? ""), String(u.fields.LastActivityAt ?? "")]));
  const members = new Map<string, string[]>();
  for (const m of memberships) members.set(m.tenantId, [...(members.get(m.tenantId) ?? []), m.userId]);

  return tenants
    .filter((t) => !t.isArchived && !t.isLostDeal)
    .map((t) => {
      const ids = members.get(t.id) ?? [];
      const last = ids.map((id) => lastSeen.get(id) ?? "").filter(Boolean).sort().pop() ?? "";
      return {
        id: t.id,
        name: t.name,
        location: [t.city, t.state].filter(Boolean).join(", ") || (t.currentZip ? `Zip ${t.currentZip}` : ""),
        kind: t.isTTT === false ? "Self-serve" : "TTT",
        signed: t.isContractSigned === true,
        referringPartner: referrer.get(t.id) ?? "",
        brandId: t.communityBrandId ?? "",
        linkedUsers: ids.length,
        ownerClerkId: t.ownerUserId,
        lastActivity: last,
        createdAt: t.createdAt,
      } satisfies BrandProjectRow;
    });
}
