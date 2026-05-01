"use client";

import { useEffect, useRef, useState } from "react";

interface Goal {
  monthKey: string;
  signedGoal: number;
  billedGoal: number;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const START_YEAR = 2024;
const END_YEAR   = 2033;

function buildYears(): number[] {
  const years: number[] = [];
  for (let y = START_YEAR; y <= END_YEAR; y++) years.push(y);
  return years;
}

function mk(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function parseDollars(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : Math.round(n);
}

function fmtGoal(n: number): string {
  if (n === 0) return "";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n.toLocaleString()}`;
}

function nowMK(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SalesGoalsClient({ initialGoals }: { initialGoals: Goal[] }) {
  const [goals, setGoals] = useState<Map<string, Goal>>(() => {
    const m = new Map<string, Goal>();
    for (const g of initialGoals) m.set(g.monthKey, g);
    return m;
  });

  // Track which months are currently being saved
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  // Expanded years — default current + previous
  const curYear = new Date().getFullYear();
  const [expanded, setExpanded] = useState<Set<number>>(
    new Set([curYear - 1, curYear])
  );

  // Input draft state — keyed by `${monthKey}-signed` / `${monthKey}-billed`
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const pendingRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function getGoal(mk: string): Goal {
    return goals.get(mk) ?? { monthKey: mk, signedGoal: 0, billedGoal: 0 };
  }

  function draftKey(monthKey: string, col: "signed" | "billed") {
    return `${monthKey}-${col}`;
  }

  function getDraft(monthKey: string, col: "signed" | "billed"): string {
    const dk = draftKey(monthKey, col);
    if (drafts.has(dk)) return drafts.get(dk)!;
    const g = goals.get(monthKey);
    const val = col === "signed" ? g?.signedGoal : g?.billedGoal;
    return val ? fmtGoal(val) : "";
  }

  function handleChange(monthKey: string, col: "signed" | "billed", raw: string) {
    const dk = draftKey(monthKey, col);
    setDrafts((prev) => new Map(prev).set(dk, raw));
  }

  async function commitGoal(monthKey: string) {
    const g = getGoal(monthKey);
    const signedDk = draftKey(monthKey, "signed");
    const billedDk = draftKey(monthKey, "billed");
    const signedRaw = drafts.get(signedDk);
    const billedRaw = drafts.get(billedDk);
    const signed = signedRaw !== undefined ? parseDollars(signedRaw) : g.signedGoal;
    const billed = billedRaw !== undefined ? parseDollars(billedRaw) : g.billedGoal;

    if (signed === g.signedGoal && billed === g.billedGoal) return;

    setSaving((prev) => new Set(prev).add(monthKey));
    setErrors((prev) => { const m = new Map(prev); m.delete(monthKey); return m; });

    try {
      const res = await fetch("/api/sales-goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthKey, signedGoal: signed, billedGoal: billed }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const { goal } = await res.json();
      setGoals((prev) => new Map(prev).set(monthKey, goal));
      // Clear drafts after successful save
      setDrafts((prev) => {
        const m = new Map(prev);
        m.delete(signedDk);
        m.delete(billedDk);
        return m;
      });
    } catch (e) {
      setErrors((prev) => new Map(prev).set(monthKey, e instanceof Error ? e.message : "Error"));
    } finally {
      setSaving((prev) => { const s = new Set(prev); s.delete(monthKey); return s; });
    }
  }

  function handleBlur(monthKey: string) {
    // Debounce so tabbing between the two cells in a row doesn't trigger double-save
    const existing = pendingRef.current.get(monthKey);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      pendingRef.current.delete(monthKey);
      commitGoal(monthKey);
    }, 150);
    pendingRef.current.set(monthKey, t);
  }

  useEffect(() => {
    return () => {
      for (const t of pendingRef.current.values()) clearTimeout(t);
    };
  }, []);

  const today = nowMK();
  const inputCls =
    "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[#2d4a3e] focus:border-[#2d4a3e] text-right";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-500">
          Signed = total of signed contracts. Earned = sum of all paid invoices per project.
          Goals auto-save on blur. Only current &amp; prior month used in the Weekly Sales Report.
        </p>
      </div>

      {buildYears().map((year) => {
        const isOpen = expanded.has(year);
        const isCurrentYear = year === curYear;
        return (
          <div key={year} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <button
              onClick={() =>
                setExpanded((prev) => {
                  const s = new Set(prev);
                  if (s.has(year)) s.delete(year);
                  else s.add(year);
                  return s;
                })
              }
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-800/50 transition-colors"
            >
              <span className={`font-semibold text-sm ${isCurrentYear ? "text-[#7ab89a]" : "text-white"}`}>
                {year}
                {isCurrentYear && (
                  <span className="ml-2 text-xs font-normal text-gray-500">current year</span>
                )}
              </span>
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isOpen && (
              <div className="px-6 pb-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Month</th>
                      <th className="py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                        Signed Revenue Goal
                      </th>
                      <th className="py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                        Earned Revenue Goal
                      </th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTH_NAMES.map((name, i) => {
                      const monthKey = mk(year, i);
                      const isCurrent = monthKey === today;
                      const goal = goals.get(monthKey);
                      const isSaving = saving.has(monthKey);
                      const err = errors.get(monthKey);
                      const isPast = monthKey < today;

                      return (
                        <tr
                          key={monthKey}
                          className={`border-t border-gray-800/60 ${isCurrent ? "bg-[#2d4a3e]/10" : ""}`}
                        >
                          <td className="py-2 pr-4 font-medium text-gray-300 text-xs w-16">
                            {name}
                            {isCurrent && (
                              <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#7ab89a] align-middle"></span>
                            )}
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              className={`${inputCls} ${isPast ? "opacity-60" : ""}`}
                              value={getDraft(monthKey, "signed")}
                              placeholder="—"
                              onChange={(e) => handleChange(monthKey, "signed", e.target.value)}
                              onBlur={() => handleBlur(monthKey)}
                              disabled={isSaving}
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              className={`${inputCls} ${isPast ? "opacity-60" : ""}`}
                              value={getDraft(monthKey, "billed")}
                              placeholder="—"
                              onChange={(e) => handleChange(monthKey, "billed", e.target.value)}
                              onBlur={() => handleBlur(monthKey)}
                              disabled={isSaving}
                            />
                          </td>
                          <td className="w-6 pl-2">
                            {isSaving && (
                              <svg className="w-3.5 h-3.5 text-gray-500 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            )}
                            {err && (
                              <span className="text-red-400 text-xs" title={err}>!</span>
                            )}
                            {!isSaving && !err && goal && (goal.signedGoal > 0 || goal.billedGoal > 0) && (
                              <svg className="w-3.5 h-3.5 text-[#7ab89a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
