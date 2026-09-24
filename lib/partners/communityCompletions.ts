import { unstable_cache } from "next/cache";
import { getAllPartnerCommunityCompletions, getTenants, getReferralCompanyById } from "@/lib/airtable";
import type { PartnerCategory } from "@/lib/types";

/** `${communityKey}::${category}::${partnerId}` -> count */
export function communityCompletionKey(communityKey: string, category: PartnerCategory, partnerId: string): string {
  return `${communityKey}::${category}::${partnerId}`;
}

/**
 * Community-tagged completion counts across all partners, keyed by
 * communityCompletionKey(). Only counts completions on projects that are
 * archived and not a lost deal — mirrors the "completed" definition used by
 * lib/partners/queries.ts's projectsCompleted. Cached (plain object, not a
 * Map — unstable_cache serializes its return value); tagged
 * "partner-community-completions" so /admin/local-vendors can invalidate it
 * on save.
 */
export const getCommunityCompletionCounts = unstable_cache(
  async function _getCommunityCompletionCounts(): Promise<Record<string, number>> {
    const [completions, tenants] = await Promise.all([
      getAllPartnerCommunityCompletions(),
      getTenants(),
    ]);
    const completedTenantIds = new Set(tenants.filter((t) => t.isArchived && !t.isLostDeal).map((t) => t.id));
    const counts: Record<string, number> = {};
    for (const c of completions) {
      if (!completedTenantIds.has(c.tenantId)) continue;
      const communityKey = c.communityId || c.communityName.trim().toLowerCase();
      if (!communityKey) continue;
      const key = communityCompletionKey(communityKey, c.category, c.partnerId);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  },
  ["partner-community-completions"],
  { revalidate: 300, tags: ["partner-community-completions"] }
);

/**
 * Best-effort resolution of a project's destination community, in priority
 * order: the linked CRM Community record, then the free-text "other"
 * community, then the legacy seniorCommunityName field. Returns null when
 * none of these are set (most non-senior-living projects).
 */
export async function resolveTenantCommunity(tenant: {
  destinationCommunity?: string;
  destinationCommunityOther?: string;
  seniorCommunityName?: string;
}): Promise<{ communityKey: string; communityName: string } | null> {
  if (tenant.destinationCommunity) {
    const c = await getReferralCompanyById(tenant.destinationCommunity).catch(() => null);
    if (c) return { communityKey: tenant.destinationCommunity, communityName: c.name };
  }
  const name = (tenant.destinationCommunityOther || tenant.seniorCommunityName || "").trim();
  if (name) return { communityKey: name.toLowerCase(), communityName: name };
  return null;
}
