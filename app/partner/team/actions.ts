"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPartnerAccount } from "@/lib/marketplace/partnerAccount";
import {
  inviteTeamMember,
  leaveTeam,
  makePrimary,
  removeTeamMember,
  resendInvite,
  revokeInvite,
  setNotifyLeads,
  type Actor,
} from "@/lib/marketplace/team";

type Result = { ok: true } | { ok: false; error: string };

// The company always comes from the signed-in person's own account, never
// from the browser; team.ts checks every target belongs to it.
async function context(): Promise<{ actor: Actor; partnerId: string } | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const account = await getPartnerAccount(userId).catch(() => null);
  if (!account) return null;
  const user = await currentUser().catch(() => null);
  const name = account.membership.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || account.membership.email;
  return {
    actor: { name, clerkUserId: userId, email: account.membership.email || user?.primaryEmailAddress?.emailAddress, isAdmin: false },
    partnerId: account.partner.id,
  };
}

async function run(fn: (ctx: { actor: Actor; partnerId: string }) => Promise<{ ok: boolean; error?: string }>): Promise<Result> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "You don't have access to a partner account." };
  try {
    const r = await fn(ctx);
    if (!r.ok) return { ok: false, error: r.error ?? "That didn't work. Please try again." };
    revalidatePath("/partner/team");
    return { ok: true };
  } catch (e) {
    console.error("[partner team]", e);
    return { ok: false, error: e instanceof Error && e.message.startsWith("Invite email failed") ? "We saved the invitation but couldn't send the email. Try Resend." : "That didn't work. Please try again." };
  }
}

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Enter their name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  title: z.string().trim().max(120).optional(),
});

export async function inviteTeammateAction(input: z.input<typeof inviteSchema>): Promise<Result> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  return run(({ actor, partnerId }) => inviteTeamMember({ partnerId, ...parsed.data, role: "Member", actor }));
}

const id = z.string().regex(/^rec[A-Za-z0-9]{14}$/);

export async function resendTeamInviteAction(userId: string): Promise<Result> {
  if (!id.safeParse(userId).success) return { ok: false, error: "Not found." };
  return run(({ actor }) => resendInvite(userId, actor));
}

export async function revokeTeamInviteAction(userId: string): Promise<Result> {
  if (!id.safeParse(userId).success) return { ok: false, error: "Not found." };
  return run(({ actor }) => revokeInvite(userId, actor));
}

export async function removeTeammateAction(userId: string): Promise<Result> {
  if (!id.safeParse(userId).success) return { ok: false, error: "Not found." };
  return run(({ actor }) => removeTeamMember(userId, actor));
}

export async function makeOwnerAction(userId: string): Promise<Result> {
  if (!id.safeParse(userId).success) return { ok: false, error: "Not found." };
  return run(({ actor }) => makePrimary(userId, actor));
}

export async function setLeadAlertsAction(userId: string, on: boolean): Promise<Result> {
  if (!id.safeParse(userId).success) return { ok: false, error: "Not found." };
  return run(({ actor }) => setNotifyLeads(userId, on, actor));
}

export async function leaveTeamAction(): Promise<Result> {
  return run(({ actor, partnerId }) => leaveTeam(actor, partnerId));
}
