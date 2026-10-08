"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isTTTAdmin } from "@/lib/config";
import { updateReferralContact } from "@/lib/airtable";
import { slugify } from "@/lib/utils";
import {
  getAllCategories,
  getAllPartners,
  getListingsForPartnerAdmin,
  createPartner,
  createListing,
  updatePartner,
} from "@/lib/marketplace/data";
import { ensurePartnerCrmLink } from "@/lib/marketplace/crmLink";
import { sendMarketplacePartnerInviteEmail } from "@/lib/admin-notifications";

type Result = { ok: true; reused: boolean } | { ok: false; error: string };

const inviteSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  contactName: z.string().trim().min(1, "Contact name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().optional(),
  categoryIds: z.array(z.string().min(1)).min(1, "Pick at least one category"),
});

export type InviteMarketplacePartnerInput = z.input<typeof inviteSchema>;

/** TTT Admin invites a business to the marketplace from /admin/partners:
 * creates (or reuses, by email) the marketplace Partner, a Draft listing per
 * chosen category, and the CRM company + contact the portal logs in
 * through, then emails them a sign-up link. */
export async function inviteMarketplacePartnerAction(input: InviteMarketplacePartnerInput): Promise<Result> {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) return { ok: false, error: "Only TTT Admins can invite partners." };

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const { companyName, contactName, email, phone, categoryIds } = parsed.data;

  try {
    const [partners, categories] = await Promise.all([getAllPartners(), getAllCategories()]);
    const chosen = categoryIds.map((id) => categories.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
    if (chosen.length === 0) return { ok: false, error: "Those categories weren't found." };

    let partner = partners.find((p) => p.email.toLowerCase() === email);
    const reused = !!partner;
    if (!partner) {
      const base = slugify(companyName) || "partner";
      const taken = new Set(partners.map((p) => p.slug));
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      partner = await createPartner({ companyName, slug, pocName: contactName, email, phone: phone || "", source: "Manual" });
    }

    const listings = await getListingsForPartnerAdmin(partner.id);
    const have = new Set(listings.map((l) => l.categoryId));
    let hasPrimary = listings.some((l) => l.isPrimary);
    for (const c of chosen) {
      if (have.has(c.id)) continue;
      await createListing({ partnerId: partner.id, categoryId: c.id, status: "Draft", isPrimary: !hasPrimary });
      hasPrimary = true;
    }

    const { referralContactId } = await ensurePartnerCrmLink(partner, {
      primaryCategoryLabel: chosen[0].label,
      contactNote: `Invited to the marketplace (${chosen.map((c) => c.label).join(", ")}) from /admin/partners.`,
    });

    // Only move forward in the lifecycle; never pull a Live partner back
    if (partner.lifecycleStatus === "Prospect") {
      await updatePartner(partner.id, { lifecycleStatus: "Invited" });
    }
    await updateReferralContact(referralContactId, { portalInviteSent: true }).catch(() => {});

    const user = await currentUser().catch(() => null);
    await sendMarketplacePartnerInviteEmail({
      inviterName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Top Tier Transitions",
      inviterEmail: user?.primaryEmailAddress?.emailAddress,
      partnerName: contactName,
      partnerEmail: email,
      companyName: partner.companyName,
      categoryLabels: chosen.map((c) => c.label),
    });

    revalidatePath("/admin/partners");
    revalidatePath("/admin/marketplace/partners");
    return { ok: true, reused };
  } catch (e) {
    console.error("inviteMarketplacePartnerAction failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Invite failed" };
  }
}
