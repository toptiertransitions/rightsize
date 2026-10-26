"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone, Pin, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchCombobox } from "@/components/ui/SearchCombobox";
import type { Shoutout } from "@/lib/shoutouts";

const MAX_LENGTH = 1500; // matches SHOUTOUT_MAX_LENGTH (lib/shoutouts.ts is server-only)
const FEED_PAGE = 8;

function fmtWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

function ShoutoutCard({ s, pinned, canDelete, onDelete }: { s: Shoutout; pinned?: boolean; canDelete: boolean; onDelete: (id: string) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <div className={cn("rounded-2xl border p-4", pinned ? "border-forest-300 bg-forest-50" : "border-gray-200 bg-white")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{s.recipientName}</span>
          <span className="text-gray-400"> from </span>
          <span className="font-medium text-gray-700">{s.authorName}</span>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {pinned && <Pin className="w-3.5 h-3.5 text-forest-600" aria-label="Pinned" />}
          <span className="text-xs text-gray-400 whitespace-nowrap">{fmtWhen(s.createdAt)}</span>
          {canDelete && !confirming && (
            <button onClick={() => setConfirming(true)} aria-label="Delete shoutout" className="text-gray-300 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-800 whitespace-pre-line break-words">&ldquo;{s.message}&rdquo;</p>
      {confirming && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-gray-600">Remove from the feed? (The email already went out.)</span>
          <button
            disabled={deleting}
            onClick={async () => { setDeleting(true); await onDelete(s.id); setDeleting(false); setConfirming(false); }}
            className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? "Removing…" : "Remove"}
          </button>
          <button onClick={() => setConfirming(false)} className="px-2.5 py-1 rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
        </div>
      )}
    </div>
  );
}

export function ShoutoutsSection({
  initialShoutouts,
  currentUserId,
  canGive,
  isAdmin,
  team,
}: {
  initialShoutouts: Shoutout[];
  currentUserId: string;
  canGive: boolean;
  isAdmin: boolean;
  team: { clerkUserId: string; name: string; role?: string }[];
}) {
  const [shoutouts, setShoutouts] = useState(initialShoutouts);
  const [showCount, setShowCount] = useState(FEED_PAGE);
  const [composing, setComposing] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [message, setMessage] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const mine = useMemo(() => shoutouts.filter((s) => s.recipientClerkId === currentUserId), [shoutouts, currentUserId]);
  const recipient = team.find((t) => t.clerkUserId === recipientId);
  const teamOptions = useMemo(() => team.map((t) => ({ id: t.clerkUserId, label: t.name, sublabel: t.role })), [team]);

  function resetComposer() {
    setComposing(false);
    setReviewing(false);
    setRecipientId("");
    setMessage("");
    setError("");
  }

  async function send() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/shoutouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientClerkId: recipientId, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.shoutout) throw new Error(data.error || "Couldn't send the shoutout");
      setShoutouts((prev) => [data.shoutout, ...prev]);
      setToast(data.emailed
        ? `Shoutout sent to ${data.shoutout.recipientName}`
        : `Shoutout posted, but the email didn't go out. ${data.shoutout.recipientName} will still see it on their home page.`);
      resetComposer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the shoutout");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/shoutouts/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setShoutouts((prev) => prev.filter((s) => s.id !== id));
    else setToast("Couldn't remove that shoutout");
  }

  const canDelete = (s: Shoutout) => isAdmin || s.authorClerkId === currentUserId;
  const feed = shoutouts.slice(0, showCount);

  return (
    <section className="mt-10 mb-10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <Megaphone className="w-4 h-4 text-forest-600" /> Team Shoutouts
        </h2>
        {canGive && !composing && (
          <button
            onClick={() => setComposing(true)}
            className="text-sm font-semibold bg-forest-600 hover:bg-forest-700 text-white px-3.5 py-1.5 rounded-xl transition-colors"
          >
            Give a Shoutout
          </button>
        )}
      </div>

      {/* Composer: Team Leads, Managers, Admins */}
      {canGive && composing && (
        <div className="mb-5 rounded-2xl border border-forest-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-900">{reviewing ? "Ready to send?" : "Give a Shoutout"}</p>
            <button onClick={resetComposer} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          {!reviewing ? (
            <>
              <label className="block text-xs font-medium text-gray-500 mb-1">Who are you recognizing?</label>
              <SearchCombobox
                value={recipientId}
                onChange={setRecipientId}
                options={teamOptions}
                placeholder="Start typing a name…"
                ariaLabel="Who are you recognizing?"
                className="w-full sm:w-80"
                autoFocus
              />
              <label className="block text-xs font-medium text-gray-500 mt-4 mb-1">Your shoutout</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
                rows={4}
                placeholder="What did they do that deserves recognition?"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-forest-600/30"
              />
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-gray-400">{message.length}/{MAX_LENGTH}</p>
                <button
                  disabled={!recipientId || !message.trim()}
                  onClick={() => setReviewing(true)}
                  className="text-sm font-semibold bg-forest-600 hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition-colors"
                >
                  Review
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-forest-50 border-l-4 border-forest-600 p-4">
                <p className="text-sm font-semibold text-gray-900">{recipient?.name}</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-gray-800 whitespace-pre-line break-words">&ldquo;{message.trim()}&rdquo;</p>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                This emails {recipient?.name}, CCs all Team Leads, Managers, Admins and Sales, and pins it on {recipient?.name?.split(" ")[0]}&rsquo;s home page.
              </p>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setReviewing(false)} disabled={sending} className="text-sm text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">Edit</button>
                <button onClick={send} disabled={sending} className="text-sm font-semibold bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-lg">
                  {sending ? "Sending…" : "Send Shoutout"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Mine, pinned */}
      {mine.length > 0 && (
        <div className="mb-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest-700">Your shoutouts</p>
          {mine.map((s) => <ShoutoutCard key={s.id} s={s} pinned canDelete={canDelete(s)} onDelete={remove} />)}
        </div>
      )}

      {/* Team feed, newest first */}
      {shoutouts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
          No shoutouts yet.{canGive ? " Be the first to recognize someone!" : ""}
        </div>
      ) : (
        <div className="space-y-3">
          {mine.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Team feed</p>}
          {feed.map((s) => <ShoutoutCard key={s.id} s={s} canDelete={canDelete(s)} onDelete={remove} />)}
          {shoutouts.length > showCount && (
            <button onClick={() => setShowCount((n) => n + FEED_PAGE)} className="w-full py-2 text-sm font-medium text-gray-500 hover:text-gray-800">
              Show more
            </button>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 max-w-sm flex items-center gap-3 rounded-xl bg-forest-700 text-white px-4 py-3 text-sm shadow-lg" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Dismiss" className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
    </section>
  );
}
