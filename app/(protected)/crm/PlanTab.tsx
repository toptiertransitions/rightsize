"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { ReferralPriority } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Quarter {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

interface ActivePartner {
  companyId: string;
  companyName: string;
  priority: ReferralPriority;
  goal: number;
  actual: number;
}

interface ConversionTarget {
  companyId: string;
  companyName: string;
  priority: ReferralPriority;
  goal: number;
  actual: number;
  targetId: string;
  bestStage: string;
}

interface AvailableCompany {
  companyId: string;
  companyName: string;
  priority: ReferralPriority;
  bestStage: string;
}

interface RepPlan {
  clerkUserId: string;
  displayName: string;
  goal: number;
  actual: number;
  activePartners: ActivePartner[];
  conversionTargets: ConversionTarget[];
  availableToConvert: AvailableCompany[];
}

interface PlanData {
  quarter: Quarter;
  reps: RepPlan[];
}

interface PlanTabProps {
  currentUserId: string;
  sysRole: string;
}

// ─── Add Quarter Modal ────────────────────────────────────────────────────────

function suggestNextQuarter(): { label: string; startDate: string; endDate: string } {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const quarterIndex = Math.floor(month / 3);
  const nextQIdx = (quarterIndex + 1) % 4;
  const nextQYear = quarterIndex === 3 ? year + 1 : year;
  const startMonths = [0, 3, 6, 9];
  const startMonth = startMonths[nextQIdx];
  const endMonth = startMonths[nextQIdx] + 2;
  const startDate = new Date(nextQYear, startMonth, 1);
  const endDate = new Date(nextQYear, endMonth + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { label: `Q${nextQIdx + 1} ${nextQYear}`, startDate: fmt(startDate), endDate: fmt(endDate) };
}

function AddQuarterModal({ onClose, onCreated }: { onClose: () => void; onCreated: (q: Quarter) => void }) {
  const suggested = suggestNextQuarter();
  const [label, setLabel] = useState(suggested.label);
  const [startDate, setStartDate] = useState(suggested.startDate);
  const [endDate, setEndDate] = useState(suggested.endDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/crm/quarters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, startDate, endDate }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      onCreated(data.quarter);
    } catch {
      setError("Failed to create quarter. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Add Quarter</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              className="w-full h-9 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
              placeholder="Q1 2026"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required
                className="w-full h-9 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required
                className="w-full h-9 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500" />
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50">
              {saving ? "Creating..." : "Create Quarter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Pacing Bar ───────────────────────────────────────────────────────────────

function PacingBar({ quarter, actual, goal }: { quarter: Quarter; actual: number; goal: number }) {
  const today = new Date();
  const start = new Date(quarter.startDate);
  const end = new Date(quarter.endDate);
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
  const elapsedDays = Math.min(totalDays, Math.max(0, (today.getTime() - start.getTime()) / 86400000));
  const pacePct = elapsedDays / totalDays;
  const fillPct = goal > 0 ? Math.min(1, actual / goal) : 0;
  const isPast = today > end;
  const isFuture = today < start;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pacing</p>
        <span className="text-xs text-gray-400">
          {isPast ? "Quarter ended" : isFuture ? "Not started" : `Day ${Math.floor(elapsedDays)} of ${Math.floor(totalDays)}`}
        </span>
      </div>
      <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all", fillPct >= pacePct ? "bg-green-500" : "bg-amber-400")}
          style={{ width: `${fillPct * 100}%` }}
        />
        {!isPast && !isFuture && (
          <div className="absolute inset-y-0 w-0.5 bg-gray-500 opacity-60" style={{ left: `${pacePct * 100}%` }} />
        )}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{actual} received</span>
        <span>
          {!isPast && !isFuture && goal > 0 && <>{(pacePct * goal).toFixed(1)} expected &nbsp;·&nbsp;</>}
          Goal: {goal}
        </span>
      </div>
    </div>
  );
}

// ─── Priority Badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: ReferralPriority }) {
  return (
    <span className={cn(
      "text-xs px-2 py-0.5 rounded-full font-medium",
      priority === "High" ? "bg-red-100 text-red-700" :
      priority === "Medium" ? "bg-amber-100 text-amber-700" :
      "bg-gray-100 text-gray-600"
    )}>
      {priority || "—"}
    </span>
  );
}

// ─── Team View ────────────────────────────────────────────────────────────────

function TeamView({ planData }: { planData: PlanData }) {
  const { quarter, reps } = planData;
  const totalGoal = reps.reduce((s, r) => s + r.goal, 0);
  const totalActual = reps.reduce((s, r) => s + r.actual, 0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const today = new Date();
  const start = new Date(quarter.startDate);
  const end = new Date(quarter.endDate);
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
  const elapsedDays = Math.min(totalDays, Math.max(0, (today.getTime() - start.getTime()) / 86400000));
  const pacePct = elapsedDays / totalDays;

  function toggle(clerkUserId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clerkUserId)) next.delete(clerkUserId);
      else next.add(clerkUserId);
      return next;
    });
  }

  const sortedReps = [...reps].sort((a, b) => b.actual - a.actual);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <KPICard label="Team Goal" value={totalGoal} sub="referrals targeted" />
        <KPICard
          label="Team Received"
          value={totalActual}
          sub={`${totalGoal > 0 ? Math.round((totalActual / totalGoal) * 100) : 0}% of goal`}
        />
        <KPICard
          label="Expected Pace"
          value={totalGoal > 0 ? (pacePct * totalGoal).toFixed(1) : "—"}
          sub={today > end ? "quarter ended" : today < start ? "not started" : `${Math.round(pacePct * 100)}% through quarter`}
        />
      </div>

      <PacingBar quarter={quarter} actual={totalActual} goal={totalGoal} />

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Rep Leaderboard</h3>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {sortedReps.map((rep, idx) => {
            const pct = rep.goal > 0 ? Math.round((rep.actual / rep.goal) * 100) : null;
            const isOpen = expanded.has(rep.clerkUserId);
            const allPartners = [
              ...rep.activePartners.map((p) => ({ ...p, type: "Active" as const })),
              ...rep.conversionTargets.map((p) => ({ ...p, type: "Converting" as const })),
            ];

            return (
              <div key={rep.clerkUserId} className={idx > 0 ? "border-t border-gray-100" : ""}>
                {/* Summary row */}
                <button
                  onClick={() => toggle(rep.clerkUserId)}
                  className="w-full text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="grid grid-cols-[1fr_60px_60px_70px_80px_80px_32px] items-center px-4 py-3 text-sm">
                    <span className="font-medium text-gray-900">{rep.displayName}</span>
                    <span className="text-center text-gray-600">{rep.goal}</span>
                    <span className="text-center font-semibold text-gray-900">{rep.actual}</span>
                    <span className="text-center">
                      {pct === null ? (
                        <span className="text-gray-400 text-xs">—</span>
                      ) : (
                        <span className={cn(
                          "text-xs font-medium",
                          pct >= 100 ? "text-green-600" : pct >= 66 ? "text-amber-600" : "text-red-500"
                        )}>
                          {pct}%
                        </span>
                      )}
                    </span>
                    <span className="text-center text-gray-500 text-xs">{rep.activePartners.length} active</span>
                    <span className="text-center text-gray-500 text-xs">{rep.conversionTargets.length} converting</span>
                    <span className="text-gray-400 text-xs text-center">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* Accordion detail */}
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 pb-4 pt-3">
                    {allPartners.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No active or converting partners.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 uppercase tracking-wide">
                            <th className="text-left pb-1.5 font-medium">Company</th>
                            <th className="text-left pb-1.5 font-medium">Type</th>
                            <th className="text-left pb-1.5 font-medium">Priority</th>
                            <th className="text-center pb-1.5 font-medium">Goal</th>
                            <th className="text-center pb-1.5 font-medium">Received</th>
                            <th className="text-center pb-1.5 font-medium">vs Goal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allPartners.map((p) => {
                            const ppct = p.goal > 0 ? Math.round((p.actual / p.goal) * 100) : null;
                            return (
                              <tr key={p.companyId} className="border-t border-gray-200 first:border-0">
                                <td className="py-1.5 pr-3 font-medium text-gray-800">{p.companyName}</td>
                                <td className="py-1.5 pr-3">
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-xs font-medium",
                                    p.type === "Active" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                                  )}>
                                    {p.type}
                                  </span>
                                </td>
                                <td className="py-1.5 pr-3"><PriorityBadge priority={p.priority} /></td>
                                <td className="py-1.5 text-center text-gray-600">{p.goal}</td>
                                <td className="py-1.5 text-center font-semibold text-gray-900">{p.actual}</td>
                                <td className="py-1.5 text-center">
                                  {ppct === null ? <span className="text-gray-400">—</span> : (
                                    <span className={cn(
                                      "font-medium",
                                      ppct >= 100 ? "text-green-600" : ppct >= 66 ? "text-amber-600" : "text-red-500"
                                    )}>
                                      {ppct}%
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Table header — rendered as the first row since we have custom rows */}
          {sortedReps.length > 0 && (
            <div className="border-t border-gray-200 bg-gray-50">
              <div className="grid grid-cols-[1fr_60px_60px_70px_80px_80px_32px] px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <span>Rep</span>
                <span className="text-center">Goal</span>
                <span className="text-center">Rcvd</span>
                <span className="text-center">vs Goal</span>
                <span className="text-center">Partners</span>
                <span className="text-center">Converting</span>
                <span />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Individual Rep View ──────────────────────────────────────────────────────

function RepView({
  rep,
  quarter,
  isPast,
  onAddTarget,
  onRemoveTarget,
}: {
  rep: RepPlan;
  quarter: Quarter;
  isPast: boolean;
  onAddTarget: (companyId: string) => Promise<void>;
  onRemoveTarget: (targetId: string) => Promise<void>;
}) {
  const [toggling, setToggling] = useState<string | null>(null);

  async function handleToggleTarget(companyId: string, currentTargetId: string | null) {
    if (isPast) return;
    setToggling(companyId);
    try {
      if (currentTargetId) await onRemoveTarget(currentTargetId);
      else await onAddTarget(companyId);
    } finally {
      setToggling(null);
    }
  }

  const today = new Date();
  const start = new Date(quarter.startDate);
  const end = new Date(quarter.endDate);
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
  const elapsedDays = Math.min(totalDays, Math.max(0, (today.getTime() - start.getTime()) / 86400000));
  const pacePct = elapsedDays / totalDays;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <KPICard label="Quarter Goal" value={rep.goal} sub="referrals targeted" />
        <KPICard
          label="Received"
          value={rep.actual}
          sub={`${rep.goal > 0 ? Math.round((rep.actual / rep.goal) * 100) : 0}% of goal`}
        />
        <KPICard
          label="Expected Pace"
          value={rep.goal > 0 ? (pacePct * rep.goal).toFixed(1) : "—"}
          sub={today > end ? "quarter ended" : today < start ? "not started" : `${Math.round(pacePct * 100)}% through quarter`}
        />
      </div>

      <PacingBar quarter={quarter} actual={rep.actual} goal={rep.goal} />

      {/* Active Partners */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Active Referral Partners</h3>
        {rep.activePartners.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No Active Referral partners assigned yet.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Partner</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Priority</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Goal</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Received</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">vs Goal</th>
                </tr>
              </thead>
              <tbody>
                {rep.activePartners.map((p) => {
                  const pct = p.goal > 0 ? Math.round((p.actual / p.goal) * 100) : null;
                  return (
                    <tr key={p.companyId} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.companyName}</td>
                      <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                      <td className="px-4 py-3 text-center text-gray-600">{p.goal}</td>
                      <td className="px-4 py-3 text-center font-medium text-gray-900">{p.actual}</td>
                      <td className="px-4 py-3 text-center">
                        {pct === null ? (
                          <span className="text-gray-400 text-xs">—</span>
                        ) : (
                          <span className={cn(
                            "text-xs font-medium",
                            pct >= 100 ? "text-green-600" : pct >= 66 ? "text-amber-600" : "text-red-500"
                          )}>
                            {pct}%
                          </span>
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

      {/* Converting This Quarter */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Converting This Quarter</h3>
          {isPast && <span className="text-xs text-gray-400">(read-only)</span>}
        </div>

        {rep.conversionTargets.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-3">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Company</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Stage</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Goal</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Received</th>
                  {!isPast && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {rep.conversionTargets.map((t) => (
                  <tr key={t.companyId} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{t.companyName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{t.bestStage}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{t.goal}</td>
                    <td className="px-4 py-3 text-center font-medium text-gray-900">{t.actual}</td>
                    {!isPast && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleToggleTarget(t.companyId, t.targetId)}
                          disabled={toggling === t.companyId}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic mb-3">No companies targeted for conversion this quarter.</p>
        )}

        {!isPast && (
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">
              Add from your pipeline
            </p>
            {rep.availableToConvert.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                No other companies are assigned to you — assign companies in the Referral Partners tab to track them here.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {rep.availableToConvert.map((c) => (
                  <button
                    key={c.companyId}
                    onClick={() => handleToggleTarget(c.companyId, null)}
                    disabled={toggling === c.companyId}
                    className="inline-flex items-center gap-1.5 text-xs border border-dashed border-gray-300 text-gray-500 rounded-lg px-2.5 py-1.5 hover:border-forest-400 hover:text-forest-600 hover:bg-forest-50 transition-colors disabled:opacity-40"
                  >
                    <span className="text-gray-400">+</span>
                    {c.companyName}
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400">{c.bestStage}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main PlanTab ─────────────────────────────────────────────────────────────

export default function PlanTab({ currentUserId, sysRole }: PlanTabProps) {
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [selectedQuarterId, setSelectedQuarterId] = useState<string | null>(null);
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quartersLoading, setQuartersLoading] = useState(true);
  const [showAddQuarter, setShowAddQuarter] = useState(false);
  const [viewMode, setViewMode] = useState<"team" | string>("team");

  const isAdmin = sysRole === "TTTAdmin";
  const isSalesOnly = sysRole === "TTTSales";

  useEffect(() => {
    fetch("/api/crm/quarters")
      .then((r) => r.json())
      .then((data) => {
        const qs: Quarter[] = data.quarters ?? [];
        setQuarters(qs);
        if (qs.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const current = qs.find((q) => q.startDate <= today && q.endDate >= today);
          setSelectedQuarterId((current ?? qs[0]).id);
        }
      })
      .catch(console.error)
      .finally(() => setQuartersLoading(false));
  }, []);

  const loadPlan = useCallback(async (quarterId: string) => {
    setLoading(true);
    setPlanData(null);
    setLoadError(null);
    try {
      const res = await fetch(`/api/crm/plan?quarterId=${quarterId}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      if (data.debug) console.log("[PlanTab] debug:", data.debug);
      setPlanData(data);
    } catch (e) {
      setLoadError(String(e));
      console.error("[PlanTab] load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedQuarterId) loadPlan(selectedQuarterId);
  }, [selectedQuarterId, loadPlan]);

  // TTTSales can only see team view or their own individual view
  useEffect(() => {
    if (isSalesOnly && viewMode !== "team" && viewMode !== currentUserId) {
      setViewMode("team");
    }
  }, [isSalesOnly, viewMode, currentUserId]);

  async function handleAddTarget(companyId: string) {
    if (!selectedQuarterId) return;
    const res = await fetch("/api/crm/plan/conversion-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarterId: selectedQuarterId, companyId }),
    });
    if (!res.ok) throw new Error("Failed");
    await loadPlan(selectedQuarterId);
  }

  async function handleRemoveTarget(targetId: string) {
    const res = await fetch(`/api/crm/plan/conversion-targets?id=${targetId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed");
    if (selectedQuarterId) await loadPlan(selectedQuarterId);
  }

  function handleQuarterCreated(q: Quarter) {
    setQuarters((prev) => [q, ...prev]);
    setSelectedQuarterId(q.id);
    setShowAddQuarter(false);
  }

  const selectedQuarter = quarters.find((q) => q.id === selectedQuarterId);
  const today = new Date().toISOString().slice(0, 10);
  const isPast = selectedQuarter ? selectedQuarter.endDate < today : false;

  // View tabs: Team + only TTTSales reps (individual views)
  const repOptions = planData?.reps ?? [];
  const viewOptions: { key: string; label: string }[] = [
    { key: "team", label: "Team" },
    ...repOptions
      .filter((r) => !isSalesOnly || r.clerkUserId === currentUserId)
      .map((r) => ({ key: r.clerkUserId, label: r.displayName })),
  ];

  const activeRep = planData?.reps.find((r) => r.clerkUserId === viewMode);

  if (quartersLoading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading quarters...</div>;
  }

  if (quarters.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-500 mb-4">No quarters set up yet.</p>
        {isAdmin && (
          <button onClick={() => setShowAddQuarter(true)}
            className="text-sm bg-forest-600 text-white rounded-lg px-4 py-2 hover:bg-forest-700">
            + Create First Quarter
          </button>
        )}
        {showAddQuarter && <AddQuarterModal onClose={() => setShowAddQuarter(false)} onCreated={handleQuarterCreated} />}
      </div>
    );
  }

  return (
    <div>
      {/* Quarter tabs */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white">
          {quarters.map((q) => (
            <button
              key={q.id}
              onClick={() => setSelectedQuarterId(q.id)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors",
                q.id === selectedQuarterId ? "bg-forest-600 text-white" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
        {isAdmin && (
          <button onClick={() => setShowAddQuarter(true)}
            className="text-sm border border-dashed border-gray-300 text-gray-500 hover:text-forest-600 hover:border-forest-400 rounded-lg px-3 py-1.5 transition-colors">
            + Add Quarter
          </button>
        )}
      </div>

      {/* View switcher (Team + individual TTTSales reps only) */}
      {viewOptions.length > 1 && (
        <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white w-fit mb-5">
          {viewOptions.map((v) => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === v.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="py-12 text-center text-sm text-gray-400">Loading plan data...</div>}

      {!loading && loadError && (
        <div className="py-8 text-center text-sm text-red-500">
          Failed to load plan: {loadError}
        </div>
      )}

      {!loading && planData && viewMode === "team" && <TeamView planData={planData} />}

      {!loading && planData && activeRep && (
        <RepView
          rep={activeRep}
          quarter={planData.quarter}
          isPast={isPast}
          onAddTarget={handleAddTarget}
          onRemoveTarget={handleRemoveTarget}
        />
      )}

      {showAddQuarter && <AddQuarterModal onClose={() => setShowAddQuarter(false)} onCreated={handleQuarterCreated} />}
    </div>
  );
}
