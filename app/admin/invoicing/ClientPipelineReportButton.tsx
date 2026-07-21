"use client";

import { useState } from "react";

export function ClientPipelineReportButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleClick() {
    setStatus("loading");
    try {
      const res = await fetch("/api/reports/client-pipeline-email", { method: "POST" });
      if (!res.ok) throw new Error();
      setStatus("success");
      setTimeout(() => setStatus("idle"), 5000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }

  const label = {
    idle:    "Send Client Pipeline Report",
    loading: "Generating report…",
    success: "Pipeline report sent ✓",
    error:   "Failed — try again",
  }[status];

  const cls = {
    idle:    "bg-[#2d4a3e] hover:bg-[#1e3329] text-white",
    loading: "bg-[#2d4a3e]/70 text-white cursor-not-allowed",
    success: "bg-emerald-700 text-white",
    error:   "bg-red-700 text-white",
  }[status];

  return (
    <div className="mb-8 flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={status === "loading"}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${cls}`}
      >
        {status === "loading" ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
        {label}
      </button>
      {status === "idle" && (
        <p className="text-xs text-gray-500">Won last 7 days · Proposing · Qualifying · Lead — with value, referral source, owner &amp; next steps.</p>
      )}
    </div>
  );
}
