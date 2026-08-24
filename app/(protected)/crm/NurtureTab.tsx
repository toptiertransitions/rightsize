"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { ReferralPriority } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StageChangeRow {
  contactId: string;
  contactName: string;
  contactTitle: string | null;
  companyName: string;
  priority: string;
  ownerName: string;
  previousStage: string;
  currentStage: string;
  stageChangedAt: string;
  lastActivityDate: string | null;
  nextStepDate: string | null;
  nextStepNote: string | null;
}

interface Quarter {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

interface ConversionTarget {
  companyId: string;
  companyName: string;
  priority: ReferralPriority;
  goal: number;
  actual: number;
  targetId: string;
  bestStage: string;
  startingStage: string;
  lastActivityDate: string | null;
  nextStepDate: string | null;
  nextStepNote: string | null;
  stageDurationDays: number | null;
  competitors: string | null;
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
  repGoal: number | null;
  activePartners: { companyId: string; companyName: string; priority: ReferralPriority; goal: number; actual: number; competitors: string | null }[];
  conversionTargets: ConversionTarget[];
  availableToConvert: AvailableCompany[];
}

interface PlanData {
  quarter: Quarter;
  reps: RepPlan[];
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
            <input value={label} onChange={(e) => setLabel(e.target.value)} required
              className="w-full h-9 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
              placeholder="Q1 2026" />
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

function EditQuarterModal({ quarter, onClose, onSaved }: { quarter: Quarter; onClose: () => void; onSaved: (q: Quarter) => void }) {
  const [label, setLabel] = useState(quarter.label);
  const [startDate, setStartDate] = useState(quarter.startDate);
  const [endDate, setEndDate] = useState(quarter.endDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/crm/quarters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: quarter.id, label, startDate, endDate }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      onSaved(data.quarter);
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Edit Quarter</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} required
              className="w-full h-9 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500" />
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
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  const color =
    stage === "Active Referral" ? "bg-green-100 text-green-700" :
    stage === "Shared Leads" ? "bg-teal-100 text-teal-700" :
    stage === "Agreed to Refer" ? "bg-blue-100 text-blue-700" :
    stage === "Met" ? "bg-indigo-100 text-indigo-700" :
    stage === "Identified" ? "bg-slate-100 text-slate-600" :
    stage === "Inactive Referral" ? "bg-red-100 text-red-600" :
    "bg-gray-100 text-gray-500";
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap", color)}>
      {stage || "—"}
    </span>
  );
}

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

function fmtDays(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "today";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}wk`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}yr`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return dt.toLocaleDateString("en-US", {
    month: "short", day: "numeric",
    ...(sameYear ? {} : { year: "2-digit" }),
  });
}

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2, "": 3 };

function sortByPriorityThenName<T extends { priority: ReferralPriority; companyName: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const diff = (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
    return diff !== 0 ? diff : a.companyName.localeCompare(b.companyName);
  });
}

// ─── Stage Changes Table ──────────────────────────────────────────────────────

