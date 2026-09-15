"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { safeJson } from "@/lib/utils";
import type { InboxThreadSummary } from "@/app/api/messages/inbox/route";
import type { ProjectMessage, MessageUrgency } from "@/lib/airtable-messages";

type EnrichedMessage = ProjectMessage & { authorName: string };

const BROADCAST_TENANT_ID = "__broadcast__";

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const URGENCY_BADGE: Record<MessageUrgency, string> = {
  Urgent: "bg-red-100 text-red-700",
  Normal: "bg-gray-100 text-gray-600",
  FYI: "bg-amber-100 text-amber-700",
};

function ThreadRow({ thread }: { thread: InboxThreadSummary }) {
  return (
    <Link
      href={`/plan?tenantId=${thread.tenantId}`}
      className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 hover:border-forest-300 hover:bg-forest-50/30 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{thread.projectName}</span>
          {thread.unreadCount > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-forest-600 text-white">
              {thread.unreadCount} new
            </span>
          )}
        </div>
        {thread.lastMessagePreview ? (
          <p className="mt-1 text-sm text-gray-500 truncate">
            <span className="text-gray-700 font-medium">{thread.lastMessageAuthorName}:</span> {thread.lastMessagePreview}
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-400 italic">No messages yet</p>
        )}
      </div>
      <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5">{formatRelative(thread.lastMessageAt)}</span>
    </Link>
  );
}

function BroadcastPanel({ canBroadcast, onSent }: { canBroadcast: boolean; onSent: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<EnrichedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/messages?tenantId=${BROADCAST_TENANT_ID}`)
      .then(r => safeJson<{ messages?: EnrichedMessage[] }>(r))
      .then(d => setMessages(d.messages ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: BROADCAST_TENANT_ID }),
    }).catch(() => {});
  }, []);

  useEffect(() => { if (expanded) load(); }, [expanded, load]);

  async function handleSend() {
    const text = body.trim();
    if (!text) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: BROADCAST_TENANT_ID, body: text, urgency: "FYI" }),
      });
      const data = await safeJson<{ message?: EnrichedMessage; error?: string }>(res);
      if (!res.ok || !data.message) throw new Error(data.error || "Failed to send");
      setMessages(prev => [data.message!, ...prev]);
      setBody("");
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden mb-4">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">Company-wide Broadcasts</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 p-4">
          {canBroadcast && (
            <div className="mb-4">
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Post a company-wide broadcast…"
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none"
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleSend}
                  disabled={submitting || !body.trim()}
                  className="h-8 px-4 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Posting…" : "Post Broadcast"}
                </button>
              </div>
            </div>
          )}
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No broadcasts yet</p>
          ) : (
            <div className="space-y-2">
              {messages.map(m => (
                <div key={m.id} className="rounded-lg bg-gray-50 p-3">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-900">{m.authorName}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${URGENCY_BADGE[m.urgency]}`}>{m.urgency}</span>
                    <span className="text-[11px] text-gray-400">{formatRelative(m.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function InboxClient({ canBroadcast }: { canBroadcast: boolean }) {
  const [threads, setThreads] = useState<InboxThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/messages/inbox")
      .then(r => safeJson<{ threads?: InboxThreadSummary[]; error?: string }>(r))
      .then(d => setThreads(d.threads ?? []))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const projectThreads = threads.filter(t => t.tenantId !== BROADCAST_TENANT_ID);

  return (
    <div>
      <BroadcastPanel canBroadcast={canBroadcast} onSent={load} />

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : projectThreads.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl">
          No project threads yet
        </div>
      ) : (
        <div className="space-y-2">
          {projectThreads.map(t => <ThreadRow key={t.tenantId} thread={t} />)}
        </div>
      )}
    </div>
  );
}
