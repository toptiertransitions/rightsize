"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getSystemRole, getUserRoleForTenant } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { upsertChecklistState } from "@/lib/checklists/data";
import { getResidentChecklist } from "@/lib/checklists/service";
import type { ChecklistActorRole } from "@/lib/checklists/shared";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

/** A resident (client user) or Top Tier lead/manager/admin checks a community task off, or un-checks it. */
export async function setCommunityChecklistItemAction(tenantId: string, itemId: string, done: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!RECORD_ID.test(tenantId) || !RECORD_ID.test(itemId)) return { ok: false, error: "Not found." };
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const [tenantRole, sysRole] = await Promise.all([
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getSystemRole(userId).catch(() => null),
  ]);
  let actorRole: ChecklistActorRole | null = null;
  if (sysRole === "TTTTeamLead" || sysRole === "TTTManager" || sysRole === "TTTAdmin" || isTTTAdmin(userId)) actorRole = "Top Tier";
  else if (tenantRole === "Owner" || tenantRole === "Collaborator") actorRole = "Resident";
  if (!actorRole) return { ok: false, error: "You can't update this checklist." };

  try {
    const checklist = await getResidentChecklist(tenantId);
    if (!checklist || !checklist.rows.some((r) => r.item.id === itemId)) return { ok: false, error: "That task wasn't found." };
    const user = await currentUser().catch(() => null);
    const actorName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.primaryEmailAddress?.emailAddress || "Someone";
    await upsertChecklistState({ tenantId, itemId, brandId: checklist.brand.id, done, actorName, actorRole });
    revalidatePath("/plan");
    return { ok: true };
  } catch (e) {
    console.error("[community checklist]", e);
    return { ok: false, error: "That didn't save. Please try again." };
  }
}
