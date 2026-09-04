"use client";

import { useState } from "react";

interface Props {
  tenantId: string;
  projectName: string;
  onClose: () => void;
}

export function ScheduleModificationModal({ tenantId, projectName, onClose }: Props) {
  const [request, setRequest] = useState("");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState<"Normal" | "Urgent">("Normal");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!request.trim()) { setError("Please describe the schedule change you are requesting."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/plan/schedule-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, projectName, request: request.trim(), reason: reason.trim() || undefined, priority }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to send request");
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Request to Modify Schedule</h2>
              <p className="text-xs text-gray-500 mt-0.5">{projectName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-10 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-900 mb-1">Request sent</p>
            <p className="text-sm text-gray-500 mb-6">Your request has been sent to the management team. They will follow up with you directly.</p>
            <button
              onClick={onClose}
              className="h-10 px-6 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <div className="flex gap-2">
                {(["Normal", "Urgent"] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 h-9 rounded-lg text-sm font-medium transition-colors border ${
                      priority === p
                        ? p === "Urgent"
                          ? "bg-orange-500 text-white border-orange-500"
                          : "bg-teal-600 text-white border-teal-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Change requested */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                What schedule change are you requesting? <span className="text-red-400">*</span>
              </label>
              <textarea
                value={request}
                onChange={e => setRequest(e.target.value)}
                rows={4}
                placeholder="Describe the specific change — e.g. move Tuesday packing shift to Wednesday, add an extra day for sorting, remove the Monday shift…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
              />
            </div>

            {/* Reason / context */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Reason / context <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder="Any additional context — client availability, crew changes, logistics constraints…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !request.trim()}
                className="flex-1 h-10 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-40 transition-colors"
              >
                {loading ? "Sending…" : "Send Request"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
