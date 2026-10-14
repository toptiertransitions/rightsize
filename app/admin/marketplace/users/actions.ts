"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSystemRole } from "@/lib/airtable";
import { hasCapability, type MarketplaceRole } from "@/lib/marketplace/permissions";
import {
  getInviteLinkForAdmin,
  inviteTeamMember,
  makePrimary,
  removeTeamMember,
  resendInvite,
  restoreTeamMember,
  revokeInvite,
  setNotifyLeads,
  type Actor,
} from "@/lib/marketplace/team";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function adminActor(): Promise<Actor | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const role = await getSystemRole(userId).catch(() => null);
  if (!role || !hasCapability(role as MarketplaceRole, "managePartnerUsers")) return null;
  const user = await currentUser().catch(() => null);
  return {
    name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Top Tier Transitions",
    clerkUserId: userId,
    email: user?.primaryEmailAddress?.emailAddress,
    isAdmin: true,
  };
}

async function run<T>(fn: (actor: Actor) => Promise<{ ok: true; data: T } | { ok: false; error: string }>): Promise<Result<T>> {
  const actor = await adminActor();
  if (!actor) return { ok: false, error: "Only TTT admins can manage partner users." };
  try {
    const r = await fn(actor);
    if (!r.ok) return r;
    revalidatePath("/admin/marketplace/users");
    return { ok: true, data: r.data };
  } catch (e) {
    console.error("[admin partner users]", e);
    return { ok: false, error: e instanceof Error && e.message.startsWith("Invite email failed") ? "Saved, but the email didn't send. Use Resend or Copy invite link." : "That didn't work. Please try again." };
  }
}

const id = z.string().regex(/^rec[A-Za-z0-9]{14}$/);
const inviteSchema = z.object({
  partnerId: id,
  name: z.string().trim().min(1, "Enter their name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  title: z.string().trim().max(120).optional(),
  role: z.enum(["Primary", "Member"]),
});

export async function adminInviteUserAction(input: z.input<typeof inviteSchema>): Promise<Result> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  return run(async (actor) => {
    const r = await inviteTeamMember({ ...parsed.data, actor });
    return r.ok ? { ok: true, data: undefined } : r;
  });
}

function byId(fn: (userId: string, actor: Actor) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>) {
  return async (userId: string): Promise<Result> => {
    if (!id.safeParse(userId).success) return { ok: false, error: "Not found." };
    return run(async (actor) => {
      const r = await fn(userId, actor);
      return r.ok ? { ok: true, data: undefined } : r;
    });
  };
}

export async function adminResendInviteAction(userId: string) { return byId(resendInvite)(userId); }
export async function adminRevokeInviteAction(userId: string) { return byId(revokeInvite)(userId); }
export async function adminRemoveUserAction(userId: string) { return byId(removeTeamMember)(userId); }
export async function adminRestoreUserAction(userId: string) { return byId(restoreTeamMember)(userId); }
export async function adminMakePrimaryAction(userId: string) { return byId(makePrimary)(userId); }

export async function adminSetLeadAlertsAction(userId: string, on: boolean): Promise<Result> {
  if (!id.safeParse(userId).success) return { ok: false, error: "Not found." };
  return run(async (actor) => {
    const r = await setNotifyLeads(userId, on, actor);
    return r.ok ? { ok: true, data: undefined } : r;
  });
}

export async function adminCopyInviteLinkAction(userId: string): Promise<Result<string>> {
  if (!id.safeParse(userId).success) return { ok: false, error: "Not found." };
  return run((actor) => getInviteLinkForAdmin(userId, actor));
}
