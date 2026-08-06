"use client";

import { useState } from "react";

export function CreateLocationButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setStatus("loading");
    try {
      const res = await fetch("/api/ebay/create-location", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStatus("success");
      setMessage(data.alreadyExisted ? "Location already exists — you're good to go." : "Location created successfully.");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Unknown error");
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={status === "loading" || status === "success"}
        className="px-5 py-2.5 bg-forest-700 hover:bg-forest-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        {status === "loading" ? "Creating…" : status === "success" ? "Done" : "Create Merchant Location"}
      </button>
      {message && (
        <p className={`mt-3 text-sm ${status === "success" ? "text-green-400" : "text-red-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
