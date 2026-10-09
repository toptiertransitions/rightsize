"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { getSystemRole, getReferralCompanies, getTenantById, updateTenant } from "@/lib/airtable";
import { canAccessMarketplaceAdmin } from "@/lib/marketplace/permissions";
import { getPartnerById, updatePartner } from "@/lib/marketplace/data";
import { slugify } from "@/lib/utils";
import {
  getAllBrands, getBrandById, createBrand, updateBrand, writeAudit, getPickableContacts, type AuditEntry,
} from "@/lib/brands/data";
import {
  CODE_RE, HEX_RE, MAX_BRAND_CONTACTS, SLUG_RE, normalizeCode, type CommunityBrand,
} from "@/lib/brands/shared";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

// Same gate as the rest of /admin/marketplace (TTTAdmin and TTTManager),
// re-checked here because every server action is its own entry point.
async function requireAdmin(): Promise<{ userId: string; actorName: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const role = await getSystemRole(userId).catch(() => null);
  if (!canAccessMarketplaceAdmin(role)) throw new Error("Not permitted");
  const user = await currentUser().catch(() => null);
  const actorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.primaryEmailAddress?.emailAddress || userId;
  return { userId, actorName };
}

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

function revalidate(id?: string) {
  revalidatePath("/admin/marketplace/tenant-config");
  if (id) revalidatePath(`/admin/marketplace/tenant-config/${id}`);
}

