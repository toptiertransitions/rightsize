"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface PendingInvite {
  shiftId: string;
  projectName: string;
  activity: string;
  dateTimeLabel: string;
}

// Shown only to TTTStaff/TTTTeamLead — /api/shift-invites/pending already
// returns an empty list for anyone else, so this renders nothing rather
// than gating on a role prop threaded down from the server. Scoped to
// today-and-later shifts in America/Chicago (see
// lib/airtable.ts getPendingShiftInvitesForEmail) so a shift that's already
// passed falls off on its own instead of cluttering this list.
//
// Accept/Decline here call the exact same /api/shift-invites/[shiftId]/respond
// endpoint as the push-notification landing page — one implementation of
// "respond to a shift" (lib/shift-response.ts), so the result is identical
// whichever surface someone responds from.
export function PendingShiftInvitesSection() {
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/shift-invites/pending")
      .then((r) => r.json())
      .then((d) => setInvites(d.invites ?? []))
      .catch(() => setInvites([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function respond(shiftId: string, status: "accepted" | "declined") {
    setActingOn(shiftId);
    setError(null);
    try {
      const res = await fetch(`/api/shift-invites/${shiftId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Couldn't save your response.");
      }
      setInvites((prev) => prev?.filter((i) => i.shiftId !== shiftId) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your response.");
    } finally {
      setActingOn(null);
    }
  }

  if (!invites || invites.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold text-gray-900">Pending Shift Invites</h2>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
          {invites.length}
        </span>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="space-y-2">
        {invites.map((inv) => (
          <div key={inv.shiftId} className="rounded-xl bg-white border border-amber-100 px-3.5 py-3">
            {/* Stacked, not a single cramped row — on a narrow iOS screen a
                horizontal layout squeezed the date/time out under truncate
                once the Accept/Decline buttons took their share of the
                width. Each line gets the full card width here instead. */}
            <Link href={`/shift-invite/${inv.shiftId}`} className="block mb-2.5">
              <p className="text-sm font-semibold text-gray-900 break-words">{inv.activity}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{inv.projectName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{inv.dateTimeLabel}</p>
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={() => respond(inv.shiftId, "accepted")}
                disabled={actingOn === inv.shiftId}
                className="flex-1 h-9 rounded-lg bg-forest-600 text-white text-xs font-semibold hover:bg-forest-700 disabled:opacity-50 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => respond(inv.shiftId, "declined")}
                disabled={actingOn === inv.shiftId}
                className="flex-1 h-9 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
