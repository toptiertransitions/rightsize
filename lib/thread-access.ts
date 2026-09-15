/**
 * Communication Hub — Phase A access control.
 *
 * "Assigned crew" reuses the exact same signal the Plan page already uses
 * to gate shift visibility for TTTStaff: appearing as a helper (by email)
 * on a plan entry for that project. See PRD-ADDENDUM-2026-09-15.md.
 *
 * TTTSales is out of scope for the comms hub — the PRD only names crew,
 * Team Lead, and Ops (Manager/Admin) as participants.
 */
import type { SystemRole } from "./types";
import { getStaffMember, getTenants, getPlanEntriesForTenant, getPlanEntriesForDateRange } from "./airtable";
import { BROADCAST_TENANT_ID } from "./airtable-messages";

const INTERNAL_ROLES: SystemRole[] = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"];

export function isCommsHubRole(sysRole: SystemRole | null): boolean {
  return !!sysRole && INTERNAL_ROLES.includes(sysRole);
}

/** Whether this user can view (and post in) a specific project's thread. */
export async function canAccessProjectThread(
  clerkUserId: string,
  sysRole: SystemRole | null,
  tenantId: string
): Promise<boolean> {
  if (!isCommsHubRole(sysRole)) return false;
  if (sysRole === "TTTManager" || sysRole === "TTTAdmin") return true;

  const tenants = await getTenants().catch(() => []);
  const tenant = tenants.find(t => t.id === tenantId);
  if (!tenant) return false;
  if (tenant.teamLeadClerkId === clerkUserId) return true;

  const member = await getStaffMember(clerkUserId).catch(() => null);
  if (!member?.email) return false;
  const emailLower = member.email.toLowerCase();
  const entries = await getPlanEntriesForTenant(tenantId).catch(() => []);
  return entries.some(e => e.helpers?.some(h => h.email.toLowerCase() === emailLower));
}

/**
 * Every tenantId (plus the broadcast sentinel) this user's inbox should
 * aggregate. Crew/helper detection scans a bounded recent+upcoming window
 * rather than all-time — matches the existing pragmatic precedent in this
 * codebase (getPlanEntriesForTodayByEmail) of bounded, in-memory filtering
 * over an unbounded system-wide scan.
 */
export async function getAccessibleTenantIds(
  clerkUserId: string,
  sysRole: SystemRole | null
): Promise<string[]> {
  if (!isCommsHubRole(sysRole)) return [];

  const allTenants = await getTenants().catch(() => []);
  const activeTenants = allTenants.filter(t => !t.isArchived);

  if (sysRole === "TTTManager" || sysRole === "TTTAdmin") {
    return [BROADCAST_TENANT_ID, ...activeTenants.map(t => t.id)];
  }

  const teamLedIds = activeTenants
    .filter(t => t.teamLeadClerkId === clerkUserId)
    .map(t => t.id);

  const member = await getStaffMember(clerkUserId).catch(() => null);
  let helperIds: string[] = [];
  if (member?.email) {
    const emailLower = member.email.toLowerCase();
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 120);
    const to = new Date(today); to.setDate(to.getDate() + 60);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const entries = await getPlanEntriesForDateRange(fmt(from), fmt(to)).catch(() => []);
    const activeIds = new Set(activeTenants.map(t => t.id));
    helperIds = Array.from(new Set(
      entries
        .filter(e => activeIds.has(e.tenantId) && e.helpers?.some(h => h.email.toLowerCase() === emailLower))
        .map(e => e.tenantId)
    ));
  }

  return Array.from(new Set([BROADCAST_TENANT_ID, ...teamLedIds, ...helperIds]));
}
