"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilterOption { id: string; name: string }

interface DashboardData {
  salesReps:          FilterOption[];
  staff:              FilterOption[];
  referralCompanies:  FilterOption[];
  referralContacts:   Array<FilterOption & { companyId: string | null; stage: string | null }>;
  signedContracts: Array<{
    id: string; tenantId: string; signedAt: string; totalCost: number;
    salesRepClerkId: string | null; referralContactId: string | null; referralCompanyId: string | null;
  }>;
  invoices: Array<{
    id: string; tenantId: string; date: string; amount: number;
    salesRepClerkId: string | null; referralContactId: string | null; referralCompanyId: string | null;
  }>;
  timeEntries: Array<{
    date: string; durationMinutes: number;
    staffClerkId: string | null; staffName: string | null; tenantId: string;
    salesRepClerkId: string | null;
  }>;
  activities: Array<{
    date: string; type: string; createdByClerkId: string;
    referralContactId: string | null; referralCompanyId: string | null;
  }>;
  soldItems: Array<{
    saleDate: string; salePrice: number; companyTake: number; channel: string;
    staffSellerId: string | null; salesRepClerkId: string | null;
  }>;
}

type Period = "W" | "M" | "Q";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtNum(n: number): string { return n.toLocaleString("en-US"); }
function fmtHrs(m: number): string {
  const h = m / 60;
  return h >= 100 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

function bucketKey(dateStr: string, period: Period): string {
  if (!dateStr || dateStr.length < 10) return "?";
  const s = dateStr.slice(0, 10);
  const [y, mo, d] = s.split("-").map(Number);
  if (period === "M") return `${y}-${String(mo).padStart(2, "0")}`;
  if (period === "Q") return `${y}-Q${Math.ceil(mo / 3)}`;
  // ISO week: find Monday
  const date = new Date(y, mo - 1, d);
  const dow = date.getDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  date.setDate(d - daysBack);
  return date.toISOString().slice(0, 10);
}

function bucketLabel(key: string, period: Period): string {
  if (!key || key === "?") return key;
  if (period === "Q") return key; // "2025-Q3"
  if (period === "M") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  // Weekly: "Jun 2"
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function last(n: number, period: Period): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    if (period === "W") d.setDate(now.getDate() - i * 7);
    else if (period === "M") d.setMonth(now.getMonth() - i);
    else d.setMonth(now.getMonth() - i * 3);
    keys.push(bucketKey(d.toISOString().slice(0, 10), period));
  }
  // Deduplicate while preserving order
  return [...new Set(keys)];
}

function periodCount(period: Period): number {
  return period === "W" ? 12 : period === "M" ? 12 : 8;
}

// ─── Autocomplete MultiSelect ─────────────────────────────────────────────────

function MultiSelect({
  label, options, selected, onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() =>
    options.filter(o => o.name.toLowerCase().includes(query.toLowerCase())).slice(0, 40),
    [options, query]
  );

  const toggle = useCallback((id: string) => {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  }, [selected, onChange]);

  const selectedNames = selected.map(id => options.find(o => o.id === id)?.name ?? id);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
          selected.length > 0
            ? "border-emerald-500 bg-emerald-50 text-emerald-800"
            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
        }`}
      >
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="bg-emerald-600 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
            {selected.length}
          </span>
        )}
        <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-64">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              placeholder={`Search ${label.toLowerCase()}…`}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-emerald-400"
            />
          </div>
          {selected.length > 0 && (
            <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1">
              {selectedNames.map((n, i) => (
                <span key={selected[i]} className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full">
                  {n}
                  <button onClick={() => toggle(selected[i])} className="hover:text-red-600">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400 text-center">No results</p>
            ) : filtered.map(o => (
              <label key={o.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="accent-emerald-600 w-3.5 h-3.5"
                />
                <span className="text-sm text-gray-700 truncate">{o.name}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-gray-100">
              <button
                onClick={() => { onChange([]); setQuery(""); }}
                className="w-full text-xs text-gray-500 hover:text-red-600 py-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = "emerald" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    emerald: "from-emerald-50 to-emerald-100/50 border-emerald-200",
    gold:    "from-amber-50 to-amber-100/50 border-amber-200",
    blue:    "from-blue-50 to-blue-100/50 border-blue-200",
    violet:  "from-violet-50 to-violet-100/50 border-violet-200",
    slate:   "from-slate-50 to-slate-100/50 border-slate-200",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color] ?? colors.emerald} border rounded-xl p-4`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Chart Section Wrapper ────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="mb-4">
        <p className="text-sm font-bold text-gray-800">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Tooltip formatters ───────────────────────────────────────────────────────

