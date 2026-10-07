"use server";

import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getPartnerSelectionsForTenant } from "@/lib/airtable";
import { getPartnerDirectory } from "@/lib/partners/queries";
import { resolveCrmReferralForTenant, toReferralOption, type CrmReferral } from "@/lib/partners/referral";
import type { ReferralPartnerOption } from "@/lib/partners/referralShared";
import type { PartnerCategory } from "@/lib/types";

export interface InviteReferralContext {
  crm: CrmReferral | null;
  /** Every live marketplace listing, for the search box. Move Manager is
   * excluded — on a TTT project Top Tier is always the move manager. */
  options: ReferralPartnerOption[];
  /** Categories already referral-locked on this project, with who's set. */
  existing: { category: PartnerCategory; name: string }[];
}

// Loaded when TTT staff choose "Yes" to attaching a referral partner in the
// Add Client User modal.
export async function getInviteReferralContextAction(
  tenantId: string
): Promise<{ ok: true; data: InviteReferralContext } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole) return { ok: false, error: "Forbidden" };
  if (typeof tenantId !== "string" || !tenantId) return { ok: false, error: "Missing project." };

  try {
    const directory = (await getPartnerDirectory()).filter((p) => p.category !== "Move Manager");
    const [crm, selections] = await Promise.all([
      resolveCrmReferralForTenant(tenantId, directory),
      getPartnerSelectionsForTenant(tenantId).catch(() => []),
    ]);
    const nameById = new Map(directory.map((p) => [p.id, p.vendorName]));
    return {
      ok: true,
      data: {
        crm,
        options: directory.map(toReferralOption).sort((a, b) => a.name.localeCompare(b.name)),
        existing: selections
          .filter((s) => s.referralLocked)
          .map((s) => ({ category: s.category, name: s.referralName || nameById.get(s.partnerId) || "Referral partner" })),
      },
    };
  } catch {
    return { ok: false, error: "Couldn't load referral partners. Please try again." };
  }
}
