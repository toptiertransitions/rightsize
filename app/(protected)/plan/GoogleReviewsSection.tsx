"use client";

import { useState, useEffect, useCallback } from "react";
import type { GoogleReview } from "@/lib/types";

function Stars({ count, size = "base" }: { count: number; size?: "sm" | "base" }) {
  const cls = size === "sm" ? "text-base" : "text-xl";
  return (
    <span className={cls} aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < count ? "text-amber-400" : "text-gray-300"}>★</span>
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="text-2xl leading-none transition-colors"
        >
          <span className={(hover || value) >= n ? "text-amber-400" : "text-gray-300"}>★</span>
        </button>
      ))}
    </div>
  );
}

function CopyButton({ review }: { review: GoogleReview }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const stars = "★".repeat(review.stars) + "☆".repeat(5 - review.stars);
    navigator.clipboard.writeText(`${stars}\n${review.text}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      title="Copy review"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-emerald-500">Copied</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

interface Props {
  tenantId: string;
  canEdit: boolean;
}

export function GoogleReviewsSection({ tenantId, canEdit }: Props) {
  const [reviews, setReviews] = useState<GoogleReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [stars, setStars] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchReviews = useCallback(() => {
    setLoading(true);
    fetch(`/api/tenants/${tenantId}/reviews`)
      .then((r) => r.json())
      .then((d) => setReviews(d.reviews ?? []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  async function handleSubmit() {
    if (!text.trim()) { setError("Please enter the review text."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/tenants/${tenantId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars, text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setReviews((prev) => [data.review, ...prev]);
      setShowForm(false);
      setText("");
      setStars(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save review");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(reviewId: string) {
    setDeletingId(reviewId);
    try {
      await fetch(`/api/tenants/${tenantId}/reviews/${reviewId}`, { method: "DELETE" });
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mt-10 pt-8 border-t border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Google Reviews</h2>
            <p className="text-xs text-gray-400">
              {reviews.length === 0 ? "No reviews yet" : `${reviews.length} review${reviews.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        {canEdit && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-[#2d4a3e] hover:text-[#1e3329] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Review
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && canEdit && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-gray-600 mb-2">Star Rating</p>
          <StarPicker value={stars} onChange={setStars} />
          <p className="text-xs font-semibold text-gray-600 mt-3 mb-1.5">Review Text</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the Google review here…"
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2d4a3e] resize-none"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="h-8 px-4 bg-[#2d4a3e] text-white text-sm font-medium rounded-lg hover:bg-[#1e3329] disabled:opacity-50 transition-colors"
            >
              {submitting ? "Saving…" : "Save Review"}
            </button>
            <button
              onClick={() => { setShowForm(false); setText(""); setStars(5); setError(""); }}
              className="h-8 px-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Review list */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-400">No Google reviews saved for this project yet.</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <Stars count={review.stars} />
                <div className="flex items-center gap-3 flex-shrink-0">
                  <CopyButton review={review} />
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(review.id)}
                      disabled={deletingId === review.id}
                      className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Delete review"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-700 mt-2 leading-relaxed whitespace-pre-wrap">{review.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
