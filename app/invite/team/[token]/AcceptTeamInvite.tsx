"use client";

import { useState, useTransition } from "react";
import { SignOutButton } from "@clerk/nextjs";
import { acceptTeamInviteAction, type AcceptState } from "./actions";

export function AcceptTeamInvite({ token, signedInAs, invitedEmail }: { token: string; signedInAs: string; invitedEmail: string }) {
  const [state, setState] = useState<AcceptState>(null);
  const [pending, start] = useTransition();
  const back = `/invite/team/${token}`;

  const error = state?.error;
  const mismatch = error?.reason === "email-mismatch" || signedInAs.toLowerCase() !== invitedEmail.toLowerCase();

  if (mismatch) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 leading-relaxed">
          This invitation is for <strong>{invitedEmail}</strong>, but you&rsquo;re signed in as <strong>{signedInAs}</strong>.
          Sign out and sign in (or create an account) with {invitedEmail}.
        </div>
        <SignOutButton redirectUrl={`/sign-in?redirect_url=${encodeURIComponent(back)}`}>
          <button className="flex items-center justify-center w-full h-12 px-5 bg-forest-600 text-white rounded-xl font-semibold text-base hover:bg-forest-700 transition-colors">
            Switch account
          </button>
        </SignOutButton>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 leading-relaxed" role="alert">
          {error.reason === "other-company"
            ? `Your account already belongs to ${error.detail ?? "another partner company"}. Ask Top Tier Transitions to move you.`
            : error.reason === "expired"
              ? "This invitation has expired. Ask whoever invited you to send a new one."
              : error.detail ?? "This invitation is no longer valid."}
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setState(await acceptTeamInviteAction(token)))}
        className="flex items-center justify-center w-full h-12 px-5 bg-forest-600 text-white rounded-xl font-semibold text-base hover:bg-forest-700 disabled:opacity-60 transition-colors"
      >
        {pending ? "Joining…" : "Accept and join"}
      </button>
      <p className="text-center text-xs text-gray-400">Signed in as {signedInAs}</p>
    </div>
  );
}
