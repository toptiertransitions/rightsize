import { unstable_cache } from "next/cache";
import { getPartnerSelectionsForTenant } from "@/lib/airtable";
import { getPartnerDirectoryFromNewModel } from "@/lib/marketplace/legacyAdapter";
import type { PartnerCategory } from "./types";

/**
 * The full computed Partners marketplace directory — Live listings from the
 * new Partner/MarketplaceListing model (lib/marketplace/), reshaped into
 * this file's original PartnerProfile shape so every existing consumer
 * (match.ts, scoring.ts, questions.ts, every /partners component) keeps
 * working unchanged — see lib/marketplace/legacyAdapter.ts for the mapping
 * and Phase 4 of the marketplace rebuild for why. Cached for 5 minutes;
 * tagged "partners-directory" so it can be invalidated on demand (see
 * app/api/tenants/route.ts, which revalidates this tag when a project's
 * archived/lost status changes).
 */
export const getPartnerDirectory = unstable_cache(
  getPartnerDirectoryFromNewModel,
  ["partners-directory"],
  { revalidate: 300, tags: ["partners-directory"] }
);

/** Category -> selected partner id, for hydrating the Selected Partners tray on load. */
export async function getSelectionsMapForTenant(
  tenantId: string
): Promise<Partial<Record<PartnerCategory, string>>> {
  const selections = await getPartnerSelectionsForTenant(tenantId);
  const map: Partial<Record<PartnerCategory, string>> = {};
  for (const s of selections) map[s.category] = s.partnerId;
  return map;
}
