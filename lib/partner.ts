import { clerkClient } from "@clerk/nextjs/server";
import {
  findReferralContactByClerkUserId,
  getPartnerTenantIdsByCompany,
  getPartnerTenantIds,
  getClientContactEmailsForPartner,
  getCompanyClientContactEmails,
  getMembershipsForUser,
  getPartnerOpportunitiesInfo,
  getCompanyOpportunitiesInfo,
} from "./airtable";
import type { ReferralContact } from "./types";

export async function isPartner(clerkUserId: string): Promise<boolean> {
  const contact = await findReferralContactByClerkUserId(clerkUserId).catch(() => null);
  return !!contact;
}

export async function getPartnerContact(clerkUserId: string): Promise<ReferralContact | null> {
  return findReferralContactByClerkUserId(clerkUserId).catch(() => null);
}

// Resolve client emails → Clerk user IDs → memberships → tenant IDs
async function getTenantIdsByClientEmails(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const clerk = await clerkClient();
  const tenantIds: string[] = [];
  for (const email of emails) {
    const res = await clerk.users
      .getUserList({ emailAddress: [email] })
      .catch(() => ({ data: [] as never[] }));
    for (const u of res.data) {
      const memberships = await getMembershipsForUser(u.id).catch(() => []);
      for (const m of memberships) {
        if (m.tenantId && !tenantIds.includes(m.tenantId)) tenantIds.push(m.tenantId);
      }
    }
  }
  return tenantIds;
}

// Full tenant lookup: CRM Opportunity chain first, email-based membership fallback second
export async function getPartnerTenantIdsFull(contact: ReferralContact): Promise<string[]> {
  const companyId = contact.referralCompanyId || null;

  const [viaOpp, emails] = await Promise.all([
    companyId
      ? getPartnerTenantIdsByCompany(companyId).catch(() => [] as string[])
      : getPartnerTenantIds(contact.id).catch(() => [] as string[]),
    companyId
      ? getCompanyClientContactEmails(companyId).catch(() => [] as string[])
      : getClientContactEmailsForPartner(contact.id).catch(() => [] as string[]),
  ]);

  const viaEmail = await getTenantIdsByClientEmails(emails).catch(() => [] as string[]);

  const all = [...viaOpp];
  for (const id of viaEmail) {
    if (!all.includes(id)) all.push(id);
  }
  return all;
}

// Returns {tenantId, stage} for all referred projects, including email-fallback ones marked Won.
// tenantId may be null for Proposing-stage opportunities not yet converted to a project.
export async function getPartnerProjectsByStage(
  contact: ReferralContact
): Promise<{ tenantId: string | null; stage: string; clientName?: string }[]> {
  const companyId = contact.referralCompanyId || null;

  const [fromOpp, emails] = await Promise.all([
    companyId
      ? getCompanyOpportunitiesInfo(companyId).catch(() => [] as { tenantId: string | null; stage: string; clientName?: string }[])
      : getPartnerOpportunitiesInfo(contact.id).catch(() => [] as { tenantId: string | null; stage: string; clientName?: string }[]),
    companyId
      ? getCompanyClientContactEmails(companyId).catch(() => [] as string[])
      : getClientContactEmailsForPartner(contact.id).catch(() => [] as string[]),
  ]);

  const viaEmail = await getTenantIdsByClientEmails(emails).catch(() => [] as string[]);
  const oppTenantIds = fromOpp.map(x => x.tenantId).filter((id): id is string => id !== null);
  const extra = viaEmail
    .filter(id => !oppTenantIds.includes(id))
    .map(id => ({ tenantId: id, stage: "Won" }));

  return [...fromOpp, ...extra] as { tenantId: string | null; stage: string; clientName?: string }[];
}

// Access check uses full lookup so projects without TenantId on the Opportunity are found via email
export async function partnerHasAccessToTenant(contact: ReferralContact, tenantId: string): Promise<boolean> {
  const tenantIds = await getPartnerTenantIdsFull(contact).catch(() => [] as string[]);
  return tenantIds.includes(tenantId);
}
