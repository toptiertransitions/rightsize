"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { TimeEntry, FocusArea, SoldItemRow, Expense, PlanEntry } from "@/lib/types";
import { TIME_FOCUS_AREAS } from "@/lib/types";

interface TenantOption {
  id: string;
  name: string;
}

interface StaffOption {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

interface Props {
  initialEntries: TimeEntry[];
  tenants: TenantOption[];
  isAdmin: boolean;
  isManager?: boolean;
  currentUserId: string;
  currentUserName: string;
  staffMembers?: StaffOption[];
  services?: string[];
  todayShift?: PlanEntry;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getWeekStart(refDate: Date): Date {
  const d = new Date(refDate);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime12(time24: string): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function computeDuration(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

function todayISO(): string {
  return toISODate(new Date());
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(entries: TimeEntry[], soldItems: SoldItemRow[], expenses: Expense[], from: string, to: string) {
  const header = [
    "Date", "Staff Name", "Project", "Focus Area", "Start Time", "End Time",
    "Duration (hrs)",
    "Travel Time (min)", "Unpaid Travel Time (min)", "Payable Travel Time (min)", "Total Payable Time (hrs)",
    "Travel Miles", "Non-Reimbursed Travel Miles", "Travel Reimbursement Owed ($)",
    "Notes", "Commission ($)", "Expense Reimbursement ($)",
  ];

  const entryRows = entries
    .filter(e => e.date >= from && e.date <= to)
    .map(e => {
      const travelMins = e.travelMinutes ?? null;
      const travelMi   = e.travelMiles   ?? null;

      // Unpaid travel: first 30 min are unpaid (or all of it if < 30)
      const unpaidTravel = travelMins != null && travelMins > 0
        ? Math.min(travelMins, 30) : null;
      // Payable travel: anything beyond the first 30 min
      const payableTravel = travelMins != null && travelMins > 0
        ? travelMins - Math.min(travelMins, 30) : null;
      // Total payable time in hours = work duration + payable travel minutes
      const totalPayableHrs = ((e.durationMinutes + (payableTravel ?? 0)) / 60).toFixed(2);

      // Non-reimbursed miles: first 20 miles aren't reimbursed
      const nonReimbursedMiles = travelMi != null && travelMi > 0
        ? Math.min(travelMi, 20) : null;
      // Reimbursement owed: miles beyond 20 × $0.725
      const reimbursementOwed = travelMi != null && travelMi > 0
        ? ((travelMi - Math.min(travelMi, 20)) * 0.725).toFixed(2) : null;

      return [
        e.date,
        e.staffName,
        e.projectName,
        e.focusArea,
        formatTime12(e.startTime),
        formatTime12(e.endTime),
        (e.durationMinutes / 60).toFixed(2),
        travelMins != null ? String(travelMins) : "",
        unpaidTravel  != null ? String(unpaidTravel)  : "",
        payableTravel != null ? String(payableTravel) : "",
        totalPayableHrs,
        travelMi != null ? String(travelMi) : "",
        nonReimbursedMiles  != null ? String(nonReimbursedMiles)  : "",
        reimbursementOwed   != null ? String(reimbursementOwed)   : "",
        e.notes ?? "",
        "",  // Commission (blank for time entries)
        "",  // Expense Reimbursement (blank for time entries)
      ];
    });

  const saleRows = soldItems
    .filter(i => i.saleDate >= from && i.saleDate <= to)
    .map(i => {
      const timeMinutes = i.staffTimeMinutes ?? ((i.valueMid ?? 0) > 100 ? 20 : 10);
      const commission = i.staffCommissionPercent != null && i.valueMid
        ? ((i.staffCommissionPercent / 100) * i.valueMid).toFixed(2)
        : "";
      const focusArea = i.channel === "FB" ? "FB Marketplace Sales" : "eBay Sales";
      return [
        i.saleDate,
        i.staffSellerName ?? "",
        i.tenantName,
        focusArea,
        "",
        "",
        (timeMinutes / 60).toFixed(2),
        "", "", "", (timeMinutes / 60).toFixed(2), // travel cols blank; total payable = duration
        "", "", "",                                  // miles cols blank
        i.itemName,
        commission,
        "",  // Expense Reimbursement (blank for sale rows)
      ];
    });

  const expenseRows = expenses
    .filter(e => e.date >= from && e.date <= to)
    .map(e => [
      e.date,
      e.staffName,
      e.tenantName ?? "",
      "Expense Reimbursement",
      "", "", "",       // start, end, duration
      "", "", "", "",   // travel time cols
      "", "", "",       // miles cols
      e.vendor + (e.description ? ` – ${e.description}` : ""),
      "",               // Commission
      e.total.toFixed(2),
    ]);

  const allRows = [...entryRows, ...saleRows, ...expenseRows].sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const csv = [header, ...allRows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `time-entries-${from}-to-${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Export Modal ─────────────────────────────────────────────────────────────
function ExportModal({ entries, onClose, weekStart }: {
  entries: TimeEntry[];
  onClose: () => void;
  weekStart: Date;
}) {
  const thisWeekFrom = toISODate(weekStart);
  const thisWeekTo   = toISODate(addDays(weekStart, 6));
  const lastWeekFrom = toISODate(addDays(weekStart, -7));
  const lastWeekTo   = toISODate(addDays(weekStart, -1));
  const twoWeeksFrom = toISODate(addDays(weekStart, -14));
  const twoWeeksTo   = toISODate(addDays(weekStart, -1));

  const [fromDate, setFromDate] = useState(twoWeeksFrom);
  const [toDate,   setToDate]   = useState(twoWeeksTo);
  const [soldItems, setSoldItems] = useState<SoldItemRow[]>([]);
  const [reimbursableExpenses, setReimbursableExpenses] = useState<Expense[]>([]);

  // Fetch sold items and reimbursable expenses on demand when modal opens
  useEffect(() => {
    fetch("/api/sold-items")
      .then(r => r.json())
      .then(d => setSoldItems(d.items ?? []))
      .catch(() => {});
    fetch("/api/expenses?reimbursable=true&from=2020-01-01&to=2099-12-31")
      .then(r => r.json())
      .then(d => setReimbursableExpenses(d.expenses ?? []))
      .catch(() => {});
  }, []);

  const presets = [
    { label: "This Week",    from: thisWeekFrom, to: thisWeekTo },
    { label: "Last Week",    from: lastWeekFrom, to: lastWeekTo },
    { label: "Last 2 Weeks", from: twoWeeksFrom, to: twoWeeksTo },
  ];

  const filtered = entries.filter(e => e.date >= fromDate && e.date <= toDate);
  const filteredSales = soldItems.filter(i => i.saleDate >= fromDate && i.saleDate <= toDate);
  const filteredExpenses = reimbursableExpenses.filter(e => e.date >= fromDate && e.date <= toDate);
  const isPreset = (p: typeof presets[0]) => fromDate === p.from && toDate === p.to;
  const totalRows = filtered.length + filteredSales.length + filteredExpenses.length;

  function doExport() {
    exportCSV(entries, soldItems, reimbursableExpenses, fromDate, toDate);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Export Time Entries</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => { setFromDate(p.from); setToDate(p.to); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isPreset(p)
                  ? "bg-forest-600 text-white"
                  : "bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date range inputs */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500"
            />
          </div>
        </div>

        {/* Entry count */}
        <div className="mb-4">
          <p className="text-xs text-gray-500">
            {filtered.length === 0 && filteredSales.length === 0 && filteredExpenses.length === 0
              ? "No entries in this range"
              : `${filtered.length} time ${filtered.length === 1 ? "entry" : "entries"} · ${(filtered.reduce((s, e) => s + e.durationMinutes, 0) / 60).toFixed(1)} hrs`
            }
          </p>
          {filteredSales.length > 0 && (
            <p className="text-xs text-gray-500">
              {filteredSales.length} sold {filteredSales.length === 1 ? "item" : "items"} (FB/eBay)
            </p>
          )}
          {filteredExpenses.length > 0 && (
            <p className="text-xs text-gray-500">
              {filteredExpenses.length} reimbursable {filteredExpenses.length === 1 ? "expense" : "expenses"} · {(() => { const t = filteredExpenses.reduce((s, e) => s + e.total, 0); return t < 0 ? `-$${Math.abs(t).toFixed(2)}` : `$${t.toFixed(2)}`; })()}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors border border-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={doExport}
            disabled={totalRows === 0}
            className="flex-1 py-2.5 rounded-xl text-sm bg-forest-600 text-white hover:bg-forest-500 transition-colors disabled:opacity-40 font-medium"
          >
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Entry Row ────────────────────────────────────────────────────────────────
function EntryRow({
  entry, canViewAll, currentUserId, onEdit,
}: {
  entry: TimeEntry;
  canViewAll: boolean;
  currentUserId: string;
  onEdit: (e: TimeEntry) => void;
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-gray-600 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">
            {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{entry.focusArea}</span>
          {canViewAll && <span className="text-xs text-gray-500">{entry.staffName}</span>}
        </div>
        <p className="text-sm font-medium text-white mt-0.5 truncate">{entry.projectName}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatTime12(entry.startTime)} – {formatTime12(entry.endTime)}
          {" "}<span className="text-forest-400 font-medium">({formatDuration(entry.durationMinutes)})</span>
          {entry.travelMinutes ? <span className="text-gray-500"> · {entry.travelMinutes}min travel</span> : null}
          {entry.travelMiles ? <span className="text-gray-500"> · {entry.travelMiles}mi</span> : null}
        </p>
        {entry.notes && <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.notes}</p>}
      </div>
      {(entry.clerkUserId === currentUserId || canViewAll) && (
        <button
          onClick={() => onEdit(entry)}
          className="text-xs text-gray-400 hover:text-white transition-colors shrink-0 px-2 py-1 rounded hover:bg-gray-700"
        >
          Edit
        </button>
      )}
    </div>
  );
}

// ─── Searchable Combobox ──────────────────────────────────────────────────────
interface ComboboxOption { id: string; name: string; }
interface ComboboxProps {
  value: string;
  onChange: (id: string, name: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  displaySuffix?: (opt: ComboboxOption) => string;
}

function SearchableCombobox({ value, onChange, options, placeholder = "Search…", displaySuffix }: ComboboxProps) {
  const selected = options.find(o => o.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  const filtered = options.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase())
  );

  const displayLabel = (opt: ComboboxOption) =>
    displaySuffix ? `${opt.name}${displaySuffix(opt)}` : opt.name;

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={open ? query : (selected ? displayLabel(selected) : "")}
        placeholder={placeholder}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500"
      />
      {open && (
        <ul className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg max-h-52 overflow-y-auto shadow-xl">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
          ) : filtered.map(opt => (
            <li
              key={opt.id}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt.id, opt.name); setOpen(false); setQuery(""); }}
              onTouchEnd={(e) => { e.preventDefault(); onChange(opt.id, opt.name); setOpen(false); setQuery(""); }}
              className={`px-3 py-2 text-sm cursor-pointer ${opt.id === value ? "bg-forest-700 text-white" : "text-gray-200 hover:bg-gray-700"}`}
            >
              {displayLabel(opt)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Staff Combobox ───────────────────────────────────────────────────────────
const STAFF_ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  TTTAdmin:   { label: "Admin",   cls: "bg-purple-900 text-purple-300" },
  TTTManager: { label: "Manager", cls: "bg-blue-900   text-blue-300"   },
  TTTStaff:   { label: "Staff",   cls: "bg-gray-700   text-gray-300"   },
};

interface StaffComboboxProps {
  value: string;
  onChange: (id: string, name: string) => void;
  options: StaffOption[];
  currentUserId: string;
  loading?: boolean;
}

function StaffCombobox({ value, onChange, options, currentUserId, loading }: StaffComboboxProps) {
  const selected = options.find(o => o.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  // Scroll cursor item into view
  useEffect(() => {
    if (!listRef.current || cursor < 0) return;
    const item = listRef.current.children[cursor] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const filtered = query
    ? options.filter(o => {
        const q = query.toLowerCase();
        return o.name.toLowerCase().includes(q) || (o.email ?? "").toLowerCase().includes(q);
      })
    : options;

  function select(opt: StaffOption) {
    onChange(opt.id, opt.name);
    setOpen(false);
    setQuery("");
    setCursor(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "Escape") { setOpen(false); setCursor(-1); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && cursor >= 0) { e.preventDefault(); if (filtered[cursor]) select(filtered[cursor]); }
  }

  const displayName = selected
    ? `${selected.name}${selected.id === currentUserId ? " (me)" : ""}`
    : "";

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={open ? query : displayName}
          placeholder={loading ? "Loading staff…" : "Search by name or email…"}
          disabled={loading}
          onFocus={() => { setQuery(""); setOpen(true); setCursor(-1); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(-1); }}
          onKeyDown={handleKeyDown}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500 pr-8 disabled:opacity-50"
        />
        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
      </div>
      {open && !loading && (
        <ul ref={listRef} className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-xl max-h-64 overflow-y-auto shadow-2xl divide-y divide-gray-700/50">
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-sm text-gray-500">
              {query ? `No staff matching "${query}"` : "No staff available"}
            </li>
          ) : filtered.map((opt, i) => {
            const badge = STAFF_ROLE_BADGE[opt.role ?? ""];
            const isMe = opt.id === currentUserId;
            const isSelected = opt.id === value;
            return (
              <li
                key={opt.id}
                onMouseDown={e => { e.preventDefault(); select(opt); }}
                onMouseEnter={() => setCursor(i)}
                className={`px-3 py-2.5 cursor-pointer flex items-center gap-3 transition-colors ${i === cursor || isSelected ? "bg-gray-700" : "hover:bg-gray-750"}`}
              >
                {/* Avatar initial */}
                <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-200 shrink-0">
                  {opt.name.charAt(0).toUpperCase()}
                </div>
                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-white">
                      {opt.name}{isMe && <span className="text-gray-400 font-normal"> (me)</span>}
                    </span>
                    {badge && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  {opt.email && <p className="text-xs text-gray-500 truncate">{opt.email}</p>}
                </div>
                {isSelected && (
                  <svg className="w-4 h-4 text-forest-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Staff Filter Combobox (main view selector) ───────────────────────────────
interface StaffFilterComboboxProps {
  value: string; // clerkUserId or "" for all
  onChange: (id: string) => void;
  options: StaffOption[];
  loading?: boolean;
}

function StaffFilterCombobox({ value, onChange, options, loading }: StaffFilterComboboxProps) {
  const selected = options.find(o => o.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  useEffect(() => {
    if (!listRef.current || cursor < 0) return;
    const item = listRef.current.children[cursor] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // "All Staff" is index 0; actual staff start at index 1
  const filteredOptions = query
    ? options.filter(o => {
        const q = query.toLowerCase();
        return o.name.toLowerCase().includes(q) || (o.email ?? "").toLowerCase().includes(q);
      })
    : options;
  // total items = "All Staff" row + filteredOptions
  const totalItems = 1 + filteredOptions.length;

  function selectAll() { onChange(""); setOpen(false); setQuery(""); setCursor(-1); }
  function selectOpt(opt: StaffOption) { onChange(opt.id); setOpen(false); setQuery(""); setCursor(-1); }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === "Escape") { setOpen(false); setCursor(-1); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, totalItems - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (cursor === 0) selectAll();
      else if (cursor > 0 && filteredOptions[cursor - 1]) selectOpt(filteredOptions[cursor - 1]);
    }
  }

  const displayValue = selected ? selected.name : "All Staff";

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={open ? query : displayValue}
          placeholder={loading ? "Loading staff…" : "Filter by staff member…"}
          disabled={loading}
          onFocus={() => { setQuery(""); setOpen(true); setCursor(-1); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(-1); }}
          onKeyDown={handleKeyDown}
          className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-forest-500 pr-8 w-52 disabled:opacity-50"
        />
        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
      </div>
      {open && !loading && (
        <ul ref={listRef} className="absolute z-50 mt-1 w-full min-w-[13rem] bg-gray-800 border border-gray-600 rounded-xl max-h-64 overflow-y-auto shadow-2xl divide-y divide-gray-700/50">
          {/* All Staff option */}
          <li
            onMouseDown={e => { e.preventDefault(); selectAll(); }}
            onMouseEnter={() => setCursor(0)}
            className={`px-3 py-2.5 cursor-pointer flex items-center gap-2 transition-colors ${cursor === 0 || value === "" ? "bg-gray-700" : "hover:bg-gray-750"}`}
          >
            <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
              ★
            </div>
            <span className="text-sm font-medium text-white">All Staff</span>
            {value === "" && (
              <svg className="w-4 h-4 text-forest-400 shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </li>
          {filteredOptions.length === 0 && query ? (
            <li className="px-3 py-3 text-sm text-gray-500">No staff matching &ldquo;{query}&rdquo;</li>
          ) : filteredOptions.map((opt, i) => {
            const badge = STAFF_ROLE_BADGE[opt.role ?? ""];
            const isSelected = opt.id === value;
            const itemCursor = i + 1;
            return (
              <li
                key={opt.id}
                onMouseDown={e => { e.preventDefault(); selectOpt(opt); }}
                onMouseEnter={() => setCursor(itemCursor)}
                className={`px-3 py-2.5 cursor-pointer flex items-center gap-3 transition-colors ${itemCursor === cursor || isSelected ? "bg-gray-700" : "hover:bg-gray-750"}`}
              >
                <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-200 shrink-0">
                  {opt.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-white">{opt.name}</span>
                    {badge && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  {opt.email && <p className="text-xs text-gray-500 truncate">{opt.email}</p>}
                </div>
                {isSelected && (
                  <svg className="w-4 h-4 text-forest-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Log Time Modal ───────────────────────────────────────────────────────────
interface ModalProps {
  entry?: TimeEntry;
  tenants: TenantOption[];
  onClose: () => void;
  onSaved: (entries: TimeEntry[], deletedId?: string) => void;
  onDeleted?: (id: string) => void;
  staffMembers?: StaffOption[];
  currentUserId: string;
  currentUserName: string;
  services?: string[];
  todayShift?: PlanEntry;
}

function LogTimeModal({ entry, tenants, onClose, onSaved, onDeleted, staffMembers, currentUserId, currentUserName, services, todayShift }: ModalProps) {
  const focusAreaOptions = services && services.length > 0 ? services : TIME_FOCUS_AREAS;

  // For new entries: pre-fill from today's shift (if any), otherwise leave blank.
  // For edits: always use the existing entry values.
  const shiftDefaults = !entry ? todayShift : undefined;
  const defaultTenantId = entry?.tenantId ?? (shiftDefaults?.tenantId ?? "");
  const defaultStartTime = entry?.startTime ?? (shiftDefaults?.startTime ?? "");
  const defaultEndTime = entry?.endTime ?? (shiftDefaults?.endTime ?? "");
  const shiftActivity = shiftDefaults?.activity;
  const firstFocusArea = entry?.focusArea ??
    (shiftActivity && focusAreaOptions.includes(shiftActivity) ? shiftActivity : "");

  const [date, setDate] = useState(entry?.date ?? todayISO());
  const [tenantId, setTenantId] = useState(defaultTenantId);
  const [splits, setSplits] = useState<{ focusArea: string; durationMinutes: number }[]>([
    {
      focusArea: firstFocusArea,
      durationMinutes: entry?.durationMinutes ??
        (defaultStartTime && defaultEndTime ? computeDuration(defaultStartTime, defaultEndTime) : 0),
    }
  ]);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [travelMiles, setTravelMiles] = useState(entry?.travelMiles != null ? String(entry.travelMiles) : "");
  const [travelMinutes, setTravelMinutes] = useState(entry?.travelMinutes != null ? String(entry.travelMinutes) : "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [forUserId, setForUserId] = useState(currentUserId);
  const [forUserName, setForUserName] = useState(currentUserName);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Always fetch fresh staff list when modal opens (admin/manager only)
  const isAdminModal = staffMembers !== undefined;
  const [liveStaff, setLiveStaff] = useState<StaffOption[]>(staffMembers ?? []);
  const [loadingStaff, setLoadingStaff] = useState(isAdminModal);

  useEffect(() => {
    if (!isAdminModal) return;
    fetch("/api/admin/staff", { credentials: "same-origin" })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.staff)) {
          const opts: StaffOption[] = data.staff
            .filter((s: { isActive: boolean }) => s.isActive)
            .map((s: { clerkUserId: string; displayName: string; email: string; role: string }) => ({
              id: s.clerkUserId,
              name: s.displayName,
              email: s.email,
              role: s.role,
            }));
          setLiveStaff(opts);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingStaff(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const duration = useMemo(() => computeDuration(startTime, endTime), [startTime, endTime]);
  const selectedProject = tenants.find(t => t.id === tenantId);

  // Sync duration changes into splits
  useEffect(() => {
    setSplits(prev => {
      if (prev.length === 1) {
        return [{ ...prev[0], durationMinutes: duration }];
      }
      // Multi mode: last split absorbs the diff
      const total = prev.reduce((s, sp) => s + sp.durationMinutes, 0);
      const diff = duration - total;
      if (diff === 0) return prev;
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, durationMinutes: Math.max(0, last.durationMinutes + diff) }];
    });
  }, [duration]);

  function addSplit() {
    setSplits(prev => {
      if (prev.length === 1) {
        const half = Math.floor(duration / 2);
        return [
          { ...prev[0], durationMinutes: half },
          { focusArea: focusAreaOptions[0], durationMinutes: duration - half },
        ];
      }
      const total = prev.reduce((s, sp) => s + sp.durationMinutes, 0);
      const remaining = Math.max(1, duration - total);
      return [...prev, { focusArea: focusAreaOptions[0], durationMinutes: remaining }];
    });
  }

  function removeSplit(i: number) {
    setSplits(prev => {
      const next = prev.filter((_, idx) => idx !== i);
      if (next.length === 1) return [{ ...next[0], durationMinutes: duration }];
      return next;
    });
  }

  function updateSplit(i: number, patch: Partial<{ focusArea: string; durationMinutes: number }>) {
    setSplits(prev => prev.map((sp, idx) => idx === i ? { ...sp, ...patch } : sp));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) { setError("Select a project"); return; }
    if (duration <= 0) { setError("End time must be after start time"); return; }
    if (splits.length > 1) {
      const splitTotal = splits.reduce((s, sp) => s + sp.durationMinutes, 0);
      if (Math.abs(splitTotal - duration) > 1) {
        setError(`Split durations must sum to ${duration} min (currently ${splitTotal} min)`);
        return;
      }
      if (splits.some(sp => !sp.focusArea)) {
        setError("All splits must have a focus area");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const sharedFields = {
        tenantId,
        projectName: selectedProject?.name ?? entry?.projectName ?? "",
        date,
        startTime,
        endTime,
        travelMiles: travelMiles ? parseFloat(travelMiles) : undefined,
        travelMinutes: travelMinutes ? parseInt(travelMinutes) : undefined,
        notes: notes || undefined,
        ...(entry ? { id: entry.id } : {}),
        ...(!entry && forUserId !== currentUserId ? { staffUserId: forUserId, staffName: forUserName } : {}),
      };
      const body = splits.length > 1
        ? { ...sharedFields, splits: splits.map(sp => ({ focusArea: sp.focusArea, durationMinutes: sp.durationMinutes })), durationMinutes: duration }
        : { ...sharedFields, focusArea: splits[0].focusArea, durationMinutes: duration };
      const res = await fetch("/api/time-entries", {
        method: entry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        // Session expired — reload to re-authenticate via Clerk
        window.location.href = "/sign-in";
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      const data = await res.json();
      onSaved(data.entries ?? [data.entry], data.deletedId);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry || !onDeleted) return;
    if (!confirm("Delete this time entry?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/time-entries?id=${entry.id}`, { method: "DELETE", credentials: "same-origin" });
      if (res.status === 401) { window.location.href = "/sign-in"; return; }
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      onDeleted(entry.id);
    } catch (err) {
      setError(String(err));
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md flex flex-col max-h-[92dvh]">

        {/* Header — sticky */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">{entry ? "Edit Time Entry" : "Log Time"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

            {!entry && isAdminModal && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Log for</label>
                <StaffCombobox
                  value={forUserId}
                  onChange={(id, name) => { setForUserId(id); setForUserName(name); }}
                  options={[
                    { id: currentUserId, name: currentUserName },
                    ...liveStaff.filter(m => m.id !== currentUserId),
                  ]}
                  currentUserId={currentUserId}
                  loading={loadingStaff}
                />
              </div>
            )}

            <div className="w-1/2">
              <label className="block text-xs font-medium text-gray-400 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Project</label>
              {tenants.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">No projects</p>
              ) : (
                <SearchableCombobox
                  value={tenantId}
                  onChange={(id) => setTenantId(id)}
                  options={tenants}
                  placeholder="Search projects…"
                />
              )}
            </div>

            {/* Focus Area — single or split */}
            {splits.length === 1 ? (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Focus Area</label>
                <select
                  value={splits[0].focusArea}
                  onChange={e => setSplits([{ focusArea: e.target.value, durationMinutes: duration }])}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500"
                >
                  <option value="" disabled hidden>Select focus area…</option>
                  {focusAreaOptions.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <button
                  type="button"
                  onClick={addSplit}
                  className="mt-1.5 text-xs text-gray-500 hover:text-forest-400 transition-colors"
                >
                  + Split across focus areas
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-400">Focus Areas</label>
                  <span className="text-xs text-gray-600">Duration</span>
                </div>
                <div className="space-y-2">
                  {splits.map((sp, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={sp.focusArea}
                        onChange={e => updateSplit(i, { focusArea: e.target.value })}
                        className="min-w-0 bg-gray-800 border border-gray-600 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-forest-500 flex-[3]"
                      >
                        <option value="" disabled hidden>Select…</option>
                        {focusAreaOptions.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <div className="relative w-[6rem] shrink-0">
                        <input
                          type="number"
                          min="1"
                          value={sp.durationMinutes}
                          onChange={e => updateSplit(i, { durationMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-forest-500 pr-7"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">min</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSplit(i)}
                        className="text-gray-600 hover:text-red-400 transition-colors shrink-0 text-lg leading-none"
                        aria-label="Remove split"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <button
                    type="button"
                    onClick={addSplit}
                    className="text-xs text-forest-400 hover:text-forest-300 transition-colors"
                  >
                    + Add focus area
                  </button>
                  {(() => {
                    const splitTotal = splits.reduce((s, sp) => s + sp.durationMinutes, 0);
                    const diff = duration - splitTotal;
                    if (diff === 0) return (
                      <span className="text-xs text-forest-400 font-medium">{splitTotal} / {duration} min</span>
                    );
                    if (diff > 0) return (
                      <span className="text-xs text-amber-400">{diff} min unallocated · {splitTotal} / {duration}</span>
                    );
                    return (
                      <span className="text-xs text-red-400">{-diff} min over · {splitTotal} / {duration}</span>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Start / End — always side-by-side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="block text-xs font-medium text-gray-400 mb-1">Start Time</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full min-w-0 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500" />
              </div>
              <div className="min-w-0">
                <label className="block text-xs font-medium text-gray-400 mb-1">End Time</label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className="w-full min-w-0 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500" />
              </div>
            </div>

            {duration > 0 && (
              <p className="text-xs text-forest-400 font-medium -mt-1">Duration: {formatDuration(duration)}</p>
            )}

            {/* Travel — stacked on mobile, side-by-side on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Travel Time <span className="text-gray-600">(min, round trip)</span></label>
                <div className="relative">
                  <input type="number" min="0" step="1" value={travelMinutes} onChange={e => setTravelMinutes(e.target.value)}
                    placeholder="0"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500 pr-10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">min</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Travel Miles <span className="text-gray-600">(round trip)</span></label>
                <div className="relative">
                  <input type="number" min="0" step="0.1" value={travelMiles} onChange={e => setTravelMiles(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500 pr-8" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">mi</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Notes <span className="text-gray-600">(optional)</span></label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500 resize-none" />
            </div>
          </div>

          {/* Footer — sticky at bottom */}
          <div className="px-6 py-4 border-t border-gray-800 flex flex-col gap-2 flex-shrink-0">
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-3">
              {entry && onDeleted && (
                <button type="button" onClick={handleDelete} disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors">
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
              <div className="flex-1" />
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-lg text-sm bg-forest-600 text-white hover:bg-forest-500 transition-colors disabled:opacity-50">
                {saving ? "Saving…" : entry ? "Save Changes" : "Log Time"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TimeTrackerClient({ initialEntries, tenants, isAdmin, isManager = false, currentUserId, currentUserName, staffMembers, services, todayShift }: Props) {
  const [entries, setEntries] = useState<TimeEntry[]>(initialEntries);
  const [staffFilter, setStaffFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [liveFilterStaff, setLiveFilterStaff] = useState<StaffOption[]>(staffMembers ?? []);
  const [loadingFilterStaff, setLoadingFilterStaff] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | undefined>(undefined);
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());
  const [showWeekends, setShowWeekends] = useState(false);

  // ── Derived permissions ───────────────────────────────────────────────────
  const canViewAll = isAdmin || isManager;

  // ── Current week bounds (fixed to today's week) ───────────────────────────
  const currentWeekStart = useMemo(() => getWeekStart(new Date()), []);
  const currentWeekEnd = useMemo(() => addDays(currentWeekStart, 6), [currentWeekStart]);
  const currentWeekStartISO = useMemo(() => toISODate(currentWeekStart), [currentWeekStart]);
  const currentWeekEndISO = useMemo(() => toISODate(currentWeekEnd), [currentWeekEnd]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);

  const weekLabel = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(currentWeekStart)} – ${fmt(currentWeekEnd)}`;
  }, [currentWeekStart, currentWeekEnd]);

  // ── Filtered entries ─────────────────────────────────────────────────────
  const visibleEntries = useMemo(() => {
    if (canViewAll && staffFilter) return entries.filter(e => e.clerkUserId === staffFilter);
    return entries;
  }, [entries, canViewAll, staffFilter]);

  // ── This week ────────────────────────────────────────────────────────────
  const thisWeekEntries = useMemo(() =>
    visibleEntries.filter(e => e.date >= currentWeekStartISO && e.date <= currentWeekEndISO),
    [visibleEntries, currentWeekStartISO, currentWeekEndISO]
  );

  const dayTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of thisWeekEntries) map.set(e.date, (map.get(e.date) ?? 0) + e.durationMinutes);
    return map;
  }, [thisWeekEntries]);

  const weekTotal = useMemo(() => thisWeekEntries.reduce((s, e) => s + e.durationMinutes, 0), [thisWeekEntries]);

  // ── Past weeks grouped ────────────────────────────────────────────────────
  const pastWeekGroups = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const e of visibleEntries) {
      if (!e.date || e.date >= currentWeekStartISO) continue;
      const d = new Date(e.date + "T12:00:00");
      if (isNaN(d.getTime())) continue; // skip invalid dates
      const ws = toISODate(getWeekStart(d));
      if (!map.has(ws)) map.set(ws, []);
      map.get(ws)!.push(e);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([ws, wEntries]) => {
        const start = new Date(ws + "T12:00:00");
        const end = addDays(start, 6);
        const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return {
          key: ws,
          label: `${fmt(start)} – ${fmt(end)}`,
          totalMins: wEntries.reduce((s, e) => s + e.durationMinutes, 0),
          entries: [...wEntries].sort((a, b) => b.date.localeCompare(a.date)),
        };
      });
  }, [visibleEntries, currentWeekStartISO]);

  // ── Live staff fetch for filter combobox ─────────────────────────────────
  useEffect(() => {
    if (!canViewAll) return;
    setLoadingFilterStaff(true);
    fetch("/api/admin/staff", { credentials: "same-origin" })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.staff)) {
          const opts: StaffOption[] = data.staff
            .filter((s: { isActive: boolean }) => s.isActive)
            .map((s: { clerkUserId: string; displayName: string; email: string; role: string }) => ({
              id: s.clerkUserId,
              name: s.displayName,
              email: s.email,
              role: s.role,
            }))
            .sort((a: StaffOption, b: StaffOption) => a.name.localeCompare(b.name));
          setLiveFilterStaff(opts);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingFilterStaff(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewAll]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openNew() { setEditEntry(undefined); setShowModal(true); }
  function openEdit(entry: TimeEntry) { setEditEntry(entry); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditEntry(undefined); }

  function handleSaved(newEntries: TimeEntry[], deletedId?: string) {
    setEntries(prev => {
      // Remove the original entry if it was replaced by a split
      let result = deletedId ? prev.filter(e => e.id !== deletedId) : [...prev];
      for (const saved of newEntries) {
        const idx = result.findIndex(e => e.id === saved.id);
        if (idx >= 0) result = result.map(e => e.id === saved.id ? saved : e);
        else result = [saved, ...result];
      }
      return result;
    });
    closeModal();
  }

  function handleDeleted(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
    closeModal();
  }

  function toggleWeek(key: string) {
    setOpenWeeks(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  }

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayStr = todayISO();
  const displayDays = showWeekends ? weekDays : weekDays.slice(0, 5);
  const displayLabels = showWeekends ? DAY_LABELS : DAY_LABELS.slice(0, 5);

  return (
    <div>
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {canViewAll && (
          <StaffFilterCombobox
            value={staffFilter}
            onChange={setStaffFilter}
            options={liveFilterStaff}
            loading={loadingFilterStaff}
          />
        )}
        <div className="flex-1" />
        <button
          onClick={() => setShowWeekends(v => !v)}
          className="px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 hover:border-gray-600 transition-colors"
        >
          {showWeekends ? "5-day" : "7-day"}
        </button>
        {canViewAll && (
          <button onClick={() => setShowExportModal(true)}
            className="px-4 py-2 rounded-xl text-sm text-gray-300 hover:text-white bg-gray-800 border border-gray-700 hover:border-gray-600 transition-colors">
            Export CSV
          </button>
        )}
        <button onClick={openNew}
          className="px-4 py-2 rounded-xl text-sm bg-forest-600 text-white hover:bg-forest-500 transition-colors font-medium">
          + Log Time
        </button>
      </div>

      {/* This week label + day grid */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
          This Week · {weekLabel}
        </p>
        {dateFilter && (
          <button
            onClick={() => setDateFilter(null)}
            className="text-xs text-forest-400 hover:text-forest-300 transition-colors flex items-center gap-1"
          >
            {new Date(dateFilter + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            <span className="text-gray-500">· clear ×</span>
          </button>
        )}
      </div>
      <div className={`grid ${showWeekends ? "grid-cols-8" : "grid-cols-6"} gap-2 mb-6`}>
        {displayDays.map((day, i) => {
          const iso = toISODate(day);
          const mins = dayTotals.get(iso) ?? 0;
          const isToday = iso === todayStr;
          const isSelected = dateFilter === iso;
          return (
            <button
              key={iso}
              onClick={() => setDateFilter(prev => prev === iso ? null : iso)}
              className={`bg-gray-800 border rounded-xl p-3 text-center transition-colors hover:border-forest-400 ${
                isSelected ? "border-forest-400 ring-1 ring-forest-400" : "border-gray-700"
              }`}
            >
              <p className={`text-xs mb-1 ${isToday ? "text-forest-400 font-semibold" : "text-gray-400"}`}>{displayLabels[i]}</p>
              <div className="flex items-center justify-center">
                {isToday ? (
                  <span className="w-6 h-6 rounded-full bg-forest-500 flex items-center justify-center text-xs font-bold text-white">
                    {day.toLocaleDateString("en-US", { day: "numeric" })}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-white">{day.toLocaleDateString("en-US", { day: "numeric" })}</span>
                )}
              </div>
              <p className={`text-xs mt-1 font-semibold ${mins > 0 ? "text-forest-400" : "text-gray-600"}`}>
                {mins > 0 ? formatDuration(mins) : "—"}
              </p>
            </button>
          );
        })}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Total</p>
          <p className="text-xs font-medium text-white">&nbsp;</p>
          <p className={`text-xs mt-1 font-bold ${weekTotal > 0 ? "text-white" : "text-gray-600"}`}>
            {weekTotal > 0 ? formatDuration(weekTotal) : "—"}
          </p>
        </div>
      </div>

      {/* This week entries */}
      {(() => {
        const displayEntries = dateFilter
          ? thisWeekEntries.filter(e => e.date === dateFilter)
          : thisWeekEntries;
        return (
        <div className="space-y-2">
          {displayEntries.length === 0 ? (
            <div className="text-center py-10 text-gray-600">
              <p className="text-sm">{dateFilter ? "No entries for this day." : "No entries this week."}</p>
              {!dateFilter && (
                <button onClick={openNew} className="mt-2 text-sm text-forest-400 hover:text-forest-300 transition-colors">
                  + Log time
                </button>
              )}
            </div>
          ) : (
            displayEntries.map(entry => (
              <EntryRow key={entry.id} entry={entry} canViewAll={canViewAll} currentUserId={currentUserId} onEdit={openEdit} />
            ))
          )}
        </div>
        );
      })()}

      {/* Past weeks accordion */}
      {pastWeekGroups.length > 0 && (
        <div className="mt-6 border-t border-gray-800 pt-4 space-y-0.5">
          {pastWeekGroups.map(({ key, label, totalMins, entries: wEntries }) => {
            const isOpen = openWeeks.has(key);
            return (
              <div key={key}>
                <button
                  onClick={() => toggleWeek(key)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-800 transition-colors text-left group"
                >
                  <div className="flex items-center gap-2">
                    <svg className={`w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-all duration-150 ${isOpen ? "rotate-90" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm text-gray-500 group-hover:text-gray-300 transition-colors">{label}</span>
                  </div>
                  <span className="text-xs text-gray-600 font-medium group-hover:text-gray-400 transition-colors">
                    {formatDuration(totalMins)}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-2 mt-1 mb-2 pl-5">
                    {wEntries.map(entry => (
                      <EntryRow key={entry.id} entry={entry} canViewAll={canViewAll} currentUserId={currentUserId} onEdit={openEdit} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Log Time Modal */}
      {showModal && (
        <LogTimeModal
          entry={editEntry}
          tenants={tenants}
          onClose={closeModal}
          onSaved={handleSaved}
          onDeleted={editEntry ? handleDeleted : undefined}
          staffMembers={staffMembers}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          services={services}
          todayShift={editEntry ? undefined : todayShift}
        />
      )}

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          entries={visibleEntries}
          onClose={() => setShowExportModal(false)}
          weekStart={currentWeekStart}
        />
      )}
    </div>
  );
}
