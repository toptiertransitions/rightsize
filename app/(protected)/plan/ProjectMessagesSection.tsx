"use client";

import { useState, useEffect, useCallback } from "react";
import { safeJson } from "@/lib/utils";
import { TEAM_CHANNEL } from "@/lib/airtable-messages";
import type { ProjectMessage, MessageUrgency } from "@/lib/airtable-messages";

type EnrichedMessage = ProjectMessage & { authorName: string };
interface ChannelInfo { key: string; label: string; }

function formatCT(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " CT";
}

function Avatar({ name, size }: { name: string; size: number }) {
  const initials = name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="rounded-full bg-forest-100 text-forest-700 flex items-center justify-center font-semibold flex-shrink-0 text-xs select-none"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </div>
  );
}

const URGENCY_STYLES: Record<MessageUrgency, { label: string; badge: string; border: string }> = {
  Urgent: { label: "Urgent", badge: "bg-red-100 text-red-700", border: "border-red-200" },
  Normal: { label: "Normal", badge: "bg-gray-100 text-gray-600", border: "border-gray-200" },
  FYI:    { label: "FYI",    badge: "bg-amber-100 text-amber-700", border: "border-amber-200" },
};

/** Who an Urgent message on this channel will email — mirrors app/api/messages/route.ts's urgentRecipients(). */
function urgentHint(channel: string): string {
  if (channel === TEAM_CHANNEL) return "Emails the project's Team Lead and all active Managers/Admins immediately.";
  if (channel.startsWith("hq:")) return "Emails all active Managers/Admins immediately.";
  if (channel.startsWith("lead:")) return "Emails the other person in this conversation immediately.";
  return "";
}

function MessageCard({ message }: { message: EnrichedMessage }) {
  const style = URGENCY_STYLES[message.urgency];
  return (
    <div className={`flex items-start gap-3 rounded-xl border ${style.border} p-3.5`}>
      <Avatar name={message.authorName} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{message.authorName}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>{style.label}</span>
          <span className="text-[11px] text-gray-400">{formatCT(message.timestamp)}</span>
        </div>
        <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{message.body}</p>
        {message.urgency === "Urgent" && !message.channel.startsWith("lead:") && (
          <p className="mt-1.5 text-[11px] font-medium">
            {message.acknowledgedAt
              ? <span className="text-emerald-600">✓ Acknowledged</span>
              : <span className="text-red-500">Awaiting acknowledgment from Ops</span>}
          </p>
        )}
      </div>
    </div>
  );
}

interface ProjectMessagesSectionProps {
  tenantId: string;
  currentUserName: string;
}

export function ProjectMessagesSection({ tenantId, currentUserName }: ProjectMessagesSectionProps) {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>(TEAM_CHANNEL);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [messages, setMessages] = useState<EnrichedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [urgency, setUrgency] = useState<MessageUrgency>("Normal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load available channels once per project.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/messages/channels?tenantId=${tenantId}`)
      .then(r => safeJson<{ channels?: ChannelInfo[] }>(r))
      .then(d => { if (!cancelled) setChannels(d.channels ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChannelsLoaded(true); });
    return () => { cancelled = true; };
  }, [tenantId]);

  // Load messages + mark read whenever the active channel changes.
  const loadChannel = useCallback(() => {
    setLoading(true);
    fetch(`/api/messages?tenantId=${tenantId}&channel=${encodeURIComponent(activeChannel)}`)
      .then(r => safeJson<{ messages?: EnrichedMessage[] }>(r))
      .then(d => setMessages(d.messages ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, channel: activeChannel }),
    }).catch(() => {});
  }, [tenantId, activeChannel]);

  useEffect(() => { loadChannel(); }, [loadChannel]);

  async function handleSend() {
    const text = body.trim();
    if (!text) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, channel: activeChannel, body: text, urgency }),
      });
      const data = await safeJson<{ message?: EnrichedMessage; error?: string }>(res);
      if (!res.ok || !data.message) throw new Error(data.error || "Failed to send");
      setMessages(prev => [data.message!, ...prev]);
      setBody("");
      setUrgency("Normal");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  }

  const activeChannelInfo = channels.find(c => c.key === activeChannel);

  return (
    <div className="mt-10 pt-8 border-t border-gray-200">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-forest-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Project Messages</h2>
          <p className="text-xs text-gray-400">Full team channel, plus private lines to HQ and your Team Lead</p>
        </div>
      </div>

      {/* Channel switcher */}
      {channelsLoaded && channels.length > 1 && (
        <div className="flex items-center gap-1.5 mb-5 overflow-x-auto">
          {channels.map(c => (
            <button
              key={c.key}
              onClick={() => setActiveChannel(c.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                activeChannel === c.key
                  ? "bg-forest-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {c.key !== TEAM_CHANNEL && "🔒 "}{c.label}
            </button>
          ))}
        </div>
      )}

      {/* Compose */}
      <div className="flex gap-3 mb-6">
        <Avatar name={currentUserName} size={36} />
        <div className="flex-1">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={activeChannelInfo?.key === TEAM_CHANNEL || !activeChannelInfo
              ? "Message this project's crew and Team Lead…"
              : `Message ${activeChannelInfo.label}…`}
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none"
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }}
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            <div className="flex gap-1.5">
              {(["Normal", "Urgent", "FYI"] as const).map(tier => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setUrgency(tier)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    urgency === tier
                      ? `${URGENCY_STYLES[tier].badge} ${URGENCY_STYLES[tier].border}`
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
            <button
              onClick={handleSend}
              disabled={submitting || !body.trim()}
              className="h-8 px-4 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Sending…" : "Send"}
            </button>
          </div>
          {urgency === "Urgent" && (
            <p className="mt-1.5 text-[11px] text-red-600">{urgentHint(activeChannel)}</p>
          )}
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
      ) : messages.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl">
          No messages yet
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map(m => (
            <MessageCard key={m.id} message={m} />
          ))}
        </div>
      )}
    </div>
  );
}
