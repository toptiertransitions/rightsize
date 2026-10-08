// Server-only: the marketplace Partner behind a signed-in partner portal
// user. Portal login goes through the CRM contact (ReferralContact.
// clerkUserId); the marketplace Partner points at that contact via
// crmReferralContactId, falling back to a matching email.
import "server-only";
import { cache } from "react";
import { getPartnerContact } from "@/lib/partner";
import { getAllPartners, getListingsForPartnerAdmin, getAllCategories } from "./data";
import type { MarketplaceCategory, MarketplaceListing, MarketplacePartner } from "./types";
import type { ReferralContact } from "@/lib/types";

export interface PartnerAccount {
  contact: ReferralContact;
  partner: MarketplacePartner;
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

export async function getPartnerAccount(clerkUserId: string): Promise<PartnerAccount | null> {
  const contact = await getPartnerContact(clerkUserId);
  if (!contact) return null;
  const partner = await findMarketplacePartnerForContact(contact);
  if (!partner) return null;
  const [listings, categories] = await Promise.all([getListingsForPartnerAdmin(partner.id), getAllCategories()]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  return {
    contact,
    partner,
    listings: listings
      .map((l) => ({ ...l, category: byId.get(l.categoryId)! }))
      .filter((l) => !!l.category)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.category.sortOrder - b.category.sortOrder),
  };
}

/** Invited partners go through setup before anything else in the portal. */
export function needsSetup(partner: MarketplacePartner): boolean {
  return partner.lifecycleStatus === "Invited";
}
