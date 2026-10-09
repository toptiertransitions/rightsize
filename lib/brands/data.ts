// Server-only Airtable access for Community Brands (white-label "tenant"
// branding). Brand configs are cached with tag "community-brands" so page
// loads don't hit Airtable each time; every admin write revalidates the tag.
import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { AIRTABLE_TABLES } from "@/lib/config";
import { getReferralContacts, getReferralContactById } from "@/lib/airtable";
import { getPartnerById } from "@/lib/marketplace/data";
import type { BrandContactRef, BrandContactView, BrandStatus, CommunityBrand, TopTierVisibility } from "./shared";
import { MAX_BRAND_CONTACTS, normalizeCode } from "./shared";

export const BRANDS_CACHE_TAG = "community-brands";

type Rec = { id: string; fields: Record<string, unknown> };

function at(table: string, path: string, options?: RequestInit) {
  return fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${path}`, {
    ...options,
    cache: "no-store",
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

const str = (v: unknown) => (v != null ? String(v) : "");

function parseContacts(raw: string): BrandContactRef[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c) => c && typeof c.contactId === "string")
      .map((c, i) => ({
        contactId: c.contactId,
        order: typeof c.order === "number" ? c.order : i,
        visible: c.visible !== false,
        titleOverride: typeof c.titleOverride === "string" && c.titleOverride ? c.titleOverride : undefined,
        photoUrl: typeof c.photoUrl === "string" && c.photoUrl ? c.photoUrl : undefined,
      }))
      .sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

function mapBrand(r: Rec): CommunityBrand {
  const f = r.fields;
  return {
    id: r.id,
    slug: str(f["Slug"]),
    communityCode: str(f["CommunityCode"]),
    displayName: str(f["DisplayName"]),
    subtitle: str(f["Subtitle"]),
    marketplacePartnerId: str(f["MarketplacePartnerId"]),
    logoUrl: str(f["LogoUrl"]),
    primaryColor: str(f["PrimaryColor"]) || "#2E6B4F",
    secondaryColor: str(f["SecondaryColor"]) || "#2E6B4F",
    status: (str(f["Status"]) || "Draft") as BrandStatus,
    welcomeMessage: str(f["WelcomeMessage"]),
    welcomeSenderName: str(f["WelcomeSenderName"]),
    welcomeSenderTitle: str(f["WelcomeSenderTitle"]),
    topTierVisibility: (str(f["TopTierVisibility"]) || "Partner visible") as TopTierVisibility,
    contacts: parseContacts(str(f["ContactsJson"])),
    slugLockedAt: str(f["SlugLockedAt"]) || undefined,
    createdAt: str(f["CreatedAt"]) || undefined,
    updatedAt: str(f["UpdatedAt"]) || undefined,
    updatedBy: str(f["UpdatedBy"]) || undefined,
  };
}

async function fetchAllBrands(): Promise<CommunityBrand[]> {
  const all: Rec[] = [];
  let offset: string | undefined;
  do {
    const res = await at(AIRTABLE_TABLES.COMMUNITY_BRANDS, offset ? `?offset=${offset}` : "");
    const data = await res.json();
    if (!res.ok) throw new Error(`CommunityBrands fetch failed: ${JSON.stringify(data)}`);
    all.push(...data.records);
    offset = data.offset;
  } while (offset);
  return all.map(mapBrand);
}

/** All brands (Draft and Active), cached for a minute and on admin save. */
export const getAllBrands = unstable_cache(fetchAllBrands, ["community-brands-all"], { revalidate: 60, tags: [BRANDS_CACHE_TAG] });

export async function getBrandById(id: string): Promise<CommunityBrand | null> {
  return (await getAllBrands()).find((b) => b.id === id) ?? null;
}

export async function getBrandBySlug(slug: string): Promise<CommunityBrand | null> {
  const s = slug.trim().toLowerCase();
  return (await getAllBrands()).find((b) => b.slug === s) ?? null;
}

export async function getBrandByCode(code: string): Promise<CommunityBrand | null> {
  const c = normalizeCode(code);
  return (await getAllBrands()).find((b) => normalizeCode(b.communityCode) === c) ?? null;
}

// ─── Writes (admin only; callers check roles) ────────────────────────────────

type BrandWrite = Partial<Omit<CommunityBrand, "id" | "createdAt">>;

function toFields(d: BrandWrite): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (d.slug !== undefined) f["Slug"] = d.slug;
  if (d.communityCode !== undefined) f["CommunityCode"] = d.communityCode;
  if (d.displayName !== undefined) f["DisplayName"] = d.displayName;
  if (d.subtitle !== undefined) f["Subtitle"] = d.subtitle;
  if (d.marketplacePartnerId !== undefined) f["MarketplacePartnerId"] = d.marketplacePartnerId;
  if (d.logoUrl !== undefined) f["LogoUrl"] = d.logoUrl || null;
  if (d.primaryColor !== undefined) f["PrimaryColor"] = d.primaryColor;
  if (d.secondaryColor !== undefined) f["SecondaryColor"] = d.secondaryColor;
  if (d.status !== undefined) f["Status"] = d.status;
  if (d.welcomeMessage !== undefined) f["WelcomeMessage"] = d.welcomeMessage;
  if (d.welcomeSenderName !== undefined) f["WelcomeSenderName"] = d.welcomeSenderName;
  if (d.welcomeSenderTitle !== undefined) f["WelcomeSenderTitle"] = d.welcomeSenderTitle;
  if (d.topTierVisibility !== undefined) f["TopTierVisibility"] = d.topTierVisibility;
  if (d.contacts !== undefined) f["ContactsJson"] = JSON.stringify(d.contacts.slice(0, MAX_BRAND_CONTACTS));
  if (d.slugLockedAt !== undefined) f["SlugLockedAt"] = d.slugLockedAt;
  if (d.updatedBy !== undefined) f["UpdatedBy"] = d.updatedBy;
  return f;
}

export async function createBrand(d: BrandWrite): Promise<CommunityBrand> {
  const now = new Date().toISOString();
  const res = await at(AIRTABLE_TABLES.COMMUNITY_BRANDS, "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: { ...toFields(d), CreatedAt: now, UpdatedAt: now } }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`createBrand failed: ${JSON.stringify(data)}`);
  revalidateTag(BRANDS_CACHE_TAG);
  return mapBrand(data.records[0]);
}

export async function updateBrand(id: string, d: BrandWrite): Promise<CommunityBrand> {
  const res = await at(AIRTABLE_TABLES.COMMUNITY_BRANDS, "", {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields: { ...toFields(d), UpdatedAt: new Date().toISOString() } }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`updateBrand failed: ${JSON.stringify(data)}`);
  revalidateTag(BRANDS_CACHE_TAG);
  return mapBrand(data.records[0]);
}

export interface AuditEntry {
  actorClerkId: string;
  actorName: string;
  entityType: "brand" | "project";
  entityId: string;
  field: string;
  oldValue: string;
  newValue: string;
}

/** Best effort: an audit write failure never blocks the change itself. */
export async function writeAudit(entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  for (let i = 0; i < entries.length; i += 10) {
    const records = entries.slice(i, i + 10).map((e) => ({
      fields: {
        Timestamp: now,
        ActorClerkId: e.actorClerkId,
        ActorName: e.actorName,
        EntityType: e.entityType,
        EntityId: e.entityId,
        Field: e.field,
        OldValue: e.oldValue.slice(0, 5000),
        NewValue: e.newValue.slice(0, 5000),
      },
    }));
    await at(AIRTABLE_TABLES.COMMUNITY_BRAND_AUDIT, "", { method: "POST", body: JSON.stringify({ records }) })
      .catch((e) => console.error("[brands] audit write failed:", e));
  }
}

export async function getAuditForEntity(entityId: string, limit = 25): Promise<Array<AuditEntry & { timestamp: string }>> {
  const formula = encodeURIComponent(`{EntityId} = "${entityId}"`);
  const res = await at(AIRTABLE_TABLES.COMMUNITY_BRAND_AUDIT, `?filterByFormula=${formula}&sort[0][field]=Timestamp&sort[0][direction]=desc&maxRecords=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records as Rec[]).map((r) => ({
    timestamp: str(r.fields["Timestamp"]),
    actorClerkId: str(r.fields["ActorClerkId"]),
    actorName: str(r.fields["ActorName"]),
    entityType: str(r.fields["EntityType"]) as "brand" | "project",
    entityId: str(r.fields["EntityId"]),
    field: str(r.fields["Field"]),
    oldValue: str(r.fields["OldValue"]),
    newValue: str(r.fields["NewValue"]),
  }));
}

