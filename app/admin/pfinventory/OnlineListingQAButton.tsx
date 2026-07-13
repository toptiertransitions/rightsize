"use client";

import { useState } from "react";

export function OnlineListingQAButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [detail, setDetail] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setDetail(null);
    try {
      const res = await fetch("/api/reports/online-listing-qa", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      if (data.message) setDetail(data.message);
      setStatus("success");
      setTimeout(() => { setStatus("idle"); setDetail(null); }, 7000);
    } catch (e) {
      setDetail(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
      setTimeout(() => { setStatus("idle"); setDetail(null); }, 5000);
    }
  }

  const label = {
    idle:    "Send Listing QA Report",
    loading: "Running QA checks…",
    success: "Report sent to your email ✓",
    error:   "Failed — try again",
  }[status];

  const cls = {
    idle:    "bg-[#2E6B4F] hover:bg-[#245a40] text-white",
    loading: "bg-[#2E6B4F]/70 text-white cursor-not-allowed",
    success: "bg-emerald-700 text-white",
    error:   "bg-red-700 text-white",
  }[status];

  return (
    <div className="mb-4 flex items-center gap-3 flex-wrap">
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {label}
      </button>
      {detail && (
        <p className={`text-xs ${status === "error" ? "text-red-400" : "text-gray-400"}`}>{detail}</p>
      )}
      {status === "idle" && !detail && (
        <p className="text-xs text-gray-500">Flags active ProFoundFinds listings with missing photos, generic titles, no description, and more.</p>
      )}
    </div>
  );
}
