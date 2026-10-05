// Single role-to-capability map for the marketplace admin section. Every
// check in code should call hasCapability(role, "...") — never compare a
// role name directly — so adding a role or changing what it can do is a
// one-file change.
import type { SystemRole } from "../types";

export type MarketplaceRole = SystemRole | "partner" | "public";

export type MarketplaceCapability =
  | "viewPartners"
  | "editPartners"
  | "editCategories"
  | "editReferralTerms"
  | "editReferralPolicy"
  | "approveListing"
  | "bulkDeleteOrImport"
  | "viewReferralAuditLog"
  | "sendInvites"
  | "runPipeline"
  | "viewReviewsAndProjects"
  | "portalEditOwnRecord";

const TTT_ADMIN_CAPS: MarketplaceCapability[] = [
  "viewPartners",
  "editPartners",
  "editCategories",
  "editReferralTerms",
  "editReferralPolicy",
  "approveListing",
  "bulkDeleteOrImport",
  "viewReferralAuditLog",
  "sendInvites",
  "runPipeline",
  "viewReviewsAndProjects",
];

// TTTManager: everything except category/field-schema editing, referral
// terms, referral policy, bulk delete/import, and the referral audit log —
// per the locked access-control spec.
const TTT_MANAGER_CAPS: MarketplaceCapability[] = [
  "viewPartners",
  "editPartners",
  "approveListing",
  "sendInvites",
  "runPipeline",
  "viewReviewsAndProjects",
];

const CAPABILITY_MAP: Record<MarketplaceRole, MarketplaceCapability[]> = {
  TTTAdmin: TTT_ADMIN_CAPS,
  TTTManager: TTT_MANAGER_CAPS,
  TTTSales: [],
  TTTStaff: [],
  TTTTeamLead: [],
  partner: ["portalEditOwnRecord"],
  public: [],
};

export function getCapabilities(role: MarketplaceRole): Set<MarketplaceCapability> {
  return new Set(CAPABILITY_MAP[role] ?? []);
}

export function hasCapability(role: MarketplaceRole, capability: MarketplaceCapability): boolean {
  return getCapabilities(role).has(capability);
}

/** Every /admin/marketplace route/action should call this first — per the
 * locked spec, unauthorized access is a 404, not a redirect, and this is
 * checked at both middleware AND route/action level, never UI-only. */
export function canAccessMarketplaceAdmin(role: MarketplaceRole | undefined | null): boolean {
  return role === "TTTAdmin" || role === "TTTManager";
}
