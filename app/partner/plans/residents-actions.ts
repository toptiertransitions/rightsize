"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getPartnerAccount } from "@/lib/marketplace/partnerAccount";
import { getChecklistItems, upsertChecklistState } from "@/lib/checklists/data";
import { getBrandsForPartner, isResidentOf } from "@/lib/checklists/service";
import { removeChecklistItem, reorderChecklist, saveChecklistItem, type ItemInput } from "@/lib/checklists/template";
import type { ChecklistItem } from "@/lib/checklists/shared";
import { cancelResidentInvite, createAndSendResidentInvite, resendResidentInvite } from "@/lib/brands/residentInvites";
import { residentInviteSchema, type ResidentInviteInput, type ResidentInviteResult } from "@/lib/brands/residentInviteShared";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

async function account() {
  const { userId } = await auth();
  if (!userId) return null;
  const acct = await getPartnerAccount(userId).catch(() => null);
  if (!acct) return null;
  const brands = await getBrandsForPartner(acct.partner.id);
  return { acct, brands };
}

/** Any partner user at the community marks a resident's task done or not done. */
export async function setResidentChecklistItemAction(tenantId: string, itemId: string, done: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!RECORD_ID.test(tenantId) || !RECORD_ID.test(itemId)) return { ok: false, error: "Not found." };
  const ctx = await account();
  if (!ctx || ctx.brands.length === 0) return { ok: false, error: "You don't have access to this resident." };
  try {
    const brand = await isResidentOf(tenantId, ctx.brands);
    if (!brand) return { ok: false, error: "You don't have access to this resident." };
    const items = await getChecklistItems([brand.id]);
    if (!items.some((i) => i.id === itemId)) return { ok: false, error: "That task wasn't found." };
    await upsertChecklistState({
      tenantId,
      itemId,
      brandId: brand.id,
      done,
      actorName: ctx.acct.membership.name || ctx.acct.partner.companyName,
      actorRole: "Community",
    });
    revalidatePath("/partner/plans");
    return { ok: true };
  } catch (e) {
    console.error("[resident checklist]", e);
    return { ok: false, error: "That didn't save. Please try again." };
  }
}

type EditResult = { ok: true; items: ChecklistItem[] } | { ok: false; error: string };

// Only the community's account owner edits the task list
async function ownerEdit(brandId: string, fn: (actorName: string) => Promise<ChecklistItem[]>): Promise<EditResult> {
  const ctx = await account();
  if (!ctx) return { ok: false, error: "You don't have access." };
  if (ctx.acct.membership.role !== "Primary") return { ok: false, error: "Only your account owner can change the checklist." };
  if (!ctx.brands.some((b) => b.id === brandId)) return { ok: false, error: "You don't have access to this checklist." };
  try {
    const items = await fn(ctx.acct.membership.name || ctx.acct.partner.companyName);
    revalidatePath("/partner/plans");
    return { ok: true, items };
  } catch (e) {
    console.error("[resident checklist edit]", e);
    return { ok: false, error: e instanceof Error && !e.message.includes("failed:") ? e.message.split("\n")[0] : "That didn't save. Please try again." };
  }
}

export async function partnerSaveChecklistItemAction(brandId: string, input: ItemInput) {
  return ownerEdit(brandId, (actor) => saveChecklistItem(brandId, input, actor));
}
export async function partnerRemoveChecklistItemAction(brandId: string, itemId: string) {
  return ownerEdit(brandId, (actor) => removeChecklistItem(brandId, itemId, actor));
}
export async function partnerReorderChecklistAction(brandId: string, ids: string[]) {
  return ownerEdit(brandId, () => reorderChecklist(brandId, ids));
}

// ─── Resident invites ────────────────────────────────────────────────────────
// Partner users can email residents only when their community has an Active
// co-branded tenant; otherwise there's no invite at all.
async function inviteContext(brandId: string) {
  const ctx = await account();
  if (!ctx) throw new Error("You don't have access.");
  const brand = ctx.brands.find((b) => b.id === brandId && b.status === "Active");
  if (!brand) throw new Error("Inviting residents isn't available for your community.");
  const name = ctx.acct.membership.name || ctx.acct.partner.companyName;
  return { brand, inviter: { name, email: ctx.acct.membership.email || undefined, clerkUserId: ctx.acct.membership.clerkUserId ?? "", side: "Community" as const } };
}

function inviteFail(e: unknown): ResidentInviteResult {
  console.error("[resident invite]", e);
  return { ok: false, error: e instanceof Error ? e.message : "That didn't send. Please try again." };
}

export async function partnerInviteResidentAction(brandId: string, input: ResidentInviteInput): Promise<ResidentInviteResult> {
  try {
    const parsed = residentInviteSchema.parse(input);
    const { brand, inviter } = await inviteContext(brandId);
    await createAndSendResidentInvite({ brand, ...parsed, inviter });
    revalidatePath("/partner/plans");
    return { ok: true };
  } catch (e) {
    return inviteFail(e);
  }
}

export async function partnerResendResidentInviteAction(brandId: string, inviteId: string): Promise<ResidentInviteResult> {
  try {
    const { brand, inviter } = await inviteContext(brandId);
    await resendResidentInvite(brand, inviteId, inviter);
    revalidatePath("/partner/plans");
    return { ok: true };
  } catch (e) {
    return inviteFail(e);
  }
}

export async function partnerCancelResidentInviteAction(brandId: string, inviteId: string): Promise<ResidentInviteResult> {
  try {
    const { brand } = await inviteContext(brandId);
    await cancelResidentInvite(brand, inviteId);
    revalidatePath("/partner/plans");
    return { ok: true };
  } catch (e) {
    return inviteFail(e);
  }
}
