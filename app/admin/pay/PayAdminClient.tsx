"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Pagination } from "../components/Pagination";

const PAGE_SIZE = 25;
const TODAY = new Date().toISOString().slice(0, 10);
const FIRST_OF_MONTH = TODAY.slice(0, 8) + "01";

type Tab = "hours" | "commission" | "mileage" | "travel" | "expenses";
type SortDir = "asc" | "desc";

interface StaffOption {
  clerkUserId: string;
  displayName: string;
}

// ─── Row types ────────────────────────────────────────────────────────────────
interface HoursRow {
  id: string;
  date: string;
  clerkUserId: string;
  staffName: string;
  projectName: string;
  focusArea: string;
  durationMinutes: number;
  hourlyRate: number;
  pay: number;
  hoursPaidAt: string | null;
  nonBillable: boolean;
}

interface CommissionRow {
  id: string;
  itemName: string;
  primaryRoute: string;
  staffSellerId: string;
  staffSellerName: string;
  saleDate: string;
  salePrice: number;
  staffCommissionPercent: number;
  commissionAmount: number;
  commissionPaidAt: string | null;
}

interface MileageRow {
  clerkUserId: string;
  staffName: string;
  date: string;
  totalMiles: number;
  reimbursableMiles: number;
  entryIds: string[];
  mileagePaidAt: string | null;
}

interface ExpenseRow {
  id: string;
  date: string;
  clerkUserId: string;
  staffName: string;
  vendor: string;
  category: string;
  description: string;
  total: number;
  paidAt: string | null;
}

