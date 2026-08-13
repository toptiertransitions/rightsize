"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, LabelList,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilterOption { id: string; name: string }

interface DashboardData {
  salesReps:         FilterOption[];
  staff:             FilterOption[];
  referralCompanies: FilterOption[];
  referralContacts:  Array<FilterOption & { companyId: string | null; stage: string | null }>;
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
  opportunities: Array<{
    id: string; createdAt: string; wonAt: string | null; lostAt: string | null;
    stage: string; estimatedValue: number; lostReason: string | null;
    salesRepClerkId: string | null; referralContactId: string | null; referralCompanyId: string | null;
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
  // Weekly: find Monday of the week.
  // Use new Date(y, mo-1, d) to stay in LOCAL timezone, then format with
  // en-CA locale (YYYY-MM-DD) instead of toISOString() which would shift to UTC.
  const date = new Date(y, mo - 1, d);
  const dow = date.getDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  date.setDate(d - daysBack);
  return date.toLocaleDateString("en-CA"); // YYYY-MM-DD in local (CT) timezone
}

function bucketLabel(key: string, period: Period): string {
  if (!key || key === "?") return key;
  if (period === "Q") return key;
  if (period === "M") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function lastBuckets(n: number, period: Period): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    if (period === "W") d.setDate(now.getDate() - i * 7);
    else if (period === "M") d.setMonth(now.getMonth() - i);
    else d.setMonth(now.getMonth() - i * 3);
    // Use toLocaleDateString("en-CA") to get YYYY-MM-DD in the browser's local
    // timezone (CT for this app) instead of toISOString() which is UTC and can
    // shift the date backward for CT users.
    keys.push(bucketKey(d.toLocaleDateString("en-CA"), period));
  }
  return [...new Set(keys)];
}

function periodCount(period: Period): number {
  return period === "W" ? 12 : period === "M" ? 12 : 8;
}

const SAGE  = "#2d4a3e";
const GOLD  = "#C9A96E";
const SLATE = "#64748b";

