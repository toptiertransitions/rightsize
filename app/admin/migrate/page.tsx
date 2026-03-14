"use client";

import { useState } from "react";

interface MigrationResult {
  email: string;
  oldId: string;
  newId: string;
  oldRecordId: string;
  tableUpdates: Record<string, number>;
  deleted: boolean;
  error?: string;
}

export default function MigrateClerkIdsPage() {
  const [rows, setRows] = useState([{ oldId: "", newId: "" }]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, Record<string, number>> | null>(null);
  const [error, setError] = useState("");

  const [autoLoading, setAutoLoading] = useState(false);
  const [autoResults, setAutoResults] = useState<MigrationResult[] | null>(null);
  const [autoError, setAutoError] = useState("");
  const [autoMessage, setAutoMessage] = useState("");

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

  async function handleAutoFix() {
    setAutoError("");
    setAutoResults(null);
    setAutoMessage("");
    if (!confirm("Automatically detect duplicate staff entries and migrate them? This will update Airtable records and delete duplicate StaffRole entries permanently.")) return;

    setAutoLoading(true);
    try {
      const res = await fetch("/api/admin/auto-migrate-duplicates", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Auto-migration failed");
      if (data.message) setAutoMessage(data.message);
      setAutoResults(data.migrations ?? null);
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : "Failed");
    } finally {
      setAutoLoading(false);
    }
  }

  const inputClass = "h-9 px-3 rounded-lg border border-gray-700 bg-gray-800 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-forest-500 w-full";

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Clerk ID Migration</h1>
          <p className="text-gray-400 text-sm mt-1">
            One-time tools to remap old dev Clerk IDs to new production Clerk IDs across all Airtable tables.
            Find IDs in the <a href="/admin/users" className="text-forest-400 underline">Users page</a>.
          </p>
        </div>

        {/* Auto-fix section */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-white">Auto-Fix Staff Duplicates</h2>
            <p className="text-sm text-gray-400 mt-1">
              Scans StaffRoles for duplicate emails, looks up each person&apos;s current Clerk ID, migrates all
              references from old dev IDs to production IDs, and removes the duplicate records.
            </p>
          </div>

          {autoError && <p className="text-sm text-red-400">{autoError}</p>}
          {autoMessage && <p className="text-sm text-forest-400">{autoMessage}</p>}

          <button
            onClick={handleAutoFix}
            disabled={autoLoading}
            className="w-full h-11 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {autoLoading ? "Running auto-fix…" : "Auto-Fix Staff Duplicates"}
          </button>

          {autoResults && autoResults.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              <h3 className="text-sm font-semibold text-white">Results</h3>
              {autoResults.map((m, i) => (
                <div key={i} className="bg-gray-800/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{m.email}</span>
                    {m.error ? (
                      <span className="text-xs text-red-400">Error</span>
                    ) : (
                      <span className={`text-xs font-medium ${m.deleted ? "text-forest-400" : "text-amber-400"}`}>
                        {m.deleted ? "Cleaned up" : "Migration ran, delete failed"}
                      </span>
                    )}
                  </div>
                  {m.error ? (
                    <p className="text-xs text-red-300">{m.error}</p>
                  ) : (
                    <>
                      <div className="text-xs text-gray-400 font-mono truncate">
                        <span className="text-gray-500">old: </span>{m.oldId}
                      </div>
                      <div className="text-xs text-gray-400 font-mono truncate">
                        <span className="text-gray-500">new: </span>{m.newId}
                      </div>
                      {Object.keys(m.tableUpdates).length > 0 ? (
                        <div className="space-y-1 pt-1">
                          {Object.entries(m.tableUpdates).map(([table, count]) => (
                            <div key={table} className="flex items-center justify-between text-xs">
                              <span className="text-gray-300">{table}</span>
                              <span className="text-forest-400">{count} record{count !== 1 ? "s" : ""} updated</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No records needed updating for this user.</p>
                      )}
                    </>
                  )}
                </div>
              ))}
              <p className="text-xs text-gray-500 pt-2">Auto-fix complete.</p>
            </div>
          )}
        </div>

        {/* Manual migration section */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-white">Manual Migration</h2>
            <p className="text-sm text-gray-400 mt-1">Specify exact old → new Clerk ID pairs manually.</p>
          </div>

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
          {loading ? "Migrating…" : "Run Manual Migration"}
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
