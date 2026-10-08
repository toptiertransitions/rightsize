"use client";

import { useState } from "react";

export function WarRoomForMeButton() {
  const [status, setStatus] = useState<"idle" | "confirm" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleRun() {
    setStatus("loading");
    try {
      const res = await fetch("/api/reports/war-room", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setMessage(`Running on ${data.partners} partners for ${data.quarter}. It'll land in ${data.email} in about 10-15 minutes.`);
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          {status === "loading" ? "Starting…" : status === "success" ? "War Room report started" : status === "error" ? "Failed, try again" : "War Room for Me"}
        </button>
        {status === "idle" && (
          <p className="text-xs text-gray-500">AI risk score and a specific next move for every War Room partner, by sales rep.</p>
        )}
        {(status === "success" || status === "error") && <p className="text-xs text-gray-500">{message}</p>}
      </div>

      {status === "confirm" && (
        <div className="mt-3 max-w-xl rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">
            This runs <strong>Create Current AI Status</strong> on every Active Referral Partner and Not Yet Referring company in the War Room for this quarter
            (it refreshes each one&apos;s saved AI Status), then emails you a risk-scored report. It takes about 10-15 minutes.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={handleRun} className="px-3 py-2 rounded-lg text-sm font-semibold bg-[#2d4a3e] hover:bg-[#1e3329] text-white">Run it</button>
            <button onClick={() => setStatus("idle")} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
