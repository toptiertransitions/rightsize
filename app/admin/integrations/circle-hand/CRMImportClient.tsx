"use client";

import { useState, useRef } from "react";

type ImportType = "client-contacts" | "companies" | "referral-contacts";

// ─── CSV parsing ──────────────────────────────────────────────────────────────

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
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[\s_\-]/g, ""));
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  }).filter(row => Object.values(row).some(v => v.trim()));
}

// ─── Config per import type ───────────────────────────────────────────────────

const CONFIGS: Record<ImportType, {
  label: string;
  description: string;
  columns: string[];
  sampleRow: string;
  apiPath: string;
  buildPayload: (row: Record<string, string>, extra?: Record<string, string>) => Record<string, string>;
}> = {
  "client-contacts": {
    label: "Client Contacts",
    description: "Import client contacts. Required: Name. Optional: Email, Phone, Source, Notes.",
    columns: ["Name", "Email", "Phone", "Source", "Notes"],
    sampleRow: "Jane Smith,jane@example.com,555-0100,Referral,VIP client",
    apiPath: "/api/crm/client-contacts",
    buildPayload: (row) => ({
      name: row["name"] || row["contactname"] || row["fullname"] || "",
      email: row["email"] || row["emailaddress"] || "",
      phone: row["phone"] || row["phonenumber"] || row["mobile"] || "",
      source: row["source"] || "",
      notes: row["notes"] || row["note"] || "",
    }),
  },
  "companies": {
    label: "Referral Companies",
    description: "Import referral partner companies. Required: Name. Optional: Type, Address, City, State, Zip, Notes.",
    columns: ["Name", "Type", "Address", "City", "State", "Zip", "Notes"],
    sampleRow: "Sunrise Senior Living,Senior Living,123 Main St,Springfield,IL,62701,Main referral partner",
    apiPath: "/api/crm/companies",
    buildPayload: (row) => ({
      name: row["name"] || row["company"] || row["companyname"] || "",
      type: row["type"] || row["companytype"] || "",
      address: row["address"] || "",
      city: row["city"] || "",
      state: row["state"] || "",
      zip: row["zip"] || row["zipcode"] || row["postalcode"] || "",
      notes: row["notes"] || "",
    }),
  },
  "referral-contacts": {
    label: "Referral Contacts",
    description: "Import contacts within referral companies. Required: Name. Optional: Title, Email, Phone, Company (matched by name), Notes.",
    columns: ["Name", "Title", "Email", "Phone", "Company", "Notes"],
    sampleRow: "Bob Jones,Director of Care,bob@sunrise.com,555-0200,Sunrise Senior Living,Key contact",
    apiPath: "/api/crm/contacts",
    buildPayload: (row, companyMap) => ({
      name: row["name"] || row["contactname"] || row["fullname"] || "",
      title: row["title"] || row["jobtitle"] || "",
      email: row["email"] || row["emailaddress"] || "",
      phone: row["phone"] || row["phonenumber"] || row["mobile"] || "",
      notes: row["notes"] || "",
      referralCompanyId: companyMap?.[
        (row["company"] || row["companyname"] || "").toLowerCase()
      ] ?? "",
    }),
  },
};

// ─── Single import panel ──────────────────────────────────────────────────────

function ImportPanel({ type }: { type: ImportType }) {
  const cfg = CONFIGS[type];
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: number } | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setRows(parseCSV(ev.target?.result as string));
    reader.readAsText(file);
    e.target.value = "";
    setResult(null);
  }

  async function handleImport() {
    if (!rows) return;
    setImporting(true);

    // For referral contacts: pre-fetch companies to build name→id map
    let companyMap: Record<string, string> = {};
    if (type === "referral-contacts") {
      try {
        const res = await fetch("/api/crm/companies");
        if (res.ok) {
          const data = await res.json();
          for (const c of data.companies ?? []) {
            companyMap[c.name.toLowerCase()] = c.id;
          }
        }
      } catch {}
    }

    let imported = 0;
    let errors = 0;
    for (const row of rows) {
      const payload = cfg.buildPayload(row, companyMap);
      const nameKey = Object.keys(payload).find(k => k === "name");
      if (!nameKey || !payload["name"]) continue;
      try {
        const res = await fetch(cfg.apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) imported++; else errors++;
      } catch { errors++; }
    }

    setImporting(false);
    setResult({ imported, errors });
    setRows(null);
  }

  const previewRows = rows?.slice(0, 4) ?? [];
  const previewCols = cfg.columns.slice(0, 4);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
      <div>
        <div className="font-semibold text-white">{cfg.label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{cfg.description}</div>
        <div className="mt-2 text-[11px] text-gray-600 font-mono">
          Columns: {cfg.columns.join(", ")} &nbsp;·&nbsp; Example row: <span className="text-gray-500">{cfg.sampleRow}</span>
        </div>
      </div>

      {result && (
        <div className={`text-sm px-3 py-2 rounded-lg ${result.errors > 0 ? "bg-yellow-900/30 text-yellow-300" : "bg-forest-900/30 text-forest-300"}`}>
          Imported {result.imported}{result.errors > 0 ? `, ${result.errors} failed` : ""}.
        </div>
      )}

      {rows && !importing && (
        <div>
          <div className="text-sm text-gray-300 mb-2">
            <span className="font-medium text-white">{rows.length}</span> rows ready to import
          </div>
          <div className="overflow-x-auto mb-3">
            <table className="text-xs w-full">
              <thead>
                <tr>{previewCols.map(c => <th key={c} className="text-left text-gray-500 pb-1 pr-4">{c}</th>)}</tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => {
                  const payload = cfg.buildPayload(row, {});
                  return (
                    <tr key={i} className="text-gray-400">
                      {previewCols.map(c => (
                        <td key={c} className="pr-4 py-0.5 truncate max-w-[140px]">
                          {payload[c.toLowerCase()] || "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {rows.length > 4 && (
                  <tr><td colSpan={previewCols.length} className="text-gray-600 pt-1">…and {rows.length - 4} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              className="h-9 px-4 bg-forest-600 hover:bg-forest-700 text-white text-sm rounded-lg font-medium transition-colors"
            >
              Import {rows.length} {cfg.label}
            </button>
            <button
              onClick={() => setRows(null)}
              className="h-9 px-4 border border-gray-700 text-gray-400 text-sm rounded-lg hover:border-gray-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {importing && (
        <div className="text-sm text-gray-400">Importing…</div>
      )}

      {!rows && !importing && (
        <>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          <button
            onClick={() => { setResult(null); fileRef.current?.click(); }}
            className="h-9 px-4 border border-gray-700 text-sm text-gray-300 rounded-lg hover:border-gray-500 hover:text-white transition-colors"
          >
            Choose CSV file…
          </button>
        </>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function CRMImportClient() {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <ImportPanel type="client-contacts" />
      <ImportPanel type="companies" />
      <ImportPanel type="referral-contacts" />
    </div>
  );
}
