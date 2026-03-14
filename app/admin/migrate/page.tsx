"use client";

import { useState } from "react";

export default function MigrateClerkIdsPage() {
  const [rows, setRows] = useState([{ oldId: "", newId: "" }]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, Record<string, number>> | null>(null);
  const [error, setError] = useState("");

  function updateRow(i: number, field: "oldId" | "newId", value: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setRows(prev => [...prev, { oldId: "", newId: "" }]);
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleRun() {
    setError("");
    setResults(null);
    const mappings: Record<string, string> = {};
    for (const { oldId, newId } of rows) {
      if (oldId.trim() && newId.trim()) mappings[oldId.trim()] = newId.trim();
    }
    if (Object.keys(mappings).length === 0) {
      setError("Add at least one old → new ID pair.");
      return;
    }
    if (!confirm(`Run migration for ${Object.keys(mappings).length} user(s)? This will update Airtable records permanently.`)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/migrate-clerk-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Migration failed");
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "h-9 px-3 rounded-lg border border-gray-700 bg-gray-800 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-forest-500 w-full";

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Clerk ID Migration</h1>
          <p className="text-gray-400 text-sm mt-1">
            One-time tool to remap old dev Clerk IDs to new production Clerk IDs across all Airtable tables.
            Find IDs in the <a href="/admin/users" className="text-forest-400 underline">Users page</a>.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <span>Old Clerk ID (dev)</span>
            <span>New Clerk ID (production)</span>
          </div>

          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={row.oldId}
                onChange={e => updateRow(i, "oldId", e.target.value)}
                className={inputClass}
                placeholder="user_2abc..."
              />
              <span className="text-gray-500 flex-shrink-0">→</span>
              <input
                value={row.newId}
                onChange={e => updateRow(i, "newId", e.target.value)}
                className={inputClass}
                placeholder="user_2xyz..."
              />
              {rows.length > 1 && (
                <button
                  onClick={() => removeRow(i)}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <button
            onClick={addRow}
            className="text-sm text-forest-400 hover:text-forest-300"
          >
            + Add another user
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={handleRun}
          disabled={loading}
          className="w-full h-11 rounded-xl bg-forest-600 text-white font-semibold hover:bg-forest-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Migrating…" : "Run Migration"}
        </button>

        {results && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-white">Migration Results</h2>
            {Object.entries(results).map(([oldId, tables]) => (
              <div key={oldId}>
                <p className="text-xs text-gray-400 font-mono mb-2 truncate">{oldId}</p>
                {Object.keys(tables).length === 0 ? (
                  <p className="text-sm text-gray-500">No records found for this ID.</p>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(tables).map(([table, count]) => (
                      <div key={table} className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">{table}</span>
                        <span className="text-forest-400 font-medium">{count} record{count !== 1 ? "s" : ""} updated</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-gray-500 pt-2 border-t border-gray-800">Migration complete. You can close this page.</p>
          </div>
        )}
      </div>
    </div>
  );
}
