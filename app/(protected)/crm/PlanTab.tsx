"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
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
  competitors: string | null;
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

// ─── Edit Quarter Modal ───────────────────────────────────────────────────────

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

// ─── Contact detail types (company-contacts API) ─────────────────────────────

interface QuarterReferral {
  clientName: string;
  city: string | null;
  state: string | null;
  oppStage: string;
  oppValue: number;
  referredAt: string;
}

interface ContactDetail {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  stage: string;
  dateIntroduced: string | null;
  lastActivityDate: string | null;
  activityCount: number;
  nextStepDate: string | null;
  nextStepNote: string | null;
  portalStatus: "active" | "invited" | "none";
  quarterReferrals: QuarterReferral[];
  allTimeTotalReferred: number;
  allTimeWonCount: number;
  allTimeWonValue: number;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

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

function fmtDollar(n: number): string {
  if (n === 0) return "$0";
  return "$" + n.toLocaleString("en-US");
}

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2, "": 3 };

function sortByPriorityThenName<T extends { priority: ReferralPriority; companyName: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const diff = (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
    return diff !== 0 ? diff : a.companyName.localeCompare(b.companyName);
  });
}

// ─── Stage Badge ─────────────────────────────────────────────────────────────

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

// ─── Opp Stage Badge ─────────────────────────────────────────────────────────

function OppStageBadge({ stage }: { stage: string }) {
  const cls =
    stage === "Won" ? "bg-green-100 text-green-700" :
    stage === "Lost" ? "bg-red-100 text-red-600" :
    "bg-blue-100 text-blue-700";
  return <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap", cls)}>{stage}</span>;
}

// ─── Portal Status Badge ──────────────────────────────────────────────────────

function PortalStatusBadge({ status }: { status: "active" | "invited" | "none" }) {
  if (status === "none") return null;
  return (
    <span className={cn(
      "text-xs px-1.5 py-0.5 rounded font-medium",
      status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
    )}>
      {status === "active" ? "Portal Active" : "Invite Sent"}
    </span>
  );
}

// ─── Quarterly Plan Section ───────────────────────────────────────────────────

interface CompanyPlan {
  meeting1: string; meeting2: string; meeting3: string;
  resource1: string; resource2: string; resource3: string;
  monthlyMeetingGoal: number;
  monthlyCheckinGoal: number;
}

interface MonthStat {
  key: string;
  label: string;
  meetings: number;
  checkins: number;
}

interface CompareResult {
  item: string;
  status: "done" | "in-progress" | "not-started";
  note: string;
}

