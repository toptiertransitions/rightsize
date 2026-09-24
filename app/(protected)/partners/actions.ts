"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { z } from "zod";
import { getUserRoleForTenant, getSystemRole, getTenantById, updateTenant, upsertPartnerSelection, deletePartnerSelection, savePartnerRequestAnswers, getPartnerRequestsForTenant, addPartnerIntroRequest } from "@/lib/airtable";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/types";
import { CATEGORY_TO_SERVICE_INTEREST, nonTTTCategoryLabel } from "@/lib/partners/nonTTTCategories";
import { getPartnerQuestions, formatAnswersForEmail } from "@/lib/partners/questions";
import { getPartnerDirectory } from "@/lib/partners/queries";
import { MAX_INTRO_REQUESTS_PER_CATEGORY } from "@/lib/partners/scoring";
import { logPartnerMatchEvent } from "@/lib/partners/analytics";
import { buildPartnerIntroConfirmationEmail, buildPartnerIntroRequestNotificationEmail } from "@/lib/email";
import { sendMoveManagementCrossSellNotification } from "@/lib/admin-notifications";

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

// Builds a per-category zod schema from that category's question set, so an
// answer is only accepted if it's a known question id with a value that
// matches the question's own type (and, for select/chips questions, one of
// its declared options) — .strict() rejects any other key outright.
function buildAnswersSchema(category: PartnerCategory) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const q of getPartnerQuestions(category)) {
    if (q.type === "single-select") {
      const values = q.options?.map((o) => o.value) ?? [];
      shape[q.id] = values.length ? z.enum(values as [string, ...string[]]).optional() : z.never().optional();
    } else if (q.type === "chips-multi") {
      const values = q.options?.map((o) => o.value) ?? [];
      shape[q.id] = values.length ? z.array(z.enum(values as [string, ...string[]])).max(10).optional() : z.never().optional();
    } else {
      shape[q.id] = z.string().max(500).optional();
    }
  }
  return z.object(shape).strict();
}

export async function savePartnerRequestAnswersAction(
  tenantId: string,
  category: PartnerCategory,
  patchAnswers: Record<string, string | string[]>
): Promise<ActionResult> {
  const base = z.object({ tenantId: tenantIdSchema, category: categorySchema }).safeParse({ tenantId, category });
  if (!base.success) return { ok: false, error: "That request wasn't valid — please try again." };

  const parsedAnswers = buildAnswersSchema(category).safeParse(patchAnswers);
  if (!parsedAnswers.success) return { ok: false, error: "That answer wasn't valid — please try again." };

  const userId = await assertCanEdit(tenantId);
  if (!userId) return { ok: false, error: "You don't have permission to update this project's partner requests." };

  try {
    const updated = await withRetry(() =>
      savePartnerRequestAnswers({
        tenantId,
        category,
        patchAnswers: parsedAnswers.data as Record<string, string | string[]>,
        createdBy: userId,
      })
    );

    // Cross-sell signal: they told the Mover survey they need packing help
    // too (not just the move), which is effectively Full Move Management —
    // but they haven't selected that service interest. Best-effort, never
    // blocks the save the user is waiting on.
    if (category === "Mover" && parsedAnswers.data.packingHelp === "packing_and_move") {
      getTenantById(tenantId)
        .then(async (tenant) => {
          if (!tenant || (tenant.serviceInterests ?? []).includes("full_service")) return;
          const clerkUser = await currentUser().catch(() => null);
          const clientName = clerkUser?.firstName
            ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ")
            : tenant.name;
          await sendMoveManagementCrossSellNotification({
            clientName,
            projectName: tenant.name,
            tenantId,
            answers: formatAnswersForEmail("Mover", updated.answers),
          });
        })
        .catch((e) => console.error("Move Management cross-sell notification failed:", e));
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save your answer — please try again." };
  }
}

// Consent-gated: the client explicitly confirms in the UI before this is
// called (see PartnerMatchResults.tsx's two-step confirm). Capped at
// MAX_INTRO_REQUESTS_PER_CATEGORY per category, enforced both here and
// again inside addPartnerIntroRequest itself.
export async function requestPartnerIntroAction(
  tenantId: string,
  category: PartnerCategory,
  partnerId: string
): Promise<ActionResult> {
  const input = z.object({ tenantId: tenantIdSchema, category: categorySchema, partnerId: partnerIdSchema }).safeParse({ tenantId, category, partnerId });
  if (!input.success) return { ok: false, error: "That request wasn't valid — please try again." };

  const userId = await assertCanEdit(tenantId);
  if (!userId) return { ok: false, error: "You don't have permission to request an introduction for this project." };

  try {
    const [tenant, directory, requests, user] = await Promise.all([
      getTenantById(tenantId),
      getPartnerDirectory(),
      getPartnerRequestsForTenant(tenantId),
      currentUser().catch(() => null),
    ]);
    if (!tenant) return { ok: false, error: "Project not found." };

    const partner = directory.find((p) => p.id === partnerId && p.category === category);
    if (!partner) return { ok: false, error: "That partner isn't available anymore." };

    const request = requests.find((r) => r.category === category);
    if (request && request.introRequests.length >= MAX_INTRO_REQUESTS_PER_CATEGORY && !request.introRequests.some((r) => r.partnerId === partnerId)) {
      return { ok: false, error: `You've already requested an intro for the maximum of ${MAX_INTRO_REQUESTS_PER_CATEGORY} partners in this category.` };
    }

    await withRetry(() => addPartnerIntroRequest(tenantId, category, partnerId, MAX_INTRO_REQUESTS_PER_CATEGORY));

    const clientEmail = user?.emailAddresses?.[0]?.emailAddress || tenant.clientEmail;
    const clientName = user?.firstName || tenant.name;
    const categoryLabel = nonTTTCategoryLabel(category);

    // Email delivery is best-effort — the intro request is already saved
    // above, so a Resend failure here never undoes it.
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);
      if (clientEmail) {
        resend.emails
          .send({
            from: "Rightsize Alerts <notifications@toptiertransitions.com>",
            to: clientEmail,
            subject: `You're connected with ${partner.vendorName}`,
            html: buildPartnerIntroConfirmationEmail({ clientName, partnerName: partner.vendorName, category: categoryLabel }),
          })
          .catch((e) => console.error("Partner intro confirmation email failed:", e));
      }
      if (partner.email) {
        resend.emails
          .send({
            from: "Rightsize Alerts <notifications@toptiertransitions.com>",
            to: partner.email,
            subject: `New client introduction — ${categoryLabel}`,
            html: buildPartnerIntroRequestNotificationEmail({
              vendorName: partner.vendorName,
              clientName,
              category: categoryLabel,
              clientEmail: clientEmail || undefined,
              clientPhone: tenant.clientPhone,
              answers: formatAnswersForEmail(category, request?.answers ?? {}),
            }),
          })
          .catch((e) => console.error("Partner intro notification email failed:", e));
      }
    }

    logPartnerMatchEvent("intro_requested", { tenantId, category, partnerId });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't request that introduction — please try again." };
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
