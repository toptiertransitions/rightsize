"use client";

import { useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Tenant { id: string; name: string; }

interface ParsedRow {
  rowNum: number;
  itemName: string;
  client: string;       // raw CSV value
  tenantId: string;     // matched tenant id ("" if no match)
  tenantName: string;   // matched tenant name
  quantity: string;
  estimatedValue: string;
  clientShare: string;
  route: string;
  barcode: string;
  deliveryDate: string;
  status: string;
  errors: string[];
}

const ROUTE_COLORS: Record<string, string> = {
  "ProFoundFinds Consignment": "bg-emerald-900/50 text-emerald-300 border-emerald-700",
  "FB/Marketplace": "bg-blue-900/50 text-blue-300 border-blue-700",
  "Online Marketplace": "bg-purple-900/50 text-purple-300 border-purple-700",
  "Discard": "bg-red-900/50 text-red-300 border-red-700",
  "Donate": "bg-amber-900/50 text-amber-300 border-amber-700",
  "Keep": "bg-gray-700/50 text-gray-300 border-gray-600",
  "Family Keeping": "bg-gray-700/50 text-gray-300 border-gray-600",
  "Other Consignment": "bg-teal-900/50 text-teal-300 border-teal-700",
};

const ROUTE_MAP: Record<string, string> = {
  pfinventory: "ProFoundFinds Consignment",
  pf: "ProFoundFinds Consignment",
  profoundfinds: "ProFoundFinds Consignment",
  "profoundfinds consignment": "ProFoundFinds Consignment",
  consignment: "ProFoundFinds Consignment",
  fb: "FB/Marketplace",
  facebook: "FB/Marketplace",
  "facebook marketplace": "FB/Marketplace",
  "fb/marketplace": "FB/Marketplace",
  ebay: "Online Marketplace",
  "online marketplace": "Online Marketplace",
  online: "Online Marketplace",
  discard: "Discard",
  donate: "Donate",
  keep: "Keep",
  "family keeping": "Family Keeping",
  family: "Family Keeping",
  "other consignment": "Other Consignment",
  other: "Other Consignment",
};

function normalizeRoute(raw: string): string {
  return ROUTE_MAP[raw.toLowerCase().trim()] ?? (raw || "—");
}

// ─── CSV Parsing ──────────────────────────────────────────────────────────────
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

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1).map(parseCSVLine);
  return { headers, rows };
}

const HEADER_ALIASES: Record<string, string[]> = {
  itemName:       ["item name", "item", "name", "item_name", "itemname"],
  client:         ["client", "project", "tenant", "client name"],
  quantity:       ["quantity", "qty", "count"],
  estimatedValue: ["estimated value", "value", "est value", "est. value", "estimatedvalue"],
  clientShare:    ["client share", "client share %", "client share percent", "share", "clientshare"],
  route:          ["recommended route", "route", "primary route", "primaryroute"],
  barcode:        ["barcode", "barcode number", "barcodenumber", "sku"],
  deliveryDate:   ["delivery date", "deliverydate", "deliver date"],
  status:         ["status"],
};

function findHeader(headers: string[], field: string): number {
  const aliases = HEADER_ALIASES[field] || [field];
  return headers.findIndex(h => aliases.includes(h.toLowerCase().trim()));
}

