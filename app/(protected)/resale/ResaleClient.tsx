"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { VendorFileModal } from "@/components/catalog/VendorFileModal";
import { KEY_DATE_ACTIVITIES } from "@/lib/types";
import type { Item, ItemStatus, LocalVendor, PlanEntry } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveProject {
  id: string;
  name: string;
  teamLeadName?: string;
  teamLeadPhone?: string;
  teamLeadEmail?: string;
}

interface TenantInfo {
  name: string;
  priceDrop1Days: number;
  priceDrop1Percent: number;
  priceDrop2Days: number;
  priceDrop2Percent: number;
}

interface Props {
  activeProjectsList: ActiveProject[];
  tenantInfoMap: Record<string, TenantInfo>;
  planEntries: PlanEntry[];
  pfItems: Item[];
  localVendors: LocalVendor[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_DATE_COLORS: Record<string, string> = {
  "Start Date":                "bg-emerald-50 text-emerald-800 border border-emerald-300",
  "Move Date":                 "bg-amber-50 text-amber-800 border border-amber-300",
  "Pickup Date":               "bg-blue-50 text-blue-800 border border-blue-300",
  "Estate Sale Date":          "bg-purple-50 text-purple-800 border border-purple-300",
  "Close Date":                "bg-red-50 text-red-800 border border-red-300",
  "Consign/ProFound Delivery": "bg-violet-50 text-violet-700 border border-violet-300",
};

const KEY_DATE_COLOR_DEFAULT = "bg-gray-100 text-gray-700 border border-gray-200";

const PF_STATUSES: ItemStatus[] = [
  "Pending Review", "Approved", "Listed", "In Cart",
  "Sold", "Donated", "Discarded", "Rejected / Revisit",
];

const PAGE_SIZE = 25;
const DAYS_OPTIONS = [
  { label: "All", value: "" },
  { label: "30+ days", value: "30" },
  { label: "60+ days", value: "60" },
  { label: "90+ days", value: "90" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(s?: string) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}

function daysSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / 86400000);
  } catch { return null; }
}

