// Server-only: the marketplace Partner behind a signed-in partner portal
// user. Access comes from the PartnerUsers table (see ./team.ts). The older
// path, through the company's CRM contact (crmReferralContactId, then a
// matching email), still works and is converted to a PartnerUsers row.
import "server-only";
import { cache } from "react";
import { getPartnerContact } from "@/lib/partner";
import { getAllPartners, getListingsForPartnerAdmin, getAllCategories } from "./data";
import { adoptLegacyLogin, getActiveMembership, touchLastActive } from "./team";
import type { MarketplaceCategory, MarketplaceListing, MarketplacePartner, PartnerUser } from "./types";
import type { ReferralContact } from "@/lib/types";

export interface PartnerAccount {
  /** The CRM referral contact behind this login, if there is one. Partner
   * users added through the team (PartnerUsers) usually have none. */
  contact: ReferralContact | null;
  partner: MarketplacePartner;
  /** This person's row on the company's team */
  membership: PartnerUser;
  listings: Array<MarketplaceListing & { category: MarketplaceCategory }>;
}

// One Partners read per request, shared by the portal layout and the page
const getPartnersOnce = cache(getAllPartners);

export async function findMarketplacePartnerForContact(contact: ReferralContact): Promise<MarketplacePartner | null> {
  const partners = await getPartnersOnce();
  const email = contact.email?.toLowerCase();
  return (
    partners.find((p) => p.crmReferralContactId === contact.id) ??
    (email ? partners.find((p) => p.email.toLowerCase() === email) : undefined) ??
    null
  );
}

/**
 * The marketplace company this signed-in person can work in, or null.
 * Their Active PartnerUsers row decides it. Someone who still signs in the
 * old way (through the company's CRM contact) is given a row on the spot,
 * unless they were removed from that company. Cached per request.
 */
export const getPartnerAccount = cache(async function getPartnerAccount(clerkUserId: string): Promise<PartnerAccount | null> {
  const [membershipRow, contact] = await Promise.all([
    getActiveMembership(clerkUserId).catch(() => null),
    getPartnerContact(clerkUserId),
  ]);

  let membership = membershipRow;
  let partner: MarketplacePartner | null = null;
  if (membership) {
    partner = (await getPartnersOnce()).find((p) => p.id === membership!.partnerId) ?? null;
  } else if (contact) {
    const legacy = await findMarketplacePartnerForContact(contact);
    if (legacy) {
      membership = await adoptLegacyLogin(legacy, {
        clerkUserId,
        email: contact.email ?? "",
        name: contact.name,
        phone: contact.phone || undefined,
        title: contact.title || undefined,
      }).catch((e) => { console.error("[partnerAccount] adopt legacy login failed:", e); return null; });
      if (membership) partner = legacy;
    }
  }
  if (!partner || !membership) return null;

  void touchLastActive(membership);
  const [listings, categories] = await Promise.all([getListingsForPartnerAdmin(partner.id), getAllCategories()]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  return {
    contact,
    partner,
    membership,
    listings: listings
      .map((l) => ({ ...l, category: byId.get(l.categoryId)! }))
      .filter((l) => !!l.category)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.category.sortOrder - b.category.sortOrder),
  };
});

/** Invited partners go through setup before anything else in the portal. */
export function needsSetup(partner: MarketplacePartner): boolean {
  return partner.lifecycleStatus === "Invited";
}
