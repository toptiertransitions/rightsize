"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

interface RenameProjectActionProps {
  tenantId: string;
  tenantName: string;
  tenantAddress?: string;
  tenantCity?: string;
  tenantState?: string;
  tenantZip?: string;
  // Render just the trigger as a link-style button (used inline next to
  // Invite Member) vs. a full standalone button (used at the bottom of the
  // page, below Delete Account, labeled "Name Project" instead of "Rename").
  variant?: "inline" | "standalone";
}

export function RenameProjectAction({ tenantId, tenantName, tenantAddress, tenantCity, tenantState, tenantZip, variant = "inline" }: RenameProjectActionProps) {
  const router = useRouter();
  const [showRename, setShowRename] = useState(false);
  const [newName, setNewName] = useState(tenantName);
  const [address, setAddress] = useState(tenantAddress ?? "");
  const [city, setCity] = useState(tenantCity ?? "");
  const [state, setState] = useState(tenantState ?? "");
  const [zip, setZip] = useState(tenantZip ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function onTrigger() {
    setNewName(tenantName);
    setAddress(tenantAddress ?? "");
    setCity(tenantCity ?? "");
    setState(tenantState ?? "");
    setZip(tenantZip ?? "");
    setError("");
    setShowRename(true);
  }

  async function handleRename() {
    if (!newName.trim()) {
      setShowRename(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          name: newName.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          zip: zip.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to rename");
      }
      setShowRename(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const label = variant === "standalone" ? "Name Project" : "Rename";
  const modalTitle = variant === "standalone" ? "Name Project" : "Rename Project";

  return (
    <>
      {variant === "standalone" ? (
        <button
          onClick={onTrigger}
          className="mt-3 text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 -mx-3 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {label}
        </button>
      ) : (
        <button
          onClick={onTrigger}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {label}
        </button>
      )}

      {showRename && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{modalTitle}</h3>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRename()}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 mb-4"
              autoFocus
            />
            <p className="text-xs text-gray-500 font-medium mb-2">Project Address <span className="font-normal">(optional — used to filter local vendors)</span></p>
            <div className="space-y-2">
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Street address"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="City"
                  className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
                <input
                  type="text"
                  value={state}
                  onChange={e => setState(e.target.value)}
                  placeholder="ST"
                  maxLength={2}
                  className="w-16 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 uppercase"
                />
                <input
                  type="text"
                  value={zip}
                  onChange={e => setZip(e.target.value)}
                  placeholder="Zip"
                  className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-500 mt-3 mb-1">{error}</p>}
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setShowRename(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                disabled={loading}
              >
                Cancel
              </button>
              <Button onClick={handleRename} disabled={loading || !newName.trim()}>
                {loading ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
