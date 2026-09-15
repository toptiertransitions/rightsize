"use client";

import { useState, useEffect, useCallback } from "react";
import { safeJson } from "@/lib/utils";
import type { ProjectMessage } from "@/lib/airtable-messages";

type OpenIssue = ProjectMessage & { projectName: string; authorName: string };

function formatCT(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }) + " CT";
}

function timeOpen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "< 1h open";
  if (hours < 24) return `${hours}h open`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h open`;
}

export function OpenIssuesTab() {
  const [issues, setIssues] = useState<OpenIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/messages/open-issues")
      .then(r => safeJson<{ issues?: OpenIssue[]; error?: string }>(r))
      .then(d => setIssues(d.issues ?? []))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAcknowledge(id: string) {
    setAcknowledgingId(id);
    try {
      const res = await fetch(`/api/messages/${id}/acknowledge`, { method: "POST" });
      const data = await safeJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to acknowledge");
      setIssues(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to acknowledge");
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? "Loading…" : `${issues.length} unacknowledged urgent message${issues.length !== 1 ? "s" : ""}.`}
        </p>
        <button
          onClick={load}
          className="text-xs font-medium text-forest-700 hover:text-forest-800"
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : issues.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl">
          Nothing open — all urgent messages have been acknowledged.
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map(issue => (
            <div key={issue.id} className="rounded-xl border border-red-200 bg-red-50/40 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Urgent</span>
                    <span className="text-sm font-semibold text-gray-900">{issue.projectName}</span>
                    <span className="text-xs text-gray-400">from {issue.authorName}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{issue.body}</p>
                  <p className="mt-1.5 text-[11px] text-red-500 font-medium">{timeOpen(issue.timestamp)} · {formatCT(issue.timestamp)}</p>
                </div>
                <button
                  onClick={() => handleAcknowledge(issue.id)}
                  disabled={acknowledgingId === issue.id}
                  className="h-8 px-4 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {acknowledgingId === issue.id ? "…" : "Acknowledge"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