/** Short, unique, uppercase code from a name, e.g. "The Roosevelt" -> ROOSEVELT. */
function suggestCode(name: string, taken: Set<string>): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !["THE", "AT", "OF", "AND"].includes(w));
  let base = (words[0] ?? "COMMUNITY").slice(0, 12);
  if (base.length < 3) base = (words.join("") || "COMMUNITY").slice(0, 12);
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base}${n}`;
  return code;
}

export async function generateCodeAction(name: string, brandId?: string): Promise<Result<string>> {
  try {
    await requireAdmin();
    const brands = await getAllBrands();
    const taken = new Set(brands.filter((b) => b.id !== brandId).map((b) => normalizeCode(b.communityCode)));
    return { ok: true, data: suggestCode(name, taken) };
  } catch (e) {
    return fail(e);
  }
}

export async function enableBrandAction(partnerId: string): Promise<Result<string>> {
  try {
    const { userId, actorName } = await requireAdmin();
    const partner = await getPartnerById(partnerId);
    if (!partner) throw new Error("Partner not found");
    const brands = await getAllBrands();
    if (brands.some((b) => b.marketplacePartnerId === partnerId)) throw new Error("This partner already has tenant branding");

    const slugs = new Set(brands.map((b) => b.slug));
    const base = slugify(partner.companyName.replace(/^the\s+/i, "")).slice(0, 40) || "community";
    let slug = base;
    for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;

    const brand = await createBrand({
      slug,
      communityCode: suggestCode(partner.companyName, new Set(brands.map((b) => normalizeCode(b.communityCode)))),
      displayName: partner.companyName,
      subtitle: "",
      marketplacePartnerId: partnerId,
      logoUrl: partner.logo || "",
      primaryColor: "#2E6B4F",
      secondaryColor: "#2E6B4F",
      status: "Draft",
      welcomeMessage: "",
      welcomeSenderName: "",
      welcomeSenderTitle: "",
      topTierVisibility: "Partner visible",
      contacts: [],
      updatedBy: actorName,
    });
    await writeAudit([{ actorClerkId: userId, actorName, entityType: "brand", entityId: brand.id, field: "created", oldValue: "", newValue: `${brand.displayName} (${brand.slug})` }]);
    revalidate();
    return { ok: true, data: brand.id };
  } catch (e) {
    return fail(e);
  }
}

const contactSchema = z.object({
  contactId: z.string().regex(/^rec[A-Za-z0-9]{14}$/),
  visible: z.boolean(),
  titleOverride: z.string().trim().max(80).optional(),
  photoUrl: z.string().trim().url().startsWith("https://").max(500).optional().or(z.literal("")),
});

const saveSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(80),
  subtitle: z.string().trim().max(80),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE, "Slug can use lowercase letters, numbers, and dashes"),
  communityCode: z.string().transform(normalizeCode).pipe(z.string().regex(CODE_RE, "Code must be 3 to 20 letters or numbers")),
  logoUrl: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\//.test(v), "Logo must be an https URL"),
  primaryColor: z.string().regex(HEX_RE, "Primary color must be a hex like #1F3A5F"),
  secondaryColor: z.string().regex(HEX_RE, "Secondary color must be a hex like #2A664A"),
  welcomeMessage: z.string().trim().max(600),
  welcomeSenderName: z.string().trim().max(80),
  welcomeSenderTitle: z.string().trim().max(80),
  topTierVisibility: z.enum(["Partner visible", "Minimal"]),
  contacts: z.array(contactSchema).max(MAX_BRAND_CONTACTS, `Up to ${MAX_BRAND_CONTACTS} contacts`),
  confirmIdentityChange: z.boolean().optional(),
});

export type SaveBrandInput = z.input<typeof saveSchema>;

export async function saveBrandAction(id: string, input: SaveBrandInput): Promise<Result<CommunityBrand>> {
  try {
    const { userId, actorName } = await requireAdmin();
    const current = await getBrandById(id);
    if (!current) throw new Error("Brand not found");
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
    const d = parsed.data;

    const brands = (await getAllBrands()).filter((b) => b.id !== id);
    if (d.slug !== current.slug) {
      if (current.slugLockedAt) throw new Error("The slug can't change after the brand has been published");
      if (brands.some((b) => b.slug === d.slug)) throw new Error("That slug is already used by another community");
    }
    if (normalizeCode(d.communityCode) !== normalizeCode(current.communityCode)) {
      if (brands.some((b) => normalizeCode(b.communityCode) === d.communityCode)) throw new Error("That community code is already used");
      if (current.status === "Active" && !d.confirmIdentityChange) throw new Error("CONFIRM_REQUIRED");
    }

    // Contacts must belong to this partner's CRM company
    if (d.contacts.length > 0) {
      const { contacts: allowed } = await getPickableContacts(current);
      const allowedIds = new Set(allowed.map((c) => c.id));
      if (d.contacts.some((c) => !allowedIds.has(c.contactId))) throw new Error("A contact isn't part of this partner's company");
    }
    const contacts = d.contacts.map((c, i) => ({
      contactId: c.contactId,
      order: i,
      visible: c.visible,
      titleOverride: c.titleOverride || undefined,
      photoUrl: c.photoUrl || undefined,
    }));

    const next = { ...d, contacts };
    const audit: AuditEntry[] = [];
    const fields = ["displayName", "subtitle", "slug", "communityCode", "logoUrl", "primaryColor", "secondaryColor", "welcomeMessage", "welcomeSenderName", "welcomeSenderTitle", "topTierVisibility"] as const;
    for (const f of fields) {
      if (String(current[f] ?? "") !== String(next[f] ?? "")) {
        audit.push({ actorClerkId: userId, actorName, entityType: "brand", entityId: id, field: f, oldValue: String(current[f] ?? ""), newValue: String(next[f] ?? "") });
      }
    }
    if (JSON.stringify(current.contacts) !== JSON.stringify(contacts)) {
      audit.push({ actorClerkId: userId, actorName, entityType: "brand", entityId: id, field: "contacts", oldValue: JSON.stringify(current.contacts), newValue: JSON.stringify(contacts) });
    }

    const { confirmIdentityChange: _c, ...write } = next;
    void _c;
    const saved = await updateBrand(id, { ...write, updatedBy: actorName });
    await writeAudit(audit);
    revalidate(id);
    return { ok: true, data: saved };
  } catch (e) {
    return fail(e);
  }
}

export async function setBrandStatusAction(id: string, status: "Draft" | "Active"): Promise<Result<CommunityBrand>> {
  try {
    const { userId, actorName } = await requireAdmin();
    const current = await getBrandById(id);
    if (!current) throw new Error("Brand not found");
    if (status === "Active" && !current.displayName) throw new Error("Add a display name before publishing");
    const saved = await updateBrand(id, {
      status,
      ...(status === "Active" && !current.slugLockedAt ? { slugLockedAt: new Date().toISOString() } : {}),
      updatedBy: actorName,
    });
    await writeAudit([{ actorClerkId: userId, actorName, entityType: "brand", entityId: id, field: "status", oldValue: current.status, newValue: status }]);
    revalidate(id);
    return { ok: true, data: saved };
  } catch (e) {
    return fail(e);
  }
}

export async function listCrmCompaniesAction(): Promise<Result<Array<{ id: string; name: string; city: string }>>> {
  try {
    await requireAdmin();
    const companies = await getReferralCompanies();
    return { ok: true, data: companies.map((c) => ({ id: c.id, name: c.name, city: c.city })).sort((a, b) => a.name.localeCompare(b.name)) };
  } catch (e) {
    return fail(e);
  }
}

/** Links the brand's marketplace partner to the CRM company its contacts live in. */
export async function linkCrmCompanyAction(brandId: string, companyId: string): Promise<Result> {
  try {
    const { userId, actorName } = await requireAdmin();
    const brand = await getBrandById(brandId);
    if (!brand?.marketplacePartnerId) throw new Error("Brand not found");
    if (!/^rec[A-Za-z0-9]{14}$/.test(companyId)) throw new Error("Pick a company");
    await updatePartner(brand.marketplacePartnerId, { crmReferralCompanyId: companyId });
    await writeAudit([{ actorClerkId: userId, actorName, entityType: "brand", entityId: brandId, field: "crmCompany", oldValue: "", newValue: companyId }]);
    revalidate(brandId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Tenant Config > Projects: set (or clear, brandId "") the brand on one or
 * more projects. Every change is audited per project. */
export async function assignProjectsBrandAction(tenantIds: string[], brandId: string): Promise<Result<number>> {
  try {
    const { userId, actorName } = await requireAdmin();
    const ids = Array.from(new Set(tenantIds)).filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
    if (ids.length === 0) throw new Error("Pick at least one project");
    if (ids.length > 200) throw new Error("Too many projects at once");
    if (brandId && !(await getBrandById(brandId))) throw new Error("Brand not found");

    const tenants = await Promise.all(ids.map((id) => getTenantById(id).catch(() => null)));
    const audit: AuditEntry[] = [];
    let changed = 0;
    for (const t of tenants) {
      if (!t || (t.communityBrandId ?? "") === brandId) continue;
      await updateTenant(t.id, { communityBrandId: brandId || null });
      audit.push({ actorClerkId: userId, actorName, entityType: "project", entityId: t.id, field: "communityBrandId", oldValue: t.communityBrandId ?? "", newValue: brandId });
      changed++;
    }
    await writeAudit(audit);
    revalidateTag("tenants");
    revalidatePath("/admin/marketplace/tenant-config/projects");
    revalidate();
    return { ok: true, data: changed };
  } catch (e) {
    return fail(e);
  }
}
