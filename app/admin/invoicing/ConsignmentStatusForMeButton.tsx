"use client";

import { useState } from "react";

export function ConsignmentStatusForMeButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleRun() {
    setStatus("loading");
    try {
      const res = await fetch("/api/reports/consignment-status", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setMessage(`Sent to ${data.email}: ${data.items} items across ${data.projects} projects, ${data.hit30 + data.hit60 + data.hit90} hit a mark this week, ${data.past90} past 90 days.`);
      setStatus("success");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to send");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleRun}
          disabled={status === "loading"}
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5l4.586 4.586a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-4-4a2 2 0 010-2.828L7 3z" />
            </svg>
          )}
          {status === "loading" ? "Sending…" : status === "success" ? "Consignment Status sent" : status === "error" ? "Failed, try again" : "Consignment Status for Me"}
        </button>
        {status === "idle" && (
          <p className="text-xs text-gray-500">Every Post Move Consignment item for sale on ProFoundFinds, eBay and FB Marketplace: age, price-drop check, and who hit 30, 60 or 90 days this week.</p>
        )}
        {(status === "success" || status === "error") && <p className="text-xs text-gray-500">{message}</p>}
      </div>
    </div>
  );
}
