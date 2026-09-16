"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { safeJson } from "@/lib/utils";
import { dmTenantId } from "@/lib/airtable-messages";
import { ProjectChannelThread } from "./ProjectChannelThread";
import type { DmConversationSummary } from "@/app/api/messages/dm-list/route";

interface DmContact { id: string; name: string; photoUrl?: string; }

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

function Avatar({ name, photoUrl, size }: { name: string; photoUrl?: string; size: number }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt={name} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
    );
  }
  const initials = name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="rounded-full bg-forest-100 text-forest-700 flex items-center justify-center font-semibold flex-shrink-0 text-xs select-none" style={{ width: size, height: size }}>
      {initials || "?"}
    </div>
  );
}

function DmRow({ conversation, currentUserId, currentUserName, currentUserPhoto, expanded, onToggle, onActivity }: {
  conversation: DmConversationSummary;
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
  expanded: boolean;
  onToggle: () => void;
  onActivity: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 transition-colors">
        <Avatar name={conversation.otherUserName} photoUrl={conversation.otherUserPhoto} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{conversation.otherUserName}</span>
            {conversation.unreadCount > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-forest-600 text-white">{conversation.unreadCount} new</span>
            )}
          </div>
          {conversation.lastMessagePreview ? (
            <p className="mt-0.5 text-xs text-gray-500 truncate">
              {conversation.lastMessageIsMine && <span className="text-gray-400">You: </span>}
              {conversation.lastMessagePreview}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-gray-400 italic">Say hi…</p>
          )}
        </div>
        <span className="text-[11px] text-gray-400 flex-shrink-0">{formatRelative(conversation.lastMessageAt)}</span>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 p-4">
          <ProjectChannelThread
            tenantId={conversation.tenantId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserPhoto={currentUserPhoto}
            onActivity={onActivity}
          />
        </div>
      )}
    </div>
  );
}

interface DmSectionProps {
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
}

export function DmSection({ currentUserId, currentUserName, currentUserPhoto }: DmSectionProps) {
  const [conversations, setConversations] = useState<DmConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults] = useState<DmContact[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // A conversation just started locally, before the server has any record of
  // it (no messages sent yet, so it can't show up in dm-list's activity-
  // derived results). Tracked separately from `conversations` so that a
  // server refresh — e.g. the read-marking call that fires the instant the
  // thread opens — never wipes it out. Cleared once the server actually
  // knows about it (i.e. a message has been sent).
  const [pendingConversation, setPendingConversation] = useState<DmConversationSummary | null>(null);

  // onActivity fires this on every send and every thread open (including
  // background refreshes of a conversation that's already expanded) — only
  // the very first load should show the full-list spinner, or an open
  // thread would flash away mid-conversation every time.
  const hasLoadedOnce = useRef(false);

  const load = useCallback(() => {
    if (!hasLoadedOnce.current) setLoading(true);
    fetch("/api/messages/dm-list")
      .then(r => safeJson<{ conversations?: DmConversationSummary[] }>(r))
      .then(d => {
        const server = d.conversations ?? [];
        setConversations(server);
        setPendingConversation(prev => (prev && server.some(c => c.tenantId === prev.tenantId)) ? null : prev);
      })
      .catch(() => {})
      .finally(() => { hasLoadedOnce.current = true; setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounced contact search.
  useEffect(() => {
    if (!searchOpen) return;
    const handle = setTimeout(() => {
      setSearching(true);
      fetch(`/api/messages/dm-contacts?q=${encodeURIComponent(query)}`)
        .then(r => safeJson<{ contacts?: DmContact[] }>(r))
        .then(d => setResults(d.contacts ?? []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, searchOpen]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function startConversation(contact: DmContact) {
    const tenantId = dmTenantId(currentUserId, contact.id);
    setSearchOpen(false);
    setQuery("");
    // Only need a placeholder if this isn't already a real conversation.
    if (!conversations.some(c => c.tenantId === tenantId)) {
      setPendingConversation({
        tenantId,
        otherUserId: contact.id,
        otherUserName: contact.name,
        otherUserPhoto: contact.photoUrl,
        unreadCount: 0,
        lastMessageAt: null,
        lastMessagePreview: null,
        lastMessageIsMine: false,
      });
    }
    setExpandedTenantId(tenantId);
  }

  const displayedConversations = pendingConversation && !conversations.some(c => c.tenantId === pendingConversation.tenantId)
    ? [pendingConversation, ...conversations]
    : conversations;

  return (
    <div>
      {/* Start a new DM */}
      <div ref={searchRef} className="relative mb-4">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search staff to message…"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400"
        />
        {searchOpen && (query.trim() || results.length > 0) && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
            {searching ? (
              <div className="px-3 py-3 text-sm text-gray-400">Searching…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400">No matches</div>
            ) : (
              results.map(c => (
                <button
                  key={c.id}
                  onMouseDown={e => { e.preventDefault(); startConversation(c); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-forest-50 transition-colors text-left"
                >
                  <Avatar name={c.name} photoUrl={c.photoUrl} size={28} />
                  <span className="text-sm text-gray-900">{c.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Existing conversations */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
      ) : displayedConversations.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl">
          No conversations yet — search above to message someone
        </div>
      ) : (
        <div className="space-y-2">
          {displayedConversations.map(c => (
            <DmRow
              key={c.tenantId}
              conversation={c}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserPhoto={currentUserPhoto}
              expanded={expandedTenantId === c.tenantId}
              onToggle={() => setExpandedTenantId(prev => (prev === c.tenantId ? null : c.tenantId))}
              onActivity={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
