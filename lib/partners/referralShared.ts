// Client-safe referral constants — no server imports, so both the signup
// wizard and the Add Client User modal can use these directly.
import type { PartnerCategory } from "@/lib/types";

export const REFERRAL_UNLISTED_PREFIX = "referral-unlisted-";

export function unlistedReferralId(category: PartnerCategory): string {
  return `${REFERRAL_UNLISTED_PREFIX}${category.toLowerCase().replace(/\s+/g, "-")}`;
}

/** A marketplace listing as offered in the referral partner search. */
export interface ReferralPartnerOption {
  partnerId: string;
  name: string;
  category: PartnerCategory;
  city: string;
  state: string;
  logo?: string;
}

/** What gets attached as a project's referral partner — either a real
 * marketplace listing (partnerId) or an unlisted partner (name only). */
export interface ReferralAttachment {
  category: PartnerCategory;
  partnerId?: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
}

// Self-serve signup: "How did you hear about Rightsize and Top Tier
// Transitions?" Options with a `category` ask a follow-up for the
// referrer's name and lock that partner category on the client's
// Partners page.
export const HOW_HEARD_OPTIONS: { key: string; label: string; category?: PartnerCategory }[] = [
  { key: "realtor", label: "From a Realtor", category: "Realtor" },
  { key: "senior_community", label: "From a Senior Community", category: "Community" },
  { key: "partner", label: "From another partner" },
  { key: "former_client", label: "From a former client" },
  { key: "google", label: "Google" },
  { key: "social", label: "Facebook / Instagram" },
  { key: "other", label: "Other" },
];

export const HOW_HEARD_KEYS = HOW_HEARD_OPTIONS.map((o) => o.key) as [string, ...string[]];

/** Case/punctuation-insensitive substring match used by every referral
 * partner search box. */
export function matchesQuery(text: string, query: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const q = norm(query);
  return !q || norm(text).includes(q);
}
