"use client";

import { useState, useEffect, useCallback } from "react";
import { Pagination } from "../components/Pagination";

const PAGE_SIZE = 25;
const TODAY = new Date().toISOString().slice(0, 10);
const FIRST_OF_MONTH = TODAY.slice(0, 8) + "01";

type Tab = "hours" | "commission" | "mileage" | "expenses";

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

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

// ─── Filter Bar ───────────────────────────────────────────────────────────────
interface FilterBarProps {
  from: string;
  to: string;
  staffId: string;
  paid: string;
  staffMembers: StaffOption[];
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onStaffChange: (v: string) => void;
  onPaidChange: (v: string) => void;
}

function FilterBar({ from, to, staffId, paid, staffMembers, onFromChange, onToChange, onStaffChange, onPaidChange }: FilterBarProps) {
  const inputCls = "h-8 px-2 text-sm rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-1 focus:ring-forest-500";
  return (
    <div className="flex flex-wrap gap-2 mb-4 items-center">
      <input type="date" value={from} onChange={e => onFromChange(e.target.value)} className={inputCls} />
      <span className="text-gray-500 text-sm">to</span>
      <input type="date" value={to} onChange={e => onToChange(e.target.value)} className={inputCls} />
      <select value={staffId} onChange={e => onStaffChange(e.target.value)} className={inputCls}>
        <option value="">All Staff</option>
        {staffMembers.map(s => <option key={s.clerkUserId} value={s.clerkUserId}>{s.displayName}</option>)}
      </select>
      <select value={paid} onChange={e => onPaidChange(e.target.value)} className={inputCls}>
        <option value="all">All</option>
        <option value="false">Unpaid</option>
        <option value="true">Paid</option>
      </select>
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(PAGE_SIZE) });
      if (staffId) params.set("staffId", staffId);
      if (paid !== "all") params.set("paid", paid);
      const res = await fetch(`/api/admin/pay/hours?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [from, to, staffId, paid, page]);

  useEffect(() => { setPage(1); }, [from, to, staffId, paid]);
  useEffect(() => { load(); }, [load]);

  async function markPaid() {
    if (!selected.size) return;
    setMarking(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pay/hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], hoursPaidAt: TODAY }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelected(new Set());
      await load();
    } catch (e) { setError(String(e)); }
    finally { setMarking(false); }
  }

  const allIds = rows.map(r => r.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));

  function toggleAll() {
    if (allSelected) setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.delete(id)); return n; });
    else setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.add(id)); return n; });
  }

  return (
    <div>
      <FilterBar from={from} to={to} staffId={staffId} paid={paid} staffMembers={staffMembers}
        onFromChange={setFrom} onToChange={setTo} onStaffChange={setStaffId} onPaidChange={setPaid} />

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-400">{total} entries</p>
        {selected.size > 0 && (
          <button
            onClick={markPaid}
            disabled={marking}
            className="px-4 h-8 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            {marking ? "Marking…" : `Mark ${selected.size} as Paid`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-600 bg-gray-700" />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Staff</th>
              <th className="px-3 py-2.5 text-left font-medium">Project</th>
              <th className="px-3 py-2.5 text-right font-medium">Hours</th>
              <th className="px-3 py-2.5 text-right font-medium">Rate</th>
              <th className="px-3 py-2.5 text-right font-medium">Pay</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="py-8 text-center text-gray-500">No entries found.</td></tr>
            ) : rows.map(row => (
              <tr key={row.id} className="border-t border-gray-800 hover:bg-gray-800/40">
                <td className="px-3 py-2.5 text-center">
                  <input type="checkbox" checked={selected.has(row.id)}
                    onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(row.id) : n.delete(row.id); return n; })}
                    className="rounded border-gray-600 bg-gray-700" />
                </td>
                <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap">{row.date}</td>
                <td className="px-3 py-2.5 text-white">{row.staffName}</td>
                <td className="px-3 py-2.5 text-gray-300 max-w-[200px] truncate">{row.projectName}</td>
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(PAGE_SIZE) });
      if (staffId) params.set("staffId", staffId);
      if (paid !== "all") params.set("paid", paid);
      const res = await fetch(`/api/admin/pay/commission?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [from, to, staffId, paid, page]);

  useEffect(() => { setPage(1); }, [from, to, staffId, paid]);
  useEffect(() => { load(); }, [load]);

  async function markPaid() {
    if (!selected.size) return;
    setMarking(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pay/commission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], commissionPaidAt: TODAY }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelected(new Set());
      await load();
    } catch (e) { setError(String(e)); }
    finally { setMarking(false); }
  }

  const allIds = rows.map(r => r.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  function toggleAll() {
    if (allSelected) setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.delete(id)); return n; });
    else setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.add(id)); return n; });
  }

  return (
    <div>
      <FilterBar from={from} to={to} staffId={staffId} paid={paid} staffMembers={staffMembers}
        onFromChange={setFrom} onToChange={setTo} onStaffChange={setStaffId} onPaidChange={setPaid} />

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-400">{total} items</p>
        {selected.size > 0 && (
          <button onClick={markPaid} disabled={marking}
            className="px-4 h-8 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors">
            {marking ? "Marking…" : `Mark ${selected.size} as Paid`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-600 bg-gray-700" />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">Item</th>
              <th className="px-3 py-2.5 text-left font-medium">Route</th>
              <th className="px-3 py-2.5 text-left font-medium">Staff</th>
              <th className="px-3 py-2.5 text-right font-medium">Sale Date</th>
              <th className="px-3 py-2.5 text-right font-medium">Sale Price</th>
              <th className="px-3 py-2.5 text-right font-medium">Comm%</th>
              <th className="px-3 py-2.5 text-right font-medium">Comm$</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-500">No items found.</td></tr>
            ) : rows.map(row => (
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
  const [selected, setSelected] = useState<Set<string>>(new Set()); // key = `clerkUserId::date`
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(PAGE_SIZE) });
      if (staffId) params.set("staffId", staffId);
      if (paid !== "all") params.set("paid", paid);
      const res = await fetch(`/api/admin/pay/mileage?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [from, to, staffId, paid, page]);

  useEffect(() => { setPage(1); }, [from, to, staffId, paid]);
  useEffect(() => { load(); }, [load]);

  async function markPaid() {
    // Collect all entryIds for selected rows
    const entryIds: string[] = [];
    for (const row of rows) {
      const key = `${row.clerkUserId}::${row.date}`;
      if (selected.has(key)) entryIds.push(...row.entryIds);
    }
    if (!entryIds.length) return;
    setMarking(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pay/mileage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryIds, mileagePaidAt: TODAY }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelected(new Set());
      await load();
    } catch (e) { setError(String(e)); }
    finally { setMarking(false); }
  }

  const rowKeys = rows.map(r => `${r.clerkUserId}::${r.date}`);
  const allSelected = rowKeys.length > 0 && rowKeys.every(k => selected.has(k));
  function toggleAll() {
    if (allSelected) setSelected(prev => { const n = new Set(prev); rowKeys.forEach(k => n.delete(k)); return n; });
    else setSelected(prev => { const n = new Set(prev); rowKeys.forEach(k => n.add(k)); return n; });
  }

  return (
    <div>
      <FilterBar from={from} to={to} staffId={staffId} paid={paid} staffMembers={staffMembers}
        onFromChange={setFrom} onToChange={setTo} onStaffChange={setStaffId} onPaidChange={setPaid} />

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-400">{total} days with travel</p>
        {selected.size > 0 && (
          <button onClick={markPaid} disabled={marking}
            className="px-4 h-8 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors">
            {marking ? "Marking…" : `Mark ${selected.size} day${selected.size !== 1 ? "s" : ""} as Paid`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-600 bg-gray-700" />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Staff</th>
              <th className="px-3 py-2.5 text-right font-medium">Total Miles</th>
              <th className="px-3 py-2.5 text-right font-medium">−20 Deduction</th>
              <th className="px-3 py-2.5 text-right font-medium">Reimbursable</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">No mileage entries found.</td></tr>
            ) : rows.map(row => {
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(PAGE_SIZE) });
      if (staffId) params.set("staffId", staffId);
      if (paid !== "all") params.set("paid", paid);
      const res = await fetch(`/api/admin/pay/expenses?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [from, to, staffId, paid, page]);

  useEffect(() => { setPage(1); }, [from, to, staffId, paid]);
  useEffect(() => { load(); }, [load]);

  async function markPaid() {
    if (!selected.size) return;
    setMarking(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pay/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], paidAt: TODAY }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSelected(new Set());
      await load();
    } catch (e) { setError(String(e)); }
    finally { setMarking(false); }
  }

  const allIds = rows.map(r => r.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  function toggleAll() {
    if (allSelected) setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.delete(id)); return n; });
    else setSelected(prev => { const n = new Set(prev); allIds.forEach(id => n.add(id)); return n; });
  }

  return (
    <div>
      <FilterBar from={from} to={to} staffId={staffId} paid={paid} staffMembers={staffMembers}
        onFromChange={setFrom} onToChange={setTo} onStaffChange={setStaffId} onPaidChange={setPaid} />

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-400">{total} expenses</p>
        {selected.size > 0 && (
          <button onClick={markPaid} disabled={marking}
            className="px-4 h-8 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors">
            {marking ? "Marking…" : `Mark ${selected.size} as Paid`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-600 bg-gray-700" />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">Date</th>
              <th className="px-3 py-2.5 text-left font-medium">Staff</th>
              <th className="px-3 py-2.5 text-left font-medium">Vendor</th>
              <th className="px-3 py-2.5 text-left font-medium">Category</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-gray-500">No reimbursable expenses found.</td></tr>
            ) : rows.map(row => (
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

// ─── Main Component ───────────────────────────────────────────────────────────
export function PayAdminClient({ staffMembers }: { staffMembers: StaffOption[] }) {
  const [tab, setTab] = useState<Tab>("hours");

  const tabs: { id: Tab; label: string }[] = [
    { id: "hours", label: "Hours" },
    { id: "commission", label: "Commission" },
    { id: "mileage", label: "Mileage" },
    { id: "expenses", label: "Expenses" },
  ];

  return (
    <div>
      {/* Tab nav */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "hours" && <HoursTab staffMembers={staffMembers} />}
      {tab === "commission" && <CommissionTab staffMembers={staffMembers} />}
      {tab === "mileage" && <MileageTab staffMembers={staffMembers} />}
      {tab === "expenses" && <ExpensesTab staffMembers={staffMembers} />}
    </div>
  );
}
