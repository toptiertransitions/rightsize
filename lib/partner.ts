import {
  findReferralContactByClerkUserId,
  getPartnerTenantIdsByCompany,
  getPartnerTenantIds,
} from "./airtable";
import type { ReferralContact } from "./types";

export async function isPartner(clerkUserId: string): Promise<boolean> {
  const contact = await findReferralContactByClerkUserId(clerkUserId).catch(() => null);
  return !!contact;
}

export async function getPartnerContact(clerkUserId: string): Promise<ReferralContact | null> {
  return findReferralContactByClerkUserId(clerkUserId).catch(() => null);
}

// Access is company-wide when a company is set; falls back to individual contact's referrals.
export async function partnerHasAccessToTenant(contact: ReferralContact, tenantId: string): Promise<boolean> {
  const companyId = contact.referralCompanyId || null;
  const tenantIds = companyId
    ? await getPartnerTenantIdsByCompany(companyId).catch(() => [] as string[])
    : await getPartnerTenantIds(contact.id).catch(() => [] as string[]);
  return tenantIds.includes(tenantId);
}
