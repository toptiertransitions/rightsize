"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/Card";

type LineItemType = "hours" | "commission" | "mileage" | "travel" | "expense";

interface LineItem {
  type: LineItemType;
  date: string;
  description: string;
  minutes: number | null;
  value: number;
}

interface PaySummary {
  from: string;
  to: string;
  totalMinutes: number;
  hourlyRate: number;
  hourlyPay: number;
  commissionEarned: number;
  reimbursableMiles: number;
  payableTravelMinutes: number;
  travelPay: number;
  reimbursableExpensesTotal: number;
  totalPretaxPay: number;
  lineItems: LineItem[];
}

function fmt$(n: number) {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

function fmtMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function getDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  const from = today.slice(0, 8) + "01";
  return { from, to: today };
}

const TYPE_LABEL: Record<LineItemType, string> = {
  hours: "Hours",
  commission: "Commission",
  mileage: "Mileage",
  travel: "Travel",
  expense: "Expense",
};

const TYPE_COLOR: Record<LineItemType, string> = {
  hours: "text-blue-600 bg-blue-50",
  commission: "text-purple-600 bg-purple-50",
  mileage: "text-amber-600 bg-amber-50",
  travel: "text-orange-600 bg-orange-50",
  expense: "text-teal-600 bg-teal-50",
};

export function MyPaySection({ clerkUserId }: { clerkUserId: string }) {
  const defaults = getDefaultDates();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [summary, setSummary] = useState<PaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pay/summary?from=${f}&to=${t}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setSummary(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pay summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(from, to); }, [load, from, to]);

  void clerkUserId;

  const inputClass = "h-8 px-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-forest-500";

  return (
    <section className="mt-10 mb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-gray-900">My Pay</h2>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputClass} />
          <span>to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="h-6 bg-gray-100 rounded animate-pulse mb-1 w-16" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-lg font-bold text-gray-900">{fmtMinutes(summary.totalMinutes)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Hours Worked</p>
                {summary.hourlyRate > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">{fmt$(summary.hourlyRate)}/hr</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <p className="text-lg font-bold text-gray-900">{fmt$(summary.hourlyPay)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Hourly Pay</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <p className="text-lg font-bold text-gray-900">{fmt$(summary.commissionEarned)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Commission Earned</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <p className="text-lg font-bold text-gray-900">{summary.reimbursableMiles.toFixed(1)} mi</p>
                <p className="text-xs text-gray-500 mt-0.5">Reimbursable Miles</p>
                <p className="text-[10px] text-gray-400 mt-1">after 20-mi/day deduction</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <p className="text-lg font-bold text-gray-900">{fmt$(summary.travelPay)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Travel Time Pay</p>
                {summary.payableTravelMinutes > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">{fmtMinutes(summary.payableTravelMinutes)} after 30-min deduction</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <p className="text-lg font-bold text-gray-900">{fmt$(summary.reimbursableExpensesTotal)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Reimbursable Expenses</p>
              </CardContent>
            </Card>

            <Card className="border-forest-300 bg-forest-50">
              <CardContent className="py-4">
                <p className="text-xl font-bold text-forest-700">{fmt$(summary.totalPretaxPay)}</p>
                <p className="text-xs text-forest-600 font-medium mt-0.5">Total Pre-Tax Pay</p>
              </CardContent>
            </Card>
          </div>

          {/* Accordion toggle */}
          {summary.lineItems.length > 0 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors w-full py-1"
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              <span>{expanded ? "Hide" : "Show"} line items ({summary.lineItems.length})</span>
            </button>
          )}

          {/* Accordion detail */}
          {expanded && summary.lineItems.length > 0 && (
            <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden">

              {/* Desktop column headers — hidden on mobile */}
              <div className="hidden sm:grid sm:grid-cols-[80px_90px_1fr_68px_88px] gap-x-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Date</span>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Type</span>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Project</span>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-right">Hours</span>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-right">Amount</span>
              </div>

              {summary.lineItems.map((item, i) => {
                const dateLabel = new Date(item.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const hasHours = (item.type === "hours" || item.type === "travel") && item.minutes != null;
                const amountLabel = item.type === "mileage" ? `${item.value.toFixed(1)} mi` : fmt$(item.value);

                return (
                  <div key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/70 transition-colors">

                    {/* ── Mobile layout ── */}
                    <div className="sm:hidden px-4 py-3.5">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_COLOR[item.type]}`}>
                          {TYPE_LABEL[item.type]}
                        </span>
                        <span className="text-base font-bold text-gray-900 tabular-nums">{amountLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-700 truncate">{item.description}</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{dateLabel}</span>
                      </div>
                      {hasHours && (
                        <p className="text-xs text-gray-400 mt-1">{fmtMinutes(item.minutes!)}</p>
                      )}
                    </div>

                    {/* ── Desktop layout ── */}
                    <div className="hidden sm:grid sm:grid-cols-[80px_90px_1fr_68px_88px] gap-x-3 px-4 py-3 items-center">
                      <span className="text-sm text-gray-400 tabular-nums">{dateLabel}</span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full w-fit ${TYPE_COLOR[item.type]}`}>
                        {TYPE_LABEL[item.type]}
                      </span>
                      <span className="text-sm text-gray-800 truncate">{item.description}</span>
                      <span className="text-sm text-gray-500 text-right tabular-nums">
                        {hasHours ? fmtMinutes(item.minutes!) : "—"}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 text-right tabular-nums">{amountLabel}</span>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
