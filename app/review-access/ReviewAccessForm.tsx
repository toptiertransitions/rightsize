"use client";

import { useActionState } from "react";
import { reviewAccessAction } from "./actions";

export function ReviewAccessForm() {
  const [state, formAction, pending] = useActionState(reviewAccessAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input
        name="code"
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="Review code"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        required
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2.5 text-sm font-medium bg-forest-600 text-white rounded-xl hover:bg-forest-700 disabled:opacity-50 transition-colors"
      >
        {pending ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