const STAFF_COLORS = ["#2d4a3e", "#C9A96E", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16"];
const ACT_COLORS   = ["#2d4a3e", "#C9A96E", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];

const CHANNEL_COLORS: Record<string, string> = {
  "Facebook":     "#1877F2",
  "eBay / Online":"#E53238",
  "Estate Sale":  "#7C3AED",
  "ProFound":     "#2d4a3e",
  "Square":       "#3E4348",
  "Stripe":       "#635BFF",
  "Other":        "#9ca3af",
};

const LOST_REASON_COLORS = ["#ef4444", "#f97316", "#eab308", "#6366f1", "#14b8a6", "#ec4899", "#8b5cf6", "#84cc16"];

// ─── Autocomplete MultiSelect ─────────────────────────────────────────────────

function MultiSelect({
  label, options, selected, onChange,
}: { label: string; options: FilterOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
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

function KpiCard({ label, value, color = "emerald" }: { label: string; value: string; color?: string }) {
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
    </div>
  );
}

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

// Tooltip components
type TipPayload = { name: string; value: number; color: string };
type TipProps   = { active?: boolean; payload?: TipPayload[]; label?: string };

function MoneyTip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {fmt$(p.value)}</p>)}
    </div>
  );
}
function CountTip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {fmtNum(p.value)}</p>)}
    </div>
  );
}
function HoursTip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {fmtHrs(p.value * 60)}</p>)}
    </div>
  );
}
function OppsTip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {p.name.includes("Value") ? fmt$(p.value) : fmtNum(p.value)}
        </p>
      ))}
    </div>
  );
}
type CycleTipPayload = { name: string; value: number | null; color: string; payload: { wonCount: number; lostCount: number } };
function CycleTip({ active, payload, label }: { active?: boolean; payload?: CycleTipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.filter(p => p.value != null).map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-medium">{p.value}d</span></p>
      ))}
      <p className="text-gray-400 mt-1.5 border-t border-gray-100 pt-1.5">
        {row.wonCount} won · {row.lostCount} lost
      </p>
    </div>
  );
}
function CycleRepTip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; payload: { rep: string; wonCount: number; lostCount: number } }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-1.5">{row.rep}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-medium">{p.value}d</span></p>
      ))}
      <p className="text-gray-400 mt-1.5 border-t border-gray-100 pt-1.5">
        {row.wonCount} won · {row.lostCount} lost
      </p>
    </div>
  );
}
function LostReasonTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullReason: string; count: number; avgDays: number } }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[180px]">
      <p className="font-semibold text-gray-700 mb-1.5">{row.fullReason}</p>
      <p className="text-red-500">{row.count} {row.count === 1 ? "loss" : "losses"}</p>
      <p className="text-amber-600">{row.avgDays}d avg to lose</p>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function OwnerDashboardClient() {

  // ── ALL HOOKS MUST COME BEFORE ANY CONDITIONAL RETURNS ──

  const [authed,          setAuthed]          = useState(false);
  const [pw,              setPw]              = useState("");
  const [pwError,         setPwError]         = useState(false);
  const [data,            setData]            = useState<DashboardData | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [fetchError,      setFetchError]      = useState<string | null>(null);
  const [period,          setPeriod]          = useState<Period>("M");
  const [salesRepFilter,  setSalesRepFilter]  = useState<string[]>([]);
  const [staffFilter,     setStaffFilter]     = useState<string[]>([]);
  const [refCompanyFilter,setRefCompanyFilter]= useState<string[]>([]);
  const [refContactFilter,setRefContactFilter]= useState<string[]>([]);
  const [insights,              setInsights]              = useState<string[]>([]);
  const [insightsLoading,       setInsightsLoading]       = useState(false);
  const [cycleLostReasonFilter, setCycleLostReasonFilter] = useState<string[]>([]);
  const [cycleMonthFrom,        setCycleMonthFrom]        = useState("");
  const [cycleMonthTo,          setCycleMonthTo]          = useState("");

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetch("/api/admin/owner/data")
      .then(r => r.json())
      .then(d => {
        if (d?.error) { setFetchError(d.error); }
        else { setData(d); }
        setLoading(false);
      })
      .catch(e => { setFetchError(String(e)); setLoading(false); });
  }, [authed]);

  const handleLogin = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (pw === "toptier123") { setAuthed(true); setPwError(false); }
    else setPwError(true);
  }, [pw]);

  const buckets = useMemo(() => lastBuckets(periodCount(period), period), [period]);

  // Filtered data arrays — computed before early returns so hooks don't move
  const contracts = useMemo(() =>
    (data?.signedContracts ?? []).filter(r => {
      if (salesRepFilter.length  && !salesRepFilter.includes(r.salesRepClerkId   ?? "")) return false;
      if (refCompanyFilter.length && !refCompanyFilter.includes(r.referralCompanyId ?? "")) return false;
      if (refContactFilter.length && !refContactFilter.includes(r.referralContactId ?? "")) return false;
      return true;
    }), [data, salesRepFilter, refCompanyFilter, refContactFilter]);

  const invoices = useMemo(() =>
    (data?.invoices ?? []).filter(r => {
      if (salesRepFilter.length  && !salesRepFilter.includes(r.salesRepClerkId   ?? "")) return false;
      if (refCompanyFilter.length && !refCompanyFilter.includes(r.referralCompanyId ?? "")) return false;
      if (refContactFilter.length && !refContactFilter.includes(r.referralContactId ?? "")) return false;
      return true;
    }), [data, salesRepFilter, refCompanyFilter, refContactFilter]);

  const timeRows = useMemo(() =>
    (data?.timeEntries ?? []).filter(r => {
      if (staffFilter.length    && !staffFilter.includes(r.staffClerkId    ?? "")) return false;
      if (salesRepFilter.length && !salesRepFilter.includes(r.salesRepClerkId ?? "")) return false;
      return true;
    }), [data, staffFilter, salesRepFilter]);

  const actRows = useMemo(() =>
    (data?.activities ?? []).filter(r => {
      if (salesRepFilter.length  && !salesRepFilter.includes(r.createdByClerkId)) return false;
      if (refCompanyFilter.length && !refCompanyFilter.includes(r.referralCompanyId ?? "")) return false;
      if (refContactFilter.length && !refContactFilter.includes(r.referralContactId ?? "")) return false;
      return true;
    }), [data, salesRepFilter, refCompanyFilter, refContactFilter]);

  const soldRows = useMemo(() =>
    (data?.soldItems ?? []).filter(r => {
      if (staffFilter.length    && !staffFilter.includes(r.staffSellerId   ?? "")) return false;
      if (salesRepFilter.length && !salesRepFilter.includes(r.salesRepClerkId ?? "")) return false;
      return true;
    }), [data, staffFilter, salesRepFilter]);

  const activityTypes = useMemo(() => [...new Set(actRows.map(a => a.type))].sort(), [actRows]);

  const activeStaffIds = useMemo(() => {
    const ids = new Set(timeRows.map(e => e.staffClerkId ?? "").filter(Boolean));
    return staffFilter.length > 0 ? staffFilter : [...ids];
  }, [timeRows, staffFilter]);

  const staffColorMap = useMemo(() =>
    Object.fromEntries(activeStaffIds.map((id, i) => [id, STAFF_COLORS[i % STAFF_COLORS.length]])),
    [activeStaffIds]);

  const staffNameMap = useMemo(() =>
    Object.fromEntries((data?.staff ?? []).map(s => [s.id, s.name])),
    [data]);

  const channels = useMemo(() => [...new Set(soldRows.map(i => i.channel))].sort(), [soldRows]);

  const channelColorMap = useMemo(() =>
    Object.fromEntries(channels.map(ch => [ch, CHANNEL_COLORS[ch] ?? "#9ca3af"])),
    [channels]);

  const oppsRows = useMemo(() =>
    (data?.opportunities ?? []).filter(r => {
      if (!r.estimatedValue) return false; // exclude $0 / null estimates
      if (salesRepFilter.length   && !salesRepFilter.includes(r.salesRepClerkId    ?? "")) return false;
      if (refCompanyFilter.length && !refCompanyFilter.includes(r.referralCompanyId ?? "")) return false;
      if (refContactFilter.length && !refContactFilter.includes(r.referralContactId ?? "")) return false;
      return true;
    }), [data, salesRepFilter, refCompanyFilter, refContactFilter]);

  const lostReasons = useMemo(() =>
    [...new Set(oppsRows.filter(o => o.stage === "Lost").map(o => o.lostReason ?? "Unknown"))].sort(),
    [oppsRows]);

  // ── Sales Cycle Duration data ────────────────────────────────────────────────
  const cycleOpps = useMemo(() => {
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
    const rows = (data?.opportunities ?? []).filter(r => {
      if (salesRepFilter.length   && !salesRepFilter.includes(r.salesRepClerkId    ?? "")) return false;
      if (refCompanyFilter.length && !refCompanyFilter.includes(r.referralCompanyId ?? "")) return false;
      if (refContactFilter.length && !refContactFilter.includes(r.referralContactId ?? "")) return false;
      if (r.stage !== "Won" && r.stage !== "Lost") return false;
      const closeDate = r.stage === "Won" ? r.wonAt : r.lostAt;
      if (!closeDate) return false;
      const dur = Math.round((new Date(closeDate).getTime() - new Date(r.createdAt).getTime()) / 86400000);
      if (dur < 0) return false;
      const month = r.createdAt.slice(0, 7);
      if (cycleMonthFrom && month < cycleMonthFrom) return false;
      if (cycleMonthTo   && month > cycleMonthTo)   return false;
      if (cycleLostReasonFilter.length > 0 && r.stage === "Lost" &&
          !cycleLostReasonFilter.includes(r.lostReason ?? "Unknown")) return false;
      return true;
    });
    void avg; // used below
    return rows.map(r => {
      const closeDate = (r.stage === "Won" ? r.wonAt : r.lostAt)!;
      const duration = Math.round((new Date(closeDate).getTime() - new Date(r.createdAt).getTime()) / 86400000);
      return {
        id: r.id,
        stage: r.stage as "Won" | "Lost",
        duration,
        month: r.createdAt.slice(0, 7),
        repId: r.salesRepClerkId ?? "",
        repName: data?.salesReps.find(s => s.id === (r.salesRepClerkId ?? ""))?.name ?? "—",
        refName: data?.referralContacts.find(s => s.id === (r.referralContactId ?? ""))?.name ?? "—",
        lostReason: r.lostReason ?? "Unknown",
        estimatedValue: r.estimatedValue,
      };
    });
  }, [data, salesRepFilter, refCompanyFilter, refContactFilter, cycleLostReasonFilter, cycleMonthFrom, cycleMonthTo]);

  const cycleMonthlyData = useMemo(() => {
    const byMonth = new Map<string, { won: number[]; lost: number[] }>();
    for (const o of cycleOpps) {
      if (!byMonth.has(o.month)) byMonth.set(o.month, { won: [], lost: [] });
      const m = byMonth.get(o.month)!;
      (o.stage === "Won" ? m.won : m.lost).push(o.duration);
    }
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, { won, lost }]) => ({
      month,
      label: new Date(month + "-15").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      wonAvg: avg(won),
      lostAvg: avg(lost),
      overallAvg: avg([...won, ...lost]),
      wonCount: won.length,
      lostCount: lost.length,
    }));
  }, [cycleOpps]);

  const cycleByRep = useMemo(() => {
    const byRep = new Map<string, { repName: string; won: number[]; lost: number[] }>();
    for (const o of cycleOpps) {
      if (!byRep.has(o.repId)) byRep.set(o.repId, { repName: o.repName, won: [], lost: [] });
      const r = byRep.get(o.repId)!;
      (o.stage === "Won" ? r.won : r.lost).push(o.duration);
    }
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
    return [...byRep.values()].map(({ repName, won, lost }) => ({
      rep: repName,
      wonAvg: avg(won),
      lostAvg: avg(lost),
      overall: avg([...won, ...lost]),
      wonCount: won.length,
      lostCount: lost.length,
    })).sort((a, b) => b.overall - a.overall);
  }, [cycleOpps]);

  const cycleByLostReason = useMemo(() => {
    const byReason = new Map<string, number[]>();
    for (const o of cycleOpps.filter(o => o.stage === "Lost")) {
      const r = o.lostReason || "Unknown";
      if (!byReason.has(r)) byReason.set(r, []);
      byReason.get(r)!.push(o.duration);
    }
    return [...byReason.entries()].map(([reason, durations]) => ({
      reason: reason.length > 22 ? reason.slice(0, 22) + "…" : reason,
      fullReason: reason,
      count: durations.length,
      avgDays: Math.round(durations.reduce((s, v) => s + v, 0) / durations.length),
    })).sort((a, b) => b.avgDays - a.avgDays);
  }, [cycleOpps]);

  const allCycleLostReasons = useMemo(() => {
    const reasons = new Set<string>();
    for (const o of (data?.opportunities ?? []).filter(o => o.stage === "Lost")) {
      reasons.add(o.lostReason ?? "Unknown");
    }
    return [...reasons].sort();
  }, [data]);

  const cycleWonAvg = useMemo(() => {
    const won = cycleOpps.filter(o => o.stage === "Won").map(o => o.duration);
    return won.length ? Math.round(won.reduce((s, v) => s + v, 0) / won.length) : null;
  }, [cycleOpps]);

  const cycleLostAvg = useMemo(() => {
    const lost = cycleOpps.filter(o => o.stage === "Lost").map(o => o.duration);
    return lost.length ? Math.round(lost.reduce((s, v) => s + v, 0) / lost.length) : null;
  }, [cycleOpps]);

  const oppsCreatedData = useMemo(() => {
    const countMap: Record<string, number> = {};
    const valueMap: Record<string, number> = {};
    for (const o of oppsRows) {
      const k = bucketKey(o.createdAt, period);
      countMap[k] = (countMap[k] ?? 0) + 1;
      valueMap[k] = (valueMap[k] ?? 0) + o.estimatedValue;
    }
    return buckets.map(k => ({
      label: bucketLabel(k, period),
      Count: countMap[k] ?? 0,
      "Est. Value": Math.round(valueMap[k] ?? 0),
    }));
  }, [oppsRows, period, buckets]);

  const oppsWonData = useMemo(() => {
    const countMap: Record<string, number> = {};
    const valueMap: Record<string, number> = {};
    for (const o of oppsRows) {
      if (!o.wonAt) continue;
      const k = bucketKey(o.wonAt, period);
      countMap[k] = (countMap[k] ?? 0) + 1;
      valueMap[k] = (valueMap[k] ?? 0) + o.estimatedValue;
    }
    return buckets.map(k => ({
      label: bucketLabel(k, period),
      Count: countMap[k] ?? 0,
      "Est. Value": Math.round(valueMap[k] ?? 0),
    }));
  }, [oppsRows, period, buckets]);

  const oppsLostData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const o of oppsRows) {
      if (o.stage !== "Lost") continue;
      const dateStr = o.lostAt || o.createdAt;
      if (!dateStr) continue;
      const k = bucketKey(dateStr, period);
      const reason = o.lostReason ?? "Unknown";
      if (!map[k]) map[k] = {};
      map[k][reason] = (map[k][reason] ?? 0) + 1;
    }
    return buckets.map(k => ({
      label: bucketLabel(k, period),
      ...Object.fromEntries(lostReasons.map(r => [r, map[k]?.[r] ?? 0])),
    }));
  }, [oppsRows, period, buckets, lostReasons]);

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

  const itemSalesData = useMemo(() => {
    const countMap:   Record<string, Record<string, number>> = {};
    const revenueMap: Record<string, Record<string, number>> = {};
    const takeMap:    Record<string, Record<string, number>> = {};
    for (const item of soldRows) {
      const k  = bucketKey(item.saleDate, period);
      const ch = item.channel;
      if (!countMap[k])   countMap[k]   = {};
      if (!revenueMap[k]) revenueMap[k] = {};
      if (!takeMap[k])    takeMap[k]    = {};
      countMap[k][ch]   = (countMap[k][ch]   ?? 0) + 1;
      revenueMap[k][ch] = (revenueMap[k][ch] ?? 0) + item.salePrice;
      takeMap[k][ch]    = (takeMap[k][ch]    ?? 0) + item.companyTake;
    }
    return buckets.map(k => ({
      label: bucketLabel(k, period),
      ...Object.fromEntries(channels.map(ch => [`count_${ch}`, countMap[k]?.[ch]   ?? 0])),
      ...Object.fromEntries(channels.map(ch => [`rev_${ch}`,   Math.round(revenueMap[k]?.[ch] ?? 0)])),
      ...Object.fromEntries(channels.map(ch => [`take_${ch}`,  Math.round(takeMap[k]?.[ch]    ?? 0)])),
    }));
  }, [soldRows, period, buckets, channels]);

  // KPI totals
  const totalSigned          = useMemo(() => contracts.reduce((s, c) => s + c.totalCost, 0), [contracts]);
  const totalEarned          = useMemo(() => invoices.reduce((s, i)  => s + i.amount,    0), [invoices]);
  const totalHours           = useMemo(() => timeRows.reduce((s, e)  => s + e.durationMinutes, 0), [timeRows]);
  const totalItemRevenue     = useMemo(() => soldRows.reduce((s, i)  => s + i.salePrice,  0), [soldRows]);
  const totalCompanyTake     = useMemo(() => soldRows.reduce((s, i)  => s + i.companyTake, 0), [soldRows]);
  const activePartnerCount   = useMemo(() =>
    new Set(actRows.map(a => a.referralCompanyId).filter(Boolean)).size, [actRows]);
  const totalOppsCreated     = useMemo(() => oppsRows.length, [oppsRows]);
  const totalOppsCreatedValue= useMemo(() => oppsRows.reduce((s, o) => s + o.estimatedValue, 0), [oppsRows]);
  const totalOppsWon         = useMemo(() => oppsRows.filter(o => o.stage === "Won").length, [oppsRows]);
  const totalOppsWonValue    = useMemo(() => oppsRows.filter(o => o.stage === "Won").reduce((s, o) => s + o.estimatedValue, 0), [oppsRows]);
  const totalOppsLost        = useMemo(() => oppsRows.filter(o => o.stage === "Lost").length, [oppsRows]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (salesRepFilter.length)   parts.push(`Sales Rep: ${salesRepFilter.map(id => data?.salesReps.find(s => s.id === id)?.name ?? id).join(", ")}`);
    if (staffFilter.length)      parts.push(`Staff: ${staffFilter.map(id => data?.staff.find(s => s.id === id)?.name ?? id).join(", ")}`);
    if (refCompanyFilter.length) parts.push(`Referral Company: ${refCompanyFilter.map(id => data?.referralCompanies.find(c => c.id === id)?.name ?? id).join(", ")}`);
    if (refContactFilter.length) parts.push(`Referral Contact: ${refContactFilter.map(id => data?.referralContacts.find(c => c.id === id)?.name ?? id).join(", ")}`);
    return parts.join(" | ");
  }, [data, salesRepFilter, staffFilter, refCompanyFilter, refContactFilter]);

  // ── Early returns (all hooks are above) ──────────────────────────────────────

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

  if (fetchError || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600 text-sm">{fetchError ?? "Failed to load data"}</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const anyFilterActive = salesRepFilter.length > 0 || staffFilter.length > 0 ||
                          refCompanyFilter.length > 0 || refContactFilter.length > 0;

  const PERIOD_LABELS: Record<Period, string> = { W: "Weekly", M: "Monthly", Q: "Quarterly" };

  const moneyTick = (v: number) => fmt$(v);

  async function handleGenerateInsights() {
    setInsightsLoading(true);
    setInsights([]);
    try {
      const res = await fetch("/api/admin/owner/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: PERIOD_LABELS[period],
          filterSummary,
          kpis: {
            totalSigned, totalEarned, totalHours,
            totalActivities: actRows.length,
            activePartners: activePartnerCount,
            oppsCreated: totalOppsCreated,
            oppsCreatedValue: totalOppsCreatedValue,
            oppsWon: totalOppsWon,
            oppsWonValue: totalOppsWonValue,
            oppsLost: totalOppsLost,
            itemsSold: soldRows.length,
            totalItemRevenue, totalCompanyTake,
          },
          revData, oppsCreatedData, oppsWonData, oppsLostData,
          actData, activePartnersData, itemSalesData,
          lostReasons, activityTypes, channels,
        }),
      });
      const d = await res.json();
      if (Array.isArray(d.insights)) setInsights(d.insights);
      else setInsights(["Unable to parse insights. Please try again."]);
    } catch {
      setInsights(["Failed to generate insights. Please try again."]);
    } finally {
      setInsightsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-gray-900">

      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a2f25] to-[#2d4a3e] px-8 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-emerald-400 uppercase mb-0.5">Top Tier Transitions</p>
          <h1 className="text-xl font-bold text-white">Executive Financial Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          {(["W", "M", "Q"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === p ? "bg-white text-emerald-900" : "text-emerald-200 hover:bg-white/10"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-40 shadow-sm">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mr-1">Filter:</span>
        <MultiSelect label="Sales Rep"        options={data.salesReps}           selected={salesRepFilter}   onChange={setSalesRepFilter}   />
        <MultiSelect label="Staff"            options={data.staff}               selected={staffFilter}      onChange={setStaffFilter}      />
        <MultiSelect label="Referral Company" options={data.referralCompanies}   selected={refCompanyFilter} onChange={setRefCompanyFilter} />
        <MultiSelect label="Referral Contact" options={data.referralContacts.map(c => ({ id: c.id, name: c.name }))} selected={refContactFilter} onChange={setRefContactFilter} />
        <button
          onClick={handleGenerateInsights}
          disabled={insightsLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-300 bg-violet-50 text-violet-800 text-sm font-semibold hover:bg-violet-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {insightsLoading ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Analyzing…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Generate AI Insights
            </>
          )}
        </button>
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

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <KpiCard label="Total Signed"    value={fmt$(totalSigned)}         color="emerald" />
          <KpiCard label="Total Earned"    value={fmt$(totalEarned)}         color="gold"    />
          <KpiCard label="Hours Logged"    value={fmtHrs(totalHours)}        color="blue"    />
          <KpiCard label="CRM Activities"  value={fmtNum(actRows.length)}    color="violet"  />
          <KpiCard label="Active Partners" value={fmtNum(activePartnerCount)} color="slate"  />
          <KpiCard label="Items Sold"      value={fmtNum(soldRows.length)}   color="emerald" />
          <KpiCard label="Item Revenue"    value={fmt$(totalItemRevenue)}    color="gold"    />
          <KpiCard label="Company Take"    value={fmt$(totalCompanyTake)}    color="emerald" />
        </div>

        {/* AI Insights */}
        {(insights.length > 0 || insightsLoading) && (
          <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-violet-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-violet-900">AI Insights</p>
              {filterSummary && <p className="text-xs text-violet-500 ml-1">— {filterSummary}</p>}
              {insights.length > 0 && (
                <button onClick={() => setInsights([])} className="ml-auto text-xs text-violet-400 hover:text-violet-700">Dismiss</button>
              )}
            </div>
            {insightsLoading ? (
              <div className="flex items-center gap-2 text-sm text-violet-600">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Reviewing data and generating insights…
              </div>
            ) : (
              <ul className="space-y-2.5">
                {insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-violet-200 text-violet-800 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <p className="text-sm text-gray-700 leading-relaxed">{insight}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Row 1: Revenue + CRM Activity */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ChartCard title="Revenue Trend" subtitle={`Signed contracts vs. earned revenue — ${PERIOD_LABELS[period].toLowerCase()}`}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradSigned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={SAGE} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={SAGE} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradEarned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={GOLD} stopOpacity={0.30} />
                    <stop offset="95%" stopColor={GOLD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<MoneyTip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="Signed" stroke={SAGE} strokeWidth={2} fill="url(#gradSigned)" dot={false} />
                <Area type="monotone" dataKey="Earned" stroke={GOLD} strokeWidth={2} fill="url(#gradEarned)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="CRM Activity Volume" subtitle="Activities logged per period by type">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={actData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CountTip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {activityTypes.map((t, i) => (
                  <Bar key={t} dataKey={t} stackId="a" fill={ACT_COLORS[i % ACT_COLORS.length]}
                    radius={i === activityTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Opportunities Created + Won */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ChartCard title="Opportunities Created" subtitle="New opps per period — count (bars) & estimated value (line)">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={oppsCreatedData} margin={{ top: 4, right: 56, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={moneyTick} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<OppsTip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="Count" fill={SAGE} fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="Est. Value" stroke={GOLD} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Opportunities Won" subtitle="Won opps per period — count (bars) & value at close (line)">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={oppsWonData} margin={{ top: 4, right: 56, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={moneyTick} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<OppsTip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="Count" fill="#16a34a" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="Est. Value" stroke={GOLD} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 2: Hours + Active Partners */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ChartCard title="Billable Hours by Staff" subtitle="Hours logged per period, stacked by team member">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={hoursData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} unit="h" />
                <Tooltip content={<HoursTip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={(val: string) => staffNameMap[val] ?? val} />
                {activeStaffIds.map((sid, i) => (
                  <Bar key={sid} dataKey={sid} stackId="a"
                    fill={staffColorMap[sid] ?? STAFF_COLORS[i % STAFF_COLORS.length]}
                    name={staffNameMap[sid] ?? sid}
                    radius={i === activeStaffIds.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Active Referral Partners" subtitle="Distinct referral companies with logged CRM activity each period">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={activePartnersData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CountTip />} />
                <Bar dataKey="Active Partners" fill={SAGE} fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="Active Partners" stroke={GOLD} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 3: Item count + revenue */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ChartCard title="Item Sales — Count by Channel" subtitle="Number of items sold per period">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={itemSalesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CountTip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {channels.map((ch, i) => (
                  <Bar key={ch} dataKey={`count_${ch}`} name={ch} stackId="a"
                    fill={channelColorMap[ch]}
                    radius={i === channels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Item Sales — Revenue by Channel" subtitle="Total sale price per channel per period">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={itemSalesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<MoneyTip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {channels.map((ch, i) => (
                  <Bar key={ch} dataKey={`rev_${ch}`} name={ch} stackId="a"
                    fill={channelColorMap[ch]}
                    radius={i === channels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 4: Company Take */}
        <ChartCard title="Item Sales — Company Take Over Time" subtitle="What TTT keeps after client payout, by channel">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={itemSalesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {channels.map(ch => (
                  <linearGradient key={ch} id={`grad_${ch.replace(/\W/g, "_")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={channelColorMap[ch]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={channelColorMap[ch]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={<MoneyTip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {channels.map(ch => (
                <Area key={ch} type="monotone" dataKey={`take_${ch}`} name={ch}
                  stroke={channelColorMap[ch]} strokeWidth={2}
                  fill={`url(#grad_${ch.replace(/\W/g, "_")})`} dot={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Opportunities Lost by Reason */}
        <ChartCard title="Opportunities Lost by Reason" subtitle="Lost opps per period, stacked by lost reason">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={oppsLostData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CountTip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {lostReasons.map((r, i) => (
                <Bar key={r} dataKey={r} stackId="a"
                  fill={LOST_REASON_COLORS[i % LOST_REASON_COLORS.length]}
                  radius={i === lostReasons.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ─── Sales Cycle Duration ─────────────────────────────────────────── */}
        <div className="border-t border-gray-100 pt-2">

          {/* Section header + local filters */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-sm font-bold text-gray-800">Sales Cycle Duration</p>
              <p className="text-xs text-gray-500 mt-0.5">Days from opportunity created → Won/Lost close — closed deals only</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Month range */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Created:</span>
                <input type="month" value={cycleMonthFrom} onChange={e => setCycleMonthFrom(e.target.value)}
                  className="h-7 px-2 text-xs border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <span className="text-xs text-gray-400">–</span>
                <input type="month" value={cycleMonthTo} onChange={e => setCycleMonthTo(e.target.value)}
                  className="h-7 px-2 text-xs border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              {/* Lost reason filter */}
              {allCycleLostReasons.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Lost Reason:</span>
                  <button onClick={() => setCycleLostReasonFilter([])}
                    className={`h-6 px-2.5 text-xs rounded-full border transition-colors ${cycleLostReasonFilter.length === 0 ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}>
                    All
                  </button>
                  {allCycleLostReasons.map(r => (
                    <button key={r}
                      onClick={() => setCycleLostReasonFilter(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                      className={`h-6 px-2.5 text-xs rounded-full border transition-colors ${cycleLostReasonFilter.includes(r) ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}>
                      {r}
                    </button>
                  ))}
                </div>
              )}
              {(cycleMonthFrom || cycleMonthTo || cycleLostReasonFilter.length > 0) && (
                <button onClick={() => { setCycleMonthFrom(""); setCycleMonthTo(""); setCycleLostReasonFilter([]); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>
              )}
            </div>
          </div>

          {/* KPI mini row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <KpiCard label="Avg Days to Win"  value={cycleWonAvg  != null ? `${cycleWonAvg}d`  : "—"} color="emerald" />
            <KpiCard label="Avg Days to Lose" value={cycleLostAvg != null ? `${cycleLostAvg}d` : "—"} color="slate"   />
            <KpiCard label="Closed Won"  value={String(cycleOpps.filter(o => o.stage === "Won").length)}  color="emerald" />
            <KpiCard label="Closed Lost" value={String(cycleOpps.filter(o => o.stage === "Lost").length)} color="slate"   />
          </div>

          {/* Chart row: monthly trend + by rep */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
            {/* Monthly avg duration */}
            <ChartCard
              title="Cycle Duration by Month Created"
              subtitle="Avg days Won (green) · Lost (red) · Overall avg (line)"
            >
              {cycleMonthlyData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No closed deal data</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={cycleMonthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={v => `${v}d`} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} width={38} />
                    <Tooltip content={<CycleTip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="wonAvg"  name="Won avg"     fill="#16a34a" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="lostAvg" name="Lost avg"    fill="#ef4444" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
                    <Line dataKey="overallAvg" name="Overall avg" type="monotone" stroke="#334155" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* By Sales Rep */}
            <ChartCard
              title="Avg Cycle Duration by Sales Rep"
              subtitle="Won (green) vs. Lost (red) — sorted longest overall first"
            >
              {cycleByRep.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No closed deal data</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, cycleByRep.length * 52)}>
                  <BarChart data={cycleByRep} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => `${v}d`} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="rep" tick={{ fontSize: 11, fill: SLATE }} tickLine={false} axisLine={false} width={84} />
                    <Tooltip content={<CycleRepTip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="wonAvg"  name="Won avg (days)"  fill="#16a34a" fillOpacity={0.85} radius={[0, 3, 3, 0]} barSize={14} />
                    <Bar dataKey="lostAvg" name="Lost avg (days)" fill="#ef4444" fillOpacity={0.75} radius={[0, 3, 3, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Lost Reason breakdown */}
          <ChartCard
            title="Lost Reason Analysis"
            subtitle="Average days-to-loss per reason (bar length) · loss count annotated — reveals quick vs. drawn-out rejections"
          >
            {cycleByLostReason.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No lost deal data</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(140, cycleByLostReason.length * 44)}>
                <BarChart data={cycleByLostReason} layout="vertical" margin={{ top: 4, right: 80, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v}d`} tick={{ fontSize: 10, fill: SLATE }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="reason" tick={{ fontSize: 11, fill: SLATE }} tickLine={false} axisLine={false} width={118} />
                  <Tooltip content={<LostReasonTip />} />
                  <Bar dataKey="avgDays" name="Avg days to loss" fill="#ef4444" fillOpacity={0.75} radius={[0, 4, 4, 0]} barSize={18}>
                    <LabelList dataKey="count" position="right" formatter={(v: unknown) => { const n = Number(v); return `${n} ${n === 1 ? "loss" : "losses"}`; }}
                      style={{ fontSize: 10, fill: SLATE }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Footer */}
        <div className="text-center pb-4">
          <p className="text-xs text-gray-400">
            Owner Dashboard · Top Tier Transitions · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

      </div>
    </div>
  );
}