function returnDate(deliveryDate?: string): string {
  if (!deliveryDate) return "";
  try {
    const d = new Date(deliveryDate);
    d.setDate(d.getDate() + 90);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function isOverdue(deliveryDate?: string): boolean {
  if (!deliveryDate) return false;
  try {
    const d = new Date(deliveryDate);
    d.setDate(d.getDate() + 90);
    return d < new Date();
  } catch { return false; }
}

// ─── Label Modal ──────────────────────────────────────────────────────────────

function LabelModal({ count, onClose, onPrint }: {
  count: number;
  onClose: () => void;
  onPrint: (w: number, h: number) => void;
}) {
  const [width, setWidth] = useState("2");
  const [height, setHeight] = useState("1");
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    setPrinting(true);
    await onPrint(parseFloat(width) || 2, parseFloat(height) || 1);
    setPrinting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white border border-gray-200 rounded-2xl shadow-2xl p-6 w-80">
        <h3 className="font-bold text-lg text-gray-900 mb-1">Print Labels</h3>
        <p className="text-gray-500 text-sm mb-5">{count} label{count !== 1 ? "s" : ""} will be generated as a PDF.</p>
        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Width (in)</label>
            <input type="number" value={width} onChange={e => setWidth(e.target.value)} min={0.5} max={8} step={0.25}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Height (in)</label>
            <input type="number" value={height} onChange={e => setHeight(e.target.value)} min={0.25} max={8} step={0.25}
              className="w-full h-9 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400" />
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-5">Price, item name, barcode, and barcode number. One label per page.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handlePrint} disabled={printing} className="flex-1 h-9 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
            {printing ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar Section ─────────────────────────────────────────────────────────

function CalendarSection({ entries, tenantNames }: {
  entries: PlanEntry[];
  tenantNames: Record<string, string>;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(["Consign/ProFound Delivery"])
  );

  function prevMonth() {
    setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }
  function toggleFilter(type: string) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  // Build calendar grid (Mon–Sun, 6 rows)
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const gridStart = new Date(firstDay);
  gridStart.setDate(1 - ((startDow === 0 ? 7 : startDow) - 1));
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  const todayStr = toISO(new Date());

  // Index entries by date
  const byDate = new Map<string, PlanEntry[]>();
  for (const e of entries) {
    if (activeFilters.size > 0 && !activeFilters.has(e.activity)) continue;
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-base font-semibold text-gray-900 w-44 text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {KEY_DATE_ACTIVITIES.map(type => {
            const active = activeFilters.has(type);
            const color = KEY_DATE_COLORS[type] ?? KEY_DATE_COLOR_DEFAULT;
            return (
              <button key={type} onClick={() => toggleFilter(type)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity ${color} ${active ? "opacity-100" : "opacity-30"}`}>
                {type}
              </button>
            );
          })}
          {activeFilters.size < KEY_DATE_ACTIVITIES.length && (
            <button onClick={() => setActiveFilters(new Set(KEY_DATE_ACTIVITIES))}
              className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-500 hover:bg-gray-50">
              Show all
            </button>
          )}
          {activeFilters.size > 0 && (
            <button onClick={() => setActiveFilters(new Set())}
              className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-400 hover:bg-gray-50">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">{d}</div>
          ))}
        </div>
        {/* Weeks */}
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const iso = toISO(day);
            const inMonth = day.getMonth() === month;
            const isToday = iso === todayStr;
            const dayEntries = byDate.get(iso) ?? [];
            const shown = dayEntries.slice(0, 3);
            const overflow = dayEntries.length - shown.length;

            return (
              <div key={idx}
                className={`min-h-[90px] p-1.5 border-b border-r border-gray-100 ${!inMonth ? "bg-gray-50/60" : "bg-white"} ${idx % 7 === 6 ? "border-r-0" : ""} ${idx >= 35 ? "border-b-0" : ""}`}>
                <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-forest-600 text-white" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                  {day.getDate()}
                </div>
                {shown.map((e, i) => {
                  const color = KEY_DATE_COLORS[e.activity] ?? KEY_DATE_COLOR_DEFAULT;
                  const label = tenantNames[e.tenantId] ?? "—";
                  return (
                    <div key={i} className={`w-full mb-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-tight border truncate ${color}`}
                      title={`${e.activity} — ${label}`}>
                      {e.activity === "Consign/ProFound Delivery" ? label : e.activity}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div className="text-[10px] text-gray-400 pl-1">+{overflow} more</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Active Projects Table ────────────────────────────────────────────────────

function ActiveProjectsSection({ projects }: { projects: ActiveProject[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Lead</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">No active projects.</td></tr>
          )}
          {projects.map((p, i) => (
            <tr key={p.id} className={i % 2 === 1 ? "bg-gray-50/60" : "bg-white"}>
              <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
              <td className="px-4 py-2.5 text-gray-700">{p.teamLeadName ?? <span className="text-gray-400 italic">Unassigned</span>}</td>
              <td className="px-4 py-2.5 text-gray-600">
                {p.teamLeadPhone
                  ? <a href={`tel:${p.teamLeadPhone}`} className="hover:text-forest-600">{p.teamLeadPhone}</a>
                  : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-2.5 text-gray-600">
                {p.teamLeadEmail
                  ? <a href={`mailto:${p.teamLeadEmail}`} className="hover:text-forest-600">{p.teamLeadEmail}</a>
                  : <span className="text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Inventory Section ────────────────────────────────────────────────────────

function InventorySection({
  initialItems,
  tenantInfoMap,
  localVendors,
}: {
  initialItems: Item[];
  tenantInfoMap: Record<string, TenantInfo>;
  localVendors: LocalVendor[];
}) {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [daysFilter, setDaysFilter] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelLoading, setLabelLoading] = useState(false);
  const [priceDropLoading, setPriceDropLoading] = useState(false);
  const [priceDropMsg, setPriceDropMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const uploadRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Build client options from items
  const clientOptions: [string, string][] = Array.from(
    new Map(
      items
        .map(i => [i.tenantId, tenantInfoMap[i.tenantId]?.name ?? i.tenantId] as [string, string])
        .filter(([, name]) => !!name)
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  // Filter
  const filtered = items.filter(item => {
    if (search) {
      const q = search.toLowerCase();
      if (!item.itemName.toLowerCase().includes(q) && !(item.barcodeNumber ?? "").toLowerCase().includes(q)) return false;
    }
    if (statusFilter && item.status !== statusFilter) return false;
    if (clientFilter && item.tenantId !== clientFilter) return false;
    if (daysFilter) {
      const days = daysSince(item.deliveryDate);
      if (days === null || days < parseInt(daysFilter)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (paginated.every(i => selected.has(i.id))) {
      setSelected(prev => {
        const next = new Set(prev);
        paginated.forEach(i => next.delete(i.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        paginated.forEach(i => next.add(i.id));
        return next;
      });
    }
  }

  const allPageSelected = paginated.length > 0 && paginated.every(i => selected.has(i.id));
  const selectedItems = items.filter(i => selected.has(i.id));

  async function patchItem(id: string, fields: Record<string, unknown>) {
    const res = await fetch("/api/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const updated: Item = data.item ?? data;
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i));
  }

  // Photo upload
  async function handlePhotoUpload(id: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) return;
    const data = await res.json();
    await patchItem(id, { photoUrl: data.photoUrl, photoPublicId: data.photoPublicId });
  }

  // Print labels
  const handlePrintLabels = useCallback(async (widthIn: number, heightIn: number) => {
    const pfItems = selectedItems.filter(i => i.primaryRoute === "ProFoundFinds Consignment");
    if (pfItems.length === 0) return;
    setLabelLoading(true);
    try {
      const labelItems = pfItems.map(i => ({
        id: i.id, itemName: i.itemName,
        price: i.valueMid ?? 0,
        barcodeNumber: i.barcodeNumber,
      }));
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
    } finally {
      setLabelLoading(false);
    }
  }, [selectedItems]);

  // Price drop — requires clientFilter to be set
  async function handlePriceDrop(type: "drop1" | "drop2" | "revert") {
    if (!clientFilter) {
      setPriceDropMsg({ type: "error", text: "Price drops must be applied per client. Select a client from the filter above first." });
      return;
    }
    const info = tenantInfoMap[clientFilter];
    if (!info) return;
    setPriceDropLoading(true);
    setPriceDropMsg(null);
    try {
      const res = await fetch("/api/sales/apply-price-drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: clientFilter,
          type,
          drop1Pct: info.priceDrop1Percent,
          drop2Pct: info.priceDrop2Percent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Price drop failed");
      if (data.updated === 0) {
        setPriceDropMsg({ type: "error", text: "No eligible Listed items found for this client." });
      } else {
        setPriceDropMsg({ type: "success", text: `${type === "revert" ? "Reverted" : "Applied"} to ${data.updated} item${data.updated !== 1 ? "s" : ""}.` });
        // Refresh items from response
        if (Array.isArray(data.itemUpdates) && data.itemUpdates.length > 0) {
          const updateMap = new Map(data.itemUpdates.map((u: { id: string; valueMid: number; priceDropOriginalValue: number }) => [u.id, u]));
          setItems(prev => prev.map(i => {
            const u = updateMap.get(i.id) as { valueMid: number; priceDropOriginalValue: number } | undefined;
            return u ? { ...i, valueMid: u.valueMid, priceDropOriginalValue: u.priceDropOriginalValue } : i;
          }));
        }
      }
    } catch (e) {
      setPriceDropMsg({ type: "error", text: e instanceof Error ? e.message : "Price drop failed" });
    } finally {
      setPriceDropLoading(false);
    }
  }

  const selectedTenantInfo = clientFilter ? tenantInfoMap[clientFilter] : null;

  // Stats
  const listedCount = filtered.filter(i => i.status === "Listed").length;
  const totalValue = filtered.reduce((s, i) => s + (i.valueMid ?? 0), 0);

  const inputCls = "h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white";

  return (
    <div>
      {/* Stats row */}
      <div className="flex flex-wrap gap-3 mb-4">
        {[
          { label: "Total Items", value: filtered.length.toString(), cls: "text-gray-900" },
          { label: "Listed", value: listedCount.toString(), cls: "text-violet-700" },
          { label: "Total Value", value: `$${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, cls: "text-forest-700" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-2">
            <div className="text-xs text-gray-400">{label}</div>
            <div className={`text-lg font-bold ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          type="text"
          placeholder="Search item name or barcode…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className={`${inputCls} w-64`}
        />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">All Statuses</option>
          {PF_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={clientFilter} onChange={e => { setClientFilter(e.target.value); setPage(1); setPriceDropMsg(null); }} className={inputCls}>
          <option value="">All Clients</option>
          {clientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {DAYS_OPTIONS.map(opt => (
            <button key={opt.value}
              onClick={() => { setDaysFilter(opt.value); setPage(1); }}
              className={`px-3 h-9 font-medium transition-colors ${daysFilter === opt.value ? "bg-forest-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Price Drop Panel */}
      <div className={`mb-3 px-4 py-3 rounded-xl border text-sm ${clientFilter ? "border-violet-200 bg-violet-50" : "border-gray-200 bg-gray-50"}`}>
        {clientFilter && selectedTenantInfo ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-violet-900">{selectedTenantInfo.name} — Price Drops</span>
            <button
              onClick={() => handlePriceDrop("drop1")}
              disabled={priceDropLoading}
              className="px-3 h-8 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
              Drop 1 ({selectedTenantInfo.priceDrop1Percent}% off — {selectedTenantInfo.priceDrop1Days} days)
            </button>
            <button
              onClick={() => handlePriceDrop("drop2")}
              disabled={priceDropLoading}
              className="px-3 h-8 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
              Drop 2 ({selectedTenantInfo.priceDrop2Percent}% off — {selectedTenantInfo.priceDrop2Days} days)
            </button>
            <button
              onClick={() => handlePriceDrop("revert")}
              disabled={priceDropLoading}
              className="px-3 h-8 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors">
              Revert to Pre-Drop
            </button>
            {priceDropLoading && <span className="text-xs text-violet-600">Applying…</span>}
            {priceDropMsg && (
              <span className={`text-xs font-medium ${priceDropMsg.type === "success" ? "text-forest-700" : "text-red-600"}`}>
                {priceDropMsg.text}
              </span>
            )}
          </div>
        ) : (
          <p className="text-gray-500">
            <span className="font-medium text-gray-700">Price drops are applied per client.</span>{" "}
            Select a client from the filter above to see price drop controls.
            {priceDropMsg?.type === "error" && (
              <span className="ml-2 text-red-600 font-medium">{priceDropMsg.text}</span>
            )}
          </p>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 px-4 py-2.5 bg-forest-50 border border-forest-200 rounded-xl">
          <span className="text-sm font-medium text-forest-800">{selected.size} selected</span>
          <button onClick={() => setShowVendorModal(true)}
            className="px-3 h-8 rounded-lg text-xs font-semibold bg-forest-600 text-white hover:bg-forest-700 transition-colors">
            Send to Vendors
          </button>
          <button onClick={() => setShowLabelModal(true)} disabled={labelLoading}
            className="px-3 h-8 rounded-lg text-xs font-semibold border border-forest-300 text-forest-700 hover:bg-forest-100 disabled:opacity-50 transition-colors">
            Print Labels
          </button>
          <button onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-gray-400 hover:text-gray-700">
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm min-w-[1200px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-3">
                <input type="checkbox" checked={allPageSelected} onChange={toggleAll}
                  className="rounded border-gray-300 text-forest-600 focus:ring-forest-400" />
              </th>
              <th className="px-2 py-3 text-xs font-semibold text-gray-400 text-right">#</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left w-12">Photo</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Item Name</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Status</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Client</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Barcode</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Price</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Share %</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Delivery</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Days</th>
              <th className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Return</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">No items match the current filters.</td></tr>
            )}
            {paginated.map((item, idx) => {
              const photoUrl = item.photos?.[0]?.url ?? item.photoUrl;
              const clientName = tenantInfoMap[item.tenantId]?.name ?? item.tenantId;
              const daysOnSite = daysSince(item.deliveryDate);
              const overdue = isOverdue(item.deliveryDate);

              return (
                <tr key={item.id}
                  className={`border-t border-gray-100 ${selected.has(item.id) ? "bg-forest-50" : idx % 2 === 1 ? "bg-gray-50/50" : "bg-white"}`}>
                  {/* Checkbox */}
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)}
                      className="rounded border-gray-300 text-forest-600 focus:ring-forest-400" />
                  </td>
                  {/* Row number */}
                  <td className="px-2 py-2 text-xs text-gray-400 text-right tabular-nums">
                    {(page - 1) * PAGE_SIZE + idx + 1}
                  </td>
                  {/* Photo */}
                  <td className="px-3 py-2">
                    <div
                      className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 cursor-pointer group"
                      onClick={() => uploadRefs.current.get(item.id)?.click()}
                      title="Click to upload photo">
                      <input type="file" accept="image/*" className="hidden"
                        ref={el => { if (el) uploadRefs.current.set(item.id, el); else uploadRefs.current.delete(item.id); }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(item.id, f); }} />
                      {photoUrl ? (
                        <>
                          <div className="relative w-10 h-10">
                            <Image src={photoUrl} alt={item.itemName} fill className="object-cover" />
                          </div>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                          </div>
                        </>
                      ) : (
                        <div className="w-10 h-10 flex items-center justify-center">
                          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                      )}
                    </div>
                  </td>
                  {/* Item Name */}
                  <td className="px-3 py-2 max-w-[180px]">
                    <InlineEdit value={item.itemName} onSave={v => patchItem(item.id, { itemName: v })} />
                  </td>
                  {/* Status */}
                  <td className="px-3 py-2">
                    <StatusSelect value={item.status} onSave={v => patchItem(item.id, { status: v })} />
                  </td>
                  {/* Client */}
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{clientName}</td>
                  {/* Barcode */}
                  <td className="px-3 py-2 font-mono text-xs">
                    <InlineEdit value={item.barcodeNumber ?? ""} placeholder="—" onSave={v => patchItem(item.id, { barcodeNumber: v || null })} />
                  </td>
                  {/* Price */}
                  <td className="px-3 py-2 text-right">
                    <InlineEdit value={item.valueMid != null ? String(item.valueMid) : ""} type="number" prefix="$" placeholder="—"
                      onSave={v => patchItem(item.id, { valueMid: v ? parseFloat(v) : null })} />
                  </td>
                  {/* Share % */}
                  <td className="px-3 py-2 text-right">
                    <InlineEdit value={item.clientSharePercent != null ? String(item.clientSharePercent) : ""} type="number" suffix="%" placeholder="—"
                      onSave={v => patchItem(item.id, { clientSharePercent: v ? parseFloat(v) : null })} />
                  </td>
                  {/* Delivery */}
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    <InlineEdit value={item.deliveryDate ?? ""} type="date" placeholder="—"
                      onSave={v => patchItem(item.id, { deliveryDate: v || null })} />
                  </td>
                  {/* Days on site */}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {daysOnSite !== null ? (
                      <span className={`text-xs font-medium ${daysOnSite >= 90 ? "text-red-600" : daysOnSite >= 60 ? "text-amber-600" : "text-gray-600"}`}>
                        {daysOnSite}
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  {/* Return date */}
                  <td className={`px-3 py-2 whitespace-nowrap text-xs ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                    {returnDate(item.deliveryDate) || <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-gray-500">{filtered.length} items, page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 h-8 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs">Next</button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showVendorModal && (
        <VendorFileModal
          isOpen={showVendorModal}
          onClose={() => setShowVendorModal(false)}
          selectedItems={selectedItems}
          localVendors={localVendors}
          onSent={updatedItems => {
            setItems(prev => {
              const map = new Map(updatedItems.map(i => [i.id, i]));
              return prev.map(i => map.get(i.id) ?? i);
            });
            setShowVendorModal(false);
          }}
        />
      )}
      {showLabelModal && (
        <LabelModal
          count={selectedItems.filter(i => i.primaryRoute === "ProFoundFinds Consignment").length}
          onClose={() => setShowLabelModal(false)}
          onPrint={handlePrintLabels}
        />
      )}
    </div>
  );
}

// ─── Inline edit cell ─────────────────────────────────────────────────────────

function InlineEdit({ value, type = "text", onSave, placeholder = "—", prefix = "", suffix = "" }: {
  value: string;
  type?: "text" | "number" | "date";
  onSave: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  function start() { setDraft(value); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }
  function commit() { setEditing(false); if (draft !== value) onSave(draft); }

  if (editing) return (
    <input ref={inputRef} type={type} value={draft} autoFocus
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-full h-7 px-2 rounded border border-forest-400 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-forest-400" />
  );
  const display = value ? `${prefix}${value}${suffix}` : null;
  return (
    <button onClick={start} title="Click to edit" className="text-left w-full px-1 py-0.5 rounded hover:bg-gray-100 transition-colors group">
      {display ? <span className="text-gray-800 text-sm">{display}</span>
        : <span className="text-gray-300 text-sm italic group-hover:text-gray-400">{placeholder}</span>}
    </button>
  );
}

// ─── Status select cell ───────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  "Listed": "bg-violet-100 text-violet-800 border-violet-300",
  "Sold": "bg-green-100 text-green-800 border-green-300",
  "Pending Review": "bg-amber-50 text-amber-800 border-amber-200",
  "Approved": "bg-blue-50 text-blue-700 border-blue-200",
  "Discarded": "bg-gray-100 text-gray-500 border-gray-200",
};

function StatusSelect({ value, onSave }: { value: ItemStatus; onSave: (v: ItemStatus) => void }) {
  const [open, setOpen] = useState(false);
  const cls = STATUS_BADGE[value] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${cls} hover:opacity-80 transition-opacity whitespace-nowrap`}>
        {value}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xl w-44">
          {PF_STATUSES.map(s => (
            <button key={s} onClick={() => { onSave(s); setOpen(false); }}
              className={`block w-full text-left px-4 py-2 text-xs hover:bg-gray-50 transition-colors ${s === value ? "font-semibold text-gray-900" : "text-gray-600"}`}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ResaleClient({
  activeProjectsList,
  tenantInfoMap,
  planEntries,
  pfItems,
  localVendors,
}: Props) {
  const tenantNames: Record<string, string> = {};
  for (const [id, info] of Object.entries(tenantInfoMap)) {
    tenantNames[id] = info.name;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resale Ops</h1>
          <p className="text-gray-500 text-sm mt-1">Global view across all active projects — calendar, team leads, and ProFound inventory.</p>
        </div>

        {/* 1. Calendar */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Dates — All Active Projects</h2>
          <CalendarSection entries={planEntries} tenantNames={tenantNames} />
        </section>

        {/* 2. Active Projects + Team Leads */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Active Projects{" "}
            <span className="text-sm font-normal text-gray-400">({activeProjectsList.length})</span>
          </h2>
          <ActiveProjectsSection projects={activeProjectsList} />
        </section>

        {/* 3. ProFound Inventory */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            ProFound Inventory{" "}
            <span className="text-sm font-normal text-gray-400">({pfItems.length} items)</span>
          </h2>
          <InventorySection
            initialItems={pfItems}
            tenantInfoMap={tenantInfoMap}
            localVendors={localVendors}
          />
        </section>

      </div>
    </div>
  );
}
