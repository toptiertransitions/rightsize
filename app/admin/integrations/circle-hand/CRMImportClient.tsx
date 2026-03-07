"use client";

import { useState, useRef, useEffect } from "react";

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
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[\s_\-\/]/g, ""));
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  }).filter(row => Object.values(row).some(v => v.trim()));
}

function downloadCSV(filename: string, headers: string[], example: string[]) {
  const csv = [headers, example].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Config per import type ───────────────────────────────────────────────────

const CONFIGS: Record<ImportType, {
  label: string;
  filename: string;
  description: string;
  columns: string[];
  templateHeaders: string[];
  templateExample: string[];
  apiPath: string;
  supportsOwner: boolean;
  buildPayload: (row: Record<string, string>, extra?: Record<string, string>) => Record<string, string>;
}> = {
  "client-contacts": {
    label: "Client Contacts",
    filename: "client-contacts-template.csv",
    description: "Import client contacts. Required: Client Name.",
    columns: ["Client Name", "Email", "Phone", "Source", "Notes"],
    templateHeaders: ["Client Name", "Email", "Phone", "Source", "Notes"],
    templateExample: [
      "Jane Smith",
      "jane@example.com",
      "555-0100",
      "Referral Partner",
      "VIP client referred by Sunrise",
    ],
    apiPath: "/api/crm/client-contacts",
    supportsOwner: false,
    buildPayload: (row) => ({
      name: row["clientname"] || row["name"] || row["contactname"] || row["fullname"] || "",
      email: row["email"] || row["emailaddress"] || "",
      phone: row["phone"] || row["phonenumber"] || row["mobile"] || "",
      source: row["source"] || "",
      notes: row["notes"] || row["note"] || "",
    }),
  },
  "companies": {
    label: "Referral Companies",
    filename: "referral-companies-template.csv",
    description: "Import referral partner companies. Required: Company Name.",
    columns: ["Company Name", "Type", "Address", "City", "State", "Zip", "Priority", "Owner", "Notes"],
    templateHeaders: ["Company Name", "Type", "Address", "City", "State", "Zip", "Priority", "Owner", "Notes"],
    templateExample: [
      "Sunrise Senior Living",
      "Senior Living",
      "123 Main St",
      "Springfield",
      "IL",
      "62701",
      "High",
      "Matt Kamhi",
      "Primary referral partner",
    ],
    apiPath: "/api/crm/companies",
    supportsOwner: true,
    buildPayload: (row) => ({
      name: row["companyname"] || row["name"] || row["company"] || "",
      type: row["type"] || row["companytype"] || "",
      address: row["address"] || "",
      city: row["city"] || "",
      state: row["state"] || "",
      zip: row["zip"] || row["zipcode"] || row["postalcode"] || "",
      priority: row["priority"] || "",
      notes: row["notes"] || "",
    }),
  },
  "referral-contacts": {
    label: "Referral Contacts",
    filename: "referral-contacts-template.csv",
    description: "Import referral partner contacts. Required: Name.",
    columns: ["Name", "Title", "Email", "Phone", "Company", "Date Introduced", "Interests", "Coffee Order", "Orgs/Groups", "Owner", "Notes"],
    templateHeaders: ["Name", "Title", "Email", "Phone", "Company", "Date Introduced", "Interests", "Coffee Order", "Orgs/Groups", "Owner", "Notes"],
    templateExample: [
      "Bob Jones",
      "Director of Care",
      "bob@sunrise.com",
      "555-0200",
      "Sunrise Senior Living",
      "2024-03-15",
      "Golf, cooking",
      "Oat milk latte",
      "NASMM, local chamber",
      "Matt Kamhi",
      "Key decision maker",
    ],
    apiPath: "/api/crm/contacts",
    supportsOwner: true,
    buildPayload: (row, companyMap) => ({
      name: row["name"] || row["contactname"] || row["fullname"] || "",
      title: row["title"] || row["jobtitle"] || "",
      email: row["email"] || row["emailaddress"] || "",
      phone: row["phone"] || row["phonenumber"] || row["mobile"] || "",
      notes: row["notes"] || row["note"] || "",
      dateIntroduced: row["dateintroduced"] || row["introduced"] || "",
      interests: row["interests"] || row["interest"] || "",
      coffeeOrder: row["coffeeorder"] || row["coffee"] || "",
      orgsGroups: row["orgsgroups"] || row["orgs"] || row["groups"] || "",
      referralCompanyId: companyMap?.[
        (row["company"] || row["companyname"] || "").toLowerCase()
      ] ?? "",
    }),
  },
};

// ─── Single import panel ──────────────────────────────────────────────────────

function ImportPanel({ type, staffMap }: { type: ImportType; staffMap: Record<string, string> }) {
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

    // Pre-fetch all existing records once to build name→id map (avoids per-row Airtable lookups)
    const existingMap = new Map<string, string>(); // name.toLowerCase() → id
    try {
      const existingRes = await fetch(cfg.apiPath);
      if (existingRes.ok) {
        const existingData = await existingRes.json();
        const records: { id: string; name: string }[] =
          existingData.companies ?? existingData.contacts ?? [];
        for (const r of records) {
          existingMap.set(r.name.toLowerCase(), r.id);
        }
      }
    } catch {}

    // For referral contacts: also pre-fetch companies to build name→id map
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
      if (!payload["name"]) continue;

      // Resolve Owner column → assignedToClerkId (for types that have an owner field)
      if (cfg.supportsOwner) {
        const ownerName = (row["owner"] || "").trim().toLowerCase();
        if (ownerName && staffMap[ownerName]) {
          payload.assignedToClerkId = staffMap[ownerName];
        }
      }

      try {
        const existingId = existingMap.get(payload["name"].toLowerCase());
        let res: Response;
        if (existingId) {
          // Overwrite existing record
          res = await fetch(cfg.apiPath, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: existingId, ...payload }),
          });
        } else {
          // Create new record
          res = await fetch(cfg.apiPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        if (res.ok) imported++; else errors++;
      } catch { errors++; }
    }

    setImporting(false);
    setResult({ imported, errors });
    setRows(null);
  }

  const previewRows = rows?.slice(0, 4) ?? [];
  // Show first 5 columns in the preview table
  const previewCols = cfg.columns.slice(0, 5);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
      <div>
        <div className="font-semibold text-white">{cfg.label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{cfg.description}</div>
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
                          {payload[c.toLowerCase().replace(/[\s_\-\/]/g, "")] || "—"}
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
        <div className="flex gap-2">
          <button
            onClick={() => downloadCSV(cfg.filename, cfg.templateHeaders, cfg.templateExample)}
            className="h-9 px-3 flex items-center gap-1.5 border border-gray-700 text-sm text-gray-400 rounded-lg hover:border-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Template
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          <button
            onClick={() => { setResult(null); fileRef.current?.click(); }}
            className="h-9 px-4 border border-gray-700 text-sm text-gray-300 rounded-lg hover:border-gray-500 hover:text-white transition-colors"
          >
            Choose CSV…
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function CRMImportClient() {
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/staff")
      .then(r => r.ok ? r.json() : { staff: [] })
      .then(data => {
        const map: Record<string, string> = {};
        for (const s of (data.staff ?? [])) {
          map[(s.displayName as string).toLowerCase()] = s.clerkUserId as string;
        }
        setStaffMap(map);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <ImportPanel type="client-contacts" staffMap={staffMap} />
      <ImportPanel type="companies" staffMap={staffMap} />
      <ImportPanel type="referral-contacts" staffMap={staffMap} />
    </div>
  );
}
