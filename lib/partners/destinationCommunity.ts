import type { PartnerProfile } from "@/lib/partners/types";

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The marketplace Community partner for the senior community a project is
 * moving into, or null. Matches the project's linked community record first
 * (destinationCommunity -> the partner's LocalVendors link), then the
 * community name (from Plan or the CRM opportunity) against partner names.
 */
export function findDestinationCommunityPartner(
  tenant: { destinationCommunity?: string },
  community: { communityName: string } | null,
  directory: PartnerProfile[]
): PartnerProfile | null {
  const communities = directory.filter((p) => p.category === "Community");
  if (tenant.destinationCommunity) {
    const byLink = communities.find((p) => p.localVendorId === tenant.destinationCommunity);
    if (byLink) return byLink;
  }
  const name = community ? normalize(community.communityName) : "";
  if (!name) return null;
  return communities.find((p) => normalize(p.vendorName) === name) ?? null;
}
