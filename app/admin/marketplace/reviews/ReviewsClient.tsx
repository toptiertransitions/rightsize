"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { POSITIVE_REVIEW_TAGS, NEGATIVE_REVIEW_TAGS, MAX_REVIEW_COMMENT_LENGTH } from "@/lib/partners/reviewTags";
import type { PartnerReviewSummary } from "@/lib/partners/reviews";
import { updateReviewAction, deleteReviewAction } from "./actions";

export interface AdminReviewRow {
  id: string;
  partnerId: string;
  partnerName: string;
  displayReviewScore: boolean;
  category: string;
  tenantId: string;
  projectName: string;
  reviewerName: string;
  score: number;
  tags: string[];
  comment: string;
  date: string;
  updatedAt: string;
  editedBy: string;
  status: "Published" | "Hidden";
}

interface Props {
  rows: AdminReviewRow[];
  partners: { id: string; name: string; summary: PartnerReviewSummary }[];
  canEdit: boolean;
  initialPartner: string;
}

type ScoreFilter = "" | "5" | "4" | "3" | "2" | "1" | "low";

function fmt(d: string) {
  if (!d) return "";
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return isNaN(date.getTime()) ? d : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Stars({ score, size = "w-3.5 h-3.5" }: { score: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} className={`${size} ${n <= score ? "text-amber-400" : "text-gray-700"}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.9l-5.2 2.8 1-5.9L1.5 7.7l5.9-.8L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

export function ReviewsClient({ rows: initialRows, partners, canEdit, initialPartner }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [partnerFilter, setPartnerFilter] = useState(initialPartner);
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("");
  const [statusFilter, setStatusFilter] = useState<"" | "Published" | "Hidden">("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (partnerFilter && r.partnerId !== partnerFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (scoreFilter === "low" ? r.score > 3 : scoreFilter && r.score !== Number(scoreFilter)) return false;
      if (q && ![r.partnerName, r.projectName, r.reviewerName, r.comment, ...r.tags].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, partnerFilter, statusFilter, scoreFilter, search]);

  // Live summary for the filtered partner, recomputed from local edits
  const selected = partners.find((p) => p.id === partnerFilter);
  const selectedSummary = useMemo(() => {
    if (!partnerFilter) return null;
    const mine = rows.filter((r) => r.partnerId === partnerFilter);
    const pub = mine.filter((r) => r.status === "Published");
    return {
      avg: pub.length ? Math.round((pub.reduce((s, r) => s + r.score, 0) / pub.length) * 10) / 10 : 0,
      count: pub.length,
      hiddenCount: mine.length - pub.length,
      displayed: mine[0]?.displayReviewScore ?? false,
    };
  }, [rows, partnerFilter]);

  const select = "bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)} className={`${select} max-w-[260px]`} aria-label="Partner">
          <option value="">All partners</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.summary?.count ?? 0})</option>
          ))}
        </select>
        <select value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value as ScoreFilter)} className={select} aria-label="Score">
          <option value="">Any score</option>
          <option value="low">3 stars or less</option>
          {["5", "4", "3", "2", "1"].map((s) => <option key={s} value={s}>{s} stars</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={select} aria-label="Status">
          <option value="">Published + hidden</option>
          <option value="Published">Published</option>
          <option value="Hidden">Hidden</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search project, reviewer, comment…"
          className={`${select} w-72 max-w-full`}
        />
        {!canEdit && <span className="text-xs text-gray-500">View only — TTT Admins can edit reviews.</span>}
      </div>

      {selected && selectedSummary && (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm">
          <span className="font-medium text-white">{selected.name}</span>
          <span className="flex items-center gap-2 text-gray-300">
            <Stars score={Math.round(selectedSummary.avg)} />
            {selectedSummary.count ? `${selectedSummary.avg.toFixed(1)} avg · ${selectedSummary.count} published` : "No published reviews"}
            {selectedSummary.hiddenCount > 0 && <span className="text-gray-500">· {selectedSummary.hiddenCount} hidden</span>}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${selectedSummary.displayed ? "bg-green-900/50 text-green-300" : "bg-gray-800 text-gray-400"}`}>
            Score {selectedSummary.displayed ? "displayed" : "not displayed"}
          </span>
          <Link href={`/admin/marketplace/partners/${selected.id}`} className="text-forest-400 hover:underline text-xs">Partner</Link>
        </div>
      )}

      {message && <p className={`text-sm mb-3 ${message.ok ? "text-green-400" : "text-red-400"}`} role="status">{message.text}</p>}

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-900 border border-gray-800 rounded-xl p-6">
          {rows.length === 0 ? "No reviews yet. Clients can rate partners from the Your Partners section on their Partners page." : "No reviews match these filters."}
        </p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {filtered.map((r) => (
            <div key={r.id} className={r.status === "Hidden" ? "opacity-60" : ""}>
              <div className="px-4 py-3 flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="flex-1 min-w-[260px]">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Stars score={r.score} />
                    <span className="text-sm font-medium text-white">{r.partnerName}</span>
                    {r.category && <span className="text-xs text-gray-500">{r.category}</span>}
                    {r.status === "Hidden" && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">Hidden</span>}
                  </div>
                  {r.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.tags.map((t) => (
                        <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">{t}</span>
                      ))}
                    </div>
                  )}
                  {r.comment && <p className="mt-1.5 text-sm text-gray-300 whitespace-pre-line">{r.comment}</p>}
                  <p className="mt-1.5 text-xs text-gray-500">
                    {r.reviewerName || "Client"}
                    {r.projectName && <> · <Link href={`/partners?tenantId=${r.tenantId}`} className="hover:text-gray-300 hover:underline">{r.projectName}</Link></>}
                    {" · "}{fmt(r.date)}
                    {r.editedBy && <> · edited by {r.editedBy}{r.updatedAt ? ` ${fmt(r.updatedAt)}` : ""}</>}
                  </p>
                </div>
                {canEdit && editing !== r.id && (
                  <button
                    type="button"
                    onClick={() => { setEditing(r.id); setMessage(null); }}
                    className="text-sm text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-1.5"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editing === r.id && (
                <ReviewEditor
                  row={r}
                  onCancel={() => setEditing(null)}
                  onSaved={(next) => {
                    setRows((all) => all.map((x) => (x.id === next.id ? next : x)));
                    setEditing(null);
                    setMessage({ ok: true, text: "Review saved." });
                  }}
                  onDeleted={() => {
                    setRows((all) => all.filter((x) => x.id !== r.id));
                    setEditing(null);
                    setMessage({ ok: true, text: "Review deleted." });
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewEditor({ row, onCancel, onSaved, onDeleted }: {
  row: AdminReviewRow;
  onCancel: () => void;
  onSaved: (row: AdminReviewRow) => void;
  onDeleted: () => void;
}) {
  const [score, setScore] = useState(row.score);
  const [tags, setTags] = useState(row.tags);
  const [comment, setComment] = useState(row.comment);
  const [status, setStatus] = useState(row.status);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  // Every known pill, plus any retired tag still on this review
  const allTags = [...new Set([...POSITIVE_REVIEW_TAGS, ...NEGATIVE_REVIEW_TAGS, ...row.tags])];

  async function save() {
    setBusy(true);
    setError("");
    const result = await updateReviewAction(row.id, { score, tags, comment, status });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    const r = result.data!;
    onSaved({ ...row, score: r.score, tags: r.tags, comment: r.comment, status: r.status, editedBy: r.editedBy ?? "", updatedAt: r.updatedAt ?? "" });
  }

  async function remove() {
    setBusy(true);
    setError("");
    const result = await deleteReviewAction(row.id);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    onDeleted();
  }

  return (
    <div className="px-4 pb-4 space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Score">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={score === n} aria-label={`${n} stars`} onClick={() => setScore(n)} className="p-0.5">
              <svg className={`w-6 h-6 ${n <= score ? "text-amber-400" : "text-gray-700 hover:text-gray-600"}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.9l-5.2 2.8 1-5.9L1.5 7.7l5.9-.8L10 1.5z" />
              </svg>
            </button>
          ))}
        </div>
        <div className="flex gap-1 border border-gray-800 rounded-lg p-0.5">
          {(["Published", "Hidden"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={`px-3 py-1 rounded-md text-xs font-medium ${status === s ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {allTags.map((t) => {
          const on = tags.includes(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => setTags((cur) => (on ? cur.filter((x) => x !== t) : [...cur, t]))}
              className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-forest-600 border-forest-600 text-white" : "border-gray-700 text-gray-400 hover:text-white"}`}
            >
              {t}
            </button>
          );
        })}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={MAX_REVIEW_COMMENT_LENGTH}
        rows={3}
        className="w-full bg-gray-950 border border-gray-700 text-white rounded-lg px-3 py-2"
        aria-label="Comment"
      />

      {error && <p className="text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="bg-forest-600 hover:bg-forest-700 text-white font-medium rounded-lg px-4 py-1.5 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-gray-400 hover:text-white px-3 py-1.5">Cancel</button>
        <span className="flex-1" />
        {confirmDelete ? (
          <>
            <span className="text-xs text-gray-400">Delete permanently?</span>
            <button type="button" onClick={remove} disabled={busy} className="bg-red-700 hover:bg-red-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">Delete</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-gray-400 hover:text-white px-2 py-1.5">Keep</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-red-400 hover:text-red-300 px-2 py-1.5">Delete</button>
        )}
      </div>
    </div>
  );
}
