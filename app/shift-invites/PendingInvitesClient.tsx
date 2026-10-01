"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface PendingInvite {
  shiftId: string;
  projectName: string;
  activity: string;
  dateTimeLabel: string;
}

export function PendingInvitesClient() {
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/shift-invites/pending")
      .then((r) => r.json())
      .then((d) => setInvites(d.invites ?? []))
      .catch(() => setError("Couldn't load your pending invites."));
  }, []);

  return (
    <div
      className="min-h-screen bg-cream-50"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top))", paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-md mx-auto px-4 sm:px-6">
        <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700 mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Rightsize
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Pending Invites</h1>
        <p className="text-sm text-gray-500 mb-6">Shifts waiting on your response</p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {invites === null && !error && (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        )}

        {invites !== null && invites.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl">
            No pending invites right now.
          </div>
        )}

        {invites && invites.length > 0 && (
          <div className="space-y-2.5">
            {invites.map((inv) => (
              <Link
                key={inv.shiftId}
                href={`/shift-invite/${inv.shiftId}`}
                className="block rounded-2xl border border-gray-200 bg-white p-4 hover:border-forest-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{inv.activity}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{inv.projectName}</p>
                    <p className="text-xs text-gray-400 mt-1">{inv.dateTimeLabel}</p>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                    Pending
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
