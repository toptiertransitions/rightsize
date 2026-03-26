"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import type { Item, ItemStatus } from "@/lib/types";
import { Pagination } from "../components/Pagination";

const PAGE_SIZE = 25;
const PF_STATUSES: ItemStatus[] = ["Listed", "Sold", "Discarded"];

interface TenantInfo { name: string; ownerEmail: string; isTTT: boolean; }
interface StaffMemberOption { id: string; name: string; }
interface Props {
  items: Item[];
  tenantInfoMap: Record<string, TenantInfo>;
  staffMembers: StaffMemberOption[];
}

function fmtDate(s?: string) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}

function calcStaffTime(valueMid: number | undefined): number {
  return (valueMid ?? 0) > 100 ? 20 : 10;
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
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
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

// ─── Staff seller dropdown cell ───────────────────────────────────────────────
function StaffSellerCell({ sellerId, sellerName, staffMembers, onSave }: {
  sellerId?: string; sellerName?: string;
  staffMembers: StaffMemberOption[];
  onSave: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Click to assign staff" className="text-left w-full px-2 py-1 rounded hover:bg-gray-700/60 transition-colors group">
        {sellerName
          ? <span className="text-gray-200 text-xs">{sellerName}</span>
          : <span className="text-gray-600 text-xs italic group-hover:text-gray-400">Assign</span>
        }
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl min-w-[150px]">
          <button onClick={() => { onSave("", ""); setOpen(false); }} className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-700 transition-colors text-gray-500">— Unassign</button>
          {staffMembers.map((m) => (
            <button key={m.id} onClick={() => { onSave(m.id, m.name); setOpen(false); }}
              className={`block w-full text-left px-4 py-2 text-xs hover:bg-gray-700 transition-colors ${m.id === sellerId ? "text-white font-semibold" : "text-gray-300"}`}>
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Photo cell ───────────────────────────────────────────────────────────────
function PhotoCell({ item, onUpload }: { item: Item; onUpload: (url: string, publicId: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const photoUrl = item.photos?.[0]?.url || item.photoUrl;

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      onUpload(data.photoUrl, data.photoPublicId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0 cursor-pointer group"
      onClick={() => !uploading && inputRef.current?.click()} title="Click to upload photo">
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {uploading ? (
        <div className="w-10 h-10 flex items-center justify-center bg-gray-800">
          <svg className="w-4 h-4 animate-spin text-forest-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      ) : photoUrl ? (
        <>
          <div className="relative w-10 h-10">
            <Image src={photoUrl} alt={item.itemName} fill className="object-cover" />
          </div>
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </>
      ) : (
        <div className="w-10 h-10 flex items-center justify-center text-gray-600 group-hover:text-gray-400 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
type SortCol = "itemName" | "status" | "client" | "quantity" | "valueMid" | "clientSharePercent" | "staffSellerName" | "staffCommissionPercent" | "staffTime" | "staffCommissionDollars" | "soldDate" | "payoutPaidAt";

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol; sortDir: "asc" | "desc" }) {
  const active = col === sortCol;
  return (
    <span className={`ml-1 inline-flex flex-col leading-none ${active ? "text-forest-400" : "text-gray-600"}`}>
      <svg className={`w-2.5 h-2.5 ${active && sortDir === "asc" ? "text-forest-400" : "text-gray-600"}`} viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L10 6H0z" /></svg>
      <svg className={`w-2.5 h-2.5 ${active && sortDir === "desc" ? "text-forest-400" : "text-gray-600"}`} viewBox="0 0 10 6" fill="currentColor"><path d="M5 6L0 0H10z" /></svg>
    </span>
  );
}

// ─── Bulk action bar ──────────────────────────────────────────────────────────
function BulkBar({ count, onClear, onBulkStatus, onBulkShare, onBulkStaffSeller, onBulkStaffCommission, onBulkStaffTime, onBulkSoldDate, staffMembers }: {
  count: number; onClear: () => void;
  onBulkStatus: (s: ItemStatus) => void;
  onBulkShare: (pct: number) => void;
  onBulkStaffSeller: (id: string, name: string) => void;
  onBulkStaffCommission: (pct: number) => void;
  onBulkStaffTime: (minutes: number) => void;
  onBulkSoldDate: (date: string) => void;
  staffMembers: StaffMemberOption[];
}) {
  const [bulkShare, setBulkShare] = useState("");
  const [bulkCommission, setBulkCommission] = useState("");
  const [bulkTime, setBulkTime] = useState("");
  const [bulkSoldDate, setBulkSoldDate] = useState("");
  const [sellerOpen, setSellerOpen] = useState(false);

  const sep = <div className="h-4 w-px bg-forest-700/50" />;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-forest-900/40 border border-forest-700/50 rounded-xl">
      <span className="text-sm font-semibold text-forest-300">{count} selected</span>
      {sep}

      {/* Status */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">Status:</span>
        {PF_STATUSES.map((s) => (
          <button key={s} onClick={() => onBulkStatus(s)}
            className={`px-2 py-1 rounded-full border text-xs font-semibold ${STATUS_STYLE[s]} hover:opacity-80 transition-opacity`}>
            {s}
          </button>
        ))}
      </div>
      {sep}

      {/* Client Share % */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">Share %:</span>
        <input type="number" placeholder="60" min="0" max="100" value={bulkShare}
          onChange={(e) => setBulkShare(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white w-16 focus:outline-none focus:ring-1 focus:ring-forest-500"
        />
        <button onClick={() => { if (bulkShare) { onBulkShare(Number(bulkShare)); setBulkShare(""); } }}
          disabled={!bulkShare}
          className="px-2 py-1 rounded bg-forest-700 text-xs text-white hover:bg-forest-600 disabled:opacity-40 transition-colors">
          Apply
        </button>
      </div>
      {sep}

      {/* Staff Seller */}
      <div className="flex items-center gap-1 relative">
        <span className="text-xs text-gray-400">Seller:</span>
        <button onClick={() => setSellerOpen((o) => !o)}
          className="px-2 py-1 rounded bg-gray-800 border border-gray-600 text-xs text-gray-300 hover:border-gray-400 transition-colors">
          Assign ▾
        </button>
        {sellerOpen && (
          <div className="absolute left-0 top-full mt-1 z-30 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl min-w-[150px]">
            <button onClick={() => { onBulkStaffSeller("", ""); setSellerOpen(false); }}
              className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-700 text-gray-500 transition-colors">— Unassign</button>
            {staffMembers.map((m) => (
              <button key={m.id} onClick={() => { onBulkStaffSeller(m.id, m.name); setSellerOpen(false); }}
                className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-700 text-gray-300 transition-colors">
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {sep}

      {/* Staff Comm % */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">Comm %:</span>
        <input type="number" placeholder="10" min="0" max="100" value={bulkCommission}
          onChange={(e) => setBulkCommission(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white w-16 focus:outline-none focus:ring-1 focus:ring-forest-500"
        />
        <button onClick={() => { if (bulkCommission) { onBulkStaffCommission(Number(bulkCommission)); setBulkCommission(""); } }}
          disabled={!bulkCommission}
          className="px-2 py-1 rounded bg-forest-700 text-xs text-white hover:bg-forest-600 disabled:opacity-40 transition-colors">
          Apply
        </button>
      </div>
      {sep}

      {/* Staff Time */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">Time (min):</span>
        <input type="number" placeholder="10" min="1" value={bulkTime}
          onChange={(e) => setBulkTime(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white w-16 focus:outline-none focus:ring-1 focus:ring-forest-500"
        />
        <button onClick={() => { if (bulkTime) { onBulkStaffTime(Number(bulkTime)); setBulkTime(""); } }}
          disabled={!bulkTime}
          className="px-2 py-1 rounded bg-forest-700 text-xs text-white hover:bg-forest-600 disabled:opacity-40 transition-colors">
          Apply
        </button>
      </div>
      {sep}

      {/* Sold Date */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">Sold Date:</span>
        <input type="date" value={bulkSoldDate} onChange={(e) => setBulkSoldDate(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-forest-500"
        />
        <button onClick={() => { if (bulkSoldDate) { onBulkSoldDate(bulkSoldDate); setBulkSoldDate(""); } }}
          disabled={!bulkSoldDate}
          className="px-2 py-1 rounded bg-forest-700 text-xs text-white hover:bg-forest-600 disabled:opacity-40 transition-colors">
          Apply
        </button>
      </div>

      <button onClick={onClear} className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors">
        Deselect all
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function EbayInventoryClient({ items: initialItems, tenantInfoMap, staffMembers }: Props) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<SortCol>("itemName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tttFilter, setTttFilter] = useState<"all" | "ttt" | "client">("all");

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
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/sign-in";
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Session expired — please reload and sign in again.");
      }
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

  async function bulkPatch(ids: string[], makeUpdates: (item: Item) => Partial<Item>) {
    const targets = items.filter((i) => ids.includes(i.id));
    await Promise.all(targets.map((item) => patchItem(item.id, item.tenantId, makeUpdates(item))));
  }

  const filtered = items.filter((item) => {
    const tenant = tenantInfoMap[item.tenantId];
    const haystack = [item.itemName, tenant?.name, tenant?.ownerEmail, item.staffSellerName].join(" ").toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesTTT = tttFilter === "all" || (tttFilter === "ttt" ? (tenant?.isTTT ?? true) : !(tenant?.isTTT ?? true));
    return matchesSearch && matchesStatus && matchesTTT;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortCol) {
      case "itemName": return dir * a.itemName.localeCompare(b.itemName);
      case "status": return dir * a.status.localeCompare(b.status);
      case "client": return dir * ((tenantInfoMap[a.tenantId]?.name ?? "").localeCompare(tenantInfoMap[b.tenantId]?.name ?? ""));
      case "quantity": return dir * ((a.quantity || 1) - (b.quantity || 1));
      case "valueMid": return dir * ((a.valueMid ?? 0) - (b.valueMid ?? 0));
      case "clientSharePercent": return dir * ((a.clientSharePercent ?? 0) - (b.clientSharePercent ?? 0));
      case "staffSellerName": return dir * ((a.staffSellerName ?? "").localeCompare(b.staffSellerName ?? ""));
      case "staffCommissionPercent": return dir * ((a.staffCommissionPercent ?? 0) - (b.staffCommissionPercent ?? 0));
      case "staffTime": return dir * (calcStaffTime(a.valueMid) - calcStaffTime(b.valueMid));
      case "staffCommissionDollars": {
        const aC = a.status === "Sold" && a.staffCommissionPercent != null && a.valueMid ? (a.staffCommissionPercent / 100) * a.valueMid : 0;
        const bC = b.status === "Sold" && b.staffCommissionPercent != null && b.valueMid ? (b.staffCommissionPercent / 100) * b.valueMid : 0;
        return dir * (aC - bC);
      }
      case "soldDate": return dir * ((a.saleDate ?? "").localeCompare(b.saleDate ?? ""));
      case "payoutPaidAt": return dir * (a.payoutPaidAt ?? "").localeCompare(b.payoutPaidAt ?? "");
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="text" placeholder="Search items, clients, staff…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forest-500 w-64"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-forest-500">
          <option value="all">All Statuses</option>
          {PF_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {([["all", "All"], ["ttt", "TTT Only"], ["client", "Client Only"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => { setTttFilter(v); setPage(1); }}
              className={`px-3 py-2 text-xs font-medium transition-colors ${tttFilter === v ? "bg-forest-600 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <BulkBar
          count={selectedIds.length}
          onClear={() => setSelected(new Set())}
          staffMembers={staffMembers}
          onBulkStatus={(s) => bulkPatch(selectedIds, (item) => {
            const updates: Partial<Item> = { status: s };
            if (s === "Sold" && item.valueMid && item.clientSharePercent)
              updates.consignorPayout = Math.round(item.valueMid * (item.clientSharePercent / 100) * 100) / 100;
            if (s !== "Sold" && item.status === "Sold") updates.consignorPayout = 0;
            return updates;
          })}
          onBulkShare={(pct) => bulkPatch(selectedIds, () => ({ clientSharePercent: pct }))}
          onBulkStaffSeller={(id, name) => bulkPatch(selectedIds, () => ({ staffSellerId: id || undefined, staffSellerName: name || undefined }))}
          onBulkStaffCommission={(pct) => bulkPatch(selectedIds, () => ({ staffCommissionPercent: pct }))}
          onBulkStaffTime={(min) => bulkPatch(selectedIds, () => ({ staffTimeMinutes: min }))}
          onBulkSoldDate={(date) => bulkPatch(selectedIds, () => ({ saleDate: date }))}
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
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox" checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll}
                      className="rounded border-gray-600 bg-gray-700 text-forest-500 focus:ring-forest-500 focus:ring-offset-gray-900 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3 text-left w-10"><span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">#</span></th>
                  <th className="px-3 py-3 text-left w-12"><span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Photo</span></th>
                  <th className="px-3 py-3 text-left min-w-[180px]">{thBtn("itemName", "Item Name")}</th>
                  <th className="px-3 py-3 text-left w-24">{thBtn("status", "Status")}</th>
                  <th className="px-3 py-3 text-left min-w-[140px]">{thBtn("client", "Client")}</th>
                  <th className="px-3 py-3 text-left w-16"><span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</span></th>
                  <th className="px-3 py-3 text-right w-14">{thBtn("quantity", "Qty", "justify-end")}</th>
                  <th className="px-3 py-3 text-right w-28">{thBtn("valueMid", "Price", "justify-end")}</th>
                  <th className="px-3 py-3 text-right w-24">{thBtn("clientSharePercent", "Client Share", "justify-end")}</th>
                  <th className="px-3 py-3 text-left w-32">{thBtn("staffSellerName", "Staff Seller")}</th>
                  <th className="px-3 py-3 text-right w-28">{thBtn("staffCommissionPercent", "Staff Comm %", "justify-end")}</th>
                  <th className="px-3 py-3 text-right w-28">{thBtn("staffCommissionDollars", "Staff Comm $", "justify-end")}</th>
                  <th className="px-3 py-3 text-right w-24">{thBtn("staffTime", "Staff Time", "justify-end")}</th>
                  <th className="px-3 py-3 text-left w-28">{thBtn("soldDate", "Sold Date")}</th>
                  <th className="px-3 py-3 text-left w-28">{thBtn("payoutPaidAt", "Paid Date")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((item, idx) => {
                  const tenant = tenantInfoMap[item.tenantId];
                  const isSaving = saving[item.id];
                  const isFlashing = flash[item.id];
                  const isSelected = selected.has(item.id);
                  const staffTime = calcStaffTime(item.valueMid);
                  const commissionDollars = item.status === "Sold" && item.staffCommissionPercent != null && item.valueMid
                    ? (item.staffCommissionPercent / 100) * item.valueMid
                    : null;
                  const globalIdx = (page - 1) * PAGE_SIZE + idx;

                  return (
                    <tr key={item.id} className={`border-b border-gray-800/60 transition-colors ${
                      isSelected ? "bg-forest-900/20" : isFlashing ? "bg-forest-900/30" : "hover:bg-gray-800/40"
                    } ${isSaving ? "opacity-60" : ""}`}>

                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(item.id)}
                          className="rounded border-gray-600 bg-gray-700 text-forest-500 focus:ring-forest-500 focus:ring-offset-gray-900 cursor-pointer"
                        />
                      </td>

                      <td className="px-3 py-2.5 text-gray-600 text-xs">{globalIdx + 1}</td>

                      {/* Photo */}
                      <td className="px-3 py-2.5">
                        <PhotoCell
                          item={item}
                          onUpload={(url, publicId) => patchItem(item.id, item.tenantId, { photos: [{ url, publicId }] })}
                        />
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
                          if (v === "Sold" && item.valueMid && item.clientSharePercent)
                            updates.consignorPayout = Math.round(item.valueMid * (item.clientSharePercent / 100) * 100) / 100;
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

                      {/* TTT Type */}
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          (tenant?.isTTT ?? true)
                            ? "bg-green-900/40 text-green-400 border-green-700"
                            : "bg-gray-800 text-gray-400 border-gray-600"
                        }`}>
                          {(tenant?.isTTT ?? true) ? "TTT" : "Client"}
                        </span>
                      </td>

                      {/* Qty */}
                      <td className="px-1 py-1 text-right">
                        <EditCell value={item.quantity || 1} type="number" onSave={(v) => patchItem(item.id, item.tenantId, { quantity: Number(v) || 1 })} className="text-right" />
                      </td>

                      {/* Price */}
                      <td className="px-1 py-1 text-right">
                        <EditCell value={item.valueMid || undefined} type="number" prefix="$"
                          onSave={(v) => {
                            const newVal = Number(v) || 0;
                            patchItem(item.id, item.tenantId, { valueMid: newVal, staffTimeMinutes: newVal > 100 ? 20 : 10 });
                          }}
                          placeholder="Set price" className="text-right font-semibold" />
                      </td>

                      {/* Client Share % */}
                      <td className="px-1 py-1 text-right">
                        <EditCell value={item.clientSharePercent ?? undefined} type="number" suffix="%"
                          onSave={(v) => patchItem(item.id, item.tenantId, { clientSharePercent: Number(v) || 0 })}
                          placeholder="Set %" className="text-right" />
                      </td>

                      {/* Staff Seller */}
                      <td className="px-1 py-1">
                        <StaffSellerCell
                          sellerId={item.staffSellerId}
                          sellerName={item.staffSellerName}
                          staffMembers={staffMembers}
                          onSave={(id, name) => patchItem(item.id, item.tenantId, {
                            staffSellerId: id || undefined,
                            staffSellerName: name || undefined,
                          })}
                        />
                      </td>

                      {/* Staff Commission % */}
                      <td className="px-1 py-1 text-right">
                        <EditCell value={item.staffCommissionPercent ?? undefined} type="number" suffix="%"
                          onSave={(v) => patchItem(item.id, item.tenantId, { staffCommissionPercent: Number(v) || 0 })}
                          placeholder="Set %" className="text-right" />
                      </td>

                      {/* Staff Commission $ */}
                      <td className="px-3 py-2.5 text-right">
                        {commissionDollars != null
                          ? <span className="text-green-400 text-xs font-semibold">${commissionDollars.toFixed(2)}</span>
                          : <span className="text-gray-600 text-xs">—</span>
                        }
                      </td>

                      {/* Staff Time */}
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-gray-300 text-xs">{staffTime} min</span>
                      </td>

                      {/* Sold Date */}
                      <td className="px-3 py-2.5">
                        {item.saleDate
                          ? <span className="text-gray-300 text-xs">{fmtDate(item.saleDate)}</span>
                          : <span className="text-gray-600 text-xs">—</span>
                        }
                      </td>

                      {/* Paid Date (editable by TTTAdmin) */}
                      <td className="px-1 py-1">
                        <EditCell
                          value={item.payoutPaidAt ? item.payoutPaidAt.slice(0, 10) : ""}
                          type="date"
                          onSave={(v) => patchItem(item.id, item.tenantId, { payoutPaidAt: v || undefined })}
                          placeholder="—"
                        />
                        {item.payoutPaidAt && (
                          <p className="text-[10px] text-green-400 px-2">{fmtDate(item.payoutPaidAt)}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination currentPage={page} totalItems={sorted.length} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <p className="text-xs text-gray-600 mt-3">
        Click any cell to edit inline. Staff Time auto-sets to 10 min (≤$100) or 20 min (&gt;$100) based on price. Staff Commission $ shows when status is Sold.
      </p>
    </div>
  );
}
