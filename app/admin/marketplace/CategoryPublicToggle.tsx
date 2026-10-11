"use client";

import { useState } from "react";
import { setCategoryPublicAction } from "./actions";

// Dashboard on/off switch for whether clients see a category at all
export function CategoryPublicToggle({ categoryId, label, initial, canEdit }: { categoryId: string; label: string; initial: boolean; canEdit: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function flip() {
    const next = !on;
    setOn(next);
    setBusy(true);
    setError("");
    const res = await setCategoryPublicAction(categoryId, next);
    setBusy(false);
    if (!res.ok) {
      setOn(!next);
      setError(res.error);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Show ${label} to clients`}
        disabled={!canEdit || busy}
        onClick={flip}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${on ? "bg-green-600" : "bg-gray-700"}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
      <span className={`text-xs ${on ? "text-green-300" : "text-gray-500"}`}>{on ? "Public" : "Hidden"}</span>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
