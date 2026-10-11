"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MARKETPLACE_LIFECYCLE_STATUSES, type MarketplaceLifecycleStatus } from "@/lib/marketplace/types";
import { draftPartnerReviewEmailAction, sendPartnerReviewEmailAction, archivePartnerAction, type ReviewKind } from "./review-actions";

export interface ReviewRow {
  id: string;
  companyName: string;
  pocName: string;
  email: string;
  categories: string[];
  status: MarketplaceLifecycleStatus;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

const STATUS_STYLE: Partial<Record<MarketplaceLifecycleStatus, string>> = {
  Submitted: "bg-amber-900/40 text-amber-300",
  "Waiting on Partner": "bg-sky-900/40 text-sky-300",
  Rejected: "bg-red-900/40 text-red-300",
  Live: "bg-green-900/40 text-green-300",
  Archived: "bg-gray-800 text-gray-500",
};

function fmt(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ReviewPanel({ row, onDone }: { row: ReviewRow; onDone: (msg: string) => void }) {
  const [kind, setKind] = useState<ReviewKind>("changes");
  const [reason, setReason] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "test" | "send">("");
  const [testSentTo, setTestSentTo] = useState("");
  const [error, setError] = useState("");

  async function draft() {
    setBusy("draft"); setError(""); setTestSentTo("");
    const res = await draftPartnerReviewEmailAction(row.id, kind, reason);
    setBusy("");
    if (!res.ok) return setError(res.error);
    setSubject(res.data!.subject);
    setBody(res.data!.body);
  }

  async function send(test: boolean) {
    if (!test && !window.confirm(`Send this to ${row.email || "the partner"} and mark ${row.companyName} as ${kind === "changes" ? "Waiting on Partner" : "Rejected"}?`)) return;
    setBusy(test ? "test" : "send"); setError("");
    const res = await sendPartnerReviewEmailAction(row.id, kind, subject, body, test);
    setBusy("");
    if (!res.ok) return setError(res.error);
    if (test) setTestSentTo(res.data!.sentTo);
    else onDone(`Sent to ${res.data!.sentTo}. ${row.companyName} is now ${kind === "changes" ? "Waiting on Partner" : "Rejected"}.`);
  }

  const kindBtn = (k: ReviewKind, label: string, on: string) => (
    <button
      type="button"
      onClick={() => { setKind(k); setSubject(""); setBody(""); setTestSentTo(""); }}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${kind === k ? on : "text-gray-400 hover:text-white"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="px-4 pb-4 pt-1 space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1 border border-gray-800 rounded-xl p-1 w-fit">
        {kindBtn("changes", "Request changes", "bg-sky-700 text-white")}
        {kindBtn("reject", "Reject", "bg-red-700 text-white")}
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          {kind === "changes" ? "What needs to change?" : "Why isn't it a fit?"} <span className="text-gray-600">(a few words; AI turns it into the email)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder={kind === "changes" ? "e.g. add a logo, the about section is blank, service area too narrow" : "e.g. outside our service area, duplicate of an existing listing"}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-forest-500 resize-none"
        />
      </div>
      <button
        type="button"
        onClick={draft}
        disabled={!!busy || !reason.trim()}
        className="px-4 py-1.5 bg-forest-700 hover:bg-forest-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
      >
        {busy === "draft" ? "Drafting…" : subject ? "Re-draft with AI" : "Draft email with AI"}
      </button>

      {subject && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setTestSentTo(""); }}
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-forest-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Message <span className="text-gray-600">(edit freely; blank line between paragraphs)</span></label>
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); setTestSentTo(""); }}
              rows={9}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-forest-500 resize-y"
            />
            {kind === "changes" && <p className="text-xs text-gray-500 mt-1">The email adds an &ldquo;Update my profile&rdquo; button that opens their My Listing.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => send(true)}
              disabled={!!busy}
              className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
            >
              {busy === "test" ? "Sending…" : testSentTo ? `Test sent to ${testSentTo}` : "Send test to me"}
            </button>
            <button
              type="button"
              onClick={() => send(false)}
              disabled={!!busy || !testSentTo || !row.email}
              title={!testSentTo ? "Send yourself a test first" : !row.email ? "No email on file for this partner" : undefined}
              className={`px-4 py-1.5 disabled:opacity-40 text-white text-sm font-medium rounded-lg ${kind === "changes" ? "bg-sky-700 hover:bg-sky-600" : "bg-red-700 hover:bg-red-600"}`}
            >
              {busy === "send" ? "Sending…" : kind === "changes" ? "Send & mark Waiting on Partner" : "Send & mark Rejected"}
            </button>
            {!testSentTo && <span className="text-xs text-gray-500">Send yourself a test first.</span>}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function PartnerReviewClient({ rows, canReview }: { rows: ReviewRow[]; canReview: boolean }) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Set<MarketplaceLifecycleStatus>>(new Set(["Submitted"]));
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [archiving, setArchiving] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = new Map<MarketplaceLifecycleStatus, number>();
    for (const r of rows) c.set(r.status, (c.get(r.status) ?? 0) + 1);
    return c;
  }, [rows]);
  const shown = rows.filter((r) => statuses.has(r.status));

  function toggle(s: MarketplaceLifecycleStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  async function archive(r: ReviewRow) {
    if (!window.confirm(`Archive ${r.companyName}? They'll drop off the review list and out of matching.`)) return;
    setArchiving(r.id);
    const res = await archivePartnerAction(r.id);
    setArchiving(null);
    setMessage(res.ok ? `${r.companyName} archived.` : res.error);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {MARKETPLACE_LIFECYCLE_STATUSES.map((s) => {
          const on = statuses.has(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? "bg-gray-200 text-gray-900 border-gray-200" : "border-gray-700 text-gray-400 hover:text-white"}`}
            >
              {s} <span className="opacity-60">{counts.get(s) ?? 0}</span>
            </button>
          );
        })}
        {statuses.size !== 1 || !statuses.has("Submitted") ? (
          <button type="button" onClick={() => setStatuses(new Set(["Submitted"]))} className="text-xs text-gray-500 hover:text-white ml-1 underline">Reset</button>
        ) : null}
      </div>

      {message && <p className="text-sm text-green-400 mb-2" role="status">{message}</p>}

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500">No partners in {statuses.size === 0 ? "the selected statuses" : [...statuses].join(", ")}.</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800/60">
          {shown.map((r) => (
            <div key={r.id}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <Link href={`/admin/marketplace/partners/${r.id}`} className="flex-1 min-w-[220px] hover:underline">
                  <span className="block text-sm text-gray-200">{r.companyName}</span>
                  <span className="block text-xs text-gray-500">
                    {[r.categories.join(", "), r.pocName, r.email].filter(Boolean).join(" · ")}
                  </span>
                </Link>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] ?? "bg-gray-800 text-gray-300"}`}>{r.status}</span>
                <span className="text-xs text-gray-500 w-28 text-right">
                  {r.reviewedAt && (r.status === "Waiting on Partner" || r.status === "Rejected") ? `Sent ${fmt(r.reviewedAt)}` : `Updated ${fmt(r.updatedAt)}`}
                </span>
                {canReview && (
                  <div className="flex items-center gap-2">
                    {r.status !== "Archived" && r.status !== "Live" && (
                      <button
                        type="button"
                        onClick={() => setOpen(open === r.id ? null : r.id)}
                        className={`text-xs px-2.5 py-1 rounded-lg border ${open === r.id ? "border-forest-500 text-forest-300" : "border-gray-700 text-gray-300 hover:text-white"}`}
                      >
                        {open === r.id ? "Close" : "Review"}
                      </button>
                    )}
                    {r.status !== "Archived" && (
                      <button
                        type="button"
                        onClick={() => archive(r)}
                        disabled={archiving === r.id}
                        className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-500 hover:text-red-300 hover:border-red-800 disabled:opacity-50"
                      >
                        {archiving === r.id ? "Archiving…" : "Archive"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {canReview && open === r.id && (
                <ReviewPanel
                  row={r}
                  onDone={(msg) => { setOpen(null); setMessage(msg); router.refresh(); }}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {!canReview && <p className="text-xs text-gray-500 mt-2">Only TTT Admins can review or archive partners.</p>}
    </div>
  );
}
