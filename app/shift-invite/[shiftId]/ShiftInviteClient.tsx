"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ShiftDetail {
  shiftId: string;
  projectName: string;
  address?: string;
  dateLabel: string;
  timeLabel: string;
  activity: string;
  roomName?: string;
  notes?: string;
  invitedBy?: string;
  status: "pending" | "accepted" | "declined";
  isPast: boolean;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "notFound"; message: string }
  | { kind: "ready"; shift: ShiftDetail };

function BackLink() {
  return (
    <Link href="/shift-invites" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700 mb-4">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Pending Invites
    </Link>
  );
}

export function ShiftInviteClient({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState<"accepted" | "declined" | null>(null);
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [confirmedStatus, setConfirmedStatus] = useState<"accepted" | "declined" | null>(null);
  const [submitError, setSubmitError] = useState("");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/shift-invites/${shiftId}`);
      const data = await res.json();
      if (res.status === 403) {
        setState({ kind: "forbidden", message: data.error ?? "You're not invited to this shift." });
        return;
      }
      if (res.status === 404) {
        setState({ kind: "notFound", message: data.error ?? "This shift has been cancelled or no longer exists." });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error", message: data.error ?? "Something went wrong loading this invite." });
        return;
      }
      setState({ kind: "ready", shift: data });
    } catch {
      setState({ kind: "error", message: "Couldn't connect. Check your connection and try again." });
    }
  }, [shiftId]);

  useEffect(() => { load(); }, [load]);

  async function respond(status: "accepted" | "declined", comment?: string) {
    setSubmitting(status);
    setSubmitError("");
    try {
      const res = await fetch(`/api/shift-invites/${shiftId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(comment ? { comment } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Couldn't save your response. Please try again.");
        return;
      }
      setConfirmedStatus(status);
    } catch {
      setSubmitError("Couldn't connect. Check your connection and try again.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div
      className="min-h-screen bg-cream-50"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top))", paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-md mx-auto px-4 sm:px-6">
        <BackLink />

        {state.kind === "loading" && (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        )}

        {state.kind === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
            <p className="text-sm text-red-700 mb-3">{state.message}</p>
            <button onClick={load} className="h-10 px-5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors">
              Try Again
            </button>
          </div>
        )}

        {state.kind === "forbidden" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
            <p className="text-sm text-gray-600">{state.message}</p>
          </div>
        )}

        {state.kind === "notFound" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
            <p className="text-sm text-gray-600">{state.message}</p>
          </div>
        )}

        {state.kind === "ready" && confirmedStatus === null && (
          <ShiftCard
            shift={state.shift}
            submitting={submitting}
            showDeclineReason={showDeclineReason}
            declineReason={declineReason}
            submitError={submitError}
            onAccept={() => respond("accepted")}
            onDeclineClick={() => setShowDeclineReason(true)}
            onDeclineReasonChange={setDeclineReason}
            onDeclineConfirm={() => respond("declined", declineReason.trim() || undefined)}
            onDeclineCancel={() => { setShowDeclineReason(false); setDeclineReason(""); }}
          />
        )}

        {state.kind === "ready" && confirmedStatus !== null && (
          <div className="rounded-2xl border border-forest-200 bg-forest-50 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-forest-600 text-white flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-900 mb-1">
              {confirmedStatus === "accepted" ? "Shift accepted" : "Shift declined"}
            </p>
            <p className="text-sm text-gray-500 mb-5">{state.shift.projectName} · {state.shift.dateLabel}</p>
            <button
              onClick={() => router.push("/shift-invites")}
              className="h-10 px-5 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors"
            >
              Back to Pending Invites
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  accepted: "bg-forest-50 text-forest-700 border-forest-200",
  declined: "bg-red-50 text-red-700 border-red-200",
};

function ShiftCard({
  shift,
  submitting,
  showDeclineReason,
  declineReason,
  submitError,
  onAccept,
  onDeclineClick,
  onDeclineReasonChange,
  onDeclineConfirm,
  onDeclineCancel,
}: {
  shift: ShiftDetail;
  submitting: "accepted" | "declined" | null;
  showDeclineReason: boolean;
  declineReason: string;
  submitError: string;
  onAccept: () => void;
  onDeclineClick: () => void;
  onDeclineReasonChange: (v: string) => void;
  onDeclineConfirm: () => void;
  onDeclineCancel: () => void;
}) {
  if (shift.isPast) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center">
        <p className="text-sm text-gray-600">This shift has already happened.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{shift.activity}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{shift.projectName}</p>
          </div>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_BADGE[shift.status]}`}>
            {shift.status === "pending" ? "Awaiting your response" : shift.status === "accepted" ? "Accepted" : "Declined"}
          </span>
        </div>

        <div className="space-y-2.5 text-sm">
          <div className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
              <div className="text-gray-900 font-medium">{shift.dateLabel}</div>
              <div className="text-gray-500">{shift.timeLabel}</div>
            </div>
          </div>

          {shift.address && (
            <div className="flex items-start gap-2.5">
              <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="text-gray-700 break-words">{shift.address}</div>
            </div>
          )}

          {shift.roomName && (
            <div className="flex items-start gap-2.5">
              <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2M5 21h2m10 0h-4m-6 0h4m0-10h.01M15 11h.01" />
              </svg>
              <div className="text-gray-700">{shift.roomName}</div>
            </div>
          )}

          {shift.invitedBy && (
            <div className="flex items-start gap-2.5">
              <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <div className="text-gray-700">Invited by {shift.invitedBy}</div>
            </div>
          )}

          {shift.notes && (
            <div className="pt-2 mt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-gray-700 whitespace-pre-wrap break-words">{shift.notes}</p>
            </div>
          )}
        </div>
      </div>

      {submitError && <p className="text-sm text-red-600 text-center">{submitError}</p>}

      {!showDeclineReason ? (
        <div className="space-y-3">
          <button
            onClick={onAccept}
            disabled={submitting !== null}
            className="w-full h-14 rounded-2xl bg-forest-600 text-white text-base font-semibold hover:bg-forest-700 disabled:opacity-50 transition-colors"
          >
            {submitting === "accepted" ? "Accepting…" : shift.status === "accepted" ? "Accepted — tap to confirm again" : "Accept"}
          </button>
          <button
            onClick={onDeclineClick}
            disabled={submitting !== null}
            className="w-full h-14 rounded-2xl border-2 border-red-200 text-red-600 text-base font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {shift.status === "declined" ? "Declined — tap to change reason" : "Decline"}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
          <label className="block text-xs font-medium text-gray-700">Reason (optional)</label>
          <textarea
            value={declineReason}
            onChange={(e) => onDeclineReasonChange(e.target.value)}
            rows={2}
            placeholder="Let the team know why, if you'd like…"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-forest-400"
          />
          <div className="flex gap-2">
            <button
              onClick={onDeclineCancel}
              disabled={submitting !== null}
              className="flex-1 h-11 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onDeclineConfirm}
              disabled={submitting !== null}
              className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {submitting === "declined" ? "Declining…" : "Confirm Decline"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
