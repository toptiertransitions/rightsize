"use client";

import { useState, useRef, useCallback } from "react";
import { VENDOR_TYPES } from "@/lib/types";
import type { VendorType } from "@/lib/types";

// ─── Template ──────────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  "vendorName",
  "vendorType",
  "pocName",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zip",
  "website",
  "itemCategories",
  "consignmentTake",
  "zipCodesServed",
  "notes",
];

const TEMPLATE_EXAMPLE = [
  "Denver Consignment Co.",
  "Consignment Store",
  "Jane Smith",
  "jane@example.com",
  "(555) 555-5555",
  "123 Main St",
  "Denver",
  "CO",
  "80202",
  "https://example.com",
  "Furniture, Art",
  "40",
  "80202, 80203",
  "Great partner for high-end items",
];

function downloadTemplate() {
  const rows = [TEMPLATE_HEADERS.join(","), TEMPLATE_EXAMPLE.map(v => `"${v}"`).join(",")];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vendor_import_template.csv";
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
  const headers = parseCSVLine(nonEmpty[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, ""));
  return nonEmpty.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "done";

interface ParsedVendor {
  vendorName: string;
  vendorType: string;
  pocName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  itemCategories: string;
  consignmentTake: number;
  zipCodesServed: string;
  notes: string;
  errors: string[];
}

interface ImportSummary {
  created: number;
  errors: Array<{ name: string; reason: string }>;
}

const VALID_VENDOR_TYPES = new Set<string>(VENDOR_TYPES);

function parseVendors(csvText: string): ParsedVendor[] {
  const rows = parseCSV(csvText);

  // Normalize header aliases
  const normalize = (row: Record<string, string>, ...keys: string[]) => {
    for (const k of keys) {
      if (row[k] !== undefined) return row[k];
    }
    return "";
  };

  return rows.map(row => {
    const vendorName = normalize(row, "vendorname", "vendor_name", "name");
    const vendorType = normalize(row, "vendortype", "vendor_type", "type");
    const pocName = normalize(row, "pocname", "poc_name", "poc", "contact", "pointofcontact");
    const email = normalize(row, "email");
    const phone = normalize(row, "phone");
    const address = normalize(row, "address", "streetaddress", "street_address");
    const city = normalize(row, "city");
    const state = normalize(row, "state");
    const zip = normalize(row, "zip", "zipcode", "zip_code", "postal");
    const website = normalize(row, "website", "url");
    const itemCategories = normalize(row, "itemcategories", "item_categories", "categories");
    const consignmentTakeRaw = normalize(row, "consignmenttake", "consignment_take", "take", "consignmentpct");
    const consignmentTake = parseFloat(consignmentTakeRaw) || 0;
    const zipCodesServed = normalize(row, "zipcodesserved", "zip_codes_served", "zipsserved", "zips_served");
    const notes = normalize(row, "notes", "note", "internalnotes");

    const errors: string[] = [];
    if (!vendorName) errors.push("vendorName is required");
    if (!vendorType) errors.push("vendorType is required");
    else if (!VALID_VENDOR_TYPES.has(vendorType)) errors.push(`"${vendorType}" is not a valid vendor type`);

    return {
      vendorName,
      vendorType,
      pocName,
      email,
      phone,
      address,
      city,
      state: state.toUpperCase(),
      zip,
      website,
      itemCategories,
      consignmentTake,
      zipCodesServed,
      notes,
      errors,
    };
  });
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function VendorImportClient() {
  const [step, setStep] = useState<Step>("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState("");
  const [vendors, setVendors] = useState<ParsedVendor[]>([]);
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
      const parsed = parseVendors(text);
      if (!parsed.length) throw new Error("No data rows found. Check that the CSV has at least one data row.");
      setVendors(parsed);
      setStep("preview");
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setProcessing(false);
    }
  }, [csvFile]);

  const handleImport = useCallback(async () => {
    const valid = vendors.filter(v => v.errors.length === 0);
    if (!valid.length) return;
    setImporting(true);
    setImportError("");

    const errors: ImportSummary["errors"] = [];
    let created = 0;

    for (const v of valid) {
      try {
        const res = await fetch("/api/local-vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendorType: v.vendorType as VendorType,
            vendorName: v.vendorName,
            pocName: v.pocName,
            email: v.email,
            phone: v.phone,
            address: v.address,
            city: v.city,
            state: v.state,
            zip: v.zip,
            website: v.website,
            itemCategories: v.itemCategories,
            consignmentTake: v.consignmentTake,
            zipCodesServed: v.zipCodesServed,
            notes: v.notes,
            isActive: true,
            prefCategories: [],
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          errors.push({ name: v.vendorName || "(blank)", reason: d.error || "Failed to create" });
        } else {
          created++;
        }
      } catch {
        errors.push({ name: v.vendorName || "(blank)", reason: "Network error" });
      }
    }

    setSummary({ created, errors });
    setStep("done");
    setImporting(false);
  }, [vendors]);

  const handleReset = () => {
    setStep("upload");
    setCsvFile(null);
    setVendors([]);
    setSummary(null);
    setProcessError("");
    setImportError("");
  };

  // ─── UPLOAD ──────────────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="max-w-xl">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">

          <div className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-gray-200 mb-0.5">CSV Template</div>
              <div className="text-xs text-gray-500 leading-relaxed">
                Required: <span className="text-gray-300">vendorName</span>, <span className="text-gray-300">vendorType</span>
                <br />
                Optional: <span className="text-gray-400">pocName, email, phone, address, city, state, zip, website, itemCategories, consignmentTake, zipCodesServed, notes</span>
              </div>
              <div className="text-xs text-gray-600 mt-1.5">
                <span className="text-amber-500 font-medium">vendorType</span> must exactly match one of:{" "}
                {VENDOR_TYPES.join(", ")}
              </div>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex-shrink-0 h-8 px-3 border border-gray-600 text-gray-300 text-xs rounded-lg hover:border-gray-400 hover:text-white transition-colors whitespace-nowrap"
            >
              Download Template
            </button>
          </div>

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
            {processing ? "Parsing…" : "Preview & Import"}
          </button>
        </div>
      </div>
    );
  }

  // ─── DONE ─────────────────────────────────────────────────────────────────────
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
          <p className="text-gray-400 text-sm mb-6">Vendors have been added to the directory.</p>

          <div className="grid grid-cols-2 gap-3 mb-6 text-left">
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-green-400">{summary.created}</div>
              <div className="text-xs text-gray-500 mt-0.5">Created</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-red-400">{summary.errors.length}</div>
              <div className="text-xs text-gray-500 mt-0.5">Errors</div>
            </div>
          </div>

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
            Import Another File
          </button>
        </div>
      </div>
    );
  }

  // ─── PREVIEW ──────────────────────────────────────────────────────────────────
  const validCount = vendors.filter(v => v.errors.length === 0).length;
  const errorCount = vendors.filter(v => v.errors.length > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-500 text-xs">{vendors.length} row{vendors.length !== 1 ? "s" : ""}</span>
        {validCount > 0 && (
          <span className="text-xs bg-green-900/60 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">
            {validCount} valid
          </span>
        )}
        {errorCount > 0 && (
          <span className="text-xs bg-red-900/60 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
            {errorCount} with errors (will be skipped)
          </span>
        )}
        <button
          onClick={handleReset}
          className="ml-auto text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          ← Back
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-800 border-b border-gray-700 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Vendor Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">POC / Email</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">City, State</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80">
                {vendors.map((v, i) => (
                  <tr
                    key={i}
                    className={`${v.errors.length > 0 ? "bg-red-950/20 opacity-60" : i % 2 !== 0 ? "bg-gray-800/20" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-white">
                      {v.vendorName || <span className="text-gray-600 italic">blank</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{v.vendorType || "—"}</td>
                    <td className="px-4 py-3">
                      {v.pocName && <div className="text-gray-300 text-xs">{v.pocName}</div>}
                      {v.email && <div className="text-gray-500 text-xs">{v.email}</div>}
                      {!v.pocName && !v.email && <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {[v.city, v.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {v.errors.length > 0 ? (
                        <div className="space-y-0.5">
                          {v.errors.map((e, j) => (
                            <div key={j} className="text-xs text-red-400">{e}</div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-green-400">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            {validCount} vendor{validCount !== 1 ? "s" : ""} will be imported
            {errorCount > 0 && <span className="text-red-500 ml-2">· {errorCount} skipped</span>}
          </div>
          <div className="flex items-center gap-3">
            {importError && <span className="text-sm text-red-400">{importError}</span>}
            <button
              onClick={handleImport}
              disabled={validCount === 0 || importing}
              className="h-10 px-5 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importing && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {importing ? "Importing…" : `Import ${validCount} Vendor${validCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
