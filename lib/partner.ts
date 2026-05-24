import {
  findReferralContactByClerkUserId,
  getPartnerTenantIdsByCompany,
} from "./airtable";
import type { ReferralContact } from "./types";

export async function isPartner(clerkUserId: string): Promise<boolean> {
  const contact = await findReferralContactByClerkUserId(clerkUserId).catch(() => null);
  return !!contact;
}

export async function getPartnerContact(clerkUserId: string): Promise<ReferralContact | null> {
  return findReferralContactByClerkUserId(clerkUserId).catch(() => null);
}

// Access is company-wide: a partner sees all tenants referred by anyone at their company.
export async function partnerHasAccessToTenant(contact: ReferralContact, tenantId: string): Promise<boolean> {
  if (!contact.referralCompanyId) return false;
  const tenantIds = await getPartnerTenantIdsByCompany(contact.referralCompanyId).catch(() => [] as string[]);
  return tenantIds.includes(tenantId);
}
