"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Pagination } from "../components/Pagination";

const PAGE_SIZE = 25;
import Image from "next/image";
import type { Item, ItemStatus } from "@/lib/types";

const PF_STATUSES: ItemStatus[] = ["Listed", "Sold", "Discarded"];

interface TenantInfo { name: string; ownerEmail: string; }
interface Props { items: Item[]; tenantInfoMap: Record<string, TenantInfo>; }

function fmtDate(s?: string) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}
function returnDate(deliveryDate?: string) {
  if (!deliveryDate) return "";
  try { const d = new Date(deliveryDate); d.setDate(d.getDate() + 90); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return ""; }
}
function isOverdue(deliveryDate?: string) {
  if (!deliveryDate) return false;
  try { const d = new Date(deliveryDate); d.setDate(d.getDate() + 90); return d < new Date(); }
  catch { return false; }
}

const STATUS_STYLE: Record<string, string> = {
  Listed:    "bg-purple-900/50 text-purple-300 border-purple-700",
  Sold:      "bg-green-900/50 text-green-300 border-green-700",
  Discarded: "bg-gray-800 text-gray-400 border-gray-700",
};

// ─── Inline editable cell ─────────────────────────────────────────────────────
function EditCell({ value, type = "text", onSave, className = "", prefix = "", suffix = "", placeholder = "—" }: {
  value: string | number | undefined; type?: "text" | "number" | "date";
  onSave: (v: string) => void; className?: string; prefix?: string; suffix?: string; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);
  function start() { setDraft(String(value ?? "")); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }
  function commit() { setEditing(false); if (draft !== String(value ?? "")) onSave(draft); }
  if (editing) return (
    <input ref={inputRef} type={type} value={draft} autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className={`bg-gray-700 border border-forest-500 rounded px-2 py-1 text-sm text-white focus:outline-none w-full ${className}`}
    />
  );
  const display = value != null && value !== "" ? `${prefix}${value}${suffix}` : null;
  return (
    <button onClick={start} title="Click to edit" className={`text-left w-full px-2 py-1 rounded hover:bg-gray-700/60 transition-colors group ${className}`}>
      {display ? <span className="text-gray-200 text-sm">{display}</span> : <span className="text-gray-600 text-sm italic group-hover:text-gray-400">{placeholder}</span>}
    </button>
  );
}

