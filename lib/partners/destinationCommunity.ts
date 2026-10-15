import type { PartnerProfile } from "@/lib/partners/types";

// Lowercase letters/digits only, without a leading "the" — "The Woodlands"
// and "Woodlands" are the same community.
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^the/, "");

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// The community name is typed by hand on /plan, so a one- or two-letter typo
// ("Centerfield" for "Canterfield") must still match. Only a clear winner
// counts: the name must be long enough, the next-closest community must be
// at least 2 edits further away (so "Brookdale Edlin" never guesses between
// Brookdale Elgin and Edgin), and when the project has a destination state
// the partner must be in it.
const MIN_FUZZY_LENGTH = 10;
const MAX_TYPO_DISTANCE = 2;

/**
 * The marketplace Community partner for the senior community a project is
 * moving into, or null. Matches the project's linked community record first
 * (destinationCommunity -> the partner's LocalVendors link), then the
 * community name (from Plan or the CRM opportunity) against partner names —
 * exactly, then allowing a small typo.
 */
export function findDestinationCommunityPartner(
  tenant: { destinationCommunity?: string; destState?: string },
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

  const exact = communities.find((p) => normalize(p.vendorName) === name);
  if (exact || name.length < MIN_FUZZY_LENGTH) return exact ?? null;

  const state = tenant.destState?.trim().toUpperCase();
  let best: PartnerProfile | null = null;
  let bestDistance = Infinity;
  let runnerUpDistance = Infinity;
  for (const p of communities) {
    if (state && p.state && p.state.trim().toUpperCase() !== state) continue;
    const d = editDistance(name, normalize(p.vendorName));
    if (d < bestDistance) { runnerUpDistance = bestDistance; best = p; bestDistance = d; }
    else if (d < runnerUpDistance) runnerUpDistance = d;
  }
  return best && bestDistance <= MAX_TYPO_DISTANCE && runnerUpDistance - bestDistance >= 2 ? best : null;
}