interface TravelRow {
  entryId: string;
  clerkUserId: string;
  staffName: string;
  date: string;
  projectName: string;
  totalTravelMinutes: number;
  commuteMinutes: number;
  payableMinutes: number;
  hourlyRate: number;
  pay: number;
  travelPaidAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sortRows<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

// ─── PaidBadge ────────────────────────────────────────────────────────────────
function PaidBadge({ paidAt }: { paidAt: string | null }) {
  if (paidAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-300 border border-green-800">
        Paid {new Date(paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
      Unpaid
    </span>
  );
}

// ─── SortableHeader ───────────────────────────────────────────────────────────
function SortableHeader({
  label, col, sortKey, sortDir, onSort, className = "",
}: {
  label: string; col: string; sortKey: string; sortDir: SortDir; onSort: (col: string) => void; className?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      className={`px-3 py-2.5 font-medium cursor-pointer select-none whitespace-nowrap group ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <svg
          className={`w-3 h-3 transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          {active && sortDir === "asc"
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          }
        </svg>
      </span>
    </th>
  );
}

// ─── StaffCombobox ────────────────────────────────────────────────────────────
function StaffCombobox({
  staffMembers, value, onChange,
}: {
  staffMembers: StaffOption[]; value: string; onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sync display name when value changes externally (e.g. cleared)
  const selectedName = staffMembers.find(s => s.clerkUserId === value)?.displayName ?? "";
  const [inputVal, setInputVal] = useState(selectedName);
  useEffect(() => { setInputVal(selectedName); }, [selectedName]);

  const filtered = query.trim() === ""
    ? staffMembers
    : staffMembers.filter(s => s.displayName.toLowerCase().includes(query.toLowerCase()));

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(s: StaffOption) {
    onChange(s.clerkUserId);
    setInputVal(s.displayName);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setInputVal("");
    setQuery("");
  }

  const inputCls = "h-8 px-2 text-sm rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-1 focus:ring-forest-500 w-44";

  return (
    <div ref={ref} className="relative">
      <div className="relative flex items-center">
        <input
          className={inputCls}
          placeholder="All Staff"
          value={open ? query : inputVal}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
        />
        {value && (
          <button
            onClick={clear}
            className="absolute right-2 text-gray-500 hover:text-gray-300"
            tabIndex={-1}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            <button
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
              onMouseDown={() => { onChange(""); setInputVal(""); setQuery(""); setOpen(false); }}
            >
              All Staff
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-500">No matches</p>
            ) : filtered.map(s => (
              <button
                key={s.clerkUserId}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors ${
                  s.clerkUserId === value ? "text-white font-medium bg-gray-700/60" : "text-gray-300"
                }`}
                onMouseDown={() => select(s)}
              >
                {s.displayName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
interface FilterBarProps {
  from: string; to: string; staffId: string; paid: string;
  staffMembers: StaffOption[];
  onFromChange: (v: string) => void; onToChange: (v: string) => void;
  onStaffChange: (v: string) => void; onPaidChange: (v: string) => void;
}

function FilterBar({ from, to, staffId, paid, staffMembers, onFromChange, onToChange, onStaffChange, onPaidChange }: FilterBarProps) {
  const inputCls = "h-8 px-2 text-sm rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-1 focus:ring-forest-500";
  return (
    <div className="flex flex-wrap gap-2 mb-4 items-center">
      <input type="date" value={from} onChange={e => onFromChange(e.target.value)} className={inputCls} />
      <span className="text-gray-500 text-sm">to</span>
      <input type="date" value={to} onChange={e => onToChange(e.target.value)} className={inputCls} />
      <StaffCombobox staffMembers={staffMembers} value={staffId} onChange={onStaffChange} />
      <select value={paid} onChange={e => onPaidChange(e.target.value)} className={inputCls}>
        <option value="all">All</option>
        <option value="false">Unpaid</option>
        <option value="true">Paid</option>
      </select>
    </div>
  );
}

// ─── Mark Paid bar ────────────────────────────────────────────────────────────
function MarkPaidBar({ total, label, selected, marking, onMark }: {
  total: number; label: string; selected: number; marking: boolean; onMark: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm text-gray-400">{total} {label}</p>
      {selected > 0 && (
        <button onClick={onMark} disabled={marking}
          className="px-4 h-8 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors">
          {marking ? "Marking…" : `Mark ${selected} as Paid`}
        </button>
      )}
    </div>
  );
}

// ─── Hours Tab ────────────────────────────────────────────────────────────────
function HoursTab({ staffMembers }: { staffMembers: StaffOption[] }) {
  const [from, setFrom] = useState(FIRST_OF_MONTH);
  const [to, setTo] = useState(TODAY);
  const [staffId, setStaffId] = useState("");
  const [paid, setPaid] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<HoursRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<keyof HoursRow>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(PAGE_SIZE) });
      if (staffId) params.set("staffId", staffId);
      if (paid !== "all") params.set("paid", paid);
      const res = await fetch(`/api/admin/pay/hours?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setRows(data.rows); setTotal(data.total);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [from, to, staffId, paid, page]);

  useEffect(() => { setPage(1); }, [from, to, staffId, paid]);
  useEffect(() => { load(); }, [load]);

  function handleSort(col: string) {
    const key = col as keyof HoursRow;
    setSortDir(sortKey === key && sortDir === "asc" ? "desc" : "asc");
    setSortKey(key);
  }

  async function markPaid() {
    if (!selected.size) return;
    setMarking(true); setError("");
    try {
      const res = await fetch("/api/admin/pay/hours", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], hoursPaidAt: TODAY }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelected(new Set()); await load();
    } catch (e) { setError(String(e)); }
    finally { setMarking(false); }
  }

  const sorted = sortRows(rows, sortKey, sortDir);
  const allIds = rows.map(r => r.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  function toggleAll() {
    if (allSelected) setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.delete(id)); return n; });
    else setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.add(id)); return n; });
  }

  const sh = (label: string, col: string, className?: string) => (
    <SortableHeader label={label} col={col} sortKey={String(sortKey)} sortDir={sortDir} onSort={handleSort} className={className} />
  );

  return (
    <div>
      <FilterBar from={from} to={to} staffId={staffId} paid={paid} staffMembers={staffMembers}
        onFromChange={setFrom} onToChange={setTo} onStaffChange={setStaffId} onPaidChange={setPaid} />
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <MarkPaidBar total={total} label="entries" selected={selected.size} marking={marking} onMark={markPaid} />

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-600 bg-gray-700" />
              </th>
              {sh("Date", "date")}
              {sh("Staff", "staffName")}
              {sh("Project", "projectName")}
              {sh("Hours", "durationMinutes", "text-right")}
              {sh("Rate", "hourlyRate", "text-right")}
              {sh("Pay", "pay", "text-right")}
              {sh("Status", "hoursPaidAt")}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-500">No entries found.</td></tr>
            ) : sorted.map(row => (
              <tr key={row.id} className="border-t border-gray-800 hover:bg-gray-800/40">
                <td className="px-3 py-2.5 text-center">
                  <input type="checkbox" checked={selected.has(row.id)}
                    onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(row.id) : n.delete(row.id); return n; })}
                    className="rounded border-gray-600 bg-gray-700" />
                </td>
                <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{row.date}</td>
                <td className="px-3 py-2.5 text-white">{row.staffName}</td>
                <td className="px-3 py-2.5 max-w-[200px] truncate">
                  {row.nonBillable
                    ? <span className="text-gray-500 italic">NonBillable</span>
                    : <span className="text-gray-300">{row.projectName}</span>
                  }
                </td>
                <td className="px-3 py-2.5 text-right text-gray-300">{(row.durationMinutes / 60).toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right text-gray-400">{row.hourlyRate > 0 ? fmt$(row.hourlyRate) : "—"}</td>
                <td className="px-3 py-2.5 text-right text-white font-medium">{row.hourlyRate > 0 ? fmt$(row.pay) : "—"}</td>
                <td className="px-3 py-2.5"><PaidBadge paidAt={row.hoursPaidAt} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}

// ─── Commission Tab ───────────────────────────────────────────────────────────
function CommissionTab({ staffMembers }: { staffMembers: StaffOption[] }) {
  const [from, setFrom] = useState(FIRST_OF_MONTH);
  const [to, setTo] = useState(TODAY);
  const [staffId, setStaffId] = useState("");
  const [paid, setPaid] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<keyof CommissionRow>("saleDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(PAGE_SIZE) });
      if (staffId) params.set("staffId", staffId);
      if (paid !== "all") params.set("paid", paid);
      const res = await fetch(`/api/admin/pay/commission?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setRows(data.rows); setTotal(data.total);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [from, to, staffId, paid, page]);

  useEffect(() => { setPage(1); }, [from, to, staffId, paid]);
  useEffect(() => { load(); }, [load]);

  function handleSort(col: string) {
    const key = col as keyof CommissionRow;
    setSortDir(sortKey === key && sortDir === "asc" ? "desc" : "asc");
    setSortKey(key);
  }

  async function markPaid() {
    if (!selected.size) return;
    setMarking(true); setError("");
    try {
      const res = await fetch("/api/admin/pay/commission", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], commissionPaidAt: TODAY }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelected(new Set()); await load();
    } catch (e) { setError(String(e)); }
    finally { setMarking(false); }
  }

  const sorted = sortRows(rows, sortKey, sortDir);
  const allIds = rows.map(r => r.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  function toggleAll() {
    if (allSelected) setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.delete(id)); return n; });
    else setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.add(id)); return n; });
  }

  const sh = (label: string, col: string, className?: string) => (
    <SortableHeader label={label} col={col} sortKey={String(sortKey)} sortDir={sortDir} onSort={handleSort} className={className} />
  );

  return (
    <div>
      <FilterBar from={from} to={to} staffId={staffId} paid={paid} staffMembers={staffMembers}
        onFromChange={setFrom} onToChange={setTo} onStaffChange={setStaffId} onPaidChange={setPaid} />
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <MarkPaidBar total={total} label="items" selected={selected.size} marking={marking} onMark={markPaid} />

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-600 bg-gray-700" />
              </th>
              {sh("Item", "itemName")}
              {sh("Route", "primaryRoute")}
              {sh("Staff", "staffSellerName")}
              {sh("Sale Date", "saleDate", "text-right")}
              {sh("Sale Price", "salePrice", "text-right")}
              {sh("Comm%", "staffCommissionPercent", "text-right")}
              {sh("Comm$", "commissionAmount", "text-right")}
              {sh("Status", "commissionPaidAt")}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-500">No items found.</td></tr>
            ) : sorted.map(row => (
              <tr key={row.id} className="border-t border-gray-800 hover:bg-gray-800/40">
                <td className="px-3 py-2.5 text-center">
                  <input type="checkbox" checked={selected.has(row.id)}
                    onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(row.id) : n.delete(row.id); return n; })}
                    className="rounded border-gray-600 bg-gray-700" />
                </td>
                <td className="px-3 py-2.5 text-white max-w-[180px] truncate">{row.itemName}</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">{row.primaryRoute}</td>
                <td className="px-3 py-2.5 text-gray-300">{row.staffSellerName}</td>
                <td className="px-3 py-2.5 text-right text-gray-300 whitespace-nowrap">{row.saleDate}</td>
                <td className="px-3 py-2.5 text-right text-gray-300">{fmt$(row.salePrice)}</td>
                <td className="px-3 py-2.5 text-right text-gray-400">{row.staffCommissionPercent}%</td>
                <td className="px-3 py-2.5 text-right text-white font-medium">{fmt$(row.commissionAmount)}</td>
                <td className="px-3 py-2.5"><PaidBadge paidAt={row.commissionPaidAt} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}

// ─── Mileage Tab ──────────────────────────────────────────────────────────────
function MileageTab({ staffMembers }: { staffMembers: StaffOption[] }) {
  const [from, setFrom] = useState(FIRST_OF_MONTH);
  const [to, setTo] = useState(TODAY);
  const [staffId, setStaffId] = useState("");
  const [paid, setPaid] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<MileageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<keyof MileageRow>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(PAGE_SIZE) });
      if (staffId) params.set("staffId", staffId);
      if (paid !== "all") params.set("paid", paid);
      const res = await fetch(`/api/admin/pay/mileage?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setRows(data.rows); setTotal(data.total);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [from, to, staffId, paid, page]);

  useEffect(() => { setPage(1); }, [from, to, staffId, paid]);
  useEffect(() => { load(); }, [load]);

  function handleSort(col: string) {
    const key = col as keyof MileageRow;
    setSortDir(sortKey === key && sortDir === "asc" ? "desc" : "asc");
    setSortKey(key);
  }

  async function markPaid() {
    const entryIds: string[] = [];
    for (const row of rows) {
      const key = `${row.clerkUserId}::${row.date}`;
      if (selected.has(key)) entryIds.push(...row.entryIds);
    }
    if (!entryIds.length) return;
    setMarking(true); setError("");
    try {
      const res = await fetch("/api/admin/pay/mileage", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryIds, mileagePaidAt: TODAY }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelected(new Set()); await load();
    } catch (e) { setError(String(e)); }
    finally { setMarking(false); }
  }

  const sorted = sortRows(rows, sortKey, sortDir);
  const rowKeys = rows.map(r => `${r.clerkUserId}::${r.date}`);
  const allSelected = rowKeys.length > 0 && rowKeys.every(k => selected.has(k));
  function toggleAll() {
    if (allSelected) setSelected(prev => { const n = new Set(prev); rowKeys.forEach(k => n.delete(k)); return n; });
    else setSelected(prev => { const n = new Set(prev); rowKeys.forEach(k => n.add(k)); return n; });
  }

  const sh = (label: string, col: string, className?: string) => (
    <SortableHeader label={label} col={col} sortKey={String(sortKey)} sortDir={sortDir} onSort={handleSort} className={className} />
  );

  return (
    <div>
      <FilterBar from={from} to={to} staffId={staffId} paid={paid} staffMembers={staffMembers}
        onFromChange={setFrom} onToChange={setTo} onStaffChange={setStaffId} onPaidChange={setPaid} />
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <MarkPaidBar total={total} label="days with travel" selected={selected.size} marking={marking} onMark={markPaid} />

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-600 bg-gray-700" />
              </th>
              {sh("Date", "date")}
              {sh("Staff", "staffName")}
              {sh("Total Miles", "totalMiles", "text-right")}
              {sh("−20 Deduction", "totalMiles", "text-right")}
              {sh("Reimbursable", "reimbursableMiles", "text-right")}
              {sh("Status", "mileagePaidAt")}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">No mileage entries found.</td></tr>
            ) : sorted.map(row => {
              const key = `${row.clerkUserId}::${row.date}`;
              return (
                <tr key={key} className="border-t border-gray-800 hover:bg-gray-800/40">
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={selected.has(key)}
                      onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(key) : n.delete(key); return n; })}
                      className="rounded border-gray-600 bg-gray-700" />
                  </td>
                  <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{row.date}</td>
                  <td className="px-3 py-2.5 text-white">{row.staffName}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300">{row.totalMiles.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-400">−{Math.min(20, row.totalMiles).toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right text-white font-medium">{row.reimbursableMiles.toFixed(1)}</td>
                  <td className="px-3 py-2.5"><PaidBadge paidAt={row.mileagePaidAt} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}

// ─── Expenses Tab ─────────────────────────────────────────────────────────────
function ExpensesTab({ staffMembers }: { staffMembers: StaffOption[] }) {
  const [from, setFrom] = useState(FIRST_OF_MONTH);
  const [to, setTo] = useState(TODAY);
  const [staffId, setStaffId] = useState("");
  const [paid, setPaid] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<keyof ExpenseRow>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(PAGE_SIZE) });
      if (staffId) params.set("staffId", staffId);
      if (paid !== "all") params.set("paid", paid);
      const res = await fetch(`/api/admin/pay/expenses?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setRows(data.rows); setTotal(data.total);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [from, to, staffId, paid, page]);

  useEffect(() => { setPage(1); }, [from, to, staffId, paid]);
  useEffect(() => { load(); }, [load]);

  function handleSort(col: string) {
    const key = col as keyof ExpenseRow;
    setSortDir(sortKey === key && sortDir === "asc" ? "desc" : "asc");
    setSortKey(key);
  }

  async function markPaid() {
    if (!selected.size) return;
    setMarking(true); setError("");
    try {
      const res = await fetch("/api/admin/pay/expenses", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], paidAt: TODAY }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelected(new Set()); await load();
    } catch (e) { setError(String(e)); }
    finally { setMarking(false); }
  }

  const sorted = sortRows(rows, sortKey, sortDir);
  const allIds = rows.map(r => r.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  function toggleAll() {
    if (allSelected) setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.delete(id)); return n; });
    else setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.add(id)); return n; });
  }

  const sh = (label: string, col: string, className?: string) => (
    <SortableHeader label={label} col={col} sortKey={String(sortKey)} sortDir={sortDir} onSort={handleSort} className={className} />
  );

  return (
    <div>
      <FilterBar from={from} to={to} staffId={staffId} paid={paid} staffMembers={staffMembers}
        onFromChange={setFrom} onToChange={setTo} onStaffChange={setStaffId} onPaidChange={setPaid} />
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <MarkPaidBar total={total} label="expenses" selected={selected.size} marking={marking} onMark={markPaid} />

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-600 bg-gray-700" />
              </th>
              {sh("Date", "date")}
              {sh("Staff", "staffName")}
              {sh("Vendor", "vendor")}
              {sh("Category", "category")}
              {sh("Amount", "total", "text-right")}
              {sh("Status", "paidAt")}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">No reimbursable expenses found.</td></tr>
            ) : sorted.map(row => (
              <tr key={row.id} className="border-t border-gray-800 hover:bg-gray-800/40">
                <td className="px-3 py-2.5 text-center">
                  <input type="checkbox" checked={selected.has(row.id)}
                    onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(row.id) : n.delete(row.id); return n; })}
                    className="rounded border-gray-600 bg-gray-700" />
                </td>
                <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{row.date}</td>
                <td className="px-3 py-2.5 text-white">{row.staffName}</td>
                <td className="px-3 py-2.5 text-gray-300">{row.vendor}</td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">{row.category}</td>
                <td className="px-3 py-2.5 text-right text-white font-medium">{fmt$(row.total)}</td>
                <td className="px-3 py-2.5"><PaidBadge paidAt={row.paidAt} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}

// ─── Travel Tab ───────────────────────────────────────────────────────────────
function fmtMins(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function TravelTab({ staffMembers }: { staffMembers: StaffOption[] }) {
  const [from, setFrom] = useState(FIRST_OF_MONTH);
  const [to, setTo] = useState(TODAY);
  const [staffId, setStaffId] = useState("");
  const [paid, setPaid] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TravelRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<keyof TravelRow>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(PAGE_SIZE) });
      if (staffId) params.set("staffId", staffId);
      if (paid !== "all") params.set("paid", paid);
      const res = await fetch(`/api/admin/pay/travel?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setRows(data.rows); setTotal(data.total);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [from, to, staffId, paid, page]);

  useEffect(() => { setPage(1); }, [from, to, staffId, paid]);
  useEffect(() => { load(); }, [load]);

  function handleSort(col: string) {
    const key = col as keyof TravelRow;
    setSortDir(sortKey === key && sortDir === "asc" ? "desc" : "asc");
    setSortKey(key);
  }

  async function markPaid() {
    if (!selected.size) return;
    setMarking(true); setError("");
    try {
      const res = await fetch("/api/admin/pay/travel", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], travelPaidAt: TODAY }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelected(new Set()); await load();
    } catch (e) { setError(String(e)); }
    finally { setMarking(false); }
  }

  const sorted = sortRows(rows, sortKey, sortDir);
  const allIds = rows.map(r => r.entryId);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  function toggleAll() {
    if (allSelected) setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.delete(id)); return n; });
    else setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.add(id)); return n; });
  }

  const sh = (label: string, col: string, className?: string) => (
    <SortableHeader label={label} col={col} sortKey={String(sortKey)} sortDir={sortDir} onSort={handleSort} className={className} />
  );

  return (
    <div>
      <FilterBar from={from} to={to} staffId={staffId} paid={paid} staffMembers={staffMembers}
        onFromChange={setFrom} onToChange={setTo} onStaffChange={setStaffId} onPaidChange={setPaid} />
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <MarkPaidBar total={total} label="travel entries" selected={selected.size} marking={marking} onMark={markPaid} />

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-600 bg-gray-700" />
              </th>
              {sh("Date", "date")}
              {sh("Staff", "staffName")}
              {sh("Project", "projectName")}
              {sh("Total Travel", "totalTravelMinutes", "text-right")}
              {sh("−30 Commute", "commuteMinutes", "text-right")}
              {sh("Payable", "payableMinutes", "text-right")}
              {sh("Rate", "hourlyRate", "text-right")}
              {sh("Pay", "pay", "text-right")}
              {sh("Status", "travelPaidAt")}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={10} className="py-8 text-center text-gray-500">No travel time entries found.</td></tr>
            ) : sorted.map(row => (
              <tr key={row.entryId} className="border-t border-gray-800 hover:bg-gray-800/40">
                <td className="px-3 py-2.5 text-center">
                  <input type="checkbox" checked={selected.has(row.entryId)}
                    onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(row.entryId) : n.delete(row.entryId); return n; })}
                    className="rounded border-gray-600 bg-gray-700" />
                </td>
                <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{row.date}</td>
                <td className="px-3 py-2.5 text-white">{row.staffName}</td>
                <td className="px-3 py-2.5 text-gray-300 max-w-[180px] truncate">{row.projectName}</td>
                <td className="px-3 py-2.5 text-right text-gray-300">{fmtMins(row.totalTravelMinutes)}</td>
                <td className="px-3 py-2.5 text-right text-gray-400">−{fmtMins(row.commuteMinutes)}</td>
                <td className="px-3 py-2.5 text-right text-gray-300">{fmtMins(row.payableMinutes)}</td>
                <td className="px-3 py-2.5 text-right text-gray-400">{row.hourlyRate > 0 ? fmt$(row.hourlyRate) : "—"}</td>
                <td className="px-3 py-2.5 text-right text-white font-medium">{row.hourlyRate > 0 ? fmt$(row.pay) : "—"}</td>
                <td className="px-3 py-2.5"><PaidBadge paidAt={row.travelPaidAt} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PayAdminClient({ staffMembers }: { staffMembers: StaffOption[] }) {
  const [tab, setTab] = useState<Tab>("hours");

  const tabs: { id: Tab; label: string }[] = [
    { id: "hours", label: "Hours" },
    { id: "commission", label: "Commission" },
    { id: "mileage", label: "Mileage" },
    { id: "travel", label: "Travel Time" },
    { id: "expenses", label: "Expenses" },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "hours" && <HoursTab staffMembers={staffMembers} />}
      {tab === "commission" && <CommissionTab staffMembers={staffMembers} />}
      {tab === "mileage" && <MileageTab staffMembers={staffMembers} />}
      {tab === "travel" && <TravelTab staffMembers={staffMembers} />}
      {tab === "expenses" && <ExpensesTab staffMembers={staffMembers} />}
    </div>
  );
}
