"use client";

import { useState, useRef, useCallback } from "react";
import type { Item } from "@/lib/types";

// ─── CSV Template ──────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = ["email", "item_name", "sale_price", "consignor_payout", "sale_date", "circle_hand_id"];
const TEMPLATE_EXAMPLE = ["owner@example.com", "Vintage Oak Dresser", "450.00", "180.00", "2024-01-15", "CH-12345"];

function downloadTemplate() {
  const rows = [TEMPLATE_HEADERS.join(","), TEMPLATE_EXAMPLE.join(",")];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "circle_hand_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

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
  const headers = parseCSVLine(nonEmpty[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
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

function fmtCurrency(n: number): string {
  if (n <= 0) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  for (const [bg, count] of ba) intersection += Math.min(count, bb.get(bg) ?? 0);
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

interface ParsedRow {
  email: string;
  itemNameCH: string;
  salePrice: number;
  consignorPayout: number;
  saleDate: string;
  circleHandId: string;
}

interface MatchedRow {
  parsed: ParsedRow;
  tenantId: string | null;   // null = email not found
  matchedItem: Item | null;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  include: boolean;
  overrideItemId: string;
  emailError?: string;
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function CircleHandClient() {
  const [step, setStep] = useState<Step>("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState("");
  const [rows, setRows] = useState<MatchedRow[]>([]);
  const [rsItems, setRsItems] = useState<Item[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleProcess = useCallback(async () => {
    if (!csvFile) { setProcessError("Please select a CSV file."); return; }
    setProcessing(true);
    setProcessError("");
    try {
      const text = await csvFile.text();
      const csvRows = parseCSV(text);
      if (!csvRows.length) throw new Error("No data rows found in CSV.");

      // Validate required columns
      const first = csvRows[0];
      if (!("email" in first)) throw new Error('CSV is missing required "email" column. Please use the template.');
      if (!("item_name" in first)) throw new Error('CSV is missing required "item_name" column. Please use the template.');

      const res = await fetch("/api/admin/circle-hand");
      if (!res.ok) throw new Error("Failed to load Rightsize items.");
      const { items, tenantOwnerEmails } = await res.json() as {
        items: Item[];
        tenantOwnerEmails: Record<string, string>;
      };
      setRsItems(items);

      // Build reverse map: email (lowercase) → tenantId
      const emailToTenantId = new Map<string, string>();
      for (const [tenantId, email] of Object.entries(tenantOwnerEmails)) {
        if (email) emailToTenantId.set(email.toLowerCase(), tenantId);
      }

      // Build tenantId → items map
      const itemsByTenant = new Map<string, Item[]>();
      for (const item of items) {
        const list = itemsByTenant.get(item.tenantId) ?? [];
        list.push(item);
        itemsByTenant.set(item.tenantId, list);
      }

      const parsed: ParsedRow[] = csvRows.map(row => ({
        email: (row["email"] || "").toLowerCase().trim(),
        itemNameCH: row["item_name"] || row["itemname"] || row["title"] || "",
        salePrice: parseNum(row["sale_price"] || row["saleprice"] || row["price"] || ""),
        consignorPayout: parseNum(row["consignor_payout"] || row["consignorpayout"] || row["payout"] || ""),
        saleDate: row["sale_date"] || row["saledate"] || row["date"] || "",
        circleHandId: row["circle_hand_id"] || row["circlehandid"] || row["id"] || "",
      })).filter(r => r.email || r.itemNameCH);

      if (!parsed.length) throw new Error("No valid rows found. Check that email and item_name columns are populated.");

      const matched: MatchedRow[] = parsed.map(p => {
        if (!p.email) {
          return { parsed: p, tenantId: null, matchedItem: null, confidence: 0, confidenceLevel: "none", include: false, overrideItemId: "", emailError: "Email is required" };
        }

        const tenantId = emailToTenantId.get(p.email) ?? null;
        if (!tenantId) {
          return { parsed: p, tenantId: null, matchedItem: null, confidence: 0, confidenceLevel: "none", include: false, overrideItemId: "", emailError: `No project owner found for ${p.email}` };
        }

        // Fuzzy match within this tenant's items only
        const tenantItems = itemsByTenant.get(tenantId) ?? [];
        let bestScore = 0;
        let bestItem: Item | null = null;
        for (const item of tenantItems) {
          const score = diceCoefficient(p.itemNameCH, item.itemName);
          if (score > bestScore) { bestScore = score; bestItem = item; }
        }

        const pct = Math.round(bestScore * 100);
        const level = scoreToLevel(pct);
        return {
          parsed: p,
          tenantId,
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
  }, [csvFile]);

  const toggleInclude = useCallback((idx: number) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, include: !r.include } : r)), []);

  const setOverride = useCallback((idx: number, itemId: string) =>
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, overrideItemId: itemId, include: itemId !== "" } : r
    )), []);

  const selectAll = useCallback((checked: boolean) =>
    setRows(prev => prev.map(r => ({ ...r, include: r.emailError ? false : checked }))), []);

  const handleImport = useCallback(async () => {
    const toProcess = rows.filter(r => r.include && !r.emailError);
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
          salePrice: r.parsed.salePrice,
          consignorPayout: r.parsed.consignorPayout,
          saleDate: r.parsed.saleDate,
          circleHandItemId: r.parsed.circleHandId,
          chDescription: r.parsed.itemNameCH,
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
    setCsvFile(null);
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

          {/* Template download */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-gray-200 mb-0.5">CSV Template</div>
              <div className="text-xs text-gray-500 leading-relaxed">
                Required: <span className="text-gray-300">email</span>, <span className="text-gray-300">item_name</span>, <span className="text-gray-300">sale_price</span>, <span className="text-gray-300">sale_date</span>
                <br />Optional: <span className="text-gray-400">consignor_payout</span>, <span className="text-gray-400">circle_hand_id</span>
              </div>
              <div className="text-xs text-gray-600 mt-1.5">
                <span className="text-amber-500 font-medium">email</span> must match the project owner&apos;s account email.
              </div>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex-shrink-0 h-8 px-3 border border-gray-600 text-gray-300 text-xs rounded-lg hover:border-gray-400 hover:text-white transition-colors whitespace-nowrap"
            >
              Download Template
            </button>
          </div>

          {/* File picker */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Upload CSV <span className="text-red-400">*</span>
            </label>
            <div
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                csvFile
                  ? "border-forest-600 bg-forest-900/20"
                  : "border-gray-700 hover:border-gray-500 bg-gray-900/40"
              }`}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={e => { setCsvFile(e.target.files?.[0] ?? null); e.target.value = ""; setProcessError(""); }}
              />
              {csvFile ? (
                <div>
                  <svg className="w-5 h-5 text-forest-500 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-forest-400 font-medium text-sm truncate max-w-[200px] mx-auto">{csvFile.name}</div>
                  <div className="text-gray-600 text-xs mt-0.5">{(csvFile.size / 1024).toFixed(1)} KB</div>
                  <button
                    type="button"
                    className="text-xs text-gray-600 hover:text-red-400 mt-1.5 transition-colors"
                    onClick={e => { e.stopPropagation(); setCsvFile(null); }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <svg className="w-6 h-6 text-gray-600 mx-auto mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="text-sm text-gray-400">Click to select your CSV</div>
                  <div className="text-xs text-gray-600 mt-0.5">Use the template above for the correct format</div>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-600 leading-relaxed">
            Items already recorded with a sale price in Rightsize are automatically skipped.
          </p>

          {processError && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400">
              {processError}
            </div>
          )}

          <button
            onClick={handleProcess}
            disabled={!csvFile || processing}
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
              {summary.skipped} item{summary.skipped !== 1 ? "s" : ""} skipped — sale price already recorded.
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

  const selectedRows = rows.filter(r => r.include && !r.emailError);
  const selectedCount = selectedRows.length;
  const allChecked = rows.filter(r => !r.emailError).length > 0 && rows.filter(r => !r.emailError).every(r => r.include);
  const someChecked = selectedCount > 0 && !allChecked;
  const emailErrors = rows.filter(r => r.emailError).length;
  const needsReview = rows.filter(r => !r.emailError && r.confidenceLevel === "medium").length;
  const needsFix = rows.filter(r => !r.emailError && (r.confidenceLevel === "low" || r.confidenceLevel === "none")).length;

  // For override dropdown: group by tenantId so we only show items from the same project
  const sortedRsItems = [...rsItems].sort((a, b) => a.itemName.localeCompare(b.itemName));

  return (
    <div className="space-y-5">

      {/* ── Summary bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-500 text-xs">{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
        {emailErrors > 0 && (
          <span className="text-xs bg-red-900/60 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
            {emailErrors} email not found
          </span>
        )}
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
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Email / Owner</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">CH Item</th>
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

                  const needsOverride = !row.emailError && (row.confidenceLevel === "low" || row.confidenceLevel === "none");
                  // For override: only show items from same tenant
                  const tenantItems = row.tenantId
                    ? sortedRsItems.filter(i => i.tenantId === row.tenantId)
                    : sortedRsItems;

                  return (
                    <tr
                      key={idx}
                      className={`transition-opacity ${
                        row.emailError ? "opacity-50 bg-red-950/20" :
                        !row.include ? "opacity-40" :
                        row.confidenceLevel === "medium" ? "bg-yellow-950/30" : ""
                      }`}
                    >
                      {/* Include */}
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={row.include}
                          disabled={!!row.emailError}
                          onChange={() => toggleInclude(idx)}
                          className="rounded border-gray-600 accent-forest-600 disabled:opacity-30"
                        />
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3">
                        <div className="text-gray-300 text-xs whitespace-nowrap">{row.parsed.email || "—"}</div>
                        {row.emailError ? (
                          <div className="text-red-400 text-[10px] mt-0.5">{row.emailError}</div>
                        ) : (
                          <div className="text-gray-600 text-[10px] mt-0.5">matched</div>
                        )}
                      </td>

                      {/* CH Item */}
                      <td className="px-4 py-3">
                        <div className="max-w-[200px]">
                          <div className="text-gray-200 text-sm font-medium leading-snug line-clamp-2">
                            {row.parsed.itemNameCH || "—"}
                          </div>
                          <div className="text-gray-600 text-xs mt-0.5">{row.parsed.saleDate}</div>
                        </div>
                      </td>

                      {/* Match */}
                      <td className="px-4 py-3">
                        <div className="max-w-[200px] space-y-1">
                          {row.emailError ? (
                            <span className="text-gray-600 text-sm">—</span>
                          ) : (
                            <>
                              <div className={`text-sm leading-snug line-clamp-2 ${
                                row.overrideItemId ? "text-forest-400 font-medium" :
                                row.confidenceLevel === "high" ? "text-gray-200" :
                                row.confidenceLevel === "medium" ? "text-yellow-300" :
                                "text-gray-600"
                              }`}>
                                {effectiveItem?.itemName ?? "—"}
                              </div>
                              <ConfidenceBadge level={row.confidenceLevel} pct={row.confidence} />
                            </>
                          )}
                        </div>
                      </td>

                      {/* Sale / Payout */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="text-gray-200 text-sm tabular-nums">{fmtCurrency(row.parsed.salePrice)}</div>
                        {row.parsed.consignorPayout > 0 && (
                          <div className="text-gray-500 text-xs tabular-nums mt-0.5">
                            {fmtCurrency(row.parsed.consignorPayout)} payout
                          </div>
                        )}
                      </td>

                      {/* Fix */}
                      <td className="px-4 py-3">
                        {needsOverride ? (
                          <select
                            value={row.overrideItemId}
                            onChange={e => setOverride(idx, e.target.value)}
                            className="h-8 text-xs rounded-lg border border-gray-700 bg-gray-800 text-gray-300 px-2 w-[180px] focus:outline-none focus:border-forest-600"
                          >
                            <option value="">— pick item —</option>
                            {tenantItems.map(item => (
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
                  {fmtCurrency(selectedRows.reduce((s, r) => s + r.parsed.salePrice, 0))} sold
                </span>
                {selectedRows.some(r => r.parsed.consignorPayout > 0) && (
                  <>
                    <span className="mx-1 text-gray-700">→</span>
                    <span className="text-forest-500">
                      {fmtCurrency(selectedRows.reduce((s, r) => s + r.parsed.consignorPayout, 0))} payout
                    </span>
                  </>
                )}
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
