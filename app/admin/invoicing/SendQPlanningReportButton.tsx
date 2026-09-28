"use client";

import { useEffect, useState } from "react";

interface Quarter {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isArchived?: boolean;
}

function QuarterPickerModal({ onClose, onSend }: { onClose: () => void; onSend: (quarterId: string) => Promise<void> }) {
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [loading, setLoading] = useState(true);
  const [quarterId, setQuarterId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/crm/quarters")
      .then((r) => r.json())
      .then((data) => {
        const list: Quarter[] = data.quarters ?? [];
        setQuarters(list);
        const activeDefault = list.find((q) => !q.isArchived) ?? list[0];
        if (activeDefault) setQuarterId(activeDefault.id);
      })
      .catch(() => setError("Failed to load quarters"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSend() {
    if (!quarterId) return;
    setSending(true);
    setError("");
    try {
      await onSend(quarterId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send report");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-white mb-1">Send Q Planning Report</h2>
        <p className="text-sm text-gray-400 mb-5">
          Emails a full summary of War Room &amp; Referral Funnel plans — by sales rep, then by referral company — to your own inbox.
        </p>

        <label className="block text-xs text-gray-500 mb-1.5">Quarter</label>
        {loading ? (
          <div className="text-sm text-gray-500">Loading quarters…</div>
        ) : quarters.length === 0 ? (
          <div className="text-sm text-gray-500">No quarters found.</div>
        ) : (
          <select
            value={quarterId}
            onChange={(e) => setQuarterId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
          >
            {quarters.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}{q.isArchived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSend}
            disabled={sending || !quarterId}
            className="flex-1 py-2.5 rounded-xl bg-forest-600 text-white font-semibold text-sm hover:bg-forest-700 disabled:opacity-50 transition-colors"
          >
            {sending ? "Sending…" : "Send Report"}
          </button>
          <button
            onClick={onClose}
            disabled={sending}
            className="px-5 py-2.5 rounded-xl border border-gray-700 text-gray-300 font-medium text-sm hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function SendQPlanningReportButton() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "success">("idle");

  async function handleSend(quarterId: string) {
    const res = await fetch("/api/reports/q-planning-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarterId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send report");
    setStatus("success");
    setTimeout(() => setStatus("idle"), 5000);
  }

  const label = {
    idle:    "Send Q Planning Report",
    success: "Report sent to your inbox ✓",
  }[status];

  const cls = {
    idle:    "bg-[#2d4a3e] hover:bg-[#1e3329] text-white",
    success: "bg-emerald-700 text-white",
  }[status];

  return (
    <div className="mb-8 flex items-center gap-3">
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${cls}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        {label}
      </button>
      {status === "idle" && (
        <p className="text-xs text-gray-500">By TTTSalesRep, then referral company — goals, stages &amp; quarterly plan details.</p>
      )}
      {open && (
        <QuarterPickerModal
          onClose={() => setOpen(false)}
          onSend={handleSend}
        />
      )}
    </div>
  );
}
