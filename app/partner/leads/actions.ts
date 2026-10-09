"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getPartnerAccount } from "@/lib/marketplace/partnerAccount";
import { getIntroductionEventById, updateIntroductionEventStatus } from "@/lib/marketplace/data";
import { PARTNER_LEAD_STATUSES, type PartnerLeadStatus } from "@/lib/marketplace/leads";

// A partner updates the status of one of their own released leads.
export async function updateMyLeadStatusAction(eventId: string, status: PartnerLeadStatus): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!PARTNER_LEAD_STATUSES.includes(status)) throw new Error("Pick a status");
    const { userId } = await auth();
    if (!userId) throw new Error("Not signed in");
    const account = await getPartnerAccount(userId);
    const event = await getIntroductionEventById(eventId);
    if (!account || !event || event.partnerId !== account.partner.id || !event.releasedAt) throw new Error("Lead not found");
    if (event.status === "Billed") throw new Error("This lead is closed");
    await updateIntroductionEventStatus(event.id, status);
    revalidatePath("/partner/leads");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
