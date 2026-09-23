"use server";

import { auth } from "@clerk/nextjs/server";
import { getUserRoleForTenant, getSystemRole, upsertPartnerSelection, deletePartnerSelection } from "@/lib/airtable";
import type { PartnerCategory } from "@/lib/types";

type ActionResult = { ok: true } | { ok: false; error: string };

const CLIENT_EDIT_ROLES = ["Owner", "Collaborator"];
const STAFF_EDIT_ROLES = ["TTTTeamLead", "TTTManager", "TTTAdmin"];

async function assertCanEdit(tenantId: string): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole && STAFF_EDIT_ROLES.includes(sysRole)) return userId;

  const tenantRole = await getUserRoleForTenant(userId, tenantId).catch(() => null);
  if (tenantRole && CLIENT_EDIT_ROLES.includes(tenantRole)) return userId;

  return null;
}

export async function selectPartnerAction(
  tenantId: string,
  category: PartnerCategory,
  partnerId: string
): Promise<ActionResult> {
  const userId = await assertCanEdit(tenantId);
  if (!userId) return { ok: false, error: "You don't have permission to change partner selections for this project." };

  try {
    await upsertPartnerSelection({ tenantId, category, partnerId, selectedBy: userId });
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save your selection — please try again." };
  }
}

export async function deselectPartnerAction(
  tenantId: string,
  category: PartnerCategory
): Promise<ActionResult> {
  const userId = await assertCanEdit(tenantId);
  if (!userId) return { ok: false, error: "You don't have permission to change partner selections for this project." };

  try {
    await deletePartnerSelection(tenantId, category);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't remove your selection — please try again." };
  }
}
