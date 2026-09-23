"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getUserRoleForTenant, getSystemRole, getTenantById, updateTenant, upsertPartnerSelection, deletePartnerSelection } from "@/lib/airtable";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/types";
import { CATEGORY_TO_SERVICE_INTEREST } from "@/lib/partners/nonTTTCategories";

type ActionResult = { ok: true } | { ok: false; error: string };

const CLIENT_EDIT_ROLES = ["Owner", "Collaborator"];
const STAFF_EDIT_ROLES = ["TTTTeamLead", "TTTManager", "TTTAdmin"];

const tenantIdSchema = z.string().min(1);
const categorySchema = z.enum(PARTNER_CATEGORIES);
const partnerIdSchema = z.string().min(1);

// Airtable has no shared retry/backoff helper (see lib/qbo.ts's qboFetch for
// the equivalent QBO pattern this mirrors). Scoped locally here rather than
// added to lib/airtable.ts so it only affects this new feature's writes.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

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
  const input = z.object({ tenantId: tenantIdSchema, category: categorySchema, partnerId: partnerIdSchema }).safeParse({ tenantId, category, partnerId });
  if (!input.success) return { ok: false, error: "That selection wasn't valid — please try again." };

  const userId = await assertCanEdit(tenantId);
  if (!userId) return { ok: false, error: "You don't have permission to change partner selections for this project." };

  try {
    await withRetry(() => upsertPartnerSelection({ tenantId, category, partnerId, selectedBy: userId }));
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save your selection — please try again." };
  }
}

export async function deselectPartnerAction(
  tenantId: string,
  category: PartnerCategory
): Promise<ActionResult> {
  const input = z.object({ tenantId: tenantIdSchema, category: categorySchema }).safeParse({ tenantId, category });
  if (!input.success) return { ok: false, error: "That request wasn't valid — please try again." };

  const userId = await assertCanEdit(tenantId);
  if (!userId) return { ok: false, error: "You don't have permission to change partner selections for this project." };

  try {
    await withRetry(() => deletePartnerSelection(tenantId, category));
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't remove your selection — please try again." };
  }
}

// NonTTTClient-only: greyed <-> active category toggling. Both just add or
// remove one key from the Project's ServiceInterests — idempotent by
// construction (Airtable multi-select write is a full replace, so re-adding
// an already-present key or re-removing an already-absent one is a no-op).
export async function activateServiceInterestAction(
  tenantId: string,
  category: PartnerCategory
): Promise<ActionResult> {
  const input = z.object({ tenantId: tenantIdSchema, category: categorySchema }).safeParse({ tenantId, category });
  if (!input.success) return { ok: false, error: "That request wasn't valid — please try again." };

  const userId = await assertCanEdit(tenantId);
  if (!userId) return { ok: false, error: "You don't have permission to change this project." };

  try {
    const tenant = await withRetry(() => getTenantById(tenantId));
    if (!tenant) return { ok: false, error: "Project not found." };
    const interest = CATEGORY_TO_SERVICE_INTEREST[category];
    const current = tenant.serviceInterests ?? [];
    if (!current.includes(interest)) {
      await withRetry(() => updateTenant(tenantId, { serviceInterests: [...current, interest], appOnlyIntent: false }));
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't update this. Please try again." };
  }
}

export async function deactivateServiceInterestAction(
  tenantId: string,
  category: PartnerCategory
): Promise<ActionResult> {
  const input = z.object({ tenantId: tenantIdSchema, category: categorySchema }).safeParse({ tenantId, category });
  if (!input.success) return { ok: false, error: "That request wasn't valid — please try again." };

  const userId = await assertCanEdit(tenantId);
  if (!userId) return { ok: false, error: "You don't have permission to change this project." };

  try {
    const tenant = await withRetry(() => getTenantById(tenantId));
    if (!tenant) return { ok: false, error: "Project not found." };
    const interest = CATEGORY_TO_SERVICE_INTEREST[category];
    const current = tenant.serviceInterests ?? [];
    if (current.includes(interest)) {
      await withRetry(() => updateTenant(tenantId, { serviceInterests: current.filter((i) => i !== interest) }));
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't update this. Please try again." };
  }
}
