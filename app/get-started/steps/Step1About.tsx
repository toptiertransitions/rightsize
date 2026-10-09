"use client";

import { useState } from "react";
import type { WizardData } from "../wizardTypes";
import { applyCommunityCode } from "../actions";

interface Props {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  brandName?: string | null;
  onBrandApplied?: (displayName: string) => void;
}

// Optional "Who sent you?" community code. Skippable: collapsed behind a
// link, and the step never waits on it.
function CommunityCode({ brandName, onBrandApplied }: Pick<Props, "brandName" | "onBrandApplied">) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (brandName) {
    return (
      <p className="text-sm text-forest-700 bg-forest-50 border border-forest-100 rounded-xl px-4 py-3">
        You&apos;re joining through <span className="font-semibold">{brandName}</span>.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-forest-700 underline underline-offset-2">
        Did a community send you? Enter your community code
      </button>
    );
  }

  async function apply() {
    setError("");
    setBusy(true);
    try {
      const res = await applyCommunityCode(code);
      if (res.ok) onBrandApplied?.(res.displayName);
      else setError(res.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor="communityCode" className="block text-sm font-semibold text-gray-900 mb-1">Who sent you?</label>
      <p className="text-xs text-gray-500 mb-2">Enter the community code you were given. You can skip this.</p>
      <div className="flex gap-2">
        <input
          id="communityCode"
          type="text"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={20}
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (code.trim()) apply(); } }}
          placeholder="ROOSEVELT"
          className="flex-1 min-w-0 h-12 px-4 rounded-xl border border-gray-300 text-base uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
        />
        <button
          type="button"
          onClick={apply}
          disabled={busy || !code.trim()}
          className="h-12 px-5 rounded-xl border border-forest-600 text-forest-700 font-semibold disabled:opacity-50"
        >
          {busy ? "Checking…" : "Apply"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2" role="alert">{error}</p>}
    </div>
  );
}

export function Step1About({ data, update, brandName, onBrandApplied }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">What&apos;s your name?</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-xs font-medium text-gray-500 mb-1.5">First name</label>
            <input
              id="firstName"
              type="text"
              autoFocus
              value={data.firstName}
              onChange={e => update({ firstName: e.target.value })}
              placeholder="Jane"
              className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-xs font-medium text-gray-500 mb-1.5">Last name</label>
            <input
              id="lastName"
              type="text"
              value={data.lastName}
              onChange={e => update({ lastName: e.target.value })}
              placeholder="Smith"
              className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
            />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">What&apos;s your current zip code?</h2>
        <p className="text-sm text-gray-500 mb-4">Helps us match you with people near you.</p>
        <input
          id="currentZip"
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={data.currentZip}
          onChange={e => update({ currentZip: e.target.value.replace(/\D/g, "").slice(0, 5) })}
          placeholder="60601"
          className="w-full max-w-[180px] h-12 px-4 rounded-xl border border-gray-300 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
        />
      </div>

      <CommunityCode brandName={brandName} onBrandApplied={onBrandApplied} />
    </div>
  );
}

export function step1Valid(data: WizardData): boolean {
  return data.firstName.trim().length > 0 && data.lastName.trim().length > 0 && /^\d{5}$/.test(data.currentZip);
}