// ─── Contacts ────────────────────────────────────────────────────────────────

/** The CRM company behind a brand's marketplace partner (where its contacts live). */
export async function getBrandCrmCompanyId(brand: Pick<CommunityBrand, "marketplacePartnerId">): Promise<string | null> {
  if (!brand.marketplacePartnerId) return null;
  const partner = await getPartnerById(brand.marketplacePartnerId).catch(() => null);
  return partner?.crmReferralCompanyId ?? null;
}

/** Every CRM contact the admin can pick from for this brand. */
export async function getPickableContacts(brand: Pick<CommunityBrand, "marketplacePartnerId">) {
  const companyId = await getBrandCrmCompanyId(brand);
  if (!companyId) return { companyId: null, contacts: [] };
  const contacts = await getReferralContacts(companyId).catch(() => []);
  return { companyId, contacts };
}

async function loadContactViews(brandId: string, refsJson: string): Promise<BrandContactView[]> {
  const refs = parseContacts(refsJson).filter((r) => r.visible).slice(0, MAX_BRAND_CONTACTS);
  const records = await Promise.all(refs.map((r) => getReferralContactById(r.contactId).catch(() => null)));
  const views: BrandContactView[] = [];
  refs.forEach((ref, i) => {
    const c = records[i];
    if (!c) return;
    views.push({
      id: c.id,
      name: c.name,
      title: ref.titleOverride || c.title || "",
      phone: c.phone || "",
      email: c.email || "",
      photoUrl: ref.photoUrl || undefined,
    });
  });
  return views;
}

const cachedContactViews = unstable_cache(loadContactViews, ["community-brand-contacts"], { revalidate: 300, tags: [BRANDS_CACHE_TAG] });

/** Visible contacts for a brand, in order. Only call for users tied to the brand. */
export async function getBrandContactViews(brand: CommunityBrand): Promise<BrandContactView[]> {
  return cachedContactViews(brand.id, JSON.stringify(brand.contacts)).catch(() => []);
}
