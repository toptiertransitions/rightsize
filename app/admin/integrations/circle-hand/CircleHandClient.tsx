"use client";

import { useState, useRef, useCallback } from "react";
import type { Item } from "@/lib/types";

// ─── CSV Utilities ─────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) return [];
  const headers = parseCSVLine(nonEmpty[0]).map(h => h.trim().toLowerCase());
  return nonEmpty.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/[$,"\s]/g, "")) || 0;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isoDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().split("T")[0];
}

function fmtCurrency(n: number): string {
  if (n <= 0) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAYOUT_LABELS: Record<string, string> = {
  ZELLE: "Zelle",
  CHEQUE: "Cheque",
  CHECK: "Cheque",
  STORE_CREDIT: "Store Credit",
  CASH: "Cash",
};

// ─── Client Map ────────────────────────────────────────────────────────────────
// Clients CSV: clientId, firstName, lastName, payoutPreferences

interface ClientInfo {
  name: string;
  payoutMethod: string; // human-readable
}

function buildClientMap(text: string): Map<string, ClientInfo> {
  const rows = parseCSV(text);
  const map = new Map<string, ClientInfo>();
  for (const row of rows) {
    const id = row["clientid"];
    if (!id) continue;
    const first = (row["firstname"] ?? "").trim();
    const last = (row["lastname"] ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ") || `Client ${id}`;
    const rawPref = (row["payoutpreferences"] ?? "").toUpperCase();
    const payoutMethod = PAYOUT_LABELS[rawPref] ?? rawPref ?? "";
    map.set(id, { name, payoutMethod });
  }
  return map;
}

// ─── Items CSV Parsing ─────────────────────────────────────────────────────────
// Key columns: title · barcodeNumeric · dateSold · retailPrice · discountAmount
//              discountAbsorbedBy · splitForCustomer · compensationType · client
// Filter: compensationType === CONSIGNMENT  AND  dateSold non-empty

interface CHItem {
  id: string;           // barcodeNumeric
  title: string;
  salePrice: number;    // retailPrice
  payout: number;       // salePrice × splitForCustomer%
  splitPct: number;
  saleDate: string;     // YYYY-MM-DD
  saleDateDisplay: string;
  consignorName: string;
  payoutMethod: string;
  clientId: string;
}

function parseItemsCSV(text: string, clientMap: Map<string, ClientInfo>): CHItem[] {
  const rows = parseCSV(text);
  return rows
    .filter(row =>
      row["compensationtype"]?.toUpperCase() === "CONSIGNMENT" && !!row["datesold"]
    )
    .map(row => {
      const salePrice = parseNum(row["retailprice"]);
      const discountAmount = parseNum(row["discountamount"]);
      const discountAbsorber = (row["discountabsorbedby"] ?? "").toUpperCase();
      // If store absorbs discount, consignor earns % of full retail
      const netForPayout = discountAbsorber === "STORE" ? salePrice : salePrice - discountAmount;
      const splitPct = parseNum(row["splitforcustomer"]);
      const payout = splitPct > 0 ? Math.round((netForPayout * splitPct) / 100 * 100) / 100 : 0;
      const clientId = row["client"] ?? "";
      const client = clientMap.get(clientId);
      return {
        id: row["barcodenumeric"] || row["sku"] || "",
        title: row["title"] ?? "",
        salePrice,
        payout,
        splitPct,
        saleDate: isoDate(row["datesold"]),
        saleDateDisplay: fmtDate(row["datesold"]),
        consignorName: client?.name ?? (clientId ? `Client ${clientId}` : "Unknown"),
        payoutMethod: client?.payoutMethod ?? "",
        clientId,
      };
    })
    .filter(item => item.title);
}

// ─── Fuzzy Matching ────────────────────────────────────────────────────────────

function diceCoefficient(a: string, b: string): number {
  const clean = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const ca = clean(a);
  const cb = clean(b);
  if (!ca && !cb) return 1;
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;

  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };

  const ba = bigrams(ca);
  const bb = bigrams(cb);
  if (!ba.size || !bb.size) return 0;

  let intersection = 0;
  for (const [bg, count] of ba) {
    intersection += Math.min(count, bb.get(bg) ?? 0);
  }
  return (2 * intersection) / (ba.size + bb.size);
}

type ConfidenceLevel = "high" | "medium" | "low" | "none";

function scoreToLevel(pct: number): ConfidenceLevel {
  if (pct >= 80) return "high";
  if (pct >= 50) return "medium";
  if (pct > 0) return "low";
  return "none";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "done";

interface MatchedRow {
  chItem: CHItem;
  matchedItem: Item | null;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  include: boolean;
  overrideItemId: string;
}

interface ImportSummary {
  updated: number;
  skipped: number;
  errors: Array<{ name: string; reason: string }>;
}

// ─── Small components ─────────────────────────────────────────────────────────

function ConfidenceBadge({ level, pct }: { level: ConfidenceLevel; pct: number }) {
  const styles: Record<ConfidenceLevel, string> = {
    high: "bg-green-900/60 text-green-400 border border-green-800",
    medium: "bg-yellow-900/60 text-yellow-400 border border-yellow-800",
    low: "bg-red-900/60 text-red-400 border border-red-800",
    none: "bg-gray-800 text-gray-500 border border-gray-700",
  };
  const label = level === "none" ? "No match" : `${pct}% ${level}`;
  return (
    <span className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${styles[level]}`}>
      {label}
    </span>
  );
}

function FileDropArea({
  label,
  hint,
  file,
  onFile,
  required,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (f: File | null) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
          file
            ? "border-forest-600 bg-forest-900/20"
            : "border-gray-700 hover:border-gray-500 bg-gray-900/40"
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={e => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
        />
        {file ? (
          <div>
            <svg className="w-5 h-5 text-forest-500 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-forest-400 font-medium text-sm truncate max-w-[160px] mx-auto">{file.name}</div>
            <div className="text-gray-600 text-xs mt-0.5">{(file.size / 1024).toFixed(1)} KB</div>
            <button
              type="button"
              className="text-xs text-gray-600 hover:text-red-400 mt-1.5 transition-colors"
              onClick={e => { e.stopPropagation(); onFile(null); }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div>
            <svg className="w-6 h-6 text-gray-600 mx-auto mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="text-sm text-gray-400">{hint}</div>
            <div className="text-xs text-gray-600 mt-0.5">Click to select .csv</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CircleHandClient() {
  const [step, setStep] = useState<Step>("upload");
  const [clientsFile, setClientsFile] = useState<File | null>(null);
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState("");
  const [rows, setRows] = useState<MatchedRow[]>([]);
  const [rsItems, setRsItems] = useState<Item[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const handleProcess = useCallback(async () => {
    if (!itemsFile) { setProcessError("Items CSV is required."); return; }
    setProcessing(true);
    setProcessError("");
    try {
      const res = await fetch("/api/admin/circle-hand");
      if (!res.ok) throw new Error("Failed to load Rightsize items.");
      const { items } = await res.json() as { items: Item[] };
      setRsItems(items);

      let clientMap = new Map<string, ClientInfo>();
      if (clientsFile) {
        clientMap = buildClientMap(await clientsFile.text());
      }

      const chItems = parseItemsCSV(await itemsFile.text(), clientMap);
      if (!chItems.length) {
        throw new Error("No sold consignment items found in the Items CSV.");
      }

      const matched: MatchedRow[] = chItems.map(chItem => {
        let bestScore = 0;
        let bestItem: Item | null = null;
        for (const rsItem of items) {
          const score = diceCoefficient(chItem.title, rsItem.itemName);
          if (score > bestScore) { bestScore = score; bestItem = rsItem; }
        }
        const pct = Math.round(bestScore * 100);
        const level = scoreToLevel(pct);
        return {
          chItem,
          matchedItem: bestItem,
          confidence: pct,
          confidenceLevel: level,
          include: level === "high" || level === "medium",
          overrideItemId: "",
        };
      });

      setRows(matched);
      setStep("preview");
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setProcessing(false);
    }
  }, [itemsFile, clientsFile]);

  const toggleInclude = useCallback((idx: number) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, include: !r.include } : r)), []);

  const setOverride = useCallback((idx: number, itemId: string) =>
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, overrideItemId: itemId, include: itemId !== "" } : r
    )), []);

  const selectAll = useCallback((checked: boolean) =>
    setRows(prev => prev.map(r => ({ ...r, include: checked }))), []);

  const handleImport = useCallback(async () => {
    const toProcess = rows.filter(r => r.include);
    if (!toProcess.length) return;
    setImporting(true);
    setImportError("");
    try {
      const updates = toProcess.map(r => {
        const effectiveItem = r.overrideItemId
          ? (rsItems.find(i => i.id === r.overrideItemId) ?? r.matchedItem)
          : r.matchedItem;
        return {
          rightsizeItemId: effectiveItem?.id ?? "",
          salePrice: r.chItem.salePrice,
          consignorPayout: r.chItem.payout,
          saleDate: r.chItem.saleDate,
          circleHandItemId: r.chItem.id,
          chDescription: r.chItem.title,
        };
      });
      const res = await fetch("/api/admin/circle-hand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error("Import request failed.");
      setSummary(await res.json() as ImportSummary);
      setStep("done");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }, [rows, rsItems]);

  const handleReset = () => {
    setStep("upload");
    setClientsFile(null);
    setItemsFile(null);
    setRows([]);
    setRsItems([]);
    setSummary(null);
    setProcessError("");
    setImportError("");
  };

  // ─── UPLOAD ────────────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="max-w-xl">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <FileDropArea
              label="Clients CSV"
              hint="Adds consignor names & payout methods"
              file={clientsFile}
              onFile={setClientsFile}
            />
            <FileDropArea
              label="Items CSV"
              hint="Sold consignment items from Circle Hand"
              file={itemsFile}
              onFile={setItemsFile}
              required
            />
          </div>

          <p className="text-xs text-gray-600 leading-relaxed">
            Only sold consignment items are imported. Items already recorded in Rightsize with a sale price are automatically skipped.
          </p>

          {processError && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400">
              {processError}
            </div>
          )}

          <button
            onClick={handleProcess}
            disabled={!itemsFile || processing}
            className="h-11 px-6 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {processing && (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {processing ? "Matching…" : "Match & Preview"}
          </button>
        </div>
      </div>
    );
  }

  // ─── DONE ──────────────────────────────────────────────────────────────────
  if (step === "done" && summary) {
    return (
      <div className="max-w-md">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-forest-900/50 border border-forest-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-forest-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Import Complete</h2>
          <p className="text-gray-400 text-sm mb-6">Sale data has been written to Rightsize.</p>

          <div className="grid grid-cols-3 gap-3 mb-6 text-left">
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-green-400">{summary.updated}</div>
              <div className="text-xs text-gray-500 mt-0.5">Updated</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-yellow-400">{summary.skipped}</div>
              <div className="text-xs text-gray-500 mt-0.5">Skipped</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-red-400">{summary.errors.length}</div>
              <div className="text-xs text-gray-500 mt-0.5">Errors</div>
            </div>
          </div>

          {summary.skipped > 0 && (
            <p className="text-xs text-yellow-700 mb-4">
              {summary.skipped} item{summary.skipped !== 1 ? "s" : ""} skipped — sale price was already recorded.
            </p>
          )}

          {summary.errors.length > 0 && (
            <div className="bg-red-900/20 border border-red-900 rounded-xl p-3 mb-4 text-left">
              <div className="text-xs font-medium text-red-400 mb-1.5">Errors</div>
              <ul className="space-y-1">
                {summary.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-300">
                    <span className="font-medium">{e.name}</span>: {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={handleReset}
            className="h-11 px-6 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium text-sm transition-colors"
          >
            Start Over
          </button>
        </div>
      </div>
    );
  }

  // ─── PREVIEW ───────────────────────────────────────────────────────────────

  // Build per-consignor summary for the panel
  const consignorMap = new Map<string, { items: number; totalPayout: number; payoutMethod: string }>();
  for (const r of rows) {
    const key = r.chItem.consignorName;
    const existing = consignorMap.get(key) ?? { items: 0, totalPayout: 0, payoutMethod: r.chItem.payoutMethod };
    consignorMap.set(key, {
      items: existing.items + 1,
      totalPayout: existing.totalPayout + r.chItem.payout,
      payoutMethod: existing.payoutMethod,
    });
  }

  const selectedRows = rows.filter(r => r.include);
  const selectedCount = selectedRows.length;
  const allChecked = rows.length > 0 && rows.every(r => r.include);
  const someChecked = selectedCount > 0 && !allChecked;
  const needsReview = rows.filter(r => r.confidenceLevel === "medium").length;
  const needsFix = rows.filter(r => r.confidenceLevel === "low" || r.confidenceLevel === "none").length;
  const sortedRsItems = [...rsItems].sort((a, b) => a.itemName.localeCompare(b.itemName));

  return (
    <div className="space-y-5">

      {/* ── Consignors panel ────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Consignors in this import
        </h2>
        <div className="flex flex-wrap gap-3">
          {[...consignorMap.entries()].map(([name, info]) => (
            <div
              key={name}
              className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 min-w-[160px]"
            >
              <div className="text-sm font-semibold text-white">{name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {info.items} item{info.items !== 1 ? "s" : ""}
                <span className="mx-1 text-gray-700">·</span>
                {fmtCurrency(info.totalPayout)} payout
              </div>
              {info.payoutMethod && (
                <div className="text-[11px] text-forest-500 mt-1">{info.payoutMethod}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Match quality bar ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-500 text-xs">{rows.length} items</span>
        {needsReview > 0 && (
          <span className="text-xs bg-yellow-900/60 text-yellow-400 border border-yellow-800 px-2 py-0.5 rounded-full">
            {needsReview} to review
          </span>
        )}
        {needsFix > 0 && (
          <span className="text-xs bg-red-900/60 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
            {needsFix} need manual match
          </span>
        )}
        <button
          onClick={handleReset}
          className="ml-auto text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          ← Back
        </button>
      </div>

      {/* ── Items table ─────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-800 border-b border-gray-700 text-left">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked; }}
                      onChange={e => selectAll(e.target.checked)}
                      className="rounded border-gray-600 accent-forest-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Item</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Consignor</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Rightsize Match</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide text-right">Sale / Payout</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Fix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80">
                {rows.map((row, idx) => {
                  const effectiveItem = row.overrideItemId
                    ? rsItems.find(i => i.id === row.overrideItemId)
                    : row.matchedItem;

                  const needsOverride = row.confidenceLevel === "low" || row.confidenceLevel === "none";

                  return (
                    <tr
                      key={idx}
                      className={`transition-opacity ${
                        !row.include ? "opacity-40" : row.confidenceLevel === "medium" ? "bg-yellow-950/30" : ""
                      }`}
                    >
                      {/* Include */}
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={() => toggleInclude(idx)}
                          className="rounded border-gray-600 accent-forest-600"
                        />
                      </td>

                      {/* Item */}
                      <td className="px-4 py-3">
                        <div className="max-w-[220px]">
                          <div className="text-gray-200 text-sm font-medium leading-snug line-clamp-2">
                            {row.chItem.title}
                          </div>
                          <div className="text-gray-600 text-xs mt-0.5">{row.chItem.saleDateDisplay}</div>
                        </div>
                      </td>

                      {/* Consignor */}
                      <td className="px-4 py-3">
                        <div className="text-gray-300 text-sm whitespace-nowrap">{row.chItem.consignorName}</div>
                        {row.chItem.payoutMethod && (
                          <div className="text-gray-600 text-xs mt-0.5">{row.chItem.payoutMethod}</div>
                        )}
                      </td>

                      {/* Match */}
                      <td className="px-4 py-3">
                        <div className="max-w-[200px] space-y-1">
                          <div className={`text-sm leading-snug line-clamp-2 ${
                            row.overrideItemId ? "text-forest-400 font-medium" :
                            row.confidenceLevel === "high" ? "text-gray-200" :
                            row.confidenceLevel === "medium" ? "text-yellow-300" :
                            "text-gray-600"
                          }`}>
                            {effectiveItem?.itemName ?? "—"}
                          </div>
                          <ConfidenceBadge level={row.confidenceLevel} pct={row.confidence} />
                        </div>
                      </td>

                      {/* Sale / Payout */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="text-gray-200 text-sm tabular-nums">{fmtCurrency(row.chItem.salePrice)}</div>
                        <div className="text-gray-500 text-xs tabular-nums mt-0.5">
                          {fmtCurrency(row.chItem.payout)} payout
                        </div>
                      </td>

                      {/* Fix — override dropdown, only for low/none */}
                      <td className="px-4 py-3">
                        {needsOverride ? (
                          <select
                            value={row.overrideItemId}
                            onChange={e => setOverride(idx, e.target.value)}
                            className="h-8 text-xs rounded-lg border border-gray-700 bg-gray-800 text-gray-300 px-2 w-[180px] focus:outline-none focus:border-forest-600"
                          >
                            <option value="">— pick item —</option>
                            {sortedRsItems.map(item => (
                              <option key={item.id} value={item.id}>
                                {item.itemName.length > 46 ? item.itemName.slice(0, 43) + "…" : item.itemName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            {selectedCount} of {rows.length} selected
            {selectedCount > 0 && (
              <>
                <span className="mx-2 text-gray-700">·</span>
                <span className="text-gray-400">
                  {fmtCurrency(selectedRows.reduce((s, r) => s + r.chItem.salePrice, 0))} sold
                </span>
                <span className="mx-1 text-gray-700">→</span>
                <span className="text-forest-500">
                  {fmtCurrency(selectedRows.reduce((s, r) => s + r.chItem.payout, 0))} payout
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {importError && <span className="text-sm text-red-400">{importError}</span>}
            <button
              onClick={handleImport}
              disabled={selectedCount === 0 || importing}
              className="h-10 px-5 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importing && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {importing ? "Importing…" : `Import ${selectedCount} Record${selectedCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>

      {needsReview > 0 && (
        <p className="text-xs text-yellow-700">
          Yellow rows have medium confidence — compare item names before importing.
        </p>
      )}
    </div>
  );
}
