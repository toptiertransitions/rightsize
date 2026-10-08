"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import zipcodes from "zipcodes";
import { getSystemRole, getReferralCompanies, createReferralCompany, createReferralContact, findReferralContactByEmail, getReferralCompanyById, getReferralContactById } from "@/lib/airtable";
import { sendPartnerPortalInviteEmail } from "@/lib/admin-notifications";
import { hasCapability, canAccessMarketplaceAdmin, type MarketplaceRole } from "@/lib/marketplace/permissions";
import {
  getAllCategories,
  getCategoryById,
  getAllListingsAdmin,
  getAllPartners,
  getPartnerById,
  getListingsForPartnerAdmin,
  createPartner,
  updatePartner,
  updateListing,
  updateListingReferralTerms,
  updateListingIntroNotification,
  createListing,
  updateCategory,
} from "@/lib/marketplace/data";
import { isListingReadyForLive, missingRequiredFields } from "@/lib/marketplace/completeness";
import type {
  MarketplaceFieldDef,
  MarketplaceLifecycleStatus,
  MarketplaceListingStatus,
  MarketplaceFeeType,
  MarketplaceReferralPolicy,
} from "@/lib/marketplace/types";
import { isKnownCounty, zipsForCounties } from "@/lib/marketplace/counties";
import { ensurePartnerCrmLink } from "@/lib/marketplace/crmLink";

// Every action here independently re-checks the caller's role — never rely
// on the layout.tsx gate alone, since a server action is its own callable
// entry point regardless of which page rendered the button that calls it.
async function requireMarketplaceRole(): Promise<MarketplaceRole> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const role = await getSystemRole(userId);
  if (!canAccessMarketplaceAdmin(role)) throw new Error("Forbidden");
  return role as MarketplaceRole;
}

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; data?: T };

// ─── Partner writes ─────────────────────────────────────────────────────────