const moneyTick = (v: number) => fmt$(v);
const moneyTip  = ({ active, payload, label }: { active?: boolean; payload?: {name:string;value:number;color:string}[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmt$(p.value)}</p>
      ))}
    </div>
  );
};

const countTip  = ({ active, payload, label }: { active?: boolean; payload?: {name:string;value:number;color:string}[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmtNum(p.value)}</p>
      ))}
    </div>
  );
};

const hoursTip  = ({ active, payload, label }: { active?: boolean; payload?: {name:string;value:number;color:string}[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmtHrs((p.value as number) * 60)}</p>
      ))}
    </div>
  );
};

// ─── Main Dashboard ────────────────────────────────────────────────────────────

const SAGE   = "#2d4a3e";
const GOLD   = "#C9A96E";
const SLATE  = "#64748b";

// Item sale channel colors
const CHANNEL_COLORS: Record<string, string> = {
  "Facebook":     "#1877F2",
  "eBay / Online":"#E53238",
  "Estate Sale":  "#7C3AED",
  "ProFound":     "#2d4a3e",
  "Square":       "#3E4348",
  "Stripe":       "#635BFF",
  "Other":        "#9ca3af",
};

export default function OwnerDashboardClient() {
  // ── Auth gate ──
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState(false);

  // ── Data ──
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── View controls ──
  const [period, setPeriod] = useState<Period>("M");

  // ── Filters ──
  const [salesRepFilter,     setSalesRepFilter]     = useState<string[]>([]);
  const [staffFilter,        setStaffFilter]        = useState<string[]>([]);
  const [refCompanyFilter,   setRefCompanyFilter]   = useState<string[]>([]);
  const [refContactFilter,   setRefContactFilter]   = useState<string[]>([]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === "toptier123") { setAuthed(true); setPwError(false); }
    else setPwError(true);
  };

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetch("/api/admin/owner/data")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(String(err)); setLoading(false); });
  }, [authed]);

  // ── Gate ──────────────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-700 to-emerald-900 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Owner Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Top Tier Transitions</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                autoFocus
                placeholder="Enter password"
                value={pw}
                onChange={e => { setPw(e.target.value); setPwError(false); }}
                className={`w-full px-4 py-3 border rounded-xl text-sm outline-none transition-all ${
                  pwError ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-emerald-500"
                }`}
              />
              {pwError && <p className="text-xs text-red-600 mt-1.5">Incorrect password</p>}
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-emerald-700 to-emerald-900 text-white font-semibold rounded-xl text-sm hover:opacity-90 transition"
            >
              Enter Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Loading / error ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading financial data…</p>
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600 text-sm">{error ?? "Failed to load data"}</p>
      </div>
    );
  }

  // ── Filter helpers ────────────────────────────────────────────────────────────

  const anyFilterActive = salesRepFilter.length > 0 || staffFilter.length > 0 ||
                          refCompanyFilter.length > 0 || refContactFilter.length > 0;

  function filterContracts(rows: DashboardData["signedContracts"]) {
    return rows.filter(r => {
      if (salesRepFilter.length > 0 && !salesRepFilter.includes(r.salesRepClerkId ?? "")) return false;
      if (refCompanyFilter.length > 0 && !refCompanyFilter.includes(r.referralCompanyId ?? "")) return false;
      if (refContactFilter.length > 0 && !refContactFilter.includes(r.referralContactId ?? "")) return false;
      return true;
    });
  }
  function filterInvoices(rows: DashboardData["invoices"]) {
    return rows.filter(r => {
      if (salesRepFilter.length > 0 && !salesRepFilter.includes(r.salesRepClerkId ?? "")) return false;
      if (refCompanyFilter.length > 0 && !refCompanyFilter.includes(r.referralCompanyId ?? "")) return false;
      if (refContactFilter.length > 0 && !refContactFilter.includes(r.referralContactId ?? "")) return false;
      return true;
    });
  }
  function filterTime(rows: DashboardData["timeEntries"]) {
    return rows.filter(r => {
      if (staffFilter.length > 0 && !staffFilter.includes(r.staffClerkId ?? "")) return false;
      if (salesRepFilter.length > 0 && !salesRepFilter.includes(r.salesRepClerkId ?? "")) return false;
      return true;
    });
  }
  function filterActivities(rows: DashboardData["activities"]) {
    return rows.filter(r => {
      if (salesRepFilter.length > 0 && !salesRepFilter.includes(r.createdByClerkId)) return false;
      if (refCompanyFilter.length > 0 && !refCompanyFilter.includes(r.referralCompanyId ?? "")) return false;
      if (refContactFilter.length > 0 && !refContactFilter.includes(r.referralContactId ?? "")) return false;
      return true;
    });
  }
  function filterSold(rows: DashboardData["soldItems"]) {
    return rows.filter(r => {
      if (staffFilter.length > 0 && !staffFilter.includes(r.staffSellerId ?? "")) return false;
      if (salesRepFilter.length > 0 && !salesRepFilter.includes(r.salesRepClerkId ?? "")) return false;
      return true;
    });
  }

  // ── Compute all chart data ─────────────────────────────────────────────────

  const buckets = last(periodCount(period), period);

  // Revenue trend
  const contracts  = filterContracts(data.signedContracts);
  const invoices   = filterInvoices(data.invoices);
  const timeRows   = filterTime(data.timeEntries);
  const actRows    = filterActivities(data.activities);
  const soldRows   = filterSold(data.soldItems);

  // Signed + Earned per bucket
  const revData = useMemo(() => {
    const signedMap: Record<string, number> = {};
    const earnedMap: Record<string, number> = {};
    for (const c of contracts) {
      const k = bucketKey(c.signedAt, period);
      signedMap[k] = (signedMap[k] ?? 0) + c.totalCost;
    }
    for (const inv of invoices) {
      const k = bucketKey(inv.date, period);
      earnedMap[k] = (earnedMap[k] ?? 0) + inv.amount;
    }
    return buckets.map(k => ({
      label: bucketLabel(k, period),
      Signed: Math.round(signedMap[k] ?? 0),
      Earned: Math.round(earnedMap[k] ?? 0),
    }));
  }, [contracts, invoices, period, buckets]);

  // CRM activities per bucket by type
  const activityTypes = useMemo(() => [...new Set(actRows.map(a => a.type))].sort(), [actRows]);
  const actData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const a of actRows) {
      const k = bucketKey(a.date, period);
      if (!map[k]) map[k] = {};
      map[k][a.type] = (map[k][a.type] ?? 0) + 1;
    }
    return buckets.map(k => ({
      label: bucketLabel(k, period),
      ...Object.fromEntries(activityTypes.map(t => [t, map[k]?.[t] ?? 0])),
    }));
  }, [actRows, period, buckets, activityTypes]);

  // Hours by staff per bucket
  const activeStaffIds = useMemo(() => {
    const ids = new Set(timeRows.map(e => e.staffClerkId ?? "").filter(Boolean));
    return staffFilter.length > 0 ? staffFilter : [...ids];
  }, [timeRows, staffFilter]);

  const staffColors = ["#2d4a3e", "#C9A96E", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16"];
  const staffColorMap = useMemo(() =>
    Object.fromEntries(activeStaffIds.map((id, i) => [id, staffColors[i % staffColors.length]])),
    [activeStaffIds]
  );
  const staffNameMap = useMemo(() =>
    Object.fromEntries(data.staff.map(s => [s.id, s.name])),
    [data.staff]
  );

  const hoursData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const e of timeRows) {
      const k = bucketKey(e.date, period);
      const sid = e.staffClerkId ?? "unknown";
      if (!map[k]) map[k] = {};
      map[k][sid] = (map[k][sid] ?? 0) + e.durationMinutes;
    }
    return buckets.map(k => {
      const row: Record<string, number | string> = { label: bucketLabel(k, period) };
      for (const sid of activeStaffIds) {
        row[sid] = Math.round((map[k]?.[sid] ?? 0) / 60 * 10) / 10;
      }
      return row;
    });
  }, [timeRows, period, buckets, activeStaffIds]);

  // Item sales per bucket per channel
  const channels = useMemo(() => [...new Set(soldRows.map(i => i.channel))].sort(), [soldRows]);
  const channelColors = useMemo(() =>
    Object.fromEntries(channels.map(ch => [ch, CHANNEL_COLORS[ch] ?? "#9ca3af"])),
    [channels]
  );

  const itemSalesData = useMemo(() => {
    const countMap: Record<string, Record<string, number>> = {};
    const revenueMap: Record<string, Record<string, number>> = {};
    const takeMap: Record<string, Record<string, number>> = {};
    for (const item of soldRows) {
      const k = bucketKey(item.saleDate, period);
      const ch = item.channel;
      if (!countMap[k]) countMap[k] = {};
      if (!revenueMap[k]) revenueMap[k] = {};
      if (!takeMap[k]) takeMap[k] = {};
      countMap[k][ch] = (countMap[k][ch] ?? 0) + 1;
      revenueMap[k][ch] = (revenueMap[k][ch] ?? 0) + item.salePrice;
      takeMap[k][ch] = (takeMap[k][ch] ?? 0) + item.companyTake;
    }
    return buckets.map(k => ({
      label: bucketLabel(k, period),
      ...Object.fromEntries(channels.map(ch => [`count_${ch}`, countMap[k]?.[ch] ?? 0])),
      ...Object.fromEntries(channels.map(ch => [`rev_${ch}`, Math.round(revenueMap[k]?.[ch] ?? 0)])),
      ...Object.fromEntries(channels.map(ch => [`take_${ch}`, Math.round(takeMap[k]?.[ch] ?? 0)])),
    }));
  }, [soldRows, period, buckets, channels]);

  // Active referral partner companies per bucket (at least one activity logged)
  const activePartnersData = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const a of actRows) {
      if (!a.referralCompanyId) continue;
      const k = bucketKey(a.date, period);
      if (!map[k]) map[k] = new Set();
      map[k].add(a.referralCompanyId);
    }
    return buckets.map(k => ({
      label: bucketLabel(k, period),
      "Active Partners": map[k]?.size ?? 0,
    }));
  }, [actRows, period, buckets]);

  // ── KPI totals (all-time filtered) ───────────────────────────────────────────

  const totalSigned      = contracts.reduce((s, c) => s + c.totalCost, 0);
  const totalEarned      = invoices.reduce((s, i) => s + i.amount, 0);
  const totalHours       = timeRows.reduce((s, e) => s + e.durationMinutes, 0);
  const totalActivities  = actRows.length;
  const totalItemRevenue = soldRows.reduce((s, i) => s + i.salePrice, 0);
  const totalCompanyTake = soldRows.reduce((s, i) => s + i.companyTake, 0);
  const totalItemCount   = soldRows.length;
  const activePartnerCount = new Set(actRows.map(a => a.referralCompanyId).filter(Boolean)).size;

  const PERIOD_LABELS: Record<Period, string> = { W: "Weekly", M: "Monthly", Q: "Quarterly" };

  // Activity type color palette
  const actTypeColors = ["#2d4a3e", "#C9A96E", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-gray-900">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-[#1a2f25] to-[#2d4a3e] px-8 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-emerald-400 uppercase mb-0.5">Top Tier Transitions</p>
          <h1 className="text-xl font-bold text-white">Owner Financial Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          {(["W", "M", "Q"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === p
                  ? "bg-white text-emerald-900"
                  : "text-emerald-200 hover:bg-white/10"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white border-b border-gray-200 px-8 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-40 shadow-sm">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mr-1">Filter:</span>
        <MultiSelect
          label="Sales Rep"
          options={data.salesReps}
          selected={salesRepFilter}
          onChange={setSalesRepFilter}
        />
        <MultiSelect
          label="Staff"
          options={data.staff}
          selected={staffFilter}
          onChange={setStaffFilter}
        />
        <MultiSelect
          label="Referral Company"
          options={data.referralCompanies}
          selected={refCompanyFilter}
          onChange={setRefCompanyFilter}
        />
        <MultiSelect
          label="Referral Contact"
          options={data.referralContacts.map(c => ({ id: c.id, name: c.name }))}
          selected={refContactFilter}
          onChange={setRefContactFilter}
        />
        {anyFilterActive && (
          <button
            onClick={() => { setSalesRepFilter([]); setStaffFilter([]); setRefCompanyFilter([]); setRefContactFilter([]); }}
            className="ml-auto text-xs text-red-500 hover:text-red-700 font-medium"
          >
            Clear all filters
          </button>
        )}
      </div>

      <div className="px-8 py-6 space-y-6 max-w-[1600px] mx-auto">

        {/* ── KPI Strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <KpiCard label="Total Signed"      value={fmt$(totalSigned)}        color="emerald" />
          <KpiCard label="Total Earned"      value={fmt$(totalEarned)}        color="gold"    />
          <KpiCard label="Hours Logged"      value={fmtHrs(totalHours)}       color="blue"    />
          <KpiCard label="CRM Activities"    value={fmtNum(totalActivities)}  color="violet"  />
          <KpiCard label="Active Partners"   value={fmtNum(activePartnerCount)} color="slate" />
          <KpiCard label="Items Sold"        value={fmtNum(totalItemCount)}   color="emerald" />
          <KpiCard label="Item Revenue"      value={fmt$(totalItemRevenue)}   color="gold"    />
          <KpiCard label="Company Take"      value={fmt$(totalCompanyTake)}   color="emerald" />
        </div>

        {/* ── Row 1: Revenue + Activities ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ChartCard
            title="Revenue Trend"
            subtitle={`Signed contracts vs. earned revenue — ${PERIOD_LABELS[period].toLowerCase()}`}
          >
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradSigned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SAGE} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={SAGE} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradEarned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={GOLD} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={GOLD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={moneyTip as never} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="Signed" stroke={SAGE}  strokeWidth={2} fill="url(#gradSigned)" dot={false} />
                <Area type="monotone" dataKey="Earned" stroke={GOLD}  strokeWidth={2} fill="url(#gradEarned)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="CRM Activity Volume"
            subtitle={`Activities logged per period by type`}
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={actData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={countTip as never} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {activityTypes.map((t, i) => (
                  <Bar key={t} dataKey={t} stackId="a" fill={actTypeColors[i % actTypeColors.length]} radius={i === activityTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Row 2: Hours + Active Partners ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ChartCard
            title="Billable Hours by Staff"
            subtitle="Hours logged per period, stacked by team member"
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={hoursData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} unit="h" />
                <Tooltip content={hoursTip as never} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(val: string) => staffNameMap[val] ?? val}
                />
                {activeStaffIds.map((sid, i) => (
                  <Bar
                    key={sid}
                    dataKey={sid}
                    stackId="a"
                    fill={staffColorMap[sid] ?? staffColors[i % staffColors.length]}
                    name={staffNameMap[sid] ?? sid}
                    radius={i === activeStaffIds.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Active Referral Partners"
            subtitle="Distinct referral companies with logged CRM activity"
          >
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={activePartnersData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={countTip as never} />
                <Bar dataKey="Active Partners" fill={SAGE} fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="Active Partners" stroke={GOLD} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Row 3: Item Sales Count + Revenue ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ChartCard
            title="Item Sales — Count by Channel"
            subtitle="Number of items sold per period"
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={itemSalesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={countTip as never} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {channels.map((ch, i) => (
                  <Bar
                    key={ch}
                    dataKey={`count_${ch}`}
                    name={ch}
                    stackId="a"
                    fill={channelColors[ch]}
                    radius={i === channels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Item Sales — Revenue by Channel"
            subtitle="Total sale price + company take per period"
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={itemSalesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={moneyTip as never} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {channels.map((ch, i) => (
                  <Bar
                    key={ch}
                    dataKey={`rev_${ch}`}
                    name={ch}
                    stackId="a"
                    fill={channelColors[ch]}
                    radius={i === channels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Row 4: Company Take ── */}
        <ChartCard
          title="Item Sales — Company Take Over Time"
          subtitle="What TTT keeps after client payout, by channel"
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={itemSalesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {channels.map((ch) => (
                  <linearGradient key={ch} id={`grad_${ch.replace(/\s/g, "_")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={channelColors[ch]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={channelColors[ch]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={moneyTip as never} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {channels.map((ch) => (
                <Area
                  key={ch}
                  type="monotone"
                  dataKey={`take_${ch}`}
                  name={ch}
                  stroke={channelColors[ch]}
                  strokeWidth={2}
                  fill={`url(#grad_${ch.replace(/\s/g, "_")})`}
                  dot={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── Footer ── */}
        <div className="text-center pb-4">
          <p className="text-xs text-gray-400">
            Owner Dashboard · Top Tier Transitions · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

      </div>
    </div>
  );
}
