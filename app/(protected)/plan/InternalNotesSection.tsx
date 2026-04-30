"use client";

import { useState, useEffect } from "react";
import type { ProjectNote, NoteComment } from "@/lib/airtable-notes";

function formatCT(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " CT";
}

function Avatar({
  name,
  photoUrl,
  size,
}: {
  name: string;
  photoUrl?: string;
  size: number;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
  return (
    <div
      className="rounded-full bg-forest-100 text-forest-700 flex items-center justify-center font-semibold flex-shrink-0 text-xs select-none"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

function CommentRow({ comment }: { comment: NoteComment }) {
  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={comment.authorName} photoUrl={comment.authorPhotoUrl} size={28} />
      <div className="flex-1 min-w-0 bg-gray-50 rounded-xl px-3 py-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-900">{comment.authorName}</span>
          <span className="text-[11px] text-gray-400">{formatCT(comment.createdAt)}</span>
        </div>
        <p className="mt-0.5 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
          {comment.content}
        </p>
      </div>
    </div>
  );
}

function NoteCard({
  note,
  currentUserName,
  currentUserPhoto,
  onCommentAdded,
  onNoteDeleted,
  currentUserId,
}: {
  note: ProjectNote;
  currentUserName: string;
  currentUserPhoto?: string;
  onCommentAdded: (noteId: string, comment: NoteComment) => void;
  onNoteDeleted: (noteId: string) => void;
  currentUserId: string;
}) {
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showReply, setShowReply] = useState(false);

  async function handleAddComment() {
    const text = commentText.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/plan/notes/${note.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          authorName: currentUserName,
          authorPhotoUrl: currentUserPhoto ?? "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onCommentAdded(note.id, data.comment);
        setCommentText("");
        setShowReply(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this note and all its comments?")) return;
    const res = await fetch(`/api/plan/notes/${note.id}`, { method: "DELETE" });
    if (res.ok) onNoteDeleted(note.id);
  }

  const isOwn = note.authorClerkId === currentUserId;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 group">
      {/* Note header + content */}
      <div className="flex items-start gap-3">
        <Avatar name={note.authorName} photoUrl={note.authorPhotoUrl} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{note.authorName}</span>
            <span className="text-xs text-gray-400">{formatCT(note.createdAt)}</span>
            {isOwn && (
              <button
                onClick={handleDelete}
                className="ml-auto text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Delete
              </button>
            )}
          </div>
          <p className="mt-1.5 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {note.content}
          </p>
        </div>
      </div>

      {/* Comments */}
      {note.comments.length > 0 && (
        <div className="mt-4 ml-12 space-y-3 border-l-2 border-gray-100 pl-4">
          {note.comments.map((c) => (
            <CommentRow key={c.id} comment={c} />
          ))}
        </div>
      )}

      {/* Reply area */}
      <div className="mt-3 ml-12">
        {!showReply ? (
          <button
            onClick={() => setShowReply(true)}
            className="text-xs text-gray-400 hover:text-forest-600 transition-colors font-medium"
          >
            {note.comments.length > 0
              ? `${note.comments.length} comment${note.comments.length !== 1 ? "s" : ""} · Add reply`
              : "Add comment"}
          </button>
        ) : (
          <div className="flex items-start gap-2.5">
            <Avatar name={currentUserName} photoUrl={currentUserPhoto} size={28} />
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                autoFocus
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment…"
                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400"
                onKeyDown={(e) => {
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
    </div>
  );
}

export function InternalNotesSection({
  tenantId,
  currentUserId,
  currentUserName,
  currentUserPhoto,
}: {
  tenantId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
}) {
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plan/notes?tenantId=${tenantId}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setNotes(d.notes ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  async function handleAddNote() {
    const text = newNote.trim();
    if (!text) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/plan/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          content: text,
          authorName: currentUserName,
          authorPhotoUrl: currentUserPhoto ?? "",
        }),
      });
      if (!res.ok) throw new Error("Failed to post note");
      const data = await res.json();
      setNotes((prev) => [{ ...data.note, comments: [] }, ...prev]);
      setNewNote("");
    } catch {
      setError("Failed to post note. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCommentAdded(noteId: string, comment: NoteComment) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId ? { ...n, comments: [...n.comments, comment] } : n
      )
    );
  }

  function handleNoteDeleted(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  return (
    <div className="mt-10 pt-8 border-t border-gray-200">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Internal Notes</h2>
          <p className="text-xs text-gray-400">Private — visible to TTT staff only</p>
        </div>
      </div>

      {/* Compose new note */}
      <div className="flex gap-3 mb-6">
        <Avatar name={currentUserName} photoUrl={currentUserPhoto} size={36} />
        <div className="flex-1">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note for this project…"
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote();
            }}
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-gray-400">⌘↵ to post</span>
            <button
              onClick={handleAddNote}
              disabled={submitting || !newNote.trim()}
              className="h-8 px-4 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Posting…" : "Post Note"}
            </button>
          </div>
        </div>
      </div>

      {/* Notes feed */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl">
          No internal notes yet
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              currentUserName={currentUserName}
              currentUserPhoto={currentUserPhoto}
              currentUserId={currentUserId}
              onCommentAdded={handleCommentAdded}
              onNoteDeleted={handleNoteDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