export async function updatePartnerOverviewAction(
  partnerId: string,
  data: {
    companyName?: string;
    pocName?: string;
    email?: string;
    phone?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    deliveryMode?: "In-person" | "Virtual" | "Both";
    logo?: string;
    shortBio?: string;
    aboutUs?: string;
    languages?: string[];
    seniorSpecialty?: string[];
    priceTier?: "" | "$" | "$$" | "$$$" | "Contact for pricing";
    featuredRank?: number | null;
    projectsCompletedAdjustment?: number;
  }
): Promise<ActionResult> {
  await requireMarketplaceRole();
  try {
    await updatePartner(partnerId, data);
    revalidatePath(`/admin/marketplace/partners/${partnerId}`);
    revalidatePath("/admin/marketplace/partners");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function updatePartnerServiceAreaAction(
  partnerId: string,
  serviceArea: { zips: string[]; counties: string[]; statewide: boolean; nationwide: boolean }
): Promise<ActionResult> {
  await requireMarketplaceRole();
  // Selected counties expand to their ZIPs here, at save time — matching
  // only reads serviceArea.zips, so the client Partners page picks them up
  // with no other change. `counties` is kept so the editor can show (and
  // later remove) what was picked.
  const counties = [...new Set(serviceArea.counties)].filter(isKnownCounty).sort();
  const manualZips = serviceArea.zips.map((z) => z.trim()).filter(Boolean);
  const invalid = manualZips.filter((z) => !/^\d{5}$/.test(z));
  if (invalid.length > 0) {
    return { ok: false, error: `Not a 5-digit ZIP: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? "…" : ""}` };
  }
  const zips = [...new Set([...manualZips, ...zipsForCounties(counties)])].sort();
  try {
    await updatePartner(partnerId, { serviceArea: { ...serviceArea, zips, counties } });
    revalidatePath(`/admin/marketplace/partners/${partnerId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

/** Simple zip+radius helper for the Service Area tab — looks up every zip
 * within radiusMiles of homeZip so staff don't have to type them out by
 * hand. Purely additive to the existing zips[] list: this returns plain
 * zip strings for the caller to merge into the same textarea the manual
 * entry already uses, so Save and everything downstream (matching,
 * scoring, the legacy /partners adapter) is completely unaffected — it
 * only ever reads serviceArea.zips, same as before. Reuses the `zipcodes`
 * package already used by the (separately gated, Local Vendors-only)
 * /api/admin/zip-coverage route, but checked against the marketplace
 * admin's own role so TTTManager can use it too, not just TTTAdmin. */
export async function lookupZipsInRadiusAction(
  homeZip: string,
  radiusMiles: number
): Promise<ActionResult<{ zips: string[] }>> {
  await requireMarketplaceRole();
  const zip = homeZip.trim();
  if (!/^\d{5}$/.test(zip)) return { ok: false, error: "Enter a valid 5-digit home zip code" };
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0 || radiusMiles > 500) {
    return { ok: false, error: "Enter a radius between 1 and 500 miles" };
  }
  if (!zipcodes.lookup(zip)) return { ok: false, error: `Zip code ${zip} wasn't found` };
  const zips = ((zipcodes.radius(zip, radiusMiles) ?? []) as string[]).sort();
  return { ok: true, data: { zips } };
}

export async function bulkUpdatePartnerLifecycleAction(
  partnerIds: string[],
  status: MarketplaceLifecycleStatus
): Promise<ActionResult> {
  const role = await requireMarketplaceRole();
  if (status === "Archived" && !hasCapability(role, "bulkDeleteOrImport")) {
    return { ok: false, error: "Archiving requires TTTAdmin." };
  }
  try {
    for (const id of partnerIds) {
      await updatePartner(id, { lifecycleStatus: status });
    }
    revalidatePath("/admin/marketplace/partners");
    revalidatePath("/admin/marketplace");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function approvePartnerAction(partnerId: string): Promise<ActionResult> {
  const role = await requireMarketplaceRole();
  if (!hasCapability(role, "approveListing")) return { ok: false, error: "Not permitted" };
  try {
    const { userId } = await auth();
    await updatePartner(partnerId, {
      lifecycleStatus: "Live",
      approvedAt: new Date().toISOString(),
      approvedBy: userId ?? "",
    });
    revalidatePath("/admin/marketplace");
    revalidatePath(`/admin/marketplace/partners/${partnerId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Approval failed" };
  }
}

/** Pipeline kanban drags a Partner card between lifecycle columns. Moving to
 * Live runs the completeness check across every one of this partner's
 * listings (not just one), since the pipeline card represents the company,
 * not a single category — and flips each listing that passes to Live too,
 * keeping Partner.lifecycleStatus and Listing.status in sync for the simple
 * case. Blocks with a clear, per-listing reason if anything isn't ready. */
export async function movePartnerLifecycleAction(
  partnerId: string,
  newStatus: MarketplaceLifecycleStatus
): Promise<ActionResult> {
  await requireMarketplaceRole();
  if (newStatus === "Live") {
    const [listings, categories] = await Promise.all([getListingsForPartnerAdmin(partnerId), getAllCategories()]);
    if (listings.length === 0) return { ok: false, error: "This partner has no listings yet — add one from the Partners tab first." };
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const blockers: string[] = [];
    for (const listing of listings) {
      if (listing.status === "Live") continue;
      const category = categoryById.get(listing.categoryId);
      if (!category) continue;
      const missing = missingRequiredFields(listing.attributes, category);
      if (missing.length > 0) blockers.push(`${category.label}: missing ${missing.map((f) => f.label).join(", ")}`);
    }
    if (blockers.length > 0) return { ok: false, error: blockers.join(" · ") };
    try {
      for (const listing of listings) {
        if (listing.status !== "Live") await updateListing(listing.id, { status: "Live" });
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
    }
  }
  try {
    await updatePartner(partnerId, { lifecycleStatus: newStatus });
    revalidatePath("/admin/marketplace/pipeline");
    revalidatePath("/admin/marketplace");
    revalidatePath("/admin/marketplace/partners");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

/** Staff-initiated only — there is no self-service path for a marketplace
 * partner to join the Referral Partner Portal. This reuses the exact same
 * portal the CRM tab's own invite flow sends people into: it ensures a
 * CRMReferralCompanies + CRMReferralContacts record exists for this
 * partner (creating one if needed, reusing an existing contact at this
 * email if there is one), links them back onto the Partners record, and
 * sends the identical invite email. The CRM tab's own flow is untouched —
 * this is a second door into the same room, not a new room. */
export async function invitePartnerToPortalAction(partnerId: string): Promise<ActionResult> {
  const role = await requireMarketplaceRole();
  if (!hasCapability(role, "sendInvites")) return { ok: false, error: "Not permitted" };

  try {
    const partner = await getPartnerById(partnerId);
    if (!partner) return { ok: false, error: "Partner not found." };
    if (!partner.email) return { ok: false, error: "This partner has no email on file — add one in Overview first." };

    const [listings, categories] = await Promise.all([getListingsForPartnerAdmin(partnerId), getAllCategories()]);
    const primary = listings.find((l) => l.isPrimary) ?? listings[0];
    await ensurePartnerCrmLink(partner, {
      primaryCategoryLabel: categories.find((c) => c.id === primary?.categoryId)?.label,
      contactNote: "Invited to the Referral Partner Portal from the marketplace admin.",
    });

    const user = await currentUser().catch(() => null);
    const inviterName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "The Team";
    await sendPartnerPortalInviteEmail({
      inviterName,
      partnerName: partner.pocName || partner.companyName,
      partnerEmail: partner.email,
    });

    revalidatePath(`/admin/marketplace/partners/${partnerId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invite failed" };
  }
}

/** CRM is the source of truth for a linked partner's business details — a
 * company can be CRM-only, marketplace-only, or both, and when it's both,
 * the shared fields (name, address, phone, email, website) always come
 * from the CRM record, never the other way. Called on every partner-detail
 * page load for a linked partner, so the Partners record (and anything
 * reading it, including the public marketplace pages) stays accurate
 * without needing a live cross-table join at render time everywhere else.
 * Best-effort: a sync failure shouldn't block viewing the partner. */
export async function syncPartnerFromCrmIfLinked(partnerId: string): Promise<void> {
  try {
    const partner = await getPartnerById(partnerId);
    if (!partner?.crmReferralCompanyId) return;

    const [company, contact] = await Promise.all([
      getReferralCompanyById(partner.crmReferralCompanyId),
      partner.crmReferralContactId ? getReferralContactById(partner.crmReferralContactId) : Promise.resolve(null),
    ]);
    if (!company) return;

    await updatePartner(partnerId, {
      companyName: company.name,
      address: company.address,
      city: company.city,
      state: company.state,
      zip: company.zip,
      website: company.website,
      ...(contact ? { pocName: contact.name, email: contact.email, phone: contact.phone } : {}),
    });
  } catch (e) {
    console.error("syncPartnerFromCrmIfLinked failed:", e);
  }
}

// ─── Listing writes ─────────────────────────────────────────────────────────

export async function updateListingAttributesAction(
  listingId: string,
  attributes: Record<string, unknown>
): Promise<ActionResult> {
  await requireMarketplaceRole();
  try {
    await updateListing(listingId, { attributes });
    revalidatePath("/admin/marketplace/partners");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

/** Status transitions go through this one path (used by both the partner
 * detail page and the pipeline kanban) so the Live completeness gate is
 * enforced exactly once, everywhere. */
export async function moveListingStatusAction(
  listingId: string,
  categoryId: string,
  newStatus: MarketplaceListingStatus,
  currentAttributes: Record<string, unknown>
): Promise<ActionResult<{ missing: string[] }>> {
  await requireMarketplaceRole();
  if (newStatus === "Live") {
    const category = await getCategoryById(categoryId);
    if (!category) return { ok: false, error: "Category not found" };
    if (!isListingReadyForLive(currentAttributes, category)) {
      const missing = missingRequiredFields(currentAttributes, category).map((f) => f.label);
      return { ok: false, error: `Missing required fields: ${missing.join(", ")}`, data: { missing } };
    }
  }
  try {
    await updateListing(listingId, { status: newStatus });
    revalidatePath("/admin/marketplace/pipeline");
    revalidatePath("/admin/marketplace/partners");
    revalidatePath("/admin/marketplace");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function updateReferralTermsAction(
  listingId: string,
  data: {
    feeType?: MarketplaceFeeType;
    feeValue?: number;
    creditToSeniorPercent?: number;
    referralNotes?: string;
    agreementOnFile?: boolean;
    agreementDate?: string;
  },
  confirmedRestrictedCategory: boolean,
  categoryFeesAllowed: boolean
): Promise<ActionResult> {
  const { userId } = await auth();
  const role = await requireMarketplaceRole();
  if (!hasCapability(role, "editReferralTerms")) return { ok: false, error: "Not permitted — TTTAdmin only." };
  if (!categoryFeesAllowed && data.feeType && data.feeType !== "none" && !confirmedRestrictedCategory) {
    return {
      ok: false,
      error: "Referral fees in this category are restricted by law or professional rules. Confirm with counsel before enabling.",
    };
  }
  try {
    await updateListingReferralTerms(listingId, data, userId ?? "");
    revalidatePath("/admin/marketplace/partners");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

/** TTTAdmin only, same gate as referral terms. Defaults to TTTAdmin for
 * every listing — this is the only place that changes it. */
export async function updateListingIntroNotificationAction(
  listingId: string,
  introNotificationMethod: "TTTAdmin" | "PartnerEmail" | "CustomURL",
  introNotificationValue?: string
): Promise<ActionResult> {
  const { userId } = await auth();
  const role = await requireMarketplaceRole();
  if (!hasCapability(role, "editReferralTerms")) return { ok: false, error: "Not permitted — TTTAdmin only." };
  if (introNotificationMethod === "CustomURL" && !introNotificationValue?.trim()) {
    return { ok: false, error: "Enter a URL to route introductions to." };
  }
  try {
    await updateListingIntroNotification(listingId, { introNotificationMethod, introNotificationValue }, userId ?? "");
    revalidatePath("/admin/marketplace/partners");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

// ─── Category writes ─────────────────────────────────────────────────────────

export async function updateCategoryFieldSchemaAction(
  categoryId: string,
  fieldSchema: MarketplaceFieldDef[]
): Promise<ActionResult> {
  const role = await requireMarketplaceRole();
  if (!hasCapability(role, "editCategories")) return { ok: false, error: "Not permitted — TTTAdmin only." };
  try {
    await updateCategory(categoryId, {
      fieldSchema,
      completenessRules: { requiredFieldKeys: fieldSchema.filter((f) => f.required).map((f) => f.key) },
    });
    revalidatePath("/admin/marketplace/categories");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function updateCategoryBasicInfoAction(
  categoryId: string,
  data: { label?: string; description?: string; icon?: string; sortOrder?: number; minLiveListings?: number; allowsVirtual?: boolean }
): Promise<ActionResult> {
  const role = await requireMarketplaceRole();
  if (!hasCapability(role, "editCategories")) return { ok: false, error: "Not permitted — TTTAdmin only." };
  try {
    await updateCategory(categoryId, data);
    revalidatePath("/admin/marketplace/categories");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

export async function updateCategoryReferralPolicyAction(
  categoryId: string,
  policy: Partial<MarketplaceReferralPolicy>,
  confirmedBy?: string
): Promise<ActionResult> {
  const { userId } = await auth();
  const role = await requireMarketplaceRole();
  if (!hasCapability(role, "editReferralPolicy")) return { ok: false, error: "Not permitted — TTTAdmin only." };
  try {
    await updateCategory(categoryId, {
      referralPolicy: policy,
      ...(policy.feesAllowed === true
        ? { referralFeeConfirmedBy: confirmedBy ?? userId ?? "", referralFeeConfirmedAt: new Date().toISOString() }
        : {}),
    });
    revalidatePath("/admin/marketplace/categories");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed" };
  }
}

// ─── Pipeline: CRM -> Prospect import ───────────────────────────────────────
// Replaces the old /admin/local-vendors "Sync Communities from CRM" button,
// which only worked for type==="Senior Living" + an Active Referral contact
// stage, and deduped by name-string-equality alone. This version works for
// any category and dedupes by CrmReferralCompanyId link, exact company name,
// and website domain. (Email dedupe across CRMReferralContacts is a known
// gap, not yet implemented — ReferralCompany itself carries no email field,
// only its linked contacts do.)
function domainOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export async function importProspectsFromCrmAction(
  categoryId: string
): Promise<ActionResult<{ created: number; skipped: number }>> {
  await requireMarketplaceRole();
  try {
    const [companies, existingPartners] = await Promise.all([
      getReferralCompanies().catch(() => []),
      getAllPartners(),
    ]);
    const existingByCrmId = new Set(existingPartners.map((p) => p.crmReferralCompanyId).filter(Boolean));
    const existingByName = new Set(existingPartners.map((p) => p.companyName.trim().toLowerCase()));
    const existingByDomain = new Set(existingPartners.map((p) => domainOf(p.website)).filter(Boolean));

    let created = 0;
    let skipped = 0;
    for (const company of companies) {
      if (existingByCrmId.has(company.id)) { skipped++; continue; }
      if (existingByName.has(company.name.trim().toLowerCase())) { skipped++; continue; }
      const companyDomain = domainOf(company.website ?? "");
      if (companyDomain && existingByDomain.has(companyDomain)) { skipped++; continue; }

      const partner = await createPartner({
        companyName: company.name,
        slug: company.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        address: company.address,
        city: company.city,
        state: company.state,
        zip: company.zip,
        website: company.website ?? "",
        source: "CRM",
        crmReferralCompanyId: company.id,
      });
      await updatePartner(partner.id, { lifecycleStatus: "Prospect" });
      await createListing({ partnerId: partner.id, categoryId, status: "Draft" });
      created++;
    }

    revalidatePath("/admin/marketplace/pipeline");
    return { ok: true, data: { created, skipped } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed" };
  }
}

export async function getMarketplaceCategoriesForAdmin() {
  await requireMarketplaceRole();
  return getAllCategories();
}

export async function getMarketplaceListingsForAdmin() {
  await requireMarketplaceRole();
  return getAllListingsAdmin();
}
