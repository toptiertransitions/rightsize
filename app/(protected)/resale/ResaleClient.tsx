"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { VendorFileModal } from "@/components/catalog/VendorFileModal";
import { EditItemModal } from "@/components/catalog/ItemGrid";
import { KEY_DATE_ACTIVITIES, VENDOR_TYPES } from "@/lib/types";
import type { Item, ItemStatus, LocalVendor, PlanEntry, StaffMember, Room, VendorType } from "@/lib/types";
import { CATEGORY_GROUPS } from "@/lib/categories";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveProject {
  id: string;
  name: string;
  address?: string;
  status: "Active" | "Post-Move";
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
  staffMembers: StaffMember[];
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
const SHIFT_COLOR = "bg-sky-50 text-sky-700 border border-sky-200";
const KEY_DATE_COLOR_DEFAULT = "bg-gray-100 text-gray-700 border border-gray-200";

const ALL_FILTER_TYPES = ["Shift", ...KEY_DATE_ACTIVITIES] as const;

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

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateShort(s?: string) {
  if (!s) return "";
  try { return new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return s; }
}

function daysSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  try {
    const diff = Date.now() - new Date(dateStr + "T12:00:00").getTime();
    return Math.floor(diff / 86400000);
  } catch { return null; }
}

function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function fmtTime(t?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

function fmtTimeRange(start?: string, end?: string): string {
  if (!start) return "";
  const s = fmtTime(start);
  const e = fmtTime(end);
  return e ? `${s}–${e}` : s;
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

function CalendarSection({
  entries,
  tenantNames,
}: {
  entries: PlanEntry[];
  tenantNames: Record<string, string>;
}) {
  const today = new Date();
  const todayStr = toISO(today);

  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));

  // All filter types default ON
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(ALL_FILTER_TYPES));

  // Project autocomplete filter
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showProjectDrop, setShowProjectDrop] = useState(false);
  const projInputRef = useRef<HTMLInputElement>(null);

  // Build project options from what has entries in the window
  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (!seen.has(e.tenantId) && tenantNames[e.tenantId]) {
        seen.set(e.tenantId, tenantNames[e.tenantId]);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, tenantNames]);

  const filteredProjectOptions = useMemo(() =>
    projectSearch
      ? projectOptions.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
      : projectOptions
  , [projectOptions, projectSearch]);

  // Navigation
  function prevPeriod() {
    if (viewMode === "month") setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    else setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; });
  }
  function nextPeriod() {
    if (viewMode === "month") setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    else setWeekStart(w => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; });
  }
  function goToday() {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setWeekStart(mondayOf(today));
  }

  // Period label
  const periodLabel = viewMode === "month"
    ? currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : (() => {
        const end = new Date(weekStart);
        end.setDate(weekStart.getDate() + 6);
        return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
      })();

  // Build calendar days
  const calendarDays = useMemo(() => {
    if (viewMode === "week") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      });
    }
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay();
    const gridStart = new Date(firstDay);
    gridStart.setDate(1 - ((startDow === 0 ? 7 : startDow) - 1));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [viewMode, currentMonth, weekStart]);

  // Index filtered entries by date
  const byDate = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const e of entries) {
      if (selectedProjectId && e.tenantId !== selectedProjectId) continue;
      const isKeyDate = e.entryType === "keydate";
      const typeKey = isKeyDate ? e.activity : "Shift";
      if (!activeFilters.has(typeKey)) continue;
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [entries, selectedProjectId, activeFilters]);

  function entryColor(e: PlanEntry) {
    if (e.entryType === "keydate") return KEY_DATE_COLORS[e.activity] ?? KEY_DATE_COLOR_DEFAULT;
    return SHIFT_COLOR;
  }

  function entryLabel(e: PlanEntry) {
    const project = tenantNames[e.tenantId] ?? "Unknown";
    if (e.entryType === "keydate") return { type: e.activity, project };
    return { type: "Shift", project };
  }

  const inCurrentMonth = (d: Date) => d.getMonth() === currentMonth.getMonth();

  return (
    <div>
      {/* Top controls */}
      <div className="flex flex-wrap items-start gap-3 mb-4">
        {/* Nav + period label */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={prevPeriod} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-base font-semibold text-gray-900 w-52 text-center text-sm">{periodLabel}</span>
          <button onClick={nextPeriod} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
          <button onClick={goToday} className="px-3 h-8 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">Today</button>
        </div>

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(["month", "week"] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-3 h-8 font-medium capitalize transition-colors ${viewMode === mode ? "bg-forest-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {mode}
            </button>
          ))}
        </div>

        {/* Project autocomplete */}
        <div className="relative w-56">
          <div className="relative">
            <input
              ref={projInputRef}
              type="text"
              placeholder="Filter by project…"
              value={projectSearch}
              onChange={e => {
                setProjectSearch(e.target.value);
                setSelectedProjectId(null);
                setShowProjectDrop(true);
              }}
              onFocus={() => setShowProjectDrop(true)}
              onBlur={() => setTimeout(() => setShowProjectDrop(false), 150)}
              className="w-full h-8 pl-3 pr-7 rounded-lg border border-gray-200 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
            />
            {(projectSearch || selectedProjectId) && (
              <button onClick={() => { setProjectSearch(""); setSelectedProjectId(null); projInputRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          {showProjectDrop && filteredProjectOptions.length > 0 && (
            <ul className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto text-xs">
              {filteredProjectOptions.map(p => (
                <li key={p.id}
                  onMouseDown={e => { e.preventDefault(); setProjectSearch(p.name); setSelectedProjectId(p.id); setShowProjectDrop(false); }}
                  className={`px-3 py-2 cursor-pointer hover:bg-forest-50 ${selectedProjectId === p.id ? "font-semibold text-forest-700" : "text-gray-800"}`}>
                  {p.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {ALL_FILTER_TYPES.map(type => {
          const active = activeFilters.has(type);
          const color = type === "Shift" ? SHIFT_COLOR : (KEY_DATE_COLORS[type] ?? KEY_DATE_COLOR_DEFAULT);
          return (
            <button key={type}
              onClick={() => setActiveFilters(prev => { const n = new Set(prev); n.has(type) ? n.delete(type) : n.add(type); return n; })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity ${color} ${active ? "opacity-100" : "opacity-25"}`}>
              {type}
            </button>
          );
        })}
        <button onClick={() => setActiveFilters(new Set(ALL_FILTER_TYPES))}
          className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-500 hover:bg-gray-50">
          All on
        </button>
        <button onClick={() => setActiveFilters(new Set())}
          className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-400 hover:bg-gray-50">
          Clear
        </button>
      </div>

      {/* Calendar grid */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {viewMode === "month"
            ? DOW.map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide">{d}</div>
              ))
            : calendarDays.map((day, idx) => (
                <div key={idx} className="py-2 px-2 text-center">
                  <div className="text-xs font-semibold text-gray-400 uppercase">{DOW[idx]}</div>
                  <div className={`text-sm font-semibold mt-0.5 ${toISO(day) === todayStr ? "text-forest-600" : "text-gray-700"}`}>
                    {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
              ))
          }
        </div>

        {/* Month view */}
        {viewMode === "month" && (
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const iso = toISO(day);
              const inMonth = inCurrentMonth(day);
              const isToday = iso === todayStr;
              const dayEntries = byDate.get(iso) ?? [];
              const shown = dayEntries.slice(0, 3);
              const overflow = dayEntries.length - shown.length;
              return (
                <div key={idx}
                  className={`min-h-[88px] p-1.5 border-b border-r border-gray-100 ${!inMonth ? "bg-gray-50/60" : "bg-white"} ${idx % 7 === 6 ? "border-r-0" : ""} ${idx >= 35 ? "border-b-0" : ""}`}>
                  <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-forest-600 text-white" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                    {day.getDate()}
                  </div>
                  {shown.map((e, i) => {
                    const { type, project } = entryLabel(e);
                    const timeRange = fmtTimeRange(e.startTime, e.endTime);
                    return (
                      <div key={i} className={`w-full mb-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-tight border ${entryColor(e)}`}
                        title={`${type} — ${project}${timeRange ? ` (${timeRange})` : ""}`}>
                        <div className="truncate">{type === "Shift" ? project : `${type} — ${project}`}</div>
                        {timeRange && <div className="font-normal opacity-70">{timeRange}</div>}
                      </div>
                    );
                  })}
                  {overflow > 0 && <div className="text-[10px] text-gray-400 pl-1">+{overflow} more</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Week view */}
        {viewMode === "week" && (
          <div className="grid grid-cols-7 min-h-[200px]">
            {calendarDays.map((day, idx) => {
              const iso = toISO(day);
              const isToday = iso === todayStr;
              const dayEntries = byDate.get(iso) ?? [];
              return (
                <div key={idx}
                  className={`p-2 border-r border-gray-100 ${idx === 6 ? "border-r-0" : ""} ${isToday ? "bg-forest-50/40" : "bg-white"}`}>
                  {dayEntries.length === 0 && (
                    <p className="text-[10px] text-gray-300 text-center mt-4">—</p>
                  )}
                  {dayEntries.map((e, i) => {
                    const { type, project } = entryLabel(e);
                    const timeRange = fmtTimeRange(e.startTime, e.endTime);
                    return (
                      <div key={i} className={`w-full mb-1 px-2 py-1 rounded border text-[10px] leading-tight ${entryColor(e)}`}>
                        <div className="font-bold truncate">{type}</div>
                        <div className="truncate opacity-75">{project}</div>
                        {timeRange && <div className="opacity-60 font-medium">{timeRange}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Active Projects Table ────────────────────────────────────────────────────

const STATUS_BADGE_PROJECT: Record<string, string> = {
  "Active":     "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Post-Move":  "bg-violet-100 text-violet-800 border border-violet-200",
};

function ActiveProjectsSection({ projects }: { projects: ActiveProject[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Address</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Lead</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">No signed active projects.</td></tr>
          )}
          {projects.map((p, i) => (
            <tr key={p.id} className={i % 2 === 1 ? "bg-gray-50/60" : "bg-white"}>
              <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
              <td className="px-4 py-2.5 text-gray-600 text-sm">{p.address || <span className="text-gray-300">—</span>}</td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_BADGE_PROJECT[p.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {p.status}
                </span>
              </td>
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
  staffMembers,
}: {
  initialItems: Item[];
  tenantInfoMap: Record<string, TenantInfo>;
  localVendors: LocalVendor[];
  staffMembers: StaffMember[];
}) {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [daysFilter, setDaysFilter] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelLoading, setLabelLoading] = useState(false);
  const [priceDropLoading, setPriceDropLoading] = useState(false);
  const [priceDropMsg, setPriceDropMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Bulk delivery date
  const [showDeliveryInput, setShowDeliveryInput] = useState(false);
  const [bulkDeliveryDate, setBulkDeliveryDate] = useState("");
  const [bulkDeliveryLoading, setBulkDeliveryLoading] = useState(false);

  const emptyRooms: Room[] = [];

  // Client options
  const clientOptions: [string, string][] = useMemo(() => Array.from(
    new Map(
      items.map(i => [i.tenantId, tenantInfoMap[i.tenantId]?.name ?? i.tenantId] as [string, string])
        .filter(([, name]) => !!name)
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1])), [items, tenantInfoMap]);

  // Filter
  const filtered = useMemo(() => items.filter(item => {
    if (search) {
      const q = search.toLowerCase();
      if (!item.itemName.toLowerCase().includes(q) && !(item.barcodeNumber ?? "").toLowerCase().includes(q)) return false;
    }
    if (statusFilter && item.status !== statusFilter) return false;
    if (clientFilter && item.tenantId !== clientFilter) return false;
    if (daysFilter) {
      const d = daysSince(item.deliveryDate);
      if (d === null || d < parseInt(daysFilter)) return false;
    }
    return true;
  }), [items, search, statusFilter, clientFilter, daysFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (paginated.every(i => selected.has(i.id))) {
      setSelected(prev => { const n = new Set(prev); paginated.forEach(i => n.delete(i.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); paginated.forEach(i => n.add(i.id)); return n; });
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

  // Bulk set delivery date
  async function applyBulkDelivery() {
    if (!bulkDeliveryDate || selected.size === 0) return;
    setBulkDeliveryLoading(true);
    try {
      await Promise.allSettled(
        Array.from(selected).map(id =>
          fetch("/api/items", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, deliveryDate: bulkDeliveryDate }),
          })
        )
      );
      setItems(prev => prev.map(i => selected.has(i.id) ? { ...i, deliveryDate: bulkDeliveryDate } : i));
      setShowDeliveryInput(false);
      setBulkDeliveryDate("");
    } catch {
      alert("Failed to update some delivery dates");
    } finally {
      setBulkDeliveryLoading(false);
    }
  }

  // Print labels
  const handlePrintLabels = useCallback(async (widthIn: number, heightIn: number) => {
    const pfItems = selectedItems.filter(i => i.primaryRoute === "ProFoundFinds Consignment");
    if (pfItems.length === 0) return;
    setLabelLoading(true);
    try {
      const res = await fetch("/api/pfinventory/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: pfItems.map(i => ({ id: i.id, itemName: i.itemName, price: i.valueMid ?? 0, barcodeNumber: i.barcodeNumber })),
          widthIn,
          heightIn,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `labels-${Date.now()}.pdf`; a.click();
      URL.revokeObjectURL(url);
      setShowLabelModal(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to generate labels");
    } finally {
      setLabelLoading(false);
    }
  }, [selectedItems]);

  // Price drop
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
        body: JSON.stringify({ tenantId: clientFilter, type, drop1Pct: info.priceDrop1Percent, drop2Pct: info.priceDrop2Percent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Price drop failed");
      if (data.updated === 0) {
        setPriceDropMsg({ type: "error", text: "No eligible Listed items found for this client." });
      } else {
        setPriceDropMsg({ type: "success", text: `${type === "revert" ? "Reverted" : "Applied"} to ${data.updated} item${data.updated !== 1 ? "s" : ""}.` });
        if (Array.isArray(data.itemUpdates)) {
          const map = new Map(data.itemUpdates.map((u: { id: string; valueMid: number }) => [u.id, u]));
          setItems(prev => prev.map(i => {
            const u = map.get(i.id) as { valueMid: number } | undefined;
            return u ? { ...i, valueMid: u.valueMid } : i;
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
  const listedCount = filtered.filter(i => i.status === "Listed").length;
  const totalValue = filtered.reduce((s, i) => s + (i.valueMid ?? 0), 0);
  const inputCls = "h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white";

  return (
    <div>
      {/* Stats */}
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

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input type="text" placeholder="Search item name or barcode…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className={`${inputCls} w-56`} />
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
            <button key={opt.value} onClick={() => { setDaysFilter(opt.value); setPage(1); }}
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
            <button onClick={() => handlePriceDrop("drop1")} disabled={priceDropLoading}
              className="px-3 h-8 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
              Drop 1 ({selectedTenantInfo.priceDrop1Percent}% — {selectedTenantInfo.priceDrop1Days}d)
            </button>
            <button onClick={() => handlePriceDrop("drop2")} disabled={priceDropLoading}
              className="px-3 h-8 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
              Drop 2 ({selectedTenantInfo.priceDrop2Percent}% — {selectedTenantInfo.priceDrop2Days}d)
            </button>
            <button onClick={() => handlePriceDrop("revert")} disabled={priceDropLoading}
              className="px-3 h-8 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50">
              Revert
            </button>
            {priceDropLoading && <span className="text-xs text-violet-600">Applying…</span>}
            {priceDropMsg && (
              <span className={`text-xs font-medium ${priceDropMsg.type === "success" ? "text-forest-700" : "text-red-600"}`}>
                {priceDropMsg.text}
              </span>
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            <span className="font-medium text-gray-700">Price drops are applied per client.</span>{" "}
            Select a client from the filter above to see price drop controls.
          </p>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 px-4 py-2.5 bg-forest-50 border border-forest-200 rounded-xl">
          <span className="text-sm font-medium text-forest-800">{selected.size} selected</span>
          <button onClick={() => setShowVendorModal(true)}
            className="px-3 h-8 rounded-lg text-xs font-semibold bg-forest-600 text-white hover:bg-forest-700">
            Send to Vendors
          </button>
          <button onClick={() => setShowLabelModal(true)} disabled={labelLoading}
            className="px-3 h-8 rounded-lg text-xs font-semibold border border-forest-300 text-forest-700 hover:bg-forest-100 disabled:opacity-50">
            Print Labels
          </button>
          {!showDeliveryInput ? (
            <button onClick={() => setShowDeliveryInput(true)}
              className="px-3 h-8 rounded-lg text-xs font-semibold border border-forest-300 text-forest-700 hover:bg-forest-100">
              Set Delivery Date
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input type="date" value={bulkDeliveryDate} onChange={e => setBulkDeliveryDate(e.target.value)}
                className="h-8 px-2 rounded-lg border border-forest-300 text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
              <button onClick={applyBulkDelivery} disabled={!bulkDeliveryDate || bulkDeliveryLoading}
                className="px-3 h-8 rounded-lg text-xs font-semibold bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-50">
                {bulkDeliveryLoading ? "Saving…" : "Apply"}
              </button>
              <button onClick={() => { setShowDeliveryInput(false); setBulkDeliveryDate(""); }}
                className="px-2 h-8 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-gray-400 hover:text-gray-700">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-10 px-3 py-3">
                <input type="checkbox" checked={allPageSelected} onChange={toggleAll}
                  className="rounded border-gray-300 text-forest-600 focus:ring-forest-400" />
              </th>
              <th className="w-12 px-2 py-3" />
              <th className="w-40 px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Item Name</th>
              <th className="w-28 px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Status</th>
              <th className="w-28 px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Client</th>
              <th className="w-20 px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Barcode</th>
              <th className="w-20 px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Start $</th>
              <th className="w-20 px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Current $</th>
              <th className="w-22 px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">Delivery</th>
              <th className="w-12 px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Days</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No items match the current filters.</td></tr>
            )}
            {paginated.map((item, idx) => {
              const photoUrl = item.photos?.[0]?.url ?? item.photoUrl;
              const clientName = tenantInfoMap[item.tenantId]?.name ?? item.tenantId;
              const daysOnSite = daysSince(item.deliveryDate);
              const startPrice = item.priceDropOriginalValue && item.priceDropOriginalValue > 0
                ? item.priceDropOriginalValue
                : item.valueMid;
              const currentPrice = item.valueMid;
              const hasDropped = !!(item.priceDropOriginalValue && item.priceDropOriginalValue > 0);

              return (
                <tr key={item.id}
                  className={`border-t border-gray-100 ${selected.has(item.id) ? "bg-forest-50" : idx % 2 === 1 ? "bg-gray-50/50" : "bg-white"}`}>
                  {/* Checkbox */}
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)}
                      className="rounded border-gray-300 text-forest-600 focus:ring-forest-400" />
                  </td>
                  {/* Photo */}
                  <td className="px-2 py-2">
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      {photoUrl ? (
                        <Image src={photoUrl} alt={item.itemName} fill className="object-cover" />
                      ) : (
                        <div className="w-10 h-10 flex items-center justify-center">
                          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                      )}
                    </div>
                  </td>
                  {/* Item Name — click to open EditItemModal */}
                  <td className="px-3 py-2 w-40">
                    <button onClick={() => setEditingItem(item)}
                      className="text-left w-full text-sm font-medium text-gray-900 hover:text-forest-700 truncate block transition-colors"
                      title={item.itemName}>
                      {item.itemName}
                    </button>
                  </td>
                  {/* Status */}
                  <td className="px-3 py-2">
                    <StatusSelect value={item.status} onSave={v => patchItem(item.id, { status: v })} />
                  </td>
                  {/* Client */}
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs truncate max-w-[112px]">{clientName}</td>
                  {/* Barcode */}
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{item.barcodeNumber ?? <span className="text-gray-300">—</span>}</td>
                  {/* Start Price */}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {startPrice != null
                      ? <span className={`text-xs ${hasDropped ? "line-through text-gray-400" : "text-gray-800 font-medium"}`}>
                          ${startPrice.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                        </span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  {/* Current Price */}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {currentPrice != null
                      ? <span className={`text-xs font-semibold ${hasDropped ? "text-forest-700" : "text-gray-800"}`}>
                          ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                        </span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  {/* Delivery */}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                    {fmtDateShort(item.deliveryDate) || <span className="text-gray-300">—</span>}
                  </td>
                  {/* Days */}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {daysOnSite !== null ? (
                      <span className={`text-xs font-medium ${daysOnSite >= 90 ? "text-red-600" : daysOnSite >= 60 ? "text-amber-600" : "text-gray-600"}`}>
                        {daysOnSite}
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
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
            setItems(prev => { const map = new Map(updatedItems.map(i => [i.id, i])); return prev.map(i => map.get(i.id) ?? i); });
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
      {editingItem && (
        <EditItemModal
          item={editingItem}
          rooms={emptyRooms}
          localVendors={localVendors}
          canReassign={false}
          isTTT={true}
          staffMembers={staffMembers}
          isTTTUser={true}
          onClose={() => setEditingItem(null)}
          onSaved={savedItem => {
            setItems(prev => prev.map(i => i.id === savedItem.id ? savedItem : i));
            setEditingItem(null);
          }}
          onItemUpdated={savedItem => {
            setItems(prev => prev.map(i => i.id === savedItem.id ? savedItem : i));
          }}
          onDeleted={() => {
            setItems(prev => prev.filter(i => i.id !== editingItem.id));
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Inline edit (price only) ─────────────────────────────────────────────────

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
      {display
        ? <span className="text-gray-800 text-sm">{display}</span>
        : <span className="text-gray-300 text-sm italic group-hover:text-gray-400">{placeholder}</span>}
    </button>
  );
}

// ─── Status select ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  "Listed":         "bg-violet-100 text-violet-800 border-violet-300",
  "Sold":           "bg-green-100 text-green-800 border-green-300",
  "Pending Review": "bg-amber-50 text-amber-800 border-amber-200",
  "Approved":       "bg-blue-50 text-blue-700 border-blue-200",
  "Discarded":      "bg-gray-100 text-gray-500 border-gray-200",
};

function StatusSelect({ value, onSave }: { value: ItemStatus; onSave: (v: ItemStatus) => void }) {
  const [open, setOpen] = useState(false);
  const cls = STATUS_BADGE[value] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${cls} hover:opacity-80 whitespace-nowrap`}>
        {value}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xl w-44">
          {PF_STATUSES.map(s => (
            <button key={s} onClick={() => { onSave(s); setOpen(false); }}
              className={`block w-full text-left px-4 py-2 text-xs hover:bg-gray-50 ${s === value ? "font-semibold text-gray-900" : "text-gray-600"}`}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const VENDOR_TYPE_COLORS: Record<VendorType, string> = {
  "Move Manager":           "bg-purple-100 text-purple-700",
  "Mover":                  "bg-blue-100 text-blue-700",
  "Future Home/Community":  "bg-green-100 text-green-700",
  "Realtor":                "bg-teal-100 text-teal-700",
  "Broker":                 "bg-yellow-100 text-yellow-700",
  "Donation Org":           "bg-orange-100 text-orange-700",
  "Consignment Store":      "bg-amber-100 text-amber-700",
  "Collector/Reseller":     "bg-indigo-100 text-indigo-700",
  "Junk Hauler":            "bg-gray-100 text-gray-600",
  "Attorney":               "bg-red-100 text-red-700",
  "Other":                  "bg-gray-100 text-gray-600",
};

// ─── Vendors Section ──────────────────────────────────────────────────────────

function VendorsSection({ initialVendors }: { initialVendors: LocalVendor[] }) {
  const router = useRouter();

  // Add-vendor form state
  const [vType, setVType] = useState<VendorType>("Consignment Store");
  const [vName, setVName] = useState("");
  const [vPoc, setVPoc] = useState("");
  const [vEmail, setVEmail] = useState("");
  const [vPhone, setVPhone] = useState("");
  const [vAddress, setVAddress] = useState("");
  const [vCity, setVCity] = useState("");
  const [vState, setVState] = useState("IL");
  const [vZip, setVZip] = useState("");
  const [vWebsite, setVWebsite] = useState("");
  const [vTake, setVTake] = useState("");
  const [vNotes, setVNotes] = useState("");
  const [vCategories, setVCategories] = useState<string[]>([""]);
  const [vSaving, setVSaving] = useState(false);
  const [vError, setVError] = useState("");
  const [vSuccess, setVSuccess] = useState(false);

  // Local vendor list (seeded from props, grows on add)
  const [vendors, setVendors] = useState<LocalVendor[]>(initialVendors);

  // Table controls
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<VendorType | "">("");
  const [sortCol, setSortCol] = useState<string>("vendorName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = vendors;
    if (typeFilter) list = list.filter(v => v.vendorType === typeFilter);
    if (q) list = list.filter(v =>
      v.vendorName.toLowerCase().includes(q) ||
      v.pocName.toLowerCase().includes(q) ||
      v.email.toLowerCase().includes(q) ||
      v.city.toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => {
      let av = "", bv = "";
      if (sortCol === "vendorName") { av = a.vendorName; bv = b.vendorName; }
      else if (sortCol === "vendorType") { av = a.vendorType; bv = b.vendorType; }
      else if (sortCol === "pocName") { av = a.pocName; bv = b.pocName; }
      else if (sortCol === "city") { av = `${a.city}, ${a.state}`; bv = `${b.city}, ${b.state}`; }
      else if (sortCol === "email") { av = a.email; bv = b.email; }
      else if (sortCol === "take") { return sortDir === "asc" ? a.consignmentTake - b.consignmentTake : b.consignmentTake - a.consignmentTake; }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [vendors, search, typeFilter, sortCol, sortDir]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!vName.trim()) { setVError("Vendor name is required"); return; }
    setVSaving(true);
    setVError("");
    setVSuccess(false);
    try {
      const res = await fetch("/api/local-vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-vendor-source": "Resale Page" },
        body: JSON.stringify({
          vendorType: vType,
          vendorName: vName.trim(),
          pocName: vPoc.trim(),
          email: vEmail.trim(),
          phone: vPhone.trim(),
          address: vAddress.trim(),
          city: vCity.trim(),
          state: vState,
          zip: vZip.trim(),
          website: vWebsite.trim(),
          consignmentTake: Number(vTake) || 0,
          notes: vNotes.trim(),
          isActive: true,
          zipCodesServed: "",
          itemCategories: vCategories.filter(Boolean).join(", "),
          prefCategories: [],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to add vendor");
      }
      const { vendor } = await res.json();
      setVendors(prev => [...prev, vendor]);
      // Reset form
      setVType("Consignment Store"); setVName(""); setVPoc(""); setVEmail("");
      setVPhone(""); setVAddress(""); setVCity(""); setVState("IL"); setVZip("");
      setVWebsite(""); setVTake(""); setVNotes(""); setVCategories([""]);
      setVSuccess(true);
      setTimeout(() => setVSuccess(false), 3000);
      router.refresh();
    } catch (err) {
      setVError(err instanceof Error ? err.message : "Error adding vendor");
    } finally {
      setVSaving(false);
    }
  }

  const thCls = "px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 whitespace-nowrap";
  const SortIcon = ({ col }: { col: string }) => (
    <span className="ml-1 inline-block opacity-40">
      {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  const inputCls = "w-full h-10 px-3 rounded-xl border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#2d4a3e] focus:border-transparent placeholder-gray-400";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="space-y-8">
      {/* Add Vendor Form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-5">Add New Vendor</h3>
        <form onSubmit={handleAdd} className="space-y-4">
          {/* Row 1: Type + Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Vendor Type</label>
              <select value={vType} onChange={e => setVType(e.target.value as VendorType)}
                className={inputCls}>
                {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Vendor Name *</label>
              <input value={vName} onChange={e => setVName(e.target.value)} placeholder="e.g. Chicago Consignment Co."
                className={inputCls} />
            </div>
          </div>

          {/* Row 2: Contact + Email + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Contact Name</label>
              <input value={vPoc} onChange={e => setVPoc(e.target.value)} placeholder="Jane Smith"
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={vEmail} onChange={e => setVEmail(e.target.value)} placeholder="jane@example.com"
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={vPhone} onChange={e => setVPhone(e.target.value)} placeholder="(312) 555-0100"
                className={inputCls} />
            </div>
          </div>

          {/* Row 3: Address + City + State + Zip */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Street Address</label>
              <input value={vAddress} onChange={e => setVAddress(e.target.value)} placeholder="123 Main St"
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input value={vCity} onChange={e => setVCity(e.target.value)} placeholder="Chicago"
                className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>State</label>
                <select value={vState} onChange={e => setVState(e.target.value)} className={inputCls}>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Zip</label>
                <input value={vZip} onChange={e => setVZip(e.target.value)} placeholder="60601"
                  className={inputCls} />
              </div>
            </div>
          </div>

          {/* Row 4: Website + Consignment Take */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Website</label>
              <input value={vWebsite} onChange={e => setVWebsite(e.target.value)} placeholder="https://example.com"
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>TTT Consignment Take %</label>
              <input type="number" min={0} max={100} value={vTake} onChange={e => setVTake(e.target.value)}
                placeholder="e.g. 40" className={inputCls} />
            </div>
          </div>

          {/* Row 5: Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={vNotes} onChange={e => setVNotes(e.target.value)} placeholder="Specializes in mid-century furniture, great for large lots…"
              rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#2d4a3e] focus:border-transparent placeholder-gray-400 resize-none" />
          </div>

          {/* Row 6: Item Categories */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls + " mb-0"}>Item Categories <span className="text-gray-400 font-normal">(optional — up to 5)</span></label>
              {vCategories.length < 5 && (
                <button type="button" onClick={() => setVCategories(prev => [...prev, ""])}
                  className="text-xs text-[#2d4a3e] font-medium hover:underline">
                  + Add category
                </button>
              )}
            </div>
            <div className="space-y-2">
              {vCategories.map((cat, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={cat}
                    onChange={e => setVCategories(prev => prev.map((c, i) => i === idx ? e.target.value : c))}
                    className="flex-1 h-10 px-3 rounded-xl border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#2d4a3e] focus:border-transparent"
                  >
                    <option value="">— Select category —</option>
                    {CATEGORY_GROUPS.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.categories.map(c => (
                          <option key={c} value={c} disabled={vCategories.includes(c) && vCategories[idx] !== c}>
                            {c}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {vCategories.length > 1 && (
                    <button type="button" onClick={() => setVCategories(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-red-500 text-lg leading-none flex-shrink-0" title="Remove">
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={vSaving}
              className="h-10 px-6 bg-[#2d4a3e] text-white text-sm font-semibold rounded-xl hover:bg-[#1e3329] disabled:opacity-50 disabled:cursor-not-allowed">
              {vSaving ? "Adding…" : "Add Vendor"}
            </button>
            {vSuccess && <span className="text-sm text-green-600 font-medium">Vendor added successfully.</span>}
            {vError && <span className="text-sm text-red-600">{vError}</span>}
          </div>
        </form>
      </div>

      {/* Vendor Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Table Controls */}
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2d4a3e]" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as VendorType | "")}
            className="h-9 pl-3 pr-8 rounded-lg border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2d4a3e] bg-white">
            <option value="">All Types</option>
            {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} vendor{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className={thCls} onClick={() => handleSort("vendorName")}>
                  Vendor <SortIcon col="vendorName" />
                </th>
                <th className={thCls} onClick={() => handleSort("vendorType")}>
                  Type <SortIcon col="vendorType" />
                </th>
                <th className={thCls} onClick={() => handleSort("pocName")}>
                  Contact <SortIcon col="pocName" />
                </th>
                <th className={thCls} onClick={() => handleSort("city")}>
                  Location <SortIcon col="city" />
                </th>
                <th className={thCls} onClick={() => handleSort("email")}>
                  Email <SortIcon col="email" />
                </th>
                <th className={thCls}>Phone</th>
                <th className={thCls + " text-right"} onClick={() => handleSort("take")}>
                  Take % <SortIcon col="take" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-400">
                    {search || typeFilter ? "No vendors match your search." : "No vendors yet."}
                  </td>
                </tr>
              ) : filtered.map(v => (
                <tr key={v.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900">{v.vendorName}</div>
                    {v.website && (
                      <a href={v.website.startsWith("http") ? v.website : `https://${v.website}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-[#2d4a3e] hover:underline"
                        onClick={e => e.stopPropagation()}>
                        {v.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${VENDOR_TYPE_COLORS[v.vendorType] ?? "bg-gray-100 text-gray-600"}`}>
                      {v.vendorType}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-700">{v.pocName || "—"}</td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                    {[v.city, v.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-3">
                    {v.email ? (
                      <a href={`mailto:${v.email}`} className="text-[#2d4a3e] hover:underline">{v.email}</a>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{v.phone || "—"}</td>
                  <td className="px-3 py-3 text-right text-gray-700 font-tabular-nums">
                    {v.consignmentTake > 0 ? `${v.consignmentTake}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

type TabId = "projects" | "items" | "vendors";

const TABS: { id: TabId; label: string }[] = [
  { id: "projects", label: "Projects" },
  { id: "items",    label: "Items" },
  { id: "vendors",  label: "Vendors" },
];

export function ResaleClient({
  activeProjectsList,
  tenantInfoMap,
  planEntries,
  pfItems,
  localVendors,
  staffMembers,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab") as TabId | null;
  const activeTab: TabId = (rawTab && ["projects", "items", "vendors"].includes(rawTab))
    ? rawTab : "projects";

  const tenantNames: Record<string, string> = {};
  for (const [id, info] of Object.entries(tenantInfoMap)) tenantNames[id] = info.name;

  function setTab(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Resale Ops</h1>
          <p className="text-gray-500 text-sm mt-1">Global view across all active projects — calendar, team leads, ProFound inventory, and vendors.</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 border-b border-gray-200 mb-8">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={[
                "px-5 py-2.5 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-[#2d4a3e] text-[#2d4a3e] bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/70"
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Projects */}
        {activeTab === "projects" && (
          <div className="space-y-10">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Dates + Shifts — All Active Projects</h2>
              <CalendarSection entries={planEntries} tenantNames={tenantNames} />
            </section>
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Active Projects{" "}
                <span className="text-sm font-normal text-gray-400">({activeProjectsList.length} signed)</span>
              </h2>
              <ActiveProjectsSection projects={activeProjectsList} />
            </section>
          </div>
        )}

        {/* Tab: Items */}
        {activeTab === "items" && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                ProFound Inventory{" "}
                <span className="text-sm font-normal text-gray-400">({pfItems.length} items)</span>
              </h2>
            </div>
            <InventorySection
              initialItems={pfItems}
              tenantInfoMap={tenantInfoMap}
              localVendors={localVendors}
              staffMembers={staffMembers}
            />
          </div>
        )}

        {/* Tab: Vendors */}
        {activeTab === "vendors" && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Vendors{" "}
                <span className="text-sm font-normal text-gray-400">({localVendors.length} total)</span>
              </h2>
            </div>
            <VendorsSection initialVendors={localVendors} />
          </div>
        )}
      </div>
    </div>
  );
}