function StageChangesTable({ rows, loading }: { rows: StageChangeRow[]; loading: boolean }) {
  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading recent stage changes...</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center text-sm text-gray-400 italic">
        No stage changes in the last 30 days.
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-green-900">Recent Progress — Stage Changes (Last 30 Days)</h3>
        <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">{rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs w-full" style={{ minWidth: 780 }}>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Company</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Contact</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Owner</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Stage Change</th>
              <th className="text-center px-4 py-2.5 font-medium text-gray-500">Changed</th>
              <th className="text-center px-4 py-2.5 font-medium text-gray-500">Last Activity</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Next Step</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.contactId} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{c.companyName}</td>
                <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                  {c.contactName}
                  {c.contactTitle && <span className="text-gray-400 block text-[10px]">{c.contactTitle}</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{c.ownerName || "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <StageBadge stage={c.previousStage} />
                  <span className="mx-1.5 text-gray-400">→</span>
                  <StageBadge stage={c.currentStage} />
                </td>
                <td className="px-4 py-2.5 text-center text-gray-500 whitespace-nowrap">{fmtDate(c.stageChangedAt?.slice(0, 10))}</td>
                <td className="px-4 py-2.5 text-center text-gray-500 whitespace-nowrap">{c.lastActivityDate ? fmtDate(c.lastActivityDate) : "—"}</td>
                <td className="px-4 py-2.5 text-gray-700 max-w-[180px]">
                  {c.nextStepDate ? (
                    <div>
                      <span className="whitespace-nowrap">{fmtDate(c.nextStepDate)}</span>
                      {c.nextStepNote && <p className="text-gray-400 truncate mt-0.5">{c.nextStepNote}</p>}
                    </div>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Not Yet Referring (Team View — flat table) ───────────────────────────────

interface FlatTarget extends ConversionTarget {
  repName: string;
  repClerkId: string;
}

function TeamNurtureTable({ targets }: { targets: FlatTarget[] }) {
  if (targets.length === 0) {
    return <p className="text-sm text-gray-400 italic">No companies are targeted for conversion this quarter.</p>;
  }
  const sorted = [...targets].sort((a, b) => {
    const pd = (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
    return pd !== 0 ? pd : a.companyName.localeCompare(b.companyName);
  });
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="text-sm w-full" style={{ minWidth: 860 }}>
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Company</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Rep</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Priority</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Start Stage</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Current Stage</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Stage Age</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Last Activity</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Next Step</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Goal</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Rcvd</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={`${t.repClerkId}-${t.companyId}`} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{t.companyName}</td>
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{t.repName}</td>
              <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
              <td className="px-4 py-3"><StageBadge stage={t.startingStage || "—"} /></td>
              <td className="px-4 py-3"><StageBadge stage={t.bestStage} /></td>
              <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">{fmtDays(t.stageDurationDays)}</td>
              <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">{fmtDate(t.lastActivityDate)}</td>
              <td className="px-4 py-3 max-w-[180px]">
                {t.nextStepDate ? (
                  <div>
                    <p className="text-gray-800 font-medium whitespace-nowrap">{fmtDate(t.nextStepDate)}</p>
                    {t.nextStepNote && <p className="text-xs text-gray-400 truncate mt-0.5" title={t.nextStepNote}>{t.nextStepNote}</p>}
                  </div>
                ) : <span className="text-gray-400">—</span>}
              </td>
              <td className="px-4 py-3 text-center text-gray-600">{t.goal}</td>
              <td className="px-4 py-3 text-center font-medium text-gray-900">{t.actual}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Not Yet Referring (Rep View — with add/remove) ───────────────────────────

function RepNurtureSection({
  rep,
  isPast,
  canManageTargets,
  toggling,
  onAddTarget,
  onRemoveTarget,
}: {
  rep: RepPlan;
  isPast: boolean;
  canManageTargets: boolean;
  toggling: string | null;
  onAddTarget: (companyId: string, currentStage: string, forClerkUserId?: string) => Promise<void>;
  onRemoveTarget: (targetId: string, companyId: string) => Promise<void>;
}) {
  const canManage = canManageTargets;

  return (
    <div className="space-y-4">
      {/* Conversion Targets */}
      {rep.conversionTargets.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="text-sm w-full" style={{ minWidth: 880 }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Company</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Priority</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Start Stage</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Current Stage</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Stage Age</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Last Activity</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Next Step</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Goal</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Rcvd</th>
                {canManage && !isPast && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {sortByPriorityThenName(rep.conversionTargets).map((t) => (
                <tr key={t.companyId} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{t.companyName}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-4 py-3"><StageBadge stage={t.startingStage || "—"} /></td>
                  <td className="px-4 py-3"><StageBadge stage={t.bestStage} /></td>
                  <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">{fmtDays(t.stageDurationDays)}</td>
                  <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">{fmtDate(t.lastActivityDate)}</td>
                  <td className="px-4 py-3 max-w-[180px]">
                    {t.nextStepDate ? (
                      <div>
                        <p className="text-gray-800 font-medium whitespace-nowrap">{fmtDate(t.nextStepDate)}</p>
                        {t.nextStepNote && <p className="text-xs text-gray-400 truncate mt-0.5" title={t.nextStepNote}>{t.nextStepNote}</p>}
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{t.goal}</td>
                  <td className="px-4 py-3 text-center font-medium text-gray-900">{t.actual}</td>
                  {canManage && !isPast && (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => onRemoveTarget(t.targetId, t.companyId)}
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
        <p className="text-sm text-gray-400 italic">No companies targeted for conversion this quarter.</p>
      )}

      {/* Add from pipeline */}
      {canManageTargets && !isPast && rep.availableToConvert.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Add from your pipeline</p>
          <div className="flex flex-wrap gap-2">
            {rep.availableToConvert.map((c) => (
              <button
                key={c.companyId}
                onClick={() => onAddTarget(c.companyId, c.bestStage, rep.clerkUserId)}
                disabled={toggling === c.companyId}
                className="inline-flex items-center gap-1.5 text-xs border border-dashed border-gray-300 text-gray-500 rounded-lg px-2.5 py-1.5 hover:border-forest-400 hover:text-forest-600 hover:bg-forest-50 transition-colors disabled:opacity-40"
              >
                <span className="text-gray-400">+</span>
                {c.companyName}
                <span className="text-gray-300">·</span>
                <StageBadge stage={c.bestStage} />
              </button>
            ))}
          </div>
        </div>
      )}

      {canManageTargets && !isPast && rep.availableToConvert.length === 0 && rep.conversionTargets.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          No other companies are assigned to you — assign companies in the Referral Partners tab to track them here.
        </p>
      )}
    </div>
  );
}

// ─── Main NurtureTab ──────────────────────────────────────────────────────────

export default function NurtureTab({ currentUserId, sysRole }: { currentUserId: string; sysRole: string }) {
  const [stageChanges, setStageChanges] = useState<StageChangeRow[]>([]);
  const [stageChangesLoading, setStageChangesLoading] = useState(true);
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [selectedQuarterId, setSelectedQuarterId] = useState<string | null>(null);
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [quartersLoading, setQuartersLoading] = useState(true);
  const [showAddQuarter, setShowAddQuarter] = useState(false);
  const [showEditQuarter, setShowEditQuarter] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const isAdmin = sysRole === "TTTAdmin";
  const [viewMode, setViewMode] = useState<"team" | string>(
    sysRole === "TTTSales" ? currentUserId : "team"
  );

  useEffect(() => {
    setStageChangesLoading(true);
    fetch("/api/crm/stage-changes?days=30")
      .then((r) => r.json())
      .then((d) => setStageChanges(d.rows ?? []))
      .catch(() => {})
      .finally(() => setStageChangesLoading(false));
  }, []);

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
    setPlanLoading(true);
    setPlanData(null);
    try {
      const res = await fetch(`/api/crm/plan?quarterId=${quarterId}`);
      const data = await res.json();
      if (res.ok) setPlanData(data);
    } catch (e) {
      console.error("[NurtureTab] load error:", e);
    } finally {
      setPlanLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedQuarterId) loadPlan(selectedQuarterId);
  }, [selectedQuarterId, loadPlan]);

  async function handleAddTarget(companyId: string, currentStage: string, forClerkUserId?: string) {
    if (!selectedQuarterId) return;
    setToggling(companyId);
    try {
      const res = await fetch("/api/crm/plan/conversion-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarterId: selectedQuarterId, companyId, startingStage: currentStage, forClerkUserId }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadPlan(selectedQuarterId);
    } finally {
      setToggling(null);
    }
  }

  async function handleRemoveTarget(targetId: string, companyId: string) {
    setToggling(companyId);
    try {
      const res = await fetch(`/api/crm/plan/conversion-targets?id=${targetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      if (selectedQuarterId) await loadPlan(selectedQuarterId);
    } finally {
      setToggling(null);
    }
  }

  function handleQuarterCreated(q: Quarter) {
    setQuarters((prev) => [q, ...prev]);
    setSelectedQuarterId(q.id);
    setShowAddQuarter(false);
  }

  function handleQuarterSaved(q: Quarter) {
    setQuarters((prev) => prev.map((existing) => (existing.id === q.id ? q : existing)));
    setShowEditQuarter(false);
    if (selectedQuarterId === q.id) loadPlan(q.id);
  }

  const selectedQuarter = quarters.find((q) => q.id === selectedQuarterId);
  const today = new Date().toISOString().slice(0, 10);
  const isPast = selectedQuarter ? selectedQuarter.endDate < today : false;

  const repOptions: { key: string; label: string }[] = [
    { key: "team", label: "Team" },
    ...(planData?.reps ?? []).map((r) => ({ key: r.clerkUserId, label: r.displayName })),
  ];

  const activeRep = planData?.reps.find((r) => r.clerkUserId === viewMode);
  // Can manage targets for the currently viewed rep (own data, or admin/manager)
  const canManageActiveRep = isAdmin || sysRole === "TTTManager" || activeRep?.clerkUserId === currentUserId;

  const allFlatTargets: FlatTarget[] = (planData?.reps ?? []).flatMap((r) =>
    r.conversionTargets.map((t) => ({ ...t, repName: r.displayName, repClerkId: r.clerkUserId }))
  );

  return (
    <div className="space-y-6">
      {/* Stage Changes — always at the top */}
      <StageChangesTable rows={stageChanges} loading={stageChangesLoading} />

      {/* Quarter selector */}
      {!quartersLoading && quarters.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Not Yet Referring Pipeline</h2>
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
                  {!q.startDate && <span className="ml-1 text-amber-300 text-xs">!</span>}
                </button>
              ))}
            </div>
            {isAdmin && selectedQuarter && (
              <button onClick={() => setShowEditQuarter(true)}
                className="text-sm border border-gray-300 text-gray-500 hover:text-forest-600 hover:border-forest-400 rounded-lg px-3 py-1.5 transition-colors">
                Edit Dates
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setShowAddQuarter(true)}
                className="text-sm border border-dashed border-gray-300 text-gray-500 hover:text-forest-600 hover:border-forest-400 rounded-lg px-3 py-1.5 transition-colors">
                + Add Quarter
              </button>
            )}
          </div>

          {/* Missing dates warning */}
          {selectedQuarter && (!selectedQuarter.startDate || !selectedQuarter.endDate) && (
            <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <span>This quarter has no date range set.</span>
              {isAdmin && (
                <button onClick={() => setShowEditQuarter(true)}
                  className="ml-auto shrink-0 text-sm font-medium text-amber-700 underline hover:text-amber-900">
                  Set dates
                </button>
              )}
            </div>
          )}

          {/* View switcher */}
          {repOptions.length > 1 && (
            <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white w-fit mb-4">
              {repOptions.map((v) => (
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

          {planLoading && <div className="py-8 text-center text-sm text-gray-400">Loading pipeline data...</div>}

          {!planLoading && planData && viewMode === "team" && (
            <TeamNurtureTable targets={allFlatTargets} />
          )}

          {!planLoading && planData && activeRep && (
            <RepNurtureSection
              rep={activeRep}
              isPast={isPast}
              canManageTargets={canManageActiveRep}
              toggling={toggling}
              onAddTarget={handleAddTarget}
              onRemoveTarget={handleRemoveTarget}
            />
          )}
        </div>
      )}

      {quartersLoading && <div className="py-4 text-center text-sm text-gray-400">Loading...</div>}

      {!quartersLoading && quarters.length === 0 && (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-500 mb-4">No quarters set up yet.</p>
          {isAdmin && (
            <button onClick={() => setShowAddQuarter(true)}
              className="text-sm bg-forest-600 text-white rounded-lg px-4 py-2 hover:bg-forest-700">
              + Create First Quarter
            </button>
          )}
        </div>
      )}

      {showAddQuarter && <AddQuarterModal onClose={() => setShowAddQuarter(false)} onCreated={handleQuarterCreated} />}
      {showEditQuarter && selectedQuarter && (
        <EditQuarterModal quarter={selectedQuarter} onClose={() => setShowEditQuarter(false)} onSaved={handleQuarterSaved} />
      )}
    </div>
  );
}
