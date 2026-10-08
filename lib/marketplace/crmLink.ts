// Server-only helper: makes sure a marketplace Partner has a CRM company and
// contact behind it. The partner portal logs people in through the CRM
// contact (ReferralContact.clerkUserId), so this is what lets a marketplace
// partner sign in, see their portal, and earn referral points.
import "server-only";
import { createReferralCompany, createReferralContact, findReferralContactByEmail } from "@/lib/airtable";
import { updatePartner } from "./data";
import type { MarketplacePartner } from "./types";

// CRMReferralCompanies.Type is a single select; only its existing choices
// can be written. Maps a marketplace category to the closest one.
const CRM_TYPE_BY_CATEGORY: Record<string, string> = {
  "Companion Care": "Companion Care",
  "Home Health Care": "Home Health Care",
  Realtor: "Realtor",
  Mover: "Moving Company",
  Hauler: "Moving Company",
  Community: "Senior Living",
  "Estate Attorney": "Attorney",
  "Financial Advisory": "Financial Advisor",
};

export function crmTypeForCategory(categoryLabel?: string): string {
  return (categoryLabel && CRM_TYPE_BY_CATEGORY[categoryLabel]) || "Other";
}

export async function ensurePartnerCrmLink(
  partner: MarketplacePartner,
  opts: { primaryCategoryLabel?: string; contactNote: string }
): Promise<{ referralCompanyId: string; referralContactId: string }> {
  let referralCompanyId = partner.crmReferralCompanyId;
  if (!referralCompanyId) {
    const company = await createReferralCompany({
      name: partner.companyName,
      type: crmTypeForCategory(opts.primaryCategoryLabel),
      address: partner.address,
      city: partner.city,
      state: partner.state,
      zip: partner.zip,
      website: partner.website,
    });
    referralCompanyId = company.id;
  }

  let referralContactId = partner.crmReferralContactId;
  if (!referralContactId) {
    const existing = await findReferralContactByEmail(partner.email).catch(() => null);
    if (existing) {
      referralContactId = existing.id;
    } else {
      const contact = await createReferralContact({
        name: partner.pocName || partner.companyName,
        email: partner.email,
        phone: partner.phone,
        referralCompanyId,
        stage: "Active Referral",
        notes: opts.contactNote,
      });
      referralContactId = contact.id;
    }
  }

  if (referralCompanyId !== partner.crmReferralCompanyId || referralContactId !== partner.crmReferralContactId) {
    await updatePartner(partner.id, { crmReferralCompanyId: referralCompanyId, crmReferralContactId: referralContactId });
  }
  return { referralCompanyId, referralContactId };
}
