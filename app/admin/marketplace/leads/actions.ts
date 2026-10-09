"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getSystemRole } from "@/lib/airtable";
import { canAccessMarketplaceAdmin } from "@/lib/marketplace/permissions";
import { releaseLead } from "@/lib/marketplace/leads";

type Result = { ok: true; emailed: boolean; pushed: boolean } | { ok: false; error: string };

// Same gate as the rest of /admin/marketplace, re-checked here because a
// server action is its own entry point.
export async function releaseLeadAction(eventId: string): Promise<Result> {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Not signed in");
    const role = await getSystemRole(userId).catch(() => null);
    if (!canAccessMarketplaceAdmin(role)) throw new Error("Not permitted");
    const user = await currentUser().catch(() => null);
    const actor = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.primaryEmailAddress?.emailAddress || userId;
    const r = await releaseLead(eventId, actor);
    revalidatePath("/admin/marketplace/leads");
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
