"use client";

import { useState, useTransition } from "react";
import { setRealtorReferralFeesAction } from "../realtor-referral-actions";

// Tenant Config: some communities don't allow Top Tier to take a realtor
// referral fee. Off (the default) means this community's co-branded clients
// see no referral-fee disclosure and no acknowledgments are tracked for them.
export function RealtorReferralToggle({ brandId, communityName, initialAllowed, canEdit }: {
  brandId: string;
  communityName: string;
  initialAllowed: boolean;
  canEdit: boolean;
}) {
  const [allowed, setAllowed] = useState(initialAllowed);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function flip() {
    const next = !allowed;
    setError("");
    start(async () => {
      const r = await setRealtorReferralFeesAction(brandId, next);
      if (!r.ok) return setError(r.error);
      setAllowed(r.allowed);
    });
  }

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={`rrf-${brandId}`} className="text-base font-bold text-white">Realtor referral fees</h2>
          <p className="text-sm text-gray-400 mt-1">
            {allowed
              ? <>On: {communityName}&rsquo;s co-branded clients see the realtor referral disclosure, must acknowledge it before a realtor introduction, and each acknowledgment is recorded.</>
              : <>Off: {communityName}&rsquo;s co-branded clients see no realtor referral-fee messaging and nothing is tracked. Turn on only if this community allows Top Tier to receive a realtor referral fee.</>}
          </p>
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={allowed}
          aria-labelledby={`rrf-${brandId}`}
          disabled={!canEdit || pending}
          onClick={flip}
          className={`relative mt-1 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50 ${allowed ? "bg-emerald-500" : "bg-gray-700"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${allowed ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
      {!canEdit && <p className="text-xs text-gray-500 mt-3">Only TTT Admins can change this.</p>}
    </section>
  );
}
