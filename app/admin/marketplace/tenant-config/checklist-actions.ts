"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getSystemRole } from "@/lib/airtable";
import { canAccessMarketplaceAdmin } from "@/lib/marketplace/permissions";
import { getBrandById } from "@/lib/brands/data";
import { removeChecklistItem, reorderChecklist, saveChecklistItem, type ItemInput } from "@/lib/checklists/template";
import type { ChecklistItem } from "@/lib/checklists/shared";

type Result = { ok: true; items: ChecklistItem[] } | { ok: false; error: string };

async function guard(brandId: string, fn: (actorName: string) => Promise<ChecklistItem[]>): Promise<Result> {
  try {
    const { userId } = await auth();
    if (!userId) return { ok: false, error: "Not signed in" };
    const role = await getSystemRole(userId).catch(() => null);
    if (!canAccessMarketplaceAdmin(role)) return { ok: false, error: "Not permitted" };
    if (!(await getBrandById(brandId))) return { ok: false, error: "That community wasn't found." };
    const user = await currentUser().catch(() => null);
    const actorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Top Tier Transitions";
    const items = await fn(actorName);
    revalidatePath(`/admin/marketplace/tenant-config/${brandId}`);
    return { ok: true, items };
  } catch (e) {
    console.error("[checklist admin]", e);
    return { ok: false, error: e instanceof Error && !e.message.includes("failed:") ? e.message.split("\n")[0] : "That didn't save. Please try again." };
  }
}

export async function adminSaveChecklistItemAction(brandId: string, input: ItemInput) {
  return guard(brandId, (actor) => saveChecklistItem(brandId, input, actor));
}
export async function adminRemoveChecklistItemAction(brandId: string, itemId: string) {
  return guard(brandId, (actor) => removeChecklistItem(brandId, itemId, actor));
}
export async function adminReorderChecklistAction(brandId: string, ids: string[]) {
  return guard(brandId, () => reorderChecklist(brandId, ids));
}
