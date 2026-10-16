"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { safeJson } from "@/lib/utils";
import { useBackClose } from "@/lib/back-button";
import { TEAM_CHANNEL } from "@/lib/airtable-messages";
import type { ProjectMessage, MessageComment, MessageUrgency } from "@/lib/airtable-messages";
import { AttachButton, AttachmentPendingChip, AttachmentView, prepareMessageAttachment, uploadMessageAttachment } from "../MessageAttachment";
import { Avatar, ProjectGlyph, AnnouncementGlyph, BackIcon, CloseIcon, ctDateKey, formatDayLabel, formatTime } from "./shared";

export type EnrichedComment = MessageComment & { authorName: string; authorPhotoUrl?: string };
export type ChatMessage = ProjectMessage & { authorName: string; authorPhotoUrl?: string; comments: EnrichedComment[] };

export interface ConversationInfo {
  kind: "announcements" | "dm" | "project";
  tenantId: string;
  title: string;
  subtitle?: string;
  photoUrl?: string;
}

interface Props {
  info: ConversationInfo;
  me: { id: string; name: string; photoUrl?: string };
  canPost: boolean;
  canAcknowledge: boolean;
  /** "fullscreen": phone, covers the app; "pane": desktop Inbox; "embedded": a fixed-height box (Plan page). */
  mode: "fullscreen" | "pane" | "embedded";
  /** Unread count when opened — draws the "New" divider. */
  initialUnread?: number;
  legacyPrivateCount?: number;
  /** Full screen with the keyboard closed: pad the composer for the home indicator. */
  padBottomSafeArea?: boolean;
  onBack?: () => void;
  onOpenMembers?: () => void;
  headerExtra?: ReactNode;
  /** Something was read or sent — the conversation list should refresh. */
  onActivity?: () => void;
}

const POLL_MS = 15000;
const INITIAL_SHOWN = 60;
const GROUP_GAP_MS = 5 * 60 * 1000;

const URGENCY_LABEL: Record<MessageUrgency, string> = { Normal: "Normal", Urgent: "Urgent", FYI: "FYI" };

function urgentHint(kind: ConversationInfo["kind"]): string {
  return kind === "project" ? "Urgent emails and notifies the Team Lead and HQ right away." : "";
}

