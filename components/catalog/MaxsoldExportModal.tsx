"use client";

import { useMemo, useState, useRef } from "react";
import JSZip from "jszip";
import type { Item } from "@/lib/types";
import { downloadOrShareBlob } from "@/lib/native";
import {
  planMaxsoldExport,
  buildMaxsoldCsv,
  maxsoldImageSource,
  maxsoldImageName,
  MAXSOLD_MAX_IMAGES_PER_LOT,
  type LotNumbering,
} from "@/lib/maxsold";

interface Props {
  items: Item[];
  /** Used in the downloaded file names, e.g. the project name. */
  fileBase: string;
  onClose: () => void;
}

type Phase = "setup" | "building" | "done";
const FETCH_CONCURRENCY = 6;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "catalog";
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function MaxsoldExportModal({ items, fileBase, onClose }: Props) {
  const [numbering, setNumbering] = useState<LotNumbering>("sequential");
  const [startAt, setStartAt] = useState("1");
  const [phase, setPhase] = useState<Phase>("setup");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failed, setFailed] = useState<string[]>([]);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [csvText, setCsvText] = useState("");
  const [error, setError] = useState("");
  const cancelled = useRef(false);

  const plan = useMemo(
    () => planMaxsoldExport(items, numbering, Number(startAt) || 1),
    [items, numbering, startAt]
  );
  const imageCount = plan.lots.reduce((s, l) => s + l.imageUrls.length, 0);
  const noPhotoLots = plan.lots.filter(l => l.imageUrls.length === 0);
  const overLimitLots = plan.lots.filter(l => l.skippedImages > 0);
  const base = `maxsold-${slug(fileBase)}`;

  async function build() {
    setPhase("building");
    setError("");
    setFailed([]);
    cancelled.current = false;

    const csv = buildMaxsoldCsv(plan.lots);
    setCsvText(csv);

    const zip = new JSZip();
    zip.file("lots.csv", csv);
    const folder = zip.folder("images")!;

    const jobs = plan.lots.flatMap(lot =>
      lot.imageUrls.map((url, i) => ({ lot, url, i }))
    );
    setProgress({ done: 0, total: jobs.length });

    const failures: string[] = [];
    let done = 0;
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length && !cancelled.current) {
        const job = jobs[cursor++];
        const src = maxsoldImageSource(job.url);
        const name = maxsoldImageName(job.lot.lotNumber, job.i, src.ext);
        try {
          const res = await fetch(src.url);
          if (!res.ok) throw new Error(String(res.status));
          folder.file(name, await res.arrayBuffer());
        } catch {
          failures.push(`${name} (${job.lot.title})`);
        }
        done++;
        setProgress({ done, total: jobs.length });
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, jobs.length || 1) }, worker));
      if (cancelled.current) return;
      // Photos are already compressed — STORE avoids burning CPU re-deflating them.
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      setFailed(failures);
      setZipBlob(blob);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build the export.");
      setPhase("setup");
    }
  }

  function handleClose() {
    cancelled.current = true;
    onClose();
  }

  const downloadCsv = () =>
    downloadOrShareBlob(new Blob([csvText], { type: "text/csv;charset=utf-8" }), `${base}-lots.csv`);
  const downloadZip = () => zipBlob && downloadOrShareBlob(zipBlob, `${base}-images.zip`);

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={phase === "building" ? undefined : handleClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Export for MaxSold</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {items.length} item{items.length !== 1 ? "s" : ""} selected · lots CSV + high-res image folder
            </p>
          </div>
          {phase !== "building" && (
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 p-1 -m-1" aria-label="Close">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {phase === "setup" && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Lot numbers</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["sequential", "Sequential", "1, 2, 3… in table order"],
                    ["barcode", "Rightsize item #", "e.g. 10006236"],
                  ] as const).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setNumbering(value)}
                      aria-pressed={numbering === value}
                      className={`text-left rounded-xl border px-3.5 py-2.5 transition-colors ${numbering === value ? "border-forest-500 bg-forest-50 ring-1 ring-forest-500" : "border-gray-200 hover:border-gray-300"}`}
                    >
                      <span className="block text-sm font-semibold text-gray-900">{label}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>
                    </button>
                  ))}
                </div>
                {numbering === "sequential" && (
                  <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                    Start at lot
                    <input
                      type="text"
                      inputMode="numeric"
                      value={startAt}
                      onFocus={e => e.target.select()}
                      onChange={e => setStartAt(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="1"
                      className="w-20 h-8 px-2.5 rounded-lg border border-gray-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-500"
                    />
                  </label>
                )}
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-100 divide-y divide-gray-100 text-sm">
                <div className="flex justify-between px-4 py-2.5"><span className="text-gray-600">Lots</span><span className="font-semibold text-gray-900 tabular-nums">{plan.lots.length}</span></div>
                <div className="flex justify-between px-4 py-2.5"><span className="text-gray-600">Images</span><span className="font-semibold text-gray-900 tabular-nums">{imageCount}</span></div>
                {plan.lots.length > 0 && (
                  <div className="flex justify-between px-4 py-2.5">
                    <span className="text-gray-600">Lot range</span>
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {Math.min(...plan.lots.map(l => l.lotNumber))}–{Math.max(...plan.lots.map(l => l.lotNumber))}
                    </span>
                  </div>
                )}
              </div>

              {(plan.excluded.length > 0 || noPhotoLots.length > 0 || overLimitLots.length > 0) && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900 space-y-1.5">
                  {plan.excluded.length > 0 && (
                    <p><strong>{plan.excluded.length} skipped</strong> — {[...new Set(plan.excluded.map(e => e.reason))].join(", ")}. Use sequential numbering to include them.</p>
                  )}
                  {noPhotoLots.length > 0 && (
                    <p><strong>{noPhotoLots.length} lot{noPhotoLots.length !== 1 ? "s have" : " has"} no photos</strong> and will import with 0 images.</p>
                  )}
                  {overLimitLots.length > 0 && (
                    <p><strong>{overLimitLots.length} lot{overLimitLots.length !== 1 ? "s have" : " has"} more than {MAXSOLD_MAX_IMAGES_PER_LOT} photos</strong> — only the first {MAXSOLD_MAX_IMAGES_PER_LOT} are included. Tell MaxSold if you need the limit raised.</p>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button onClick={handleClose} className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                <button
                  onClick={build}
                  disabled={plan.lots.length === 0}
                  className="flex-1 h-10 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Build export
                </button>
              </div>
            </>
          )}

          {phase === "building" && (
            <div className="py-4">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">Downloading full-resolution photos…</p>
                <p className="text-sm text-gray-500 tabular-nums">{progress.done} / {progress.total}</p>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-forest-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-3">Keep this window open — large catalogs can take a few minutes.</p>
              <button onClick={handleClose} className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2">Cancel</button>
            </div>
          )}

          {phase === "done" && zipBlob && (
            <>
              <div className="flex items-center gap-3 rounded-xl bg-forest-50 border border-forest-200 px-4 py-3">
                <span className="w-8 h-8 rounded-full bg-forest-600 text-white flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                </span>
                <p className="text-sm text-forest-900">
                  <strong>{plan.lots.length} lots</strong> and <strong>{progress.total - failed.length} images</strong> ready.
                </p>
              </div>

              {failed.length > 0 && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-800">
                  <p className="font-semibold mb-1">{failed.length} image{failed.length !== 1 ? "s" : ""} couldn&apos;t be downloaded and {failed.length !== 1 ? "are" : "is"} missing from the ZIP:</p>
                  <ul className="list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">{failed.map(f => <li key={f}>{f}</li>)}</ul>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button onClick={downloadCsv} className="h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Lots CSV
                </button>
                <button onClick={downloadZip} className="h-11 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 transition-colors flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Images ZIP · {formatBytes(zipBlob.size)}
                </button>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                The ZIP is a complete MaxSold package — <code className="text-gray-700">lots.csv</code> plus an <code className="text-gray-700">images/</code> folder named by lot and photo order (<code className="text-gray-700">441-1.jpg, 441-2.jpg…</code>). Tell MaxSold you&apos;re using the <strong>image folder</strong> option.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
