"use client";

import { useState } from "react";
import { KEY_DATE_ACTIVITIES } from "@/lib/types";
import type { PlanEntry } from "@/lib/types";

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface PartnerKeyDateProject {
  tenantId: string;
  name: string;
}

interface Props {
  projects: PartnerKeyDateProject[];
  defaultTenantId?: string;
  defaultDate?: string;
  entry?: PlanEntry; // editing an existing key date the partner added
  onClose: () => void;
  onSaved: (entry: PlanEntry) => void;
  onDeleted?: (id: string) => void;
}

export function PartnerKeyDateModal({ projects, defaultTenantId, defaultDate, entry, onClose, onSaved, onDeleted }: Props) {
  const isEdit = !!entry;
  const [tenantId, setTenantId] = useState(entry?.tenantId ?? defaultTenantId ?? projects[0]?.tenantId ?? "");
  const [date, setDate] = useState(entry?.date ?? defaultDate ?? toISO(new Date()));
  const [activity, setActivity] = useState(entry?.activity ?? KEY_DATE_ACTIVITIES[0]);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const inputCls = "w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d4a3e]/30 bg-white";

  const handleSave = async () => {
    if (!tenantId) { setError("Please select a project"); return; }
    if (!date) { setError("Date is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/partner/plan/${tenantId}`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit ? { id: entry!.id, date, activity, notes: notes.trim() } : { date, activity, notes: notes.trim() }
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to save key date");
      onSaved(d.entry as PlanEntry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save key date");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/partner/plan/${entry.tenantId}?id=${entry.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to delete key date");
      onDeleted?.(entry.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete key date");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? "Edit Key Date" : "Add Key Date"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Project</label>
              <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={inputCls}>
                {projects.map((p) => (
                  <option key={p.tenantId} value={p.tenantId}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
            <select value={activity} onChange={(e) => setActivity(e.target.value)} className={inputCls}>
              {KEY_DATE_ACTIVITIES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d4a3e]/30 bg-white resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 space-y-2">
          {isEdit && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600 flex-1">Delete this key date?</p>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={loading}
                  className="px-3 h-9 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-3 h-9 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? "Deleting…" : "Delete"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={loading}
                className="text-sm font-medium text-red-600 hover:text-red-700"
              >
                Delete key date
              </button>
            )
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 h-11 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 h-11 rounded-xl bg-[#2d4a3e] text-white font-medium hover:bg-[#243d33] disabled:opacity-50"
            >
              {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Key Date"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
