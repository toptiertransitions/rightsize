"use client";

import { useState, useEffect, useCallback } from "react";
import { safeJson } from "@/lib/utils";
import { TEAM_CHANNEL } from "@/lib/airtable-messages";
import type { ProjectMessage, MessageComment, MessageUrgency } from "@/lib/airtable-messages";

type EnrichedComment = MessageComment & { authorName: string; authorPhotoUrl?: string };
type EnrichedMessage = ProjectMessage & { authorName: string; authorPhotoUrl?: string; comments: EnrichedComment[] };
interface ChannelInfo { key: string; label: string; }

const PAGE_SIZE = 5;
const LOAD_MORE_SIZE = 10;

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

function Avatar({ name, photoUrl, size }: { name: string; photoUrl?: string; size: number }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
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

function CommentRow({ comment }: { comment: EnrichedComment }) {
  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={comment.authorName} photoUrl={comment.authorPhotoUrl} size={28} />
      <div className="flex-1 min-w-0 bg-gray-50 rounded-xl px-3 py-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-900">{comment.authorName}</span>
          <span className="text-[11px] text-gray-400">{formatCT(comment.createdAt)}</span>
        </div>
        <p className="mt-0.5 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{comment.body}</p>
      </div>
    </div>
  );
}

interface MessageCardProps {
  message: EnrichedMessage;
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
  onLikeToggled: (messageId: string, likedBy: string[]) => void;
  onCommentAdded: (messageId: string, comment: EnrichedComment) => void;
}

function MessageCard({ message, currentUserId, currentUserName, currentUserPhoto, onLikeToggled, onCommentAdded }: MessageCardProps) {
  const style = URGENCY_STYLES[message.urgency];
  const [liking, setLiking] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const liked = message.likedBy.includes(currentUserId);

  async function handleToggleLike() {
    if (liking) return;
    setLiking(true);
    try {
      const res = await fetch(`/api/messages/${message.id}/like`, { method: "POST" });
      const data = await safeJson<{ message?: { likedBy: string[] }; error?: string }>(res);
      if (!res.ok || !data.message) throw new Error(data.error);
      onLikeToggled(message.id, data.message.likedBy);
    } catch { /* non-fatal — leave state unchanged */ }
    finally { setLiking(false); }
  }

  async function handleAddComment() {
    const text = commentText.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/messages/${message.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await safeJson<{ comment?: EnrichedComment; error?: string }>(res);
      if (!res.ok || !data.comment) throw new Error(data.error);
      onCommentAdded(message.id, data.comment);
      setCommentText("");
      setShowReply(false);
    } catch { /* non-fatal */ }
    finally { setSubmitting(false); }
  }

  return (
    <div className={`rounded-xl border ${style.border} p-3.5`}>
      <div className="flex items-start gap-3">
        <Avatar name={message.authorName} photoUrl={message.authorPhotoUrl} size={32} />
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

      {/* Like + comment toggle */}
      <div className="mt-2.5 ml-11 flex items-center gap-4">
        <button
          onClick={handleToggleLike}
          disabled={liking}
          className={`flex items-center gap-1 text-xs font-medium transition-colors ${
            liked ? "text-forest-600" : "text-gray-400 hover:text-forest-600"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill={liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={liked ? 0 : 2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          {message.likedBy.length > 0 ? message.likedBy.length : "Like"}
        </button>
        <button
          onClick={() => setShowReply(v => !v)}
          className="text-xs text-gray-400 hover:text-forest-600 transition-colors font-medium"
        >
          {message.comments.length > 0
            ? `${message.comments.length} comment${message.comments.length !== 1 ? "s" : ""}`
            : "Comment"}
        </button>
      </div>

      {/* Comments */}
      {message.comments.length > 0 && (
        <div className="mt-3 ml-11 space-y-2.5 border-l-2 border-gray-100 pl-4">
          {message.comments.map(c => <CommentRow key={c.id} comment={c} />)}
        </div>
      )}

      {/* Reply box */}
      {showReply && (
        <div className="mt-3 ml-11 flex items-start gap-2.5">
          <Avatar name={currentUserName} photoUrl={currentUserPhoto} size={28} />
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              autoFocus
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Write a comment…"
              className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400"
              onKeyDown={e => {
                if (e.key === "Enter") handleAddComment();
                if (e.key === "Escape") { setShowReply(false); setCommentText(""); }
              }}
            />
            <button
              onClick={handleAddComment}
              disabled={submitting || !commentText.trim()}
              className="h-7 px-3 bg-forest-600 text-white text-xs font-medium rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "…" : "Post"}
            </button>
            <button
              onClick={() => { setShowReply(false); setCommentText(""); }}
              className="h-7 px-2 text-gray-400 hover:text-gray-600 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ProjectChannelThreadProps {
  tenantId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
  /** Called after sending or marking a channel read, so a parent list view (e.g. Inbox) can refresh its own unread counts. */
  onActivity?: () => void;
}

/**
 * Channel switcher + compose + feed for one project — the Full Project
 * Team channel plus private Staff↔HQ / Staff↔Team Lead lines. Shared
 * between the Plan page's Project Messages section and the Inbox's
 * inline-expanded thread view, so both stay in sync with zero duplication.
 */
export function ProjectChannelThread({ tenantId, currentUserId, currentUserName, currentUserPhoto, onActivity }: ProjectChannelThreadProps) {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>(TEAM_CHANNEL);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [messages, setMessages] = useState<EnrichedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
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
    setVisibleCount(PAGE_SIZE);
    fetch(`/api/messages?tenantId=${tenantId}&channel=${encodeURIComponent(activeChannel)}`)
      .then(r => safeJson<{ messages?: EnrichedMessage[] }>(r))
      .then(d => setMessages(d.messages ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, channel: activeChannel }),
    })
      .then(() => onActivity?.())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      onActivity?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  }

  function handleLikeToggled(messageId: string, likedBy: string[]) {
    setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, likedBy } : m)));
  }

  function handleCommentAdded(messageId: string, comment: EnrichedComment) {
    setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, comments: [...m.comments, comment] } : m)));
  }

  const activeChannelInfo = channels.find(c => c.key === activeChannel);
  // Messages arrive newest-first; showing the first N is "the last N messages".
  const visibleMessages = messages.slice(0, visibleCount);
  const remaining = messages.length - visibleMessages.length;

  return (
    <div>
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
        <Avatar name={currentUserName} photoUrl={currentUserPhoto} size={36} />
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
        <>
          <div className="space-y-3">
            {visibleMessages.map(m => (
              <MessageCard
                key={m.id}
                message={m}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                currentUserPhoto={currentUserPhoto}
                onLikeToggled={handleLikeToggled}
                onCommentAdded={handleCommentAdded}
              />
            ))}
          </div>
          {remaining > 0 && (
            <button
              onClick={() => setVisibleCount(c => c + LOAD_MORE_SIZE)}
              className="mt-4 w-full text-center text-xs font-semibold text-forest-700 hover:text-forest-800 py-2 rounded-lg hover:bg-forest-50 transition-colors"
            >
              See {Math.min(remaining, LOAD_MORE_SIZE)} more ({remaining} older)
            </button>
          )}
        </>
      )}
    </div>
  );
}