function QuarterlyPlanSection({
  companyId,
  quarterId,
  companyName,
  competitors,
}: {
  companyId: string;
  quarterId: string;
  companyName: string;
  competitors?: string | null;
}) {
  const [plan, setPlan] = useState<CompanyPlan>({
    meeting1: "", meeting2: "", meeting3: "",
    resource1: "", resource2: "", resource3: "",
    monthlyMeetingGoal: 0, monthlyCheckinGoal: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [meetingGoalStr, setMeetingGoalStr] = useState("");
  const [checkinGoalStr, setCheckinGoalStr] = useState("");
  const [actStats, setActStats] = useState<MonthStat[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareResults, setCompareResults] = useState<{ results: CompareResult[]; summary: string } | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(false);
    setActStats(null);
    fetch(`/api/crm/plan/company-plan?companyId=${companyId}&quarterId=${quarterId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.plan) {
          setPlan(d.plan);
          setMeetingGoalStr(d.plan.monthlyMeetingGoal > 0 ? String(d.plan.monthlyMeetingGoal) : "");
          setCheckinGoalStr(d.plan.monthlyCheckinGoal > 0 ? String(d.plan.monthlyCheckinGoal) : "");
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    fetch(`/api/crm/plan/activity-stats?companyId=${companyId}&quarterId=${quarterId}`)
      .then((r) => r.json())
      .then((d) => setActStats(d.months ?? []))
      .catch(() => setActStats([]));
  }, [companyId, quarterId]);

  async function saveField(field: keyof Pick<CompanyPlan, "meeting1"|"meeting2"|"meeting3"|"resource1"|"resource2"|"resource3">, value: string) {
    setSaving(field);
    try {
      await fetch("/api/crm/plan/company-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, quarterId, [field]: value }),
      });
    } finally {
      setSaving(null);
    }
  }

  async function saveNumericField(field: "monthlyMeetingGoal" | "monthlyCheckinGoal", value: number) {
    setPlan((p) => ({ ...p, [field]: value }));
    const airtableKey = field === "monthlyMeetingGoal" ? "monthlyMeetingGoal" : "monthlyCheckinGoal";
    await fetch("/api/crm/plan/company-plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, quarterId, [airtableKey]: value }),
    });
  }

  async function handleCompare() {
    setComparing(true);
    setCompareResults(null);
    setCompareError(null);
    try {
      const res = await fetch("/api/crm/plan/compare-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId, quarterId, companyName,
          meetings: [plan.meeting1, plan.meeting2, plan.meeting3],
          resources: [plan.resource1, plan.resource2, plan.resource3],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Compare failed");
      setCompareResults(data);
    } catch (e) {
      setCompareError(String(e));
    } finally {
      setComparing(false);
    }
  }

  if (!loaded) return <div className="px-5 pt-4 pb-2 text-xs text-gray-400 italic">Loading plan...</div>;

  const hasPlanItems = [plan.meeting1, plan.meeting2, plan.meeting3, plan.resource1, plan.resource2, plan.resource3].some(Boolean);

  const todayMonthKey = new Date().toISOString().slice(0, 7);

  function cellClass(actual: number, goal: number, monthKey: string) {
    if (monthKey > todayMonthKey) return "bg-gray-50 text-gray-300";
    if (goal === 0) return "bg-gray-50 text-gray-400";
    if (actual >= goal) return "bg-green-100 text-green-800 font-semibold";
    if (actual * 2 >= goal) return "bg-amber-50 text-amber-700";
    return "bg-red-50 text-red-600";
  }

  const statusColor = (s: string) =>
    s === "done" ? "bg-green-50 border-green-200 text-green-700" :
    s === "in-progress" ? "bg-amber-50 border-amber-200 text-amber-700" :
    "bg-red-50 border-red-200 text-red-500";

  const statusDot = (s: string) =>
    s === "done" ? "bg-green-500" :
    s === "in-progress" ? "bg-amber-400" :
    "bg-red-400";

  return (
    <div className="bg-white border-b border-slate-200 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quarter&apos;s Plan</h4>
        <button
          onClick={handleCompare}
          disabled={comparing || !hasPlanItems}
          className="text-xs bg-forest-600 text-white rounded-lg px-3 py-1.5 hover:bg-forest-700 disabled:opacity-40 transition-colors"
        >
          {comparing ? "Analyzing..." : "Compare Activity"}
        </button>
      </div>

      {/* Key Meetings + Key Resources */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Key Meetings</p>
          <div className="space-y-1.5">
            {(["meeting1", "meeting2", "meeting3"] as const).map((f, i) => (
              <input
                key={f}
                type="text"
                value={plan[f]}
                placeholder={`Meeting ${i + 1}`}
                onChange={(e) => setPlan((p) => ({ ...p, [f]: e.target.value }))}
                onBlur={(e) => saveField(f, e.target.value)}
                className={cn(
                  "w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400",
                  saving === f ? "border-forest-300 bg-forest-50" : "border-gray-200"
                )}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Key Resources to Use</p>
          <div className="space-y-1.5">
            {(["resource1", "resource2", "resource3"] as const).map((f, i) => (
              <input
                key={f}
                type="text"
                value={plan[f]}
                placeholder={`Resource ${i + 1}`}
                onChange={(e) => setPlan((p) => ({ ...p, [f]: e.target.value }))}
                onBlur={(e) => saveField(f, e.target.value)}
                className={cn(
                  "w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400",
                  saving === f ? "border-forest-300 bg-forest-50" : "border-gray-200"
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Goals */}
      <div className="flex gap-4 mb-3">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Monthly In-Person Meetings Goal</p>
          <input
            type="number"
            min="0"
            value={meetingGoalStr}
            placeholder="0"
            onFocus={(e) => e.target.select()}
            onChange={(e) => setMeetingGoalStr(e.target.value)}
            onBlur={(e) => {
              const n = parseInt(e.target.value, 10);
              const val = isNaN(n) || n < 0 ? 0 : n;
              setMeetingGoalStr(val > 0 ? String(val) : "");
              saveNumericField("monthlyMeetingGoal", val);
            }}
            className="w-24 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400"
          />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Monthly Checkins Goal</p>
          <input
            type="number"
            min="0"
            value={checkinGoalStr}
            placeholder="0"
            onFocus={(e) => e.target.select()}
            onChange={(e) => setCheckinGoalStr(e.target.value)}
            onBlur={(e) => {
              const n = parseInt(e.target.value, 10);
              const val = isNaN(n) || n < 0 ? 0 : n;
              setCheckinGoalStr(val > 0 ? String(val) : "");
              saveNumericField("monthlyCheckinGoal", val);
            }}
            className="w-24 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400"
          />
        </div>
        <div className="self-end pb-1.5">
          <p className="text-xs text-gray-400">Checkins = Calls, Emails &amp; Texts</p>
        </div>
      </div>

      {/* Activity Tracker */}
      {actStats && actStats.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1.5">Activity vs Goals</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left pr-3 pb-1 font-medium text-gray-400 w-24" />
                  {actStats.map((m) => (
                    <th key={m.key} className="text-center px-2 pb-1 font-medium text-gray-500 whitespace-nowrap">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pr-3 py-1 text-gray-500 font-medium whitespace-nowrap">In-Person Mtgs</td>
                  {actStats.map((m) => {
                    const isFuture = m.key > todayMonthKey;
                    return (
                      <td key={m.key} className={cn("text-center px-2 py-1 rounded", cellClass(m.meetings, plan.monthlyMeetingGoal, m.key))}>
                        {isFuture ? "—" : plan.monthlyMeetingGoal > 0 ? `${m.meetings} / ${plan.monthlyMeetingGoal}` : m.meetings || "—"}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="pr-3 py-1 text-gray-500 font-medium whitespace-nowrap">Checkins</td>
                  {actStats.map((m) => {
                    const isFuture = m.key > todayMonthKey;
                    return (
                      <td key={m.key} className={cn("text-center px-2 py-1 rounded", cellClass(m.checkins, plan.monthlyCheckinGoal, m.key))}>
                        {isFuture ? "—" : plan.monthlyCheckinGoal > 0 ? `${m.checkins} / ${plan.monthlyCheckinGoal}` : m.checkins || "—"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Competitors */}
      {competitors && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Competitors</p>
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">{competitors}</p>
        </div>
      )}

      {/* Compare Results */}
      {compareError && (
        <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">{compareError}</div>
      )}
      {compareResults && (
        <div className="mt-3 space-y-2">
          {compareResults.summary && (
            <p className="text-xs text-gray-600 italic mb-2">{compareResults.summary}</p>
          )}
          {compareResults.results.map((r, i) => (
            <div key={i} className={cn("flex items-start gap-2 border rounded-lg px-3 py-2", statusColor(r.status))}>
              <div className={cn("mt-0.5 w-2 h-2 rounded-full shrink-0", statusDot(r.status))} />
              <div className="min-w-0">
                <p className="text-xs font-medium leading-snug">{r.item}</p>
                {r.note && <p className="text-xs opacity-80 mt-0.5">{r.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Company Contacts Panel (lazy-loaded accordion detail) ────────────────────

function CompanyContactsPanel({
  companyId,
  quarterId,
  excludeStages,
  companyName,
  competitors,
}: {
  companyId: string;
  quarterId: string;
  excludeStages?: string[];
  companyName: string;
  competitors?: string | null;
}) {
  const [rawContacts, setRawContacts] = useState<ContactDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRawContacts(null);
    setError(null);
    fetch(`/api/crm/plan/company-contacts?companyId=${companyId}&quarterId=${quarterId}`)
      .then((r) => r.json())
      .then((d) => setRawContacts(d.contacts ?? []))
      .catch((e) => setError(String(e)));
  }, [companyId, quarterId]);

  const contacts = rawContacts
    ? (excludeStages?.length
        ? rawContacts.filter((c) => !excludeStages.includes(c.stage))
        : rawContacts)
    : null;

  if (error) return (
    <div className="px-6 py-3 text-xs text-red-500 bg-red-50">Failed to load contacts: {error}</div>
  );

  return (
    <>
      <QuarterlyPlanSection companyId={companyId} quarterId={quarterId} companyName={companyName} competitors={competitors} />
      {!contacts ? (
        <div className="px-6 py-3 text-xs text-gray-400 italic">Loading contacts...</div>
      ) : contacts.length === 0 ? (
        <div className="px-6 py-3 text-xs text-gray-400 italic">No referral contacts recorded for this company.</div>
      ) : (
    <div className="bg-slate-50 border-t border-slate-200 px-5 py-4 space-y-3">
      {contacts.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
          {/* Contact header */}
          <div className="flex items-start justify-between gap-4 mb-2.5">
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-2 mb-1">
                <span className="font-semibold text-gray-900">{c.name}</span>
                {c.title && <span className="text-xs text-gray-500">{c.title}</span>}
                <StageBadge stage={c.stage} />
                <PortalStatusBadge status={c.portalStatus} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                {c.dateIntroduced && <span>Introduced: {fmtDate(c.dateIntroduced)}</span>}
                {c.email && <span>{c.email}</span>}
                {c.phone && <span>{c.phone}</span>}
              </div>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
              <div className="font-medium">{c.activityCount} activities</div>
              {c.lastActivityDate && <div className="text-gray-400">Last: {fmtDate(c.lastActivityDate)}</div>}
            </div>
          </div>

          {/* Next step */}
          {c.nextStepDate && (
            <div className="mb-3 text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <span className="font-semibold text-amber-800">Next Step: {fmtDate(c.nextStepDate)}</span>
              {c.nextStepNote && <span className="text-amber-700"> — {c.nextStepNote}</span>}
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            {/* Quarter referrals */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                This Quarter &mdash; {c.quarterReferrals.length} referral{c.quarterReferrals.length !== 1 ? "s" : ""}
                {c.quarterReferrals.length > 0 && (
                  <span className="text-gray-500 normal-case font-normal ml-1">
                    ({fmtDollar(c.quarterReferrals.reduce((s, r) => s + r.oppValue, 0))} value)
                  </span>
                )}
              </p>
              {c.quarterReferrals.length === 0 ? (
                <p className="text-xs text-gray-400 italic">None yet</p>
              ) : (
                <div className="space-y-1.5">
                  {c.quarterReferrals.map((r, i) => (
                    <div key={i} className="text-xs flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-800">{r.clientName}</span>
                        {(r.city || r.state) && (
                          <span className="text-gray-400"> · {[r.city, r.state].filter(Boolean).join(", ")}</span>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {r.oppValue > 0 && <span className="font-medium text-gray-900">{fmtDollar(r.oppValue)}</span>}
                        <OppStageBadge stage={r.oppStage} />
                        <span className="text-gray-400">{fmtDate(r.referredAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All-time stats */}
            <div className="border-l border-gray-100 pl-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">All Time</p>
              <div className="space-y-1 text-xs">
                <div className="text-gray-600">{c.allTimeTotalReferred} total referred</div>
                <div className="text-gray-600">
                  {c.allTimeWonCount} won
                  {c.allTimeWonValue > 0 && (
                    <span className="text-green-700 font-semibold ml-1">{fmtDollar(c.allTimeWonValue)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
      )}
    </>
  );
}

// ─── Inline Goal Editor (admin only) ─────────────────────────────────────────

function InlineGoalEditor({
  currentGoal,
  onSave,
}: {
  currentGoal: number;
  onSave: (goal: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentGoal));
  const [saving, setSaving] = useState(false);

  async function commit() {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 0) {
      setSaving(true);
      try { await onSave(n); } finally { setSaving(false); }
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-14 h-6 text-center text-sm border border-forest-400 rounded px-1 focus:outline-none"
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true); setValue(String(currentGoal)); }}
      className="group inline-flex items-center gap-1 text-sm text-gray-700 hover:text-forest-600"
      title="Click to set rep quarterly goal"
    >
      {currentGoal}
      <span className="opacity-0 group-hover:opacity-60 text-xs text-gray-400">✏</span>
    </button>
  );
}

// ─── Rep Accordion Item (used in Team View) ───────────────────────────────────

interface RepAccordionItemProps {
  rep: RepPlan;
  isAdmin: boolean;
  sysRole: string;
  currentUserId: string;
  isPast: boolean;
  pacePct: number;
  onSetRepGoal: (clerkUserId: string, goal: number) => Promise<void>;
  onAddTarget: (companyId: string, currentStage: string, forClerkUserId: string) => Promise<void>;
  onRemoveTarget: (targetId: string) => Promise<void>;
}

function calcVsPace(actual: number, goal: number, pacePct: number): number | null {
  if (goal <= 0 || pacePct <= 0) return null;
  const pacingGoal = goal * Math.min(1, pacePct);
  return Math.round((actual / pacingGoal) * 100);
}

function RepAccordionItem({
  rep,
  isAdmin,
  sysRole,
  currentUserId,
  isPast,
  pacePct,
  onSetRepGoal,
  onAddTarget,
  onRemoveTarget,
}: RepAccordionItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const pct = calcVsPace(rep.actual, rep.goal, pacePct);
  const activeGoalSum = rep.activePartners.reduce((s, p) => s + p.goal, 0);
  const notAccountedFor = Math.max(0, rep.goal - activeGoalSum);

  // Can this current user add/remove targets for this rep?
  const canManage = isAdmin || sysRole === "TTTManager" || currentUserId === rep.clerkUserId;

  async function handleToggle(companyId: string, targetId: string | null, currentStage: string) {
    if (isPast || !canManage) return;
    setToggling(companyId);
    try {
      if (targetId) await onRemoveTarget(targetId);
      else await onAddTarget(companyId, currentStage, rep.clerkUserId);
    } finally {
      setToggling(null);
    }
  }

  return (
    <div>
      {/* Summary row */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full text-left hover:bg-gray-50 transition-colors"
      >
        <div className="grid grid-cols-[1fr_90px_60px_65px_55px_60px_32px] items-center px-4 py-3 text-sm">
          <span className="font-medium text-gray-900 truncate">{rep.displayName}</span>

          {/* Goal — admin can click to edit */}
          <div className="text-center" onClick={(e) => e.stopPropagation()}>
            {isAdmin && !isPast ? (
              <InlineGoalEditor
                currentGoal={rep.goal}
                onSave={(g) => onSetRepGoal(rep.clerkUserId, g)}
              />
            ) : (
              <span className="text-gray-600 text-sm">{rep.goal}</span>
            )}
          </div>

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
          <span className="text-center text-gray-500 text-xs">{rep.conversionTargets.length} targeting</span>
          <span className="text-gray-400 text-xs text-center">{isOpen ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Accordion detail */}
      {isOpen && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 pb-5 pt-4 space-y-5">

          {/* Not Accounted For banner — only when admin has set a rep goal */}
          {rep.repGoal !== null && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
              <span className="font-semibold text-amber-800">Not Accounted For</span>
              <span className="text-amber-900 font-bold text-base">{notAccountedFor}</span>
              <span className="text-amber-600">
                Rep goal {rep.goal} &minus; active partner goals {activeGoalSum}
              </span>
            </div>
          )}

          {/* Active Referral Partners */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Active Referral Partners</p>
            {rep.activePartners.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No active referral partners.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 uppercase tracking-wide">
                    <th className="text-left pb-1.5 font-medium">Company</th>
                    <th className="text-left pb-1.5 font-medium">Priority</th>
                    <th className="text-center pb-1.5 font-medium">Q Goal</th>
                    <th className="text-center pb-1.5 font-medium">Received</th>
                    <th className="text-center pb-1.5 font-medium">vs Pace</th>
                  </tr>
                </thead>
                <tbody>
                  {sortByPriorityThenName(rep.activePartners).map((p) => {
                    const ppct = calcVsPace(p.actual, p.goal, pacePct);
                    return (
                      <tr key={p.companyId} className="border-t border-gray-200 first:border-0">
                        <td className="py-1.5 pr-3 font-medium text-gray-800">{p.companyName}</td>
                        <td className="py-1.5 pr-3"><PriorityBadge priority={p.priority} /></td>
                        <td className="py-1.5 text-center text-gray-600">{p.goal}</td>
                        <td className="py-1.5 text-center font-semibold text-gray-900">{p.actual}</td>
                        <td className="py-1.5 text-center">
                          {ppct === null ? <span className="text-gray-400">—</span> : (
                            <span className={cn("font-medium", ppct >= 100 ? "text-green-600" : ppct >= 66 ? "text-amber-600" : "text-red-500")}>
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

          {/* Not Yet Referring */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Not Yet Referring</p>

            {rep.conversionTargets.length > 0 ? (
              <div className="overflow-x-auto mb-3">
                <table className="text-xs" style={{ minWidth: 760 }}>
                  <thead>
                    <tr className="text-gray-400 uppercase tracking-wide">
                      <th className="text-left pb-1.5 pr-3 font-medium">Company</th>
                      <th className="text-left pb-1.5 pr-3 font-medium">Priority</th>
                      <th className="text-left pb-1.5 pr-3 font-medium">Start Stage</th>
                      <th className="text-left pb-1.5 pr-3 font-medium">Current Stage</th>
                      <th className="text-center pb-1.5 pr-3 font-medium">Stage Age</th>
                      <th className="text-center pb-1.5 pr-3 font-medium">Last Activity</th>
                      <th className="text-left pb-1.5 pr-3 font-medium">Next Step</th>
                      <th className="text-center pb-1.5 pr-3 font-medium">Goal</th>
                      <th className="text-center pb-1.5 font-medium">Rcvd</th>
                      {canManage && !isPast && <th className="pb-1.5" />}
                    </tr>
                  </thead>
                  <tbody>
                    {sortByPriorityThenName(rep.conversionTargets).map((t) => (
                      <tr key={t.companyId} className="border-t border-gray-200 first:border-0">
                        <td className="py-1.5 pr-3 font-medium text-gray-800 whitespace-nowrap">{t.companyName}</td>
                        <td className="py-1.5 pr-3"><PriorityBadge priority={t.priority} /></td>
                        <td className="py-1.5 pr-3"><StageBadge stage={t.startingStage || "—"} /></td>
                        <td className="py-1.5 pr-3"><StageBadge stage={t.bestStage} /></td>
                        <td className="py-1.5 pr-3 text-center text-gray-500 whitespace-nowrap">{fmtDays(t.stageDurationDays)}</td>
                        <td className="py-1.5 pr-3 text-center text-gray-500 whitespace-nowrap">{fmtDate(t.lastActivityDate)}</td>
                        <td className="py-1.5 pr-3 max-w-[160px]">
                          {t.nextStepDate ? (
                            <div>
                              <span className="text-gray-700 whitespace-nowrap">{fmtDate(t.nextStepDate)}</span>
                              {t.nextStepNote && (
                                <p className="text-gray-400 truncate mt-0.5" title={t.nextStepNote}>{t.nextStepNote}</p>
                              )}
                            </div>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-center text-gray-600">{t.goal}</td>
                        <td className="py-1.5 text-center font-semibold text-gray-900">{t.actual}</td>
                        {canManage && !isPast && (
                          <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleToggle(t.companyId, t.targetId, t.bestStage)}
                              disabled={toggling === t.companyId}
                              className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
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
              <p className="text-xs text-gray-400 italic mb-3">No companies targeted for conversion this quarter.</p>
            )}

            {/* Add from pipeline */}
            {canManage && !isPast && rep.availableToConvert.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Add from pipeline</p>
                <div className="flex flex-wrap gap-2">
                  {rep.availableToConvert.map((c) => (
                    <button
                      key={c.companyId}
                      onClick={() => handleToggle(c.companyId, null, c.bestStage)}
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
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Team View ────────────────────────────────────────────────────────────────

function TeamView({
  planData,
  isAdmin,
  sysRole,
  currentUserId,
  isPast,
  onSetRepGoal,
  onAddTarget,
  onRemoveTarget,
}: {
  planData: PlanData;
  isAdmin: boolean;
  sysRole: string;
  currentUserId: string;
  isPast: boolean;
  onSetRepGoal: (clerkUserId: string, goal: number) => Promise<void>;
  onAddTarget: (companyId: string, currentStage: string, forClerkUserId: string) => Promise<void>;
  onRemoveTarget: (targetId: string) => Promise<void>;
}) {
  const { quarter, reps } = planData;
  const totalGoal = reps.reduce((s, r) => s + r.goal, 0);
  const totalActual = reps.reduce((s, r) => s + r.actual, 0);

  const today = new Date();
  const start = new Date(quarter.startDate);
  const end = new Date(quarter.endDate);
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
  const elapsedDays = Math.min(totalDays, Math.max(0, (today.getTime() - start.getTime()) / 86400000));
  const pacePct = elapsedDays / totalDays;

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
          {/* Header */}
          <div className="grid grid-cols-[1fr_90px_60px_65px_55px_60px_32px] px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
            <span>Rep</span>
            <span className="text-center">{isAdmin ? "Goal (click ✏)" : "Goal"}</span>
            <span className="text-center">Rcvd</span>
            <span className="text-center">vs Pace</span>
            <span className="text-center">Active</span>
            <span className="text-center">Targeting</span>
            <span />
          </div>

          {sortedReps.map((rep, idx) => (
            <div key={rep.clerkUserId} className={idx > 0 ? "border-t border-gray-100" : ""}>
              <RepAccordionItem
                rep={rep}
                isAdmin={isAdmin}
                sysRole={sysRole}
                currentUserId={currentUserId}
                isPast={isPast}
                pacePct={pacePct}
                onSetRepGoal={onSetRepGoal}
                onAddTarget={onAddTarget}
                onRemoveTarget={onRemoveTarget}
              />
            </div>
          ))}

          {sortedReps.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400 italic text-center">No sales reps found.</p>
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
  onAddTarget: (companyId: string, currentStage: string, forClerkUserId?: string) => Promise<void>;
  onRemoveTarget: (targetId: string) => Promise<void>;
}) {
  const [toggling, setToggling] = useState<string | null>(null);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  function toggleCompany(companyId: string) {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId); else next.add(companyId);
      return next;
    });
  }

  async function handleToggleTarget(companyId: string, currentTargetId: string | null, currentStage: string) {
    if (isPast) return;
    setToggling(companyId);
    try {
      if (currentTargetId) await onRemoveTarget(currentTargetId);
      else await onAddTarget(companyId, currentStage);
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

  const activeGoalSum = rep.activePartners.reduce((s, p) => s + p.goal, 0);
  const notAccountedFor = rep.repGoal !== null ? Math.max(0, rep.goal - activeGoalSum) : null;

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

      {/* Not Accounted For — only shown when admin has set a rep-level goal */}
      {notAccountedFor !== null && (
        <div className="flex items-center gap-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Not Accounted For</p>
            <p className="text-2xl font-bold text-amber-900">{notAccountedFor}</p>
          </div>
          <p className="text-xs text-amber-600">
            {rep.goal} total goal &minus; {activeGoalSum} from active partners
            = {notAccountedFor} referrals not yet covered by active referring companies
          </p>
        </div>
      )}

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
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Q Goal</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Received</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">vs Pace</th>
                  <th className="px-2 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {sortByPriorityThenName(rep.activePartners).map((p) => {
                  const pct = calcVsPace(p.actual, p.goal, pacePct);
                  const isOpen = expandedCompanies.has(p.companyId);
                  return (
                    <Fragment key={p.companyId}>
                      <tr
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleCompany(p.companyId)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{p.companyName}</td>
                        <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                        <td className="px-4 py-3 text-center text-gray-600">{p.goal}</td>
                        <td className="px-4 py-3 text-center font-medium text-gray-900">{p.actual}</td>
                        <td className="px-4 py-3 text-center">
                          {pct === null ? (
                            <span className="text-gray-400 text-xs">—</span>
                          ) : (
                            <span className={cn("text-xs font-medium",
                              pct >= 100 ? "text-green-600" : pct >= 66 ? "text-amber-600" : "text-red-500")}>
                              {pct}%
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-center text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <CompanyContactsPanel companyId={p.companyId} quarterId={quarter.id} excludeStages={["Identified"]} companyName={p.companyName} competitors={p.competitors} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Not Yet Referring */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Not Yet Referring</h3>
          {isPast && <span className="text-xs text-gray-400">(read-only)</span>}
        </div>

        {rep.conversionTargets.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-3">
            <table className="text-sm" style={{ minWidth: 880 }}>
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
                  {!isPast && <th className="px-4 py-2.5" />}
                  <th className="px-2 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody>
                {sortByPriorityThenName(rep.conversionTargets).map((t) => {
                  const isOpen = expandedCompanies.has(t.companyId);
                  const colCount = isPast ? 10 : 11;
                  return (
                    <Fragment key={t.companyId}>
                      <tr
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleCompany(t.companyId)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{t.companyName}</td>
                        <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                        <td className="px-4 py-3"><StageBadge stage={t.startingStage || "—"} /></td>
                        <td className="px-4 py-3"><StageBadge stage={t.bestStage} /></td>
                        <td className="px-4 py-3 text-center text-sm text-gray-500 whitespace-nowrap">{fmtDays(t.stageDurationDays)}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-500 whitespace-nowrap">{fmtDate(t.lastActivityDate)}</td>
                        <td className="px-4 py-3 max-w-[200px]">
                          {t.nextStepDate ? (
                            <div>
                              <p className="text-gray-800 font-medium whitespace-nowrap">{fmtDate(t.nextStepDate)}</p>
                              {t.nextStepNote && (
                                <p className="text-xs text-gray-400 truncate mt-0.5" title={t.nextStepNote}>{t.nextStepNote}</p>
                              )}
                            </div>
                          ) : <span className="text-gray-400 text-sm">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{t.goal}</td>
                        <td className="px-4 py-3 text-center font-medium text-gray-900">{t.actual}</td>
                        {!isPast && (
                          <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleToggleTarget(t.companyId, t.targetId, t.bestStage)}
                              disabled={toggling === t.companyId}
                              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </td>
                        )}
                        <td className="px-2 py-3 text-center text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={colCount} className="p-0">
                            <CompanyContactsPanel companyId={t.companyId} quarterId={quarter.id} companyName={t.companyName} competitors={t.competitors} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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
                    onClick={() => handleToggleTarget(c.companyId, null, c.bestStage)}
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
  const [showEditQuarter, setShowEditQuarter] = useState(false);
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

  useEffect(() => {
    if (isSalesOnly && viewMode !== "team" && viewMode !== currentUserId) {
      setViewMode("team");
    }
  }, [isSalesOnly, viewMode, currentUserId]);

  async function handleAddTarget(companyId: string, currentStage: string, forClerkUserId?: string) {
    if (!selectedQuarterId) return;
    const res = await fetch("/api/crm/plan/conversion-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarterId: selectedQuarterId, companyId, startingStage: currentStage, forClerkUserId }),
    });
    if (!res.ok) throw new Error("Failed");
    await loadPlan(selectedQuarterId);
  }

  async function handleRemoveTarget(targetId: string) {
    const res = await fetch(`/api/crm/plan/conversion-targets?id=${targetId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed");
    if (selectedQuarterId) await loadPlan(selectedQuarterId);
  }

  async function handleSetRepGoal(clerkUserId: string, goal: number) {
    if (!selectedQuarterId) return;
    await fetch("/api/crm/plan/rep-goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarterId: selectedQuarterId, clerkUserId, goal }),
    });
    await loadPlan(selectedQuarterId);
  }

  function handleQuarterCreated(q: Quarter) {
    setQuarters((prev) => [q, ...prev]);
    setSelectedQuarterId(q.id);
    setShowAddQuarter(false);
  }

  function handleQuarterSaved(q: Quarter) {
    setQuarters((prev) => prev.map((existing) => existing.id === q.id ? q : existing));
    setShowEditQuarter(false);
    if (selectedQuarterId === q.id) loadPlan(q.id);
  }

  const selectedQuarter = quarters.find((q) => q.id === selectedQuarterId);
  const today = new Date().toISOString().slice(0, 10);
  const isPast = selectedQuarter ? selectedQuarter.endDate < today : false;

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
        <div className="mb-5 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <span>This quarter has no date range set — referral counts can&apos;t be filtered by quarter.</span>
          {isAdmin && (
            <button onClick={() => setShowEditQuarter(true)}
              className="ml-auto shrink-0 text-sm font-medium text-amber-700 underline hover:text-amber-900">
              Set dates
            </button>
          )}
        </div>
      )}

      {/* View switcher */}
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

      {!loading && planData && viewMode === "team" && (
        <TeamView
          planData={planData}
          isAdmin={isAdmin}
          sysRole={sysRole}
          currentUserId={currentUserId}
          isPast={isPast}
          onSetRepGoal={handleSetRepGoal}
          onAddTarget={handleAddTarget}
          onRemoveTarget={handleRemoveTarget}
        />
      )}

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
      {showEditQuarter && selectedQuarter && (
        <EditQuarterModal quarter={selectedQuarter} onClose={() => setShowEditQuarter(false)} onSaved={handleQuarterSaved} />
      )}
    </div>
  );
}
