"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

interface ProjectActionsProps {
  tenantId: string;
  tenantName: string;
}

export function ProjectActions({ tenantId, tenantName }: ProjectActionsProps) {
  const router = useRouter();
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [newName, setNewName] = useState(tenantName);
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRename() {
    if (!newName.trim() || newName.trim() === tenantName) {
      setShowRename(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, name: newName.trim() }),
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

  async function handleDelete() {
    if (confirmName !== tenantName) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tenants?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to delete");
      }
      router.push("/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setNewName(tenantName); setError(""); setShowRename(true); }}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Rename
        </button>
        <button
          onClick={() => { setConfirmName(""); setError(""); setShowDelete(true); }}
          className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
        >
          Delete Project
        </button>
      </div>

      {/* Rename modal */}
      {showRename && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Rename Project</h3>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRename()}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 mb-3"
              autoFocus
            />
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2 justify-end">
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

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Project</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will permanently delete <span className="font-semibold text-gray-700">{tenantName}</span> and all its rooms, items, and members. This cannot be undone.
            </p>
            <p className="text-sm text-gray-600 mb-2">
              Type <span className="font-mono font-semibold">{tenantName}</span> to confirm:
            </p>
            <input
              type="text"
              value={confirmName}
              onChange={e => setConfirmName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-3"
              autoFocus
            />
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || confirmName !== tenantName}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Deleting…" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