function HeartIcon({ filled, className = "w-4 h-4" }: { filled: boolean; className?: string }) {
  return (
    <svg className={className} fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={filled ? 0 : 2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

function ReplyIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
    </svg>
  );
}

function FlagIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
    </svg>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────

function Composer({ placeholder, allowUrgency, kind, tenantId, onSend, compactTarget, padBottomSafeArea, autoFocus }: {
  placeholder: string;
  allowUrgency: boolean;
  kind: ConversationInfo["kind"];
  tenantId: string;
  onSend: (data: { body: string; urgency: MessageUrgency; attachment?: Awaited<ReturnType<typeof uploadMessageAttachment>> }) => Promise<string | null>;
  compactTarget?: boolean;
  padBottomSafeArea?: boolean;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  const [urgency, setUrgency] = useState<MessageUrgency>("Normal");
  const [menuOpen, setMenuOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [body]);

  async function send() {
    const text = body.trim();
    if ((!text && !file) || sending) return;
    setSending(true);
    setError("");
    try {
      const attachment = file ? await uploadMessageAttachment(file, kind === "project" ? tenantId : undefined) : undefined;
      const err = await onSend({ body: text, urgency, attachment });
      if (err) { setError(err); return; }
      setBody("");
      setFile(null);
      setUrgency("Normal");
      ref.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  async function attach(raw: File) {
    setError("");
    try { setFile(await prepareMessageAttachment(raw)); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't process that file."); }
  }

  const canSend = (!!body.trim() || !!file) && !sending;

  return (
    <div
      className="shrink-0 border-t border-gray-100 bg-white px-3 pt-2"
      style={{ paddingBottom: padBottomSafeArea ? "max(8px, var(--sab))" : 8 }}
    >
      {urgency !== "Normal" && (
        <div className={`mb-2 flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-xs ${urgency === "Urgent" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
          <span><span className="font-semibold">{URGENCY_LABEL[urgency]}</span>{urgency === "Urgent" && ` · ${urgentHint(kind)}`}</span>
          <button type="button" onClick={() => setUrgency("Normal")} className="font-medium underline underline-offset-2">Clear</button>
        </div>
      )}
      {file && <div className="mb-2"><AttachmentPendingChip file={file} onRemove={() => setFile(null)} /></div>}
      {error && <p className="mb-1.5 text-xs text-red-600" role="alert">{error}</p>}
      <div className="flex items-end gap-1.5 rounded-2xl border border-gray-200 bg-white pl-1.5 pr-1.5 py-1.5 focus-within:border-forest-400 focus-within:ring-2 focus-within:ring-forest-100">
        <AttachButton onSelect={attach} disabled={sending} />
        {allowUrgency && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Mark as urgent or FYI"
              aria-expanded={menuOpen}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${urgency === "Urgent" ? "border-red-300 text-red-600 bg-red-50" : urgency === "FYI" ? "border-amber-300 text-amber-700 bg-amber-50" : "border-gray-200 text-gray-400 hover:text-forest-600"}`}
            >
              <FlagIcon />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 z-20 w-56 rounded-xl border border-gray-200 bg-white shadow-lg py-1">
                  {(["Normal", "Urgent", "FYI"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => { setUrgency(u); setMenuOpen(false); ref.current?.focus(); }}
                      className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 ${urgency === u ? "font-semibold text-gray-900" : "text-gray-700"}`}
                    >
                      {u === "Normal" ? "Normal message" : u === "Urgent" ? "Urgent — notify Lead + HQ" : "FYI — no action needed"}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <textarea
          ref={ref}
          value={body}
          autoFocus={autoFocus}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
            if (e.key === "Enter" && !e.shiftKey && !coarse) { e.preventDefault(); send(); }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          className="flex-1 min-w-0 resize-none bg-transparent px-1.5 py-1.5 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none leading-snug"
        />
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="Send"
          className={`flex-shrink-0 ${compactTarget ? "w-8 h-8" : "w-9 h-9"} rounded-xl flex items-center justify-center transition-colors ${canSend ? "bg-forest-600 text-white hover:bg-forest-700" : "bg-gray-100 text-gray-300"}`}
        >
          {sending ? <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" /> : <SendIcon />}
        </button>
      </div>
    </div>
  );
}

// ─── Message row ─────────────────────────────────────────────────────────────

function MessageRow({ m, me, startsGroup, active, canAcknowledge, showThreadLink, onToggleActive, onLike, onOpenThread, onAcknowledge }: {
  m: ChatMessage;
  me: Props["me"];
  startsGroup: boolean;
  active: boolean;
  canAcknowledge: boolean;
  showThreadLink: boolean;
  onToggleActive: () => void;
  onLike: () => void;
  onOpenThread: () => void;
  onAcknowledge: () => void;
}) {
  const liked = m.likedBy.includes(me.id);
  const replies = m.comments.length;
  const isUrgent = m.urgency === "Urgent";

  return (
    <div
      className={`group relative flex gap-2.5 px-4 ${startsGroup ? "pt-3" : "pt-0.5"} pb-0.5 ${active ? "bg-gray-50" : "lg:hover:bg-gray-50"} ${isUrgent ? "border-l-[3px] border-red-400 pl-[13px]" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        onToggleActive();
      }}
    >
      <div className="w-9 flex-shrink-0">
        {startsGroup ? (
          <Avatar name={m.authorName} photoUrl={m.authorPhotoUrl} size={36} />
        ) : (
          <span className="hidden lg:group-hover:block text-[10px] text-gray-400 text-right pt-1 pr-0.5">{formatTime(m.timestamp).replace(/ [AP]M$/, "")}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {startsGroup && (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[15px] font-bold text-gray-900">{m.authorName}</span>
            <span className="text-xs text-gray-400">{formatTime(m.timestamp)}</span>
          </div>
        )}
        {m.urgency !== "Normal" && (
          <span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide ${isUrgent ? "text-red-600" : "text-amber-600"}`}>
            <FlagIcon className="w-3 h-3" /> {m.urgency}
          </span>
        )}
        {m.body && <p className="text-[15px] text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>}
        {m.attachment && <AttachmentView attachment={m.attachment} />}

        {isUrgent && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {m.acknowledgedAt ? (
              <span className="text-xs font-medium text-emerald-700">✓ Acknowledged</span>
            ) : canAcknowledge ? (
              <button type="button" onClick={onAcknowledge} className="text-xs font-semibold px-3 h-8 rounded-lg bg-red-600 text-white hover:bg-red-700">Acknowledge</button>
            ) : (
              <span className="text-xs font-medium text-red-600">Waiting on HQ</span>
            )}
          </div>
        )}

        {(m.likedBy.length > 0 || (showThreadLink && replies > 0)) && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {m.likedBy.length > 0 && (
              <button
                type="button"
                onClick={onLike}
                aria-pressed={liked}
                className={`inline-flex items-center gap-1 h-7 px-2 rounded-full border text-xs font-semibold ${liked ? "border-forest-300 bg-forest-50 text-forest-700" : "border-gray-200 text-gray-600"}`}
              >
                <HeartIcon filled className="w-3.5 h-3.5 text-red-500" /> {m.likedBy.length}
              </button>
            )}
            {showThreadLink && replies > 0 && (
              <button type="button" onClick={onOpenThread} className="inline-flex items-center gap-1.5 h-7 text-xs font-semibold text-forest-700 hover:underline">
                <span className="flex -space-x-1.5">
                  {[...new Map(m.comments.map((c) => [c.authorClerkId, c])).values()].slice(0, 3).map((c) => (
                    <Avatar key={c.authorClerkId} name={c.authorName} photoUrl={c.authorPhotoUrl} size={20} className="ring-2 ring-white" />
                  ))}
                </span>
                {replies} {replies === 1 ? "reply" : "replies"}
                <span className="font-normal text-gray-400">· {formatTime(m.comments[m.comments.length - 1].createdAt)}</span>
              </button>
            )}
          </div>
        )}

        {/* Mobile: tap a message for its actions */}
        {active && (
          <div className="lg:hidden mt-2 mb-1 flex items-center gap-2">
            <button type="button" onClick={onLike} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-sm font-medium ${liked ? "border-forest-300 bg-forest-50 text-forest-700" : "border-gray-200 text-gray-700"}`}>
              <HeartIcon filled={liked} className={`w-4 h-4 ${liked ? "text-red-500" : ""}`} /> {liked ? "Liked" : "Like"}
            </button>
            {showThreadLink && (
              <button type="button" onClick={onOpenThread} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-gray-200 text-sm font-medium text-gray-700">
                <ReplyIcon /> Reply in thread
              </button>
            )}
          </div>
        )}
      </div>

      {/* Desktop: hover actions */}
      <div className="hidden lg:group-hover:flex absolute -top-3 right-4 items-center rounded-lg border border-gray-200 bg-white shadow-sm">
        <button type="button" onClick={onLike} title={liked ? "Unlike" : "Like"} className={`w-8 h-8 flex items-center justify-center hover:bg-gray-50 rounded-l-lg ${liked ? "text-red-500" : "text-gray-500"}`}>
          <HeartIcon filled={liked} />
        </button>
        {showThreadLink && (
          <button type="button" onClick={onOpenThread} title="Reply in thread" className="w-8 h-8 flex items-center justify-center hover:bg-gray-50 rounded-r-lg text-gray-500">
            <ReplyIcon />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Thread panel ────────────────────────────────────────────────────────────

function ThreadPanel({ message, me, title, canAcknowledge, onClose, onLike, onAcknowledge, onReplied, fullscreen }: {
  message: ChatMessage;
  me: Props["me"];
  title: string;
  canAcknowledge: boolean;
  onClose: () => void;
  onLike: () => void;
  onAcknowledge: () => void;
  onReplied: (c: EnrichedComment) => void;
  fullscreen: boolean;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [message.comments.length]);

  async function reply() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/messages/${message.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await safeJson<{ comment?: EnrichedComment; error?: string }>(res);
      if (!res.ok || !data.comment) throw new Error(data.error || "Couldn't send");
      onReplied(data.comment);
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="shrink-0 flex items-center gap-2 px-2 h-14 border-b border-gray-100" style={fullscreen ? { paddingTop: "var(--sat)", height: "calc(56px + var(--sat))" } : undefined}>
        <button type="button" onClick={onClose} aria-label="Close thread" className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100">
          <span className="lg:hidden"><BackIcon /></span>
          <span className="hidden lg:block"><CloseIcon /></span>
        </button>
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-900 leading-tight">Thread</p>
          <p className="text-xs text-gray-500 truncate">{title}</p>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3">
        <MessageRow
          m={message}
          me={me}
          startsGroup
          active={false}
          canAcknowledge={canAcknowledge}
          showThreadLink={false}
          onToggleActive={() => {}}
          onLike={onLike}
          onOpenThread={() => {}}
          onAcknowledge={onAcknowledge}
        />
        <div className="flex items-center gap-3 px-4 my-3">
          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">{message.comments.length} {message.comments.length === 1 ? "reply" : "replies"}</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        {message.comments.map((c, i) => {
          const prev = message.comments[i - 1];
          const starts = !prev || prev.authorClerkId !== c.authorClerkId || new Date(c.createdAt).getTime() - new Date(prev.createdAt).getTime() > GROUP_GAP_MS;
          return (
            <div key={c.id} className={`flex gap-2.5 px-4 ${starts ? "pt-3" : "pt-0.5"}`}>
              <div className="w-9 flex-shrink-0">{starts && <Avatar name={c.authorName} photoUrl={c.authorPhotoUrl} size={36} />}</div>
              <div className="flex-1 min-w-0">
                {starts && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[15px] font-bold text-gray-900">{c.authorName}</span>
                    <span className="text-xs text-gray-400">{formatTime(c.createdAt)}</span>
                  </div>
                )}
                <p className="text-[15px] text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{c.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="shrink-0 border-t border-gray-100 px-3 pt-2" style={{ paddingBottom: fullscreen ? "max(8px, var(--sab))" : 8 }}>
        {error && <p className="mb-1.5 text-xs text-red-600" role="alert">{error}</p>}
        <div className="flex items-end gap-1.5 rounded-2xl border border-gray-200 pl-3 pr-1.5 py-1.5 focus-within:border-forest-400 focus-within:ring-2 focus-within:ring-forest-100">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              const coarse = window.matchMedia("(pointer: coarse)").matches;
              if (e.key === "Enter" && !e.shiftKey && !coarse) { e.preventDefault(); reply(); }
            }}
            rows={1}
            placeholder="Reply…"
            aria-label="Reply in thread"
            className="flex-1 min-w-0 resize-none bg-transparent py-1.5 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none max-h-36"
          />
          <button
            type="button"
            onClick={reply}
            disabled={!body.trim() || sending}
            aria-label="Send reply"
            className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${body.trim() && !sending ? "bg-forest-600 text-white hover:bg-forest-700" : "bg-gray-100 text-gray-300"}`}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Earlier private lines (read-only) ───────────────────────────────────────

function LegacyPrivateHistory({ tenantId, onClose, fullscreen }: { tenantId: string; onClose: () => void; fullscreen: boolean }) {
  const [groups, setGroups] = useState<{ label: string; messages: ChatMessage[] }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ch = await fetch(`/api/messages/channels?tenantId=${tenantId}`).then((r) => safeJson<{ channels?: { key: string; label: string }[] }>(r)).catch(() => ({ channels: [] as { key: string; label: string }[] }));
      const privateChannels = (ch.channels ?? []).filter((c) => c.key !== TEAM_CHANNEL);
      const loaded = await Promise.all(privateChannels.map(async (c) => {
        const d = await fetch(`/api/messages?tenantId=${tenantId}&channel=${encodeURIComponent(c.key)}`).then((r) => safeJson<{ messages?: ChatMessage[] }>(r)).catch(() => ({ messages: [] as ChatMessage[] }));
        return { label: c.label, messages: [...(d.messages ?? [])].reverse() };
      }));
      if (!cancelled) setGroups(loaded.filter((g) => g.messages.length > 0));
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="shrink-0 flex items-center gap-2 px-2 border-b border-gray-100" style={{ paddingTop: fullscreen ? "var(--sat)" : 0, height: fullscreen ? "calc(56px + var(--sat))" : 56 }}>
        <button type="button" onClick={onClose} aria-label="Back" className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"><BackIcon /></button>
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-900 leading-tight">Earlier private messages</p>
          <p className="text-xs text-gray-500">Read only — continue in Direct Messages</p>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-6">
        {groups === null ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No earlier private messages.</p>
        ) : groups.map((g) => (
          <div key={g.label}>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{g.label}</p>
            <div className="space-y-3">
              {g.messages.map((m) => (
                <div key={m.id} className="flex gap-2.5">
                  <Avatar name={m.authorName} photoUrl={m.authorPhotoUrl} size={32} />
                  <div className="min-w-0">
                    <p className="text-sm"><span className="font-bold text-gray-900">{m.authorName}</span> <span className="text-xs text-gray-400">{formatDayLabel(m.timestamp)} {formatTime(m.timestamp)}</span></p>
                    {m.body && <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{m.body}</p>}
                    {m.attachment && <AttachmentView attachment={m.attachment} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Conversation ────────────────────────────────────────────────────────────

export function ConversationView({
  info, me, canPost, canAcknowledge, mode, initialUnread = 0, legacyPrivateCount = 0,
  padBottomSafeArea, onBack, onOpenMembers, headerExtra, onActivity,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null); // ascending
  const [loadError, setLoadError] = useState("");
  const [shown, setShown] = useState(INITIAL_SHOWN);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  // Set just before older messages are prepended, to keep the reader's place
  const heightBeforePrepend = useRef<number | null>(null);
  const lastSeenTimestamp = useRef<string>("");
  const fullscreen = mode === "fullscreen";
  const { tenantId, kind } = info;

  // Android back closes an open thread / history view before the conversation
  useBackClose(threadId ? () => setThreadId(null) : showLegacy ? () => setShowLegacy(false) : null);

  const markRead = useCallback(() => {
    fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, channel: TEAM_CHANNEL }),
    }).then(() => onActivity?.()).catch(() => {});
  }, [tenantId, onActivity]);

  const load = useCallback(async (initial: boolean) => {
    try {
      const res = await fetch(`/api/messages?tenantId=${encodeURIComponent(tenantId)}&channel=${TEAM_CHANNEL}`);
      const data = await safeJson<{ messages?: ChatMessage[]; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Couldn't load messages");
      const asc = [...(data.messages ?? [])].reverse();
      const newest = asc[asc.length - 1]?.timestamp ?? "";
      if (initial) {
        if (initialUnread > 0) {
          const fromOthers = asc.filter((m) => m.authorClerkId !== me.id);
          setFirstUnreadId(fromOthers[Math.max(0, fromOthers.length - initialUnread)]?.id ?? null);
        }
        setMessages(asc);
        lastSeenTimestamp.current = newest;
        markRead();
      } else {
        setMessages((prev) => {
          // Keep any optimistic local state for messages the server echoes
          const prevById = new Map((prev ?? []).map((m) => [m.id, m]));
          return asc.map((m) => ({ ...prevById.get(m.id), ...m }));
        });
        if (newest > lastSeenTimestamp.current) {
          const hasFromOthers = asc.some((m) => m.timestamp > lastSeenTimestamp.current && m.authorClerkId !== me.id);
          lastSeenTimestamp.current = newest;
          if (hasFromOthers) {
            if (!stickToBottom.current) setNewBelow(true);
            markRead();
          }
        }
      }
      setLoadError("");
    } catch (e) {
      if (initial) setLoadError(e instanceof Error ? e.message : "Couldn't load messages");
    }
  }, [tenantId, initialUnread, me.id, markRead]);

  // Load on open; refresh while visible and when the app comes back
  useEffect(() => {
    setMessages(null);
    setThreadId(null);
    setActiveId(null);
    setShown(INITIAL_SHOWN);
    setFirstUnreadId(null);
    stickToBottom.current = true;
    load(true);
    const refresh = () => { if (document.visibilityState === "visible") load(false); };
    const timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Stay pinned to the newest message unless the reader scrolled up
  useLayoutEffect(() => {
    const el = streamRef.current;
    if (!el || !messages) return;
    if (heightBeforePrepend.current !== null) {
      el.scrollTop += el.scrollHeight - heightBeforePrepend.current;
      heightBeforePrepend.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, shown]);

  // Keyboard opening shrinks the screen — keep the newest message in view
  useEffect(() => {
    const el = streamRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (stickToBottom.current) el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function onScroll() {
    const el = streamRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = atBottom;
    if (atBottom) setNewBelow(false);
  }

  function scrollToBottom() {
    const el = streamRef.current;
    if (!el) return;
    stickToBottom.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setNewBelow(false);
  }

  const update = (id: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
    setMessages((prev) => prev?.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)) ?? prev);

  async function like(m: ChatMessage) {
    const liked = m.likedBy.includes(me.id);
    update(m.id, { likedBy: liked ? m.likedBy.filter((x) => x !== me.id) : [...m.likedBy, me.id] });
    const res = await fetch(`/api/messages/${m.id}/like`, { method: "POST" }).catch(() => null);
    const data = res ? await safeJson<{ message?: { likedBy: string[] } }>(res).catch(() => ({ message: undefined })) : { message: undefined };
    if (data.message) update(m.id, { likedBy: data.message.likedBy });
    else update(m.id, { likedBy: m.likedBy });
  }

  async function acknowledge(m: ChatMessage) {
    update(m.id, { acknowledgedAt: new Date().toISOString() });
    const res = await fetch(`/api/messages/${m.id}/acknowledge`, { method: "POST" }).catch(() => null);
    if (!res?.ok) update(m.id, { acknowledgedAt: m.acknowledgedAt });
  }

  async function send(data: { body: string; urgency: MessageUrgency; attachment?: Awaited<ReturnType<typeof uploadMessageAttachment>> }): Promise<string | null> {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, channel: TEAM_CHANNEL, body: data.body, urgency: kind === "project" ? data.urgency : (kind === "announcements" ? "FYI" : "Normal"), attachment: data.attachment }),
    });
    const out = await safeJson<{ message?: ChatMessage; error?: string }>(res);
    if (!res.ok || !out.message) return out.error || "Couldn't send";
    stickToBottom.current = true;
    lastSeenTimestamp.current = out.message.timestamp;
    setFirstUnreadId(null);
    setMessages((prev) => [...(prev ?? []), { ...out.message!, comments: out.message!.comments ?? [] }]);
    onActivity?.();
    return null;
  }

  const visible = useMemo(() => (messages ?? []).slice(-shown), [messages, shown]);
  const hiddenOlder = (messages?.length ?? 0) - visible.length;
  const thread = threadId ? messages?.find((m) => m.id === threadId) ?? null : null;
  const placeholder = kind === "project" ? `Message #${info.title}` : kind === "dm" ? `Message ${info.title}` : "Post an announcement";
  const threadAsSidePane = mode === "pane";

  const header = (
    <div
      className="shrink-0 flex items-center gap-2 px-2 border-b border-gray-100 bg-white"
      style={{ paddingTop: fullscreen ? "var(--sat)" : 0, height: fullscreen ? "calc(60px + var(--sat))" : 60 }}
    >
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Back to Inbox" className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 flex-shrink-0">
          <BackIcon />
        </button>
      )}
      <button
        type="button"
        onClick={onOpenMembers}
        disabled={!onOpenMembers}
        className={`flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-lg py-1 ${onBack ? "" : "pl-2"} ${onOpenMembers ? "hover:bg-gray-50" : "cursor-default"}`}
      >
        {kind === "dm" ? <Avatar name={info.title} photoUrl={info.photoUrl} size={34} /> : kind === "project" ? <ProjectGlyph size={34} /> : <AnnouncementGlyph size={34} />}
        <span className="min-w-0">
          <span className="block text-base font-bold text-gray-900 truncate leading-tight">{info.title}</span>
          {info.subtitle && <span className="block text-xs text-gray-500 truncate">{info.subtitle}</span>}
        </span>
      </button>
      {headerExtra}
      {onOpenMembers && kind === "project" && (
        <button type="button" onClick={onOpenMembers} aria-label="Project members" className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 flex-shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}
    </div>
  );

  let lastDay = "";
  let lastMsg: ChatMessage | null = null;

  const stream = (
    <div ref={streamRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3" role="log" aria-live="polite">
      {messages === null ? (
        loadError ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-gray-500">{loadError}</p>
            <button type="button" onClick={() => load(true)} className="text-sm font-semibold text-forest-700">Try again</button>
          </div>
        ) : (
          <div className="p-4 space-y-5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2.5 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-100" />
                <div className="flex-1 space-y-2 pt-1"><div className="h-3 w-24 bg-gray-100 rounded" /><div className="h-3 w-3/4 bg-gray-100 rounded" /></div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="px-4 pt-6 pb-2">
            {hiddenOlder > 0 ? (
              <button type="button" onClick={() => {
                stickToBottom.current = false;
                heightBeforePrepend.current = streamRef.current?.scrollHeight ?? null;
                setShown((s) => s + INITIAL_SHOWN);
              }} className="w-full text-center text-sm font-semibold text-forest-700 py-2 rounded-lg hover:bg-forest-50">
                Load earlier messages
              </button>
            ) : (
              <div className="pb-2">
                {kind === "dm" ? <Avatar name={info.title} photoUrl={info.photoUrl} size={56} /> : kind === "project" ? <ProjectGlyph size={56} /> : <AnnouncementGlyph size={56} />}
                <p className="mt-3 text-lg font-bold text-gray-900">{kind === "project" ? `#${info.title}` : info.title}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {kind === "project"
                    ? "Everyone on this project's team — the Team Lead, scheduled crew, and HQ — sees messages here."
                    : kind === "dm"
                      ? `This is the start of your direct messages with ${info.title}. Only the two of you can see them.`
                      : "Company-wide announcements from HQ."}
                </p>
              </div>
            )}
            {kind === "project" && legacyPrivateCount > 0 && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm text-gray-600">
                Private lines with HQ and Team Leads now live in Direct Messages.{" "}
                <button type="button" onClick={() => setShowLegacy(true)} className="font-semibold text-forest-700 hover:underline">
                  View {legacyPrivateCount} earlier private message{legacyPrivateCount === 1 ? "" : "s"}
                </button>
              </div>
            )}
          </div>

          {visible.map((m) => {
            const day = ctDateKey(m.timestamp);
            const showDay = day !== lastDay;
            const prev: ChatMessage | null = showDay ? null : lastMsg;
            const startsGroup = !prev
              || prev.authorClerkId !== m.authorClerkId
              || new Date(m.timestamp).getTime() - new Date(prev.timestamp).getTime() > GROUP_GAP_MS
              || m.urgency !== "Normal" || prev.urgency !== "Normal"
              || m.id === firstUnreadId;
            lastDay = day;
            lastMsg = m;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="flex justify-center py-2">
                    <span className="text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-full px-3 py-1 shadow-sm">{formatDayLabel(m.timestamp)}</span>
                  </div>
                )}
                {m.id === firstUnreadId && (
                  <div className="flex items-center gap-2 px-4 my-1" aria-label="New messages">
                    <div className="h-px flex-1 bg-red-300" />
                    <span className="text-[11px] font-bold uppercase tracking-wide text-red-500">New</span>
                  </div>
                )}
                <MessageRow
                  m={m}
                  me={me}
                  startsGroup={startsGroup}
                  active={activeId === m.id}
                  canAcknowledge={canAcknowledge && kind === "project"}
                  showThreadLink
                  onToggleActive={() => setActiveId((a) => (a === m.id ? null : m.id))}
                  onLike={() => like(m)}
                  onOpenThread={() => { setThreadId(m.id); setActiveId(null); }}
                  onAcknowledge={() => acknowledge(m)}
                />
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 bg-white">
      <div className="relative flex flex-col flex-1 min-w-0 min-h-0">
        {header}
        {stream}
        {newBelow && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute left-1/2 -translate-x-1/2 bottom-24 z-10 h-9 px-4 rounded-full bg-forest-600 text-white text-sm font-semibold shadow-lg"
          >
            New messages ↓
          </button>
        )}
        {canPost ? (
          <Composer
            placeholder={placeholder}
            allowUrgency={kind === "project"}
            kind={kind}
            tenantId={tenantId}
            onSend={send}
            padBottomSafeArea={padBottomSafeArea}
          />
        ) : (
          <div className="shrink-0 border-t border-gray-100 px-4 py-3 text-center text-sm text-gray-500" style={{ paddingBottom: padBottomSafeArea ? "max(12px, var(--sab))" : 12 }}>
            Only HQ can post announcements.
          </div>
        )}
      </div>

      {thread && (
        <div className={threadAsSidePane ? "w-[380px] flex-shrink-0 border-l border-gray-200" : "absolute inset-0 z-20"}>
          <ThreadPanel
            message={thread}
            me={me}
            title={kind === "project" ? `#${info.title}` : info.title}
            canAcknowledge={canAcknowledge && kind === "project"}
            onClose={() => setThreadId(null)}
            onLike={() => like(thread)}
            onAcknowledge={() => acknowledge(thread)}
            onReplied={(c) => update(thread.id, (m) => ({ comments: [...m.comments, c] }))}
            fullscreen={fullscreen}
          />
        </div>
      )}

      {showLegacy && (
        <div className="absolute inset-0 z-30">
          <LegacyPrivateHistory tenantId={tenantId} onClose={() => setShowLegacy(false)} fullscreen={fullscreen} />
        </div>
      )}
    </div>
  );
}
