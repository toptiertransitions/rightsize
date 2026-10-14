"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { acceptInvite, type AcceptOutcome } from "@/lib/marketplace/team";

export type AcceptState = { error?: Extract<AcceptOutcome, { ok: false }> } | null;

export async function acceptTeamInviteAction(token: string): Promise<AcceptState> {
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/invite/team/${token}`)}`);

  let outcome: AcceptOutcome;
  try {
    outcome = await acceptInvite(token, userId);
  } catch (e) {
    console.error("[team invite] accept failed:", e);
    return { error: { ok: false, reason: "invalid", detail: "Something went wrong. Please try again." } };
  }
  if (!outcome.ok) return { error: outcome };
  redirect(outcome.needsSetup ? "/partner/setup" : "/partner/leads");
}
