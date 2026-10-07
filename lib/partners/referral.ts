import {
  setReferralPartnerSelection,
  getOpportunitiesForTenant,
  getClientContactById,
  getReferralContactById,
  getReferralCompanyById,
} from "@/lib/airtable";
import { getAllPartners } from "@/lib/marketplace/data";
import type { PartnerCategory, PartnerSelection } from "@/lib/types";
import type { PartnerProfile } from "./types";
import { PARTNER_CATEGORIES } from "@/lib/types";
import { REFERRAL_UNLISTED_PREFIX, unlistedReferralId, type ReferralAttachment, type ReferralPartnerOption } from "./referralShared";

// CRM ReferralCompany.Type -> the Partners page category it belongs under.
// Types with no sensible category (Doctor, Hospital, Other) map to nothing —
// staff pick the category themselves in the Add Client User modal.
const CRM_TYPE_TO_CATEGORY: Record<string, PartnerCategory> = {
  "Senior Living": "Community",
  Realtor: "Realtor",
  Broker: "Realtor",
  Attorney: "Estate Attorney",
  "Financial Advisor": "Financial Advisory",
  "Moving Company": "Mover",
  "Companion Care": "Companion Care",
  "Home Health Care": "Home Health Care",
};

export interface CrmReferral {
  companyName: string;
  companyType: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  suggestedCategory?: PartnerCategory;
  /** Marketplace listings belonging to this same company (linked via
   * Partner.CrmReferralCompanyId/ContactId, or an exact company-name match). */
  marketplaceMatches: ReferralPartnerOption[];
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function toReferralOption(p: PartnerProfile): ReferralPartnerOption {
  return { partnerId: p.id, name: p.vendorName, category: p.category, city: p.city, state: p.state, logo: p.logo };
}

/**
 * Project -> CRM Opportunity -> ClientContact.ReferralPartnerId (falling back
 * to a Key Person's referral contact) -> ReferralContact -> ReferralCompany.
 * Returns null when the project has no CRM referral on record.
 */
export async function resolveCrmReferralForTenant(
  tenantId: string,
  directory: PartnerProfile[]
): Promise<CrmReferral | null> {
  const opps = await getOpportunitiesForTenant(tenantId).catch(() => []);
  opps.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  for (const opp of opps) {
    const clientContact = opp.clientContactId ? await getClientContactById(opp.clientContactId).catch(() => null) : null;
    const referralContactId =
      clientContact?.referralPartnerId || opp.keyPeople.find((k) => k.referralContactId)?.referralContactId;
    if (!referralContactId) continue;

    const contact = await getReferralContactById(referralContactId).catch(() => null);
    if (!contact) continue;
    const company = contact.referralCompanyId ? await getReferralCompanyById(contact.referralCompanyId).catch(() => null) : null;

    const companyName = company?.name || "";
    const marketplacePartners = await getAllPartners().catch(() => []);
    const linkedIds = new Set(
      marketplacePartners
        .filter(
          (p) =>
            (company && p.crmReferralCompanyId === company.id) ||
            p.crmReferralContactId === contact.id ||
            (companyName && normName(p.companyName) === normName(companyName))
        )
        .map((p) => p.id)
    );
    const marketplaceMatches = directory.filter((p) => linkedIds.has(p.id)).map(toReferralOption);

    const typeCategory = company ? CRM_TYPE_TO_CATEGORY[company.type] : undefined;
    const suggestedCategory =
      marketplaceMatches.find((m) => m.category === typeCategory)?.category ?? marketplaceMatches[0]?.category ?? typeCategory;

    return {
      companyName,
      companyType: company?.type ?? "",
      contactName: contact.name,
      contactPhone: contact.phone,
      contactEmail: contact.email,
      suggestedCategory,
      marketplaceMatches,
    };
  }
  return null;
}

/**
 * The PartnerProfile to show for a referral-locked selection: the live
 * marketplace listing when there is one, otherwise a card built from the
 * details stored on the selection itself (unlisted partners, or a listing
 * that has since been paused).
 */
export function buildReferralPartner(sel: PartnerSelection, directory: PartnerProfile[]): PartnerProfile {
  const listed = sel.partnerId.startsWith(REFERRAL_UNLISTED_PREFIX)
    ? undefined
    : directory.find((p) => p.id === sel.partnerId && p.category === sel.category);
  if (listed) {
    return {
      ...listed,
      isReferral: true,
      referralContactName: sel.referralContactName,
      phone: listed.phone || sel.referralPhone,
      email: listed.email || sel.referralEmail,
    };
  }
  return {
    id: sel.partnerId,
    vendorName: sel.referralName || sel.referralContactName || "Your referral partner",
    category: sel.category,
    zipCodesServed: "",
    city: "",
    state: "",
    avgRating: 0,
    rawAvgRating: 0,
    reviewCount: 0,
    projectsCompleted: 0,
    phone: sel.referralPhone,
    email: sel.referralEmail,
    isReferral: true,
    referralContactName: sel.referralName ? sel.referralContactName : undefined,
  };
}

/**
 * Validates and writes a referral-locked selection. A partnerId must be a
 * live marketplace listing in that exact category; anything else is stored
 * as an unlisted partner under a stable per-category id.
 */
export async function attachReferralPartner(params: {
  tenantId: string;
  attachment: ReferralAttachment;
  directory: PartnerProfile[];
  selectedBy: string;
  source: "TTT Invite" | "Signup";
}): Promise<void> {
  const { tenantId, attachment: a, directory, selectedBy, source } = params;
  if (!(PARTNER_CATEGORIES as readonly string[]).includes(a.category)) throw new Error("Invalid partner category");

  const listed = a.partnerId ? directory.find((p) => p.id === a.partnerId && p.category === a.category) : undefined;
  if (a.partnerId && !listed) throw new Error("That partner isn't available in the marketplace anymore");

  const name = (listed?.vendorName ?? a.name).trim().slice(0, 200);
  if (!name && !a.contactName?.trim()) throw new Error("Enter the referral partner's name");

  await setReferralPartnerSelection({
    tenantId,
    category: a.category,
    partnerId: listed ? listed.id : unlistedReferralId(a.category),
    selectedBy,
    source,
    name,
    contactName: a.contactName?.trim().slice(0, 200),
    phone: a.phone?.trim().slice(0, 50),
    email: a.email?.trim().slice(0, 200),
  });
}
