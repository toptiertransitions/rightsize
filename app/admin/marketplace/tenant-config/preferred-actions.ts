"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getSystemRole } from "@/lib/airtable";
import { hasCapability, type MarketplaceRole } from "@/lib/marketplace/permissions";
import { getAllPartners } from "@/lib/marketplace/data";
import { getBrandById, setBrandPreferredPartners, writeAudit } from "@/lib/brands/data";

type Result = { ok: true; ids: string[] } | { ok: false; error: string };
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

/** TTT Admin: tag (or untag) a marketplace partner as one of a community's preferred partners. */
export async function setPreferredPartnerAction(brandId: string, partnerId: string, preferred: boolean): Promise<Result> {
  if (!RECORD_ID.test(brandId) || !RECORD_ID.test(partnerId)) return { ok: false, error: "Not found." };
  try {
    const { userId } = await auth();
    if (!userId) return { ok: false, error: "Not signed in" };
    const role = await getSystemRole(userId).catch(() => null);
    if (!role || !hasCapability(role as MarketplaceRole, "managePreferredPartners")) return { ok: false, error: "Only TTT Admins can set preferred partners." };

    const brand = await getBrandById(brandId);
    if (!brand) return { ok: false, error: "That community wasn't found." };
    const partner = (await getAllPartners()).find((p) => p.id === partnerId);
    if (!partner) return { ok: false, error: "That partner wasn't found." };
    if (partner.id === brand.marketplacePartnerId) return { ok: false, error: "A community can't be its own preferred partner." };

    const ids = preferred
      ? [...new Set([...brand.preferredPartnerIds, partnerId])]
      : brand.preferredPartnerIds.filter((id) => id !== partnerId);
    const updated = await setBrandPreferredPartners(brandId, ids);

    const user = await currentUser().catch(() => null);
    await writeAudit([{
      actorClerkId: userId,
      actorName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || userId,
      entityType: "brand",
      entityId: brandId,
      field: "PreferredPartner",
      oldValue: preferred ? "" : partner.companyName,
      newValue: preferred ? partner.companyName : "",
    }]).catch(() => {});

    revalidatePath(`/admin/marketplace/tenant-config/${brandId}`);
    revalidatePath(`/admin/marketplace/partners/${partnerId}`);
    return { ok: true, ids: updated.preferredPartnerIds };
  } catch (e) {
    console.error("[preferred partners]", e);
    return { ok: false, error: "That didn't save. Please try again." };
  }
}