// ─── Status select cell ───────────────────────────────────────────────────────
function StatusCell({ value, onSave }: { value: ItemStatus; onSave: (v: ItemStatus) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={`px-2 py-1 rounded-full border text-xs font-semibold ${STATUS_STYLE[value] ?? STATUS_STYLE.Discarded} hover:opacity-80 transition-opacity`}>{value}</button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
          {PF_STATUSES.map((s) => (
            <button key={s} onClick={() => { onSave(s); setOpen(false); }} className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${s === value ? "text-white font-semibold" : "text-gray-300"}`}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
type SortCol = "itemName" | "status" | "client" | "barcodeNumber" | "quantity" | "valueMid" | "clientSharePercent" | "deliveryDate" | "returnDate" | "squareSynced";

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol; sortDir: "asc" | "desc" }) {
  const active = col === sortCol;
  return (
    <span className={`ml-1 inline-flex flex-col leading-none ${active ? "text-forest-400" : "text-gray-600"}`}>
      <svg className={`w-2.5 h-2.5 ${active && sortDir === "asc" ? "text-forest-400" : "text-gray-600"}`} viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L10 6H0z" /></svg>
      <svg className={`w-2.5 h-2.5 ${active && sortDir === "desc" ? "text-forest-400" : "text-gray-600"}`} viewBox="0 0 10 6" fill="currentColor"><path d="M5 6L0 0H10z" /></svg>
    </span>
  );
}

// ─── Label size modal ─────────────────────────────────────────────────────────
function LabelModal({ count, onClose, onPrint }: { count: number; onClose: () => void; onPrint: (w: number, h: number) => void }) {
  const [width, setWidth] = useState("2");
  const [height, setHeight] = useState("1");
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    const w = parseFloat(width) || 2;
    const h = parseFloat(height) || 1;
    setPrinting(true);
    await onPrint(w, h);
    setPrinting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 w-80">
        <h3 className="text-white font-bold text-lg mb-1">Print Labels</h3>
        <p className="text-gray-400 text-sm mb-5">{count} label{count !== 1 ? "s" : ""} will be generated as a PDF.</p>

        <div className="mb-4">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Label Size</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Width (in)</label>
              <input type="number" step="0.25" min="0.5" max="8" value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <span className="text-gray-500 mt-4">×</span>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Height (in)</label>
              <input type="number" step="0.25" min="0.25" max="8" value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-600 mt-2">Default: 2 × 1 in (standard label)</p>
        </div>

        <div className="bg-gray-800/60 rounded-xl p-3 mb-5 text-xs text-gray-400 space-y-1">
          <p>Each label includes: price, item name, scannable Code 128 barcode, and barcode number.</p>
          <p>One label per page — use printer settings to fit multiple on a sheet.</p>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors">Cancel</button>
          <button onClick={handlePrint} disabled={printing} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-forest-600 hover:bg-forest-700 text-white transition-colors disabled:opacity-50">
            {printing ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk edit bar ─────────────────────────────────────────────────────────────
function BulkBar({
  count, onClear, onBulkStatus, onBulkShare, onBulkDelivery, onPrintLabels,
}: {
  count: number;
  onClear: () => void;
  onBulkStatus: (s: ItemStatus) => void;
  onBulkShare: (pct: number) => void;
  onBulkDelivery: (date: string) => void;
  onPrintLabels: () => void;
}) {
  const [bulkShare, setBulkShare] = useState("");
  const [bulkDate, setBulkDate] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-forest-900/40 border border-forest-700/50 rounded-xl">
      <span className="text-sm font-semibold text-forest-300">{count} selected</span>
      <div className="h-4 w-px bg-forest-700/50" />

      {/* Bulk status */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">Status:</span>
        {PF_STATUSES.map((s) => (
          <button key={s} onClick={() => onBulkStatus(s)}
            className={`px-2 py-1 rounded-full border text-xs font-semibold ${STATUS_STYLE[s]} hover:opacity-80 transition-opacity`}>
            {s}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-forest-700/50" />

      {/* Bulk share % */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">Share %:</span>
        <input type="number" placeholder="e.g. 60" min="0" max="100"
          value={bulkShare} onChange={(e) => setBulkShare(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white w-20 focus:outline-none focus:ring-1 focus:ring-forest-500"
        />
        <button onClick={() => { if (bulkShare) { onBulkShare(Number(bulkShare)); setBulkShare(""); } }}
          disabled={!bulkShare}
          className="px-2 py-1 rounded bg-forest-700 text-xs text-white hover:bg-forest-600 disabled:opacity-40 transition-colors">
          Apply
        </button>
      </div>

      <div className="h-4 w-px bg-forest-700/50" />

      {/* Bulk delivery date */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">Delivery:</span>
        <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-forest-500"
        />
        <button onClick={() => { if (bulkDate) { onBulkDelivery(bulkDate); setBulkDate(""); } }}
          disabled={!bulkDate}
          className="px-2 py-1 rounded bg-forest-700 text-xs text-white hover:bg-forest-600 disabled:opacity-40 transition-colors">
          Apply
        </button>
      </div>

      <div className="h-4 w-px bg-forest-700/50" />

      {/* Print labels */}
      <button onClick={onPrintLabels}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-medium text-white transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Print Labels
      </button>

      <button onClick={onClear} className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors">
        Deselect all
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PFInventoryClient({ items: initialItems, tenantInfoMap }: Props) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<SortCol>("itemName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showLabelModal, setShowLabelModal] = useState(false);

  // Square sync state
  const [squareConnected, setSquareConnected] = useState<boolean | null>(null);
  const [squareLocation, setSquareLocation] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<{ name: string; error: string }[]>([]);
  const [pullingSales, setPullingSales] = useState(false);
  const [pullResult, setPullResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/square/status")
      .then(r => r.ok ? r.json() : { connected: false })
      .then(d => { setSquareConnected(d.connected); setSquareLocation(d.locationName); })
      .catch(() => setSquareConnected(false));
  }, []);

  const flashRow = useCallback((id: string) => {
    setFlash((p) => ({ ...p, [id]: true }));
    setTimeout(() => setFlash((p) => ({ ...p, [id]: false })), 1200);
  }, []);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  async function patchItem(id: string, tenantId: string, updates: Partial<Item>) {
    setSaving((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tenantId, ...updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setItems((prev) => prev.map((item) => (item.id === id ? data.item : item)));
      flashRow(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving((p) => ({ ...p, [id]: false }));
    }
  }

  // ─── Bulk patch ─────────────────────────────────────────────────────────────
  async function bulkPatch(ids: string[], makeUpdates: (item: Item) => Partial<Item>) {
    const targets = items.filter((i) => ids.includes(i.id));
    await Promise.all(targets.map((item) => patchItem(item.id, item.tenantId, makeUpdates(item))));
  }

  const filtered = items.filter((item) => {
    const tenant = tenantInfoMap[item.tenantId];
    const haystack = [item.itemName, item.barcodeNumber, tenant?.name, tenant?.ownerEmail].join(" ").toLowerCase();
    return (!search || haystack.includes(search.toLowerCase())) && (statusFilter === "all" || item.status === statusFilter);
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortCol) {
      case "itemName": return dir * a.itemName.localeCompare(b.itemName);
      case "status": return dir * a.status.localeCompare(b.status);
      case "client": return dir * ((tenantInfoMap[a.tenantId]?.name ?? "").localeCompare(tenantInfoMap[b.tenantId]?.name ?? ""));
      case "barcodeNumber": return dir * (a.barcodeNumber ?? "").localeCompare(b.barcodeNumber ?? "");
      case "quantity": return dir * ((a.quantity || 1) - (b.quantity || 1));
      case "valueMid": return dir * ((a.valueMid ?? 0) - (b.valueMid ?? 0));
      case "clientSharePercent": return dir * ((a.clientSharePercent ?? 0) - (b.clientSharePercent ?? 0));
      case "deliveryDate": return dir * (a.deliveryDate ?? "").localeCompare(b.deliveryDate ?? "");
      case "returnDate": return dir * ((a.deliveryDate ? new Date(a.deliveryDate).getTime() : 0) - (b.deliveryDate ? new Date(b.deliveryDate).getTime() : 0));
      case "squareSynced": {
        const aVal = a.squareSyncedAt ? 1 : 0;
        const bVal = b.squareSyncedAt ? 1 : 0;
        return dir * (aVal - bVal);
      }
      default: return 0;
    }
  });

  const allFilteredIds = sorted.map((i) => i.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const someSelected = allFilteredIds.some((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) setSelected((s) => { const n = new Set(s); allFilteredIds.forEach((id) => n.delete(id)); return n; });
    else setSelected((s) => new Set([...s, ...allFilteredIds]));
  }
  function toggleOne(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const selectedIds = [...selected].filter((id) => allFilteredIds.includes(id));
  const selectedItems = items.filter((i) => selectedIds.includes(i.id));

  async function handlePrintLabels(widthIn: number, heightIn: number) {
    const labelItems = selectedItems.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      price: item.valueMid ?? 0,
      barcodeNumber: item.barcodeNumber,
    }));
    try {
      const res = await fetch("/api/pfinventory/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: labelItems, widthIn, heightIn }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `labels-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setShowLabelModal(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to generate labels");
    }
  }

  async function handleSquareSync() {
    const targets = selectedIds.length > 0 ? selectedItems : sorted.filter(i => i.status === "Listed" && i.barcodeNumber);
    if (!targets.length) { setSyncResult("No eligible items (need barcode + Listed status)."); return; }
    setSyncing(true);
    setSyncResult(null);
    setSyncErrors([]);
    try {
      const res = await fetch("/api/square/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: targets.map(i => ({
          id: i.id, itemName: i.itemName, valueMid: i.valueMid ?? 0,
          barcodeNumber: i.barcodeNumber,
          squareCatalogItemId: i.squareCatalogItemId,
          squareCatalogVariationId: i.squareCatalogVariationId,
        })) }),
      });
      const data = await res.json();
      setSyncResult(`Synced ${data.succeeded} item${data.succeeded !== 1 ? "s" : ""} to Square${data.failed ? `, ${data.failed} failed` : ""}.`);
      const failures = (data.results ?? []).filter((r: { success: boolean; name: string; error?: string }) => !r.success);
      setSyncErrors(failures.map((r: { name: string; error?: string }) => ({ name: r.name, error: r.error ?? "Unknown error" })));
      // Refresh items to show updated squareSyncedAt
      const refreshed = await fetch("/api/items?primaryRoute=ProFoundFinds+Consignment").then(r => r.json()).catch(() => null);
      if (refreshed?.items) setItems(refreshed.items);
    } catch (e) {
      setSyncResult(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handlePullSales() {
    setPullingSales(true);
    setPullResult(null);
    try {
      const res = await fetch("/api/square/sync-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      });
      const data = await res.json();
      // Show detailed result: message + any no-match payments for admin awareness
      let resultText = data.message ?? (res.ok ? "Done." : "Failed.");
      if (data.errors?.length) resultText += ` Errors: ${data.errors.join("; ")}`;
      setPullResult(resultText);
      if (data.processed > 0) {
        const refreshed = await fetch("/api/items?primaryRoute=ProFoundFinds+Consignment").then(r => r.json()).catch(() => null);
        if (refreshed?.items) setItems(refreshed.items);
      }
    } catch (e) {
      setPullResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPullingSales(false);
    }
  }

  function thBtn(col: SortCol, label: string, cls = "") {
    return (
      <button onClick={() => toggleSort(col)} className={`flex items-center gap-0.5 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-200 transition-colors ${cls}`}>
        {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
      </button>
    );
  }

  const totalValue = filtered.reduce((s, i) => s + (i.valueMid || 0), 0);
  const soldCount = filtered.filter((i) => i.status === "Sold").length;
  const listedCount = filtered.filter((i) => i.status === "Listed").length;

  return (
    <div>
      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 mb-5">
        {[
          { label: "Total Items", value: filtered.length, cls: "text-white" },
          { label: "Listed", value: listedCount, cls: "text-purple-300" },
          { label: "Sold", value: soldCount, cls: "text-green-300" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2">
            <span className="text-xs text-gray-400">{label}</span>
            <p className={`text-lg font-bold ${cls}`}>{value}</p>
          </div>
        ))}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2">
          <span className="text-xs text-gray-400">Total Label Value</span>
          <p className="text-lg font-bold text-white">${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Square status banner */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
          squareConnected === null ? "border-gray-700 text-gray-500" :
          squareConnected ? "border-green-700 bg-green-900/20 text-green-400" :
          "border-red-800 bg-red-900/20 text-red-400"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${squareConnected ? "bg-green-400" : "bg-red-500"}`} />
          {squareConnected === null ? "Checking Square…" : squareConnected ? `Square: ${squareLocation ?? "Connected"}` : "Square: Not connected"}
        </div>
        {squareConnected && (
          <>
            <button
              onClick={handleSquareSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-xs font-medium text-white transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? "Syncing…" : selectedIds.length > 0 ? `Sync ${selectedIds.length} to Square` : "Sync Listed to Square"}
            </button>
            <button
              onClick={handlePullSales}
              disabled={pullingSales}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-800 hover:bg-green-700 text-xs font-medium text-white transition-colors disabled:opacity-50"
              title="Pull completed Square sales from the last 14 days and mark matched items as Sold"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16l4 4 4-4M7 20V4M17 8l4-4-4-4M21 4v16" />
              </svg>
              {pullingSales ? "Pulling…" : "Pull Sales from Square"}
            </button>
          </>
        )}
        {syncResult && <span className="text-xs text-gray-400">{syncResult}</span>}
        {pullResult && <span className="text-xs text-gray-400">{pullResult}</span>}
      </div>

      {/* Sync error details */}
      {syncErrors.length > 0 && (
        <div className="mb-4 bg-red-950/40 border border-red-800 rounded-xl p-3">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
            {syncErrors.length} item{syncErrors.length !== 1 ? "s" : ""} failed to sync
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {syncErrors.map((e, i) => (
              <div key={i} className="text-xs text-red-300">
                <span className="font-medium text-red-200">{e.name}:</span>{" "}
                <span className="text-red-400">{e.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="text" placeholder="Search items, clients, barcodes…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forest-500 w-64"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-forest-500">
          <option value="all">All Statuses</option>
          {PF_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <BulkBar
          count={selectedIds.length}
          onClear={() => setSelected(new Set())}
          onBulkStatus={(s) => bulkPatch(selectedIds, (item) => {
            const updates: Partial<Item> = { status: s };
            if (s === "Sold" && item.valueMid && item.clientSharePercent) {
              updates.consignorPayout = Math.round(item.valueMid * (item.clientSharePercent / 100) * 100) / 100;
            }
            if (s !== "Sold" && item.status === "Sold") updates.consignorPayout = 0;
            return updates;
          })}
          onBulkShare={(pct) => bulkPatch(selectedIds, () => ({ clientSharePercent: pct }))}
          onBulkDelivery={(date) => bulkPatch(selectedIds, () => ({ deliveryDate: date }))}
          onPrintLabels={() => setShowLabelModal(true)}
        />
      )}

      {sorted.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl py-16 text-center">
          <p className="text-gray-400 text-sm">No items found.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800/60">
                  {/* Checkbox */}
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll}
                      className="rounded border-gray-600 bg-gray-700 text-forest-500 focus:ring-forest-500 focus:ring-offset-gray-900 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3 text-left w-10"><span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">#</span></th>
                  <th className="px-3 py-3 text-left w-12"><span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Photo</span></th>
                  <th className="px-3 py-3 text-left min-w-[180px]">{thBtn("itemName", "Item Name")}</th>
                  <th className="px-3 py-3 text-left w-24">{thBtn("status", "Status")}</th>
                  <th className="px-3 py-3 text-left min-w-[140px]">{thBtn("client", "Client")}</th>
                  <th className="px-3 py-3 text-left w-24">{thBtn("barcodeNumber", "Barcode")}</th>
                  <th className="px-3 py-3 text-right w-14">{thBtn("quantity", "Qty", "justify-end")}</th>
                  <th className="px-3 py-3 text-right w-28">{thBtn("valueMid", "Price / Label", "justify-end")}</th>
                  <th className="px-3 py-3 text-right w-24">{thBtn("clientSharePercent", "Client Share", "justify-end")}</th>
                  <th className="px-3 py-3 text-left w-28">{thBtn("deliveryDate", "Delivery")}</th>
                  <th className="px-3 py-3 text-left w-28">{thBtn("returnDate", "Return Date")}</th>
                  <th className="px-3 py-3 text-left w-20">{thBtn("squareSynced", "Square")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((item, idx) => {
                  const tenant = tenantInfoMap[item.tenantId];
                  const isSaving = saving[item.id];
                  const isFlashing = flash[item.id];
                  const isSelected = selected.has(item.id);
                  const overdue = isOverdue(item.deliveryDate);
                  const photoUrl = item.photos?.[0]?.url || item.photoUrl;
                  const globalIdx = (page - 1) * PAGE_SIZE + idx;

                  return (
                    <tr key={item.id} className={`border-b border-gray-800/60 transition-colors ${
                      isSelected ? "bg-forest-900/20" : isFlashing ? "bg-forest-900/30" : "hover:bg-gray-800/40"
                    } ${isSaving ? "opacity-60" : ""}`}>

                      {/* Checkbox */}
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(item.id)}
                          className="rounded border-gray-600 bg-gray-700 text-forest-500 focus:ring-forest-500 focus:ring-offset-gray-900 cursor-pointer"
                        />
                      </td>

                      <td className="px-3 py-2.5 text-gray-600 text-xs">{globalIdx + 1}</td>

                      {/* Photo */}
                      <td className="px-3 py-2.5">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                          {photoUrl ? (
                            <div className="relative w-10 h-10">
                              <Image src={photoUrl} alt={item.itemName} fill className="object-cover" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 flex items-center justify-center text-gray-600">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Item name */}
                      <td className="px-1 py-1">
                        <EditCell value={item.itemName} onSave={(v) => patchItem(item.id, item.tenantId, { itemName: v })} placeholder="Item name" />
                        <p className="text-[10px] text-gray-600 px-2">{item.category}</p>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <StatusCell value={item.status as ItemStatus} onSave={(v) => {
                          const updates: Partial<Item> = { status: v };
                          if (v === "Sold" && item.valueMid && item.clientSharePercent) {
                            updates.consignorPayout = Math.round(item.valueMid * (item.clientSharePercent / 100) * 100) / 100;
                          }
                          if (v !== "Sold" && item.status === "Sold") updates.consignorPayout = 0;
                          patchItem(item.id, item.tenantId, updates);
                        }} />
                      </td>

                      {/* Client */}
                      <td className="px-3 py-2.5">
                        {tenant ? (
                          <div>
                            <p className="text-gray-300 text-xs font-medium truncate max-w-[130px]">{tenant.name}</p>
                            <p className="text-gray-500 text-[10px] truncate max-w-[130px]">{tenant.ownerEmail}</p>
                          </div>
                        ) : <span className="text-gray-600 text-xs">—</span>}
                      </td>

                      {/* Barcode */}
                      <td className="px-1 py-1">
                        <EditCell value={item.barcodeNumber} onSave={(v) => patchItem(item.id, item.tenantId, { barcodeNumber: v })} placeholder="Add barcode" />
                      </td>

                      {/* Qty */}
                      <td className="px-1 py-1 text-right">
                        <EditCell value={item.quantity || 1} type="number" onSave={(v) => patchItem(item.id, item.tenantId, { quantity: Number(v) || 1 })} className="text-right" />
                      </td>

                      {/* Price for Label */}
                      <td className="px-1 py-1 text-right">
                        <EditCell value={item.valueMid || undefined} type="number" prefix="$"
                          onSave={(v) => patchItem(item.id, item.tenantId, { valueMid: Number(v) || 0 })}
                          placeholder="Set price" className="text-right font-semibold" />
                      </td>

                      {/* Client Share % */}
                      <td className="px-1 py-1 text-right">
                        <EditCell value={item.clientSharePercent ?? undefined} type="number" suffix="%"
                          onSave={(v) => patchItem(item.id, item.tenantId, { clientSharePercent: Number(v) || 0 })}
                          placeholder="Set %" className="text-right" />
                      </td>

                      {/* Delivery Date */}
                      <td className="px-1 py-1">
                        <EditCell value={item.deliveryDate ? item.deliveryDate.slice(0, 10) : ""} type="date"
                          onSave={(v) => patchItem(item.id, item.tenantId, { deliveryDate: v })} placeholder="Set date" />
                        {item.deliveryDate && <p className="text-[10px] text-gray-500 px-2">{fmtDate(item.deliveryDate)}</p>}
                      </td>

                      {/* Return Date */}
                      <td className="px-3 py-2.5">
                        {item.deliveryDate ? (
                          <span className={`text-xs font-medium ${overdue ? "text-red-400" : "text-gray-300"}`}>
                            {returnDate(item.deliveryDate)}
                            {overdue && <span className="ml-1 text-[10px] bg-red-900/60 text-red-300 border border-red-700 rounded px-1 py-0.5">Overdue</span>}
                          </span>
                        ) : <span className="text-gray-600 text-xs">—</span>}
                      </td>

                      {/* Square sync status */}
                      <td className="px-3 py-2.5">
                        {item.squareSyncedAt ? (
                          <span className="flex items-center gap-1 text-[10px] text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                            Synced
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          <Pagination currentPage={page} totalItems={sorted.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>
        </div>
      )}

      <p className="text-xs text-gray-600 mt-3">Click any cell to edit inline. Select rows for bulk actions.</p>

      {showLabelModal && (
        <LabelModal
          count={selectedIds.length}
          onClose={() => setShowLabelModal(false)}
          onPrint={handlePrintLabels}
        />
      )}
    </div>
  );
}