// ─── Template download ────────────────────────────────────────────────────────
function downloadTemplate() {
  const headers = [
    "Item Name",
    "Client",
    "Quantity",
    "Estimated Value",
    "Client Share",
    "Recommended Route",
    "Barcode",
    "Delivery Date",
    "Status",
  ];
  const example = [
    "Leather Sofa",
    "Smith Family",
    "1",
    "350",
    "60",
    "PFInventory",
    "TTT-00123",
    "2026-04-01",
    "Pending Review",
  ];
  const csv = [headers, example].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "item-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ItemImportClient({ tenants }: { tenants: Tenant[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number; errors: { row: number; error: string }[] } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const tenantByName = new Map(tenants.map(t => [t.name.toLowerCase().trim(), t]));

  function matchTenant(clientRaw: string): { tenantId: string; tenantName: string } {
    const key = clientRaw.toLowerCase().trim();
    // Exact match
    const exact = tenantByName.get(key);
    if (exact) return { tenantId: exact.id, tenantName: exact.name };
    // Partial match (client name contains or is contained by tenant name)
    for (const [tName, t] of tenantByName) {
      if (tName.includes(key) || key.includes(tName)) {
        return { tenantId: t.id, tenantName: t.name };
      }
    }
    return { tenantId: "", tenantName: "" };
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows: rawRows } = parseCSV(text);

      const idx = {
        itemName:       findHeader(headers, "itemName"),
        client:         findHeader(headers, "client"),
        quantity:       findHeader(headers, "quantity"),
        estimatedValue: findHeader(headers, "estimatedValue"),
        clientShare:    findHeader(headers, "clientShare"),
        route:          findHeader(headers, "route"),
        barcode:        findHeader(headers, "barcode"),
        deliveryDate:   findHeader(headers, "deliveryDate"),
        status:         findHeader(headers, "status"),
      };

      const parsed: ParsedRow[] = rawRows
        .filter(r => r.some(c => c.trim()))
        .map((r, i) => {
          const get = (col: number) => (col >= 0 ? r[col] ?? "" : "");
          const itemName    = get(idx.itemName);
          const client      = get(idx.client);
          const quantity    = get(idx.quantity);
          const estimatedValue = get(idx.estimatedValue);
          const clientShare = get(idx.clientShare);
          const route       = get(idx.route);
          const barcode     = get(idx.barcode);
          const deliveryDate = get(idx.deliveryDate);
          const status      = get(idx.status);

          const { tenantId, tenantName } = matchTenant(client);
          const errors: string[] = [];
          if (!itemName.trim()) errors.push("Missing Item Name");
          if (!client.trim()) errors.push("Missing Client");
          else if (!tenantId) errors.push(`No project found for "${client}"`);

          return { rowNum: i + 2, itemName, client, tenantId, tenantName, quantity, estimatedValue, clientShare, route, barcode, deliveryDate, status, errors };
        });

      setRows(parsed);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const validRows = rows.filter(r => r.errors.length === 0);
  const invalidRows = rows.filter(r => r.errors.length > 0);

  async function handleImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const payload = validRows.map(r => ({
        itemName: r.itemName,
        tenantId: r.tenantId,
        quantity: r.quantity ? parseFloat(r.quantity) || undefined : undefined,
        estimatedValue: r.estimatedValue ? parseFloat(r.estimatedValue) || undefined : undefined,
        clientSharePercent: r.clientShare ? parseFloat(r.clientShare) || undefined : undefined,
        route: r.route,
        barcode: r.barcode || undefined,
        deliveryDate: r.deliveryDate || undefined,
        status: r.status || undefined,
      }));
      const res = await fetch("/api/admin/items-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json();
      setResult(data);
      if (data.imported > 0) setRows([]);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Actions row */}
      <div className="flex items-center gap-3">
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 border border-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Template
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-forest-600 text-white rounded-lg text-sm hover:bg-forest-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
          </svg>
          {fileName ? "Replace CSV" : "Upload CSV"}
        </button>
        {fileName && <span className="text-xs text-gray-400">{fileName}</span>}
      </div>

      {/* Column guide */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">CSV Columns</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-gray-300">
          {[
            ["Item Name *", "Name of the item"],
            ["Client *", "Project name (must match an existing project)"],
            ["Quantity", "Number of units"],
            ["Estimated Value", "Dollar value (numbers only, no $)"],
            ["Client Share", "Client's % share (e.g. 60 for 60%)"],
            ["Recommended Route", "PFInventory · FB · eBay · Discard · Donate · Keep"],
            ["Barcode", "Barcode number (PFInventory items only)"],
            ["Delivery Date", "YYYY-MM-DD format"],
            ["Status", "Pending Review · Approved · Listed · Sold · Discarded"],
          ].map(([col, desc]) => (
            <div key={col} className="bg-gray-800 rounded-lg p-2">
              <p className="font-medium text-white">{col}</p>
              <p className="text-gray-400 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div className={`rounded-xl p-4 border ${result.failed === 0 ? "bg-green-900/30 border-green-700" : "bg-amber-900/30 border-amber-700"}`}>
          <p className="text-sm font-medium text-white">
            {result.imported} item{result.imported !== 1 ? "s" : ""} imported successfully
            {result.failed > 0 && `, ${result.failed} failed`}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.errors.map((e, i) => (
                <li key={i} className="text-xs text-red-300">Row {e.row}: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="space-y-4">
          {invalidRows.length > 0 && (
            <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
              <p className="text-sm font-medium text-red-300 mb-2">{invalidRows.length} row{invalidRows.length !== 1 ? "s" : ""} with errors (will be skipped)</p>
              <ul className="space-y-1">
                {invalidRows.map(r => (
                  <li key={r.rowNum} className="text-xs text-red-400">
                    Row {r.rowNum} ({r.itemName || "no name"}): {r.errors.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-300">
              <span className="font-medium text-white">{validRows.length}</span> valid row{validRows.length !== 1 ? "s" : ""} ready to import
            </p>
            <button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="px-5 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {importing ? "Importing…" : `Import ${validRows.length} Item${validRows.length !== 1 ? "s" : ""}`}
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">#</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">Item Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">Client / Project</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">Route</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">Qty</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">Est. Value</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">Client Share</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">Barcode</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">Delivery Date</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const normalizedRoute = normalizeRoute(r.route);
                    const routeColor = ROUTE_COLORS[normalizedRoute] ?? "bg-gray-700/50 text-gray-300 border-gray-600";
                    const hasError = r.errors.length > 0;
                    return (
                      <tr key={r.rowNum} className={`border-b border-gray-800 ${hasError ? "bg-red-950/30" : "hover:bg-gray-800/40"}`}>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{r.rowNum}</td>
                        <td className="px-4 py-2.5 font-medium text-white whitespace-nowrap">
                          {r.itemName || <span className="text-red-400 italic">missing</span>}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {r.tenantId ? (
                            <span className="text-green-300">{r.tenantName}</span>
                          ) : (
                            <span className="text-red-400">{r.client || <span className="italic">missing</span>}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {r.route ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs border ${routeColor}`}>
                              {normalizedRoute}
                            </span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300">{r.quantity || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-300">
                          {r.estimatedValue ? `$${parseFloat(r.estimatedValue).toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300">
                          {r.clientShare ? `${r.clientShare}%` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 font-mono text-xs">{r.barcode || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-300 text-xs">{r.deliveryDate || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-300 text-xs">{r.status || "—"}</td>
                        <td className="px-4 py-2.5">
                          {r.errors.length > 0 ? (
                            <span className="text-red-400 text-xs">{r.errors.join("; ")}</span>
                          ) : (
                            <span className="text-green-500 text-xs">Ready</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && !result && (
        <div
          className="border-2 border-dashed border-gray-700 rounded-xl p-12 text-center cursor-pointer hover:border-gray-500 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <svg className="w-10 h-10 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-400 text-sm mb-1">Drop your CSV file here or click to upload</p>
          <p className="text-gray-600 text-xs">Download the template above to get started</p>
        </div>
      )}
    </div>
  );
}
