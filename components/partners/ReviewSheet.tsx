"use client";

import { useEffect, useState } from "react";
import { useBackClose } from "@/lib/back-button";
import type { PartnerProfile } from "@/lib/partners/types";
import {
  reviewTagsForScore,
  REVIEW_SCORE_LABELS,
  REVIEW_SCORE_PROMPTS,
  MAX_REVIEW_COMMENT_LENGTH,
} from "@/lib/partners/reviewTags";
import { submitPartnerReviewAction, type MyPartnerReview } from "@/app/(protected)/partners/review-actions";
import { PartnerLogo } from "./PartnerLogo";

export const STAR_PATH = "M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.9l-5.2 2.8 1-5.9L1.5 7.7l5.9-.8L10 1.5z";

interface Props {
  tenantId: string;
  partner: PartnerProfile;
  existing?: MyPartnerReview;
  /** The star tapped on the card to open this sheet. */
  initialScore?: number;
  onClose: () => void;
  onSaved: (review: MyPartnerReview) => void;
}

// Uber-style: stars first, then score-dependent adjective pills and an
// optional comment. Everything after the stars is skippable.
export function ReviewSheet({ tenantId, partner, existing, initialScore, onClose, onSaved }: Props) {
  useBackClose(onClose);
  const [score, setScore] = useState(initialScore ?? existing?.score ?? 0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const tagOptions = score ? reviewTagsForScore(score) : [];

  function pickScore(n: number) {
    setScore(n);
    // Praise pills don't carry over to a low score, or vice versa
    const next = reviewTagsForScore(n);
    setTags((t) => t.filter((tag) => next.includes(tag)));
  }

  function toggleTag(tag: string) {
    setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  async function submit() {
    if (!score || saving) return;
    setSaving(true);
    setError(null);
    const result = await submitPartnerReviewAction({ tenantId, category: partner.category, partnerId: partner.id, score, tags, comment });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.review);
  }

  const shown = hover || score;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-sheet-title"
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[90vh] flex flex-col pb-[env(safe-area-inset-bottom,0px)] motion-safe:animate-[fadeInScale_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <PartnerLogo logo={partner.logo} name={partner.vendorName} size="mobile" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{partner.category}</p>
              <h2 id="review-sheet-title" className="text-lg font-bold text-gray-900 leading-snug line-clamp-2">
                How was {partner.vendorName}?
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-6">
          <div className="flex flex-col items-center pt-3 pb-5">
            <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={score === n}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  onClick={() => pickScore(n)}
                  onMouseEnter={() => setHover(n)}
                  className="w-11 h-11 flex items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-500 motion-safe:active:scale-90 transition-transform"
                >
                  <svg className={`w-9 h-9 transition-colors ${n <= shown ? "text-amber-400" : "text-gray-200"}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d={STAR_PATH} />
                  </svg>
                </button>
              ))}
            </div>
            <p className="mt-1.5 h-5 text-sm font-medium text-gray-600">{shown ? REVIEW_SCORE_LABELS[shown] : "Tap to rate"}</p>
          </div>

          {score > 0 && (
            <div className="space-y-5 motion-safe:animate-[fadeInScale_0.2s_ease-out]">
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2.5">
                  {REVIEW_SCORE_PROMPTS[score]} <span className="font-normal text-gray-400">Optional</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {tagOptions.map((tag) => {
                    const on = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTag(tag)}
                        className={`min-h-[36px] px-3.5 rounded-full text-sm font-medium border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500 ${
                          on ? "bg-forest-600 border-forest-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="review-comment" className="text-sm font-semibold text-gray-800">
                  Anything else? <span className="font-normal text-gray-400">Optional</span>
                </label>
                <textarea
                  id="review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={MAX_REVIEW_COMMENT_LENGTH}
                  rows={3}
                  placeholder="Share details that would help other families"
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-base sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!score || saving}
              className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500"
            >
              {saving ? "Saving…" : existing ? "Update review" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact star row on a "Your Partners" tray card: empty stars to start a
// review (the tapped star pre-fills the sheet), or the client's own rating
// with an Edit link once they've left one.
export function TrayReviewRow({ review, onOpen }: { review?: MyPartnerReview; onOpen: (score?: number) => void }) {
  const [hover, setHover] = useState(0);
  if (review) {
    return (
      <button
        type="button"
        onClick={() => onOpen()}
        className="self-start flex items-center gap-1.5 min-h-[28px] rounded text-[11px] text-gray-500 hover:text-forest-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500"
        aria-label={`Your rating: ${review.score} out of 5. Edit review`}
      >
        <span className="font-medium">Your rating</span>
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <svg key={n} className={`w-3 h-3 ${n <= review.score ? "text-amber-400" : "text-gray-200"}`} viewBox="0 0 20 20" fill="currentColor">
              <path d={STAR_PATH} />
            </svg>
          ))}
        </span>
        <span className="font-medium text-forest-600 underline underline-offset-2">Edit</span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-gray-400">Rate</span>
      <div className="flex items-center" role="group" aria-label="Rate this partner" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onOpen(n)}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
            className="w-7 h-7 flex items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-500"
          >
            <svg className={`w-4 h-4 transition-colors ${n <= hover ? "text-amber-300" : "text-gray-200"}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d={STAR_PATH} />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
