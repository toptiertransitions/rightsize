"use client";

import { useState } from "react";

// "Activity Analysis for Me": pick one sales rep; their full CRM activity is
// analyzed against every other rep and a coaching plan is emailed to you to
// forward to them (see lib/sales-coaching-report.ts).
export function ActivityAnalysisForMeButton({ reps }: { reps: { id: string; name: string }[] }) {
  const [status, setStatus] = useState<"idle" | "confirm" | "loading" | "success" | "error">("idle");
  const [repId, setRepId] = useState("");
  const [message, setMessage] = useState("");
  const repName = reps.find((r) => r.id === repId)?.name ?? "";

  async function handleRun() {
    setStatus("loading");
    try {
      const res = await fetch("/api/reports/sales-coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setMessage(`Analyzing ${data.repName}. The coaching plan will land in ${data.email} in about 15-25 minutes, ready to forward.`);
      setStatus("success");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to start");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setStatus("confirm")}
          disabled={status === "loading" || status === "confirm"}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            status === "success" ? "bg-emerald-700 text-white"
            : status === "error" ? "bg-red-700 text-white"
            : "bg-[#2d4a3e] hover:bg-[#1e3329] text-white disabled:opacity-70"
          }`}
        >
          {status === "loading" ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          )}
          {status === "loading" ? "Starting…" : status === "success" ? "Activity Analysis started" : status === "error" ? "Failed, try again" : "Activity Analysis for Me"}
        </button>
        {status === "idle" && (
          <p className="text-xs text-gray-500">Pick a sales rep: AI reads all of their CRM activity, compares it with the rest of the team, and emails you a coaching plan to forward to them.</p>
        )}
        {(status === "success" || status === "error") && <p className="text-xs text-gray-500">{message}</p>}
      </div>

      {status === "confirm" && (
        <div className="mt-3 max-w-xl rounded-lg border border-gray-200 bg-white p-4">
          <label htmlFor="coach-rep" className="block text-sm font-semibold text-gray-800">Sales rep</label>
          <select
            id="coach-rep"
            value={repId}
            onChange={(e) => setRepId(e.target.value)}
            className="mt-1.5 w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900"
          >
            <option value="">Choose a sales rep…</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <p className="mt-3 text-sm text-gray-700">
            This reads {repName ? `all of ${repName}'s` : "all of the rep's"} CRM activity (every logged email in the last 180 days, and every call, meeting, text, note and task),
            their partner companies by type and priority, funnel stages, referrals, and won and lost leads, and compares it with every other sales rep.
            You&apos;ll get a branded coaching email with what&apos;s working, what isn&apos;t, language to use instead, ready-to-send messages,
            next steps by referral partner, and a 30-day plan, written to forward to them. It takes about 15-25 minutes. Nothing in the CRM is changed.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={handleRun} disabled={!repId} className="px-3 py-2 rounded-lg text-sm font-semibold bg-[#2d4a3e] hover:bg-[#1e3329] text-white disabled:opacity-40">Run it</button>
            <button onClick={() => setStatus("idle")} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
