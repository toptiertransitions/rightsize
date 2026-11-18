"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getSystemRole } from "@/lib/airtable";
import { getBrandById, writeAudit } from "@/lib/brands/data";
import { setBrandReferralFeesAllowed } from "@/lib/partners/realtorReferralBrands";

type Result = { ok: true; allowed: boolean } | { ok: false; error: string };
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

/** TTT Admin: whether this community's co-branded clients see the realtor
 * referral disclosure (and have acknowledgments tracked). Off by default. */
export async function setRealtorReferralFeesAction(brandId: string, allowed: boolean): Promise<Result> {
  if (!RECORD_ID.test(brandId)) return { ok: false, error: "Not found." };
  try {
    const { userId } = await auth();
    if (!userId) return { ok: false, error: "Not signed in" };
    if ((await getSystemRole(userId).catch(() => null)) !== "TTTAdmin") return { ok: false, error: "Only TTT Admins can change this." };
    const brand = await getBrandById(brandId);
    if (!brand) return { ok: false, error: "That community wasn't found." };

    const user = await currentUser().catch(() => null);
    const actorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || userId;
    await setBrandReferralFeesAllowed(brandId, allowed, brand.displayName, actorName);
    await writeAudit([{
      actorClerkId: userId, actorName, entityType: "brand", entityId: brandId,
      field: "RealtorReferralFees", oldValue: allowed ? "Off" : "On", newValue: allowed ? "On" : "Off",
    }]).catch(() => {});

    revalidatePath(`/admin/marketplace/tenant-config/${brandId}`);
    return { ok: true, allowed };
  } catch (e) {
    console.error("[realtor referral fees]", e);
    return { ok: false, error: "That didn't save. Please try again." };
  }
}
