"use client";

import { useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { deleteMyAccountAction } from "./actions";

export function DeleteAccountConfirm({ email }: { email: string }) {
  const { signOut } = useClerk();
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function run() {
    setError("");
    start(async () => {
      const r = await deleteMyAccountAction();
      if (!r.ok) return setError(r.message);
      // The sign-in no longer exists; clear this device's session
      await signOut({ redirectUrl: "/delete-account?deleted=1" }).catch(() => { window.location.assign("/delete-account?deleted=1"); });
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Signed in as <span className="font-medium text-gray-900">{email}</span></p>
      <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 w-5 h-5 accent-red-600" />
        <span>I understand this permanently deletes my account and can&rsquo;t be undone.</span>
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button
        type="button"
        onClick={run}
        disabled={!understood || pending}
        className="w-full h-12 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-40"
      >
        {pending ? "Deleting…" : "Delete my account"}
      </button>
    </div>
  );
}
