"use server";

import { getIntroductionEventByToken, updateIntroductionEventStatus } from "@/lib/marketplace/data";
import type { MarketplaceIntroductionStatus } from "@/lib/marketplace/types";

type ActionResult = { ok: true } | { ok: false; error: string };

// Public — no auth. The token itself is the only credential (single-use in
// practice: it's emailed to one specific partner about one specific lead),
// matching the no-login-required design decision for marketplace partners.
export async function updateLeadStatusAction(token: string, status: MarketplaceIntroductionStatus): Promise<ActionResult> {
  try {
    const event = await getIntroductionEventByToken(token);
    if (!event) return { ok: false, error: "This link isn't valid." };
    await updateIntroductionEventStatus(event.id, status);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
