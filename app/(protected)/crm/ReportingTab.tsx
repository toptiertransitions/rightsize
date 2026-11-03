"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClientOpportunity, CRMActivity, ReferralCompany, ReferralContact, ReferralContactStage, StaffMember } from "@/lib/types";
import { ctDateStr, ctToday } from "@/lib/date-ct";
import { cn } from "@/lib/utils";

interface Props {
  opportunities: ClientOpportunity[];
  referralContacts: ReferralContact[];
  companies: ReferralCompany[];
  staffMembers: StaffMember[];
  currentUserId: string;
}

type Period = "30d" | "week" | "month" | "quarter";

const PERIODS: { id: Period; label: string }[] = [
  { id: "30d", label: "Rolling 30 Days" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "quarter", label: "This Quarter" },
];

// Forward order of the referral funnel; Inactive is a drop-out, never a progression
const STAGE_ORDER: ReferralContactStage[] = ["Identified", "Met", "Agreed to Refer", "Shared Leads", "Active Referral"];

const UNASSIGNED = "__unassigned__";

// ─── Date helpers (YYYY-MM-DD strings, Central time) ─────────────────────────

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function lastOfMonth(y: number, m: number): string {
  // m is 1-based; day 0 of the next month is the last day of this one
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function periodRange(period: Period, today: string): { start: string; end: string } {
  const [y, m, d] = today.split("-").map(Number);
  if (period === "30d") return { start: addDays(today, -29), end: today };
  if (period === "week") {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const start = addDays(today, dow === 0 ? -6 : 1 - dow); // Monday
    return { start, end: addDays(start, 6) };
  }
  if (period === "month") return { start: `${today.slice(0, 7)}-01`, end: lastOfMonth(y, m) };
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  return {
    start: `${y}-${String(qStartMonth).padStart(2, "0")}-01`,
    end: lastOfMonth(y, qStartMonth + 2),
  };
}

function fmtRange(start: string, end: string): string {
  const f = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  return `${f(start)} – ${f(end)}`;
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

interface RepRow {
  id: string;
  name: string;
  wonCount: number;
  wonValue: number;
  expectedCount: number;
  expectedValue: number;
  created: number;
  contactsTouched: number;
  activeReferrals: number;
  progressions: number;
}

type MetricKey = Exclude<keyof RepRow, "id" | "name">;

const COLUMNS: { key: MetricKey; label: string; sub: string; money?: boolean }[] = [
  { key: "wonValue", label: "Won $", sub: "by close date", money: true },
  { key: "wonCount", label: "Won", sub: "opps closed" },
  { key: "expectedValue", label: "Pipeline $", sub: "open, exp. close in period", money: true },
  { key: "created", label: "Opps Created", sub: "by created date" },
  { key: "contactsTouched", label: "Contacts Touched", sub: "unique, by activity date" },
  { key: "activeReferrals", label: "Active Referral", sub: "partners right now" },
  { key: "progressions", label: "Stage Moves", sub: "partners advanced" },
];

export default function ReportingTab({ opportunities, referralContacts, companies, staffMembers, currentUserId }: Props) {
  const [period, setPeriod] = useState<Period>("30d");
  const [sortKey, setSortKey] = useState<MetricKey>("wonValue");
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesError, setActivitiesError] = useState(false);

  useEffect(() => {
    fetch("/api/crm/activities")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setActivities(d.activities || []))
      .catch(() => setActivitiesError(true))
      .finally(() => setActivitiesLoading(false));
  }, []);

  const today = ctToday();
  const { start, end } = periodRange(period, today);
  const inPeriod = (s: string | null | undefined) => {
    const d = ctDateStr(s);
    return !!d && d >= start && d <= end;
  };

  const rows = useMemo(() => {
    // Owner ids are usually Clerk ids, but older writes used the Airtable staff id — accept both
    const staffById = new Map<string, StaffMember>();
    for (const s of staffMembers) {
      if (s.clerkUserId) staffById.set(s.clerkUserId, s);
      staffById.set(s.id, s);
    }
    const resolve = (id: string | null | undefined) => {
      const s = id ? staffById.get(id) : undefined;
      return s?.clerkUserId || s?.id || UNASSIGNED;
    };

    const byRep = new Map<string, RepRow>();
    const row = (id: string): RepRow => {
      let r = byRep.get(id);
      if (!r) {
        const s = staffById.get(id);
        r = {
          id,
          name: id === UNASSIGNED ? "Unassigned" : s?.displayName ?? "Unknown",
          wonCount: 0, wonValue: 0, expectedCount: 0, expectedValue: 0,
          created: 0, contactsTouched: 0, activeReferrals: 0, progressions: 0,
        };
        byRep.set(id, r);
      }
      return r;
    };

    // Always list active sales reps, even with zero activity, so the board shows everyone
    for (const s of staffMembers) {
      if (s.isActive && s.role === "TTTSales") row(s.clerkUserId || s.id);
    }

    for (const o of opportunities) {
      const rep = resolve(o.assignedToClerkId);
      const value = o.estimatedValue || 0;
      if (o.stage === "Won") {
        // Fall back to expected close for Won opps that predate WonAt tracking
        if (inPeriod(o.wonAt || o.expectedCloseDate)) {
          const r = row(rep);
          r.wonCount++;
          r.wonValue += value;
        }
      } else if (o.stage !== "Lost" && inPeriod(o.expectedCloseDate)) {
        const r = row(rep);
        r.expectedCount++;
        r.expectedValue += value;
      }
      if (inPeriod(o.createdAt)) row(rep).created++;
    }

    // Unique contacts touched: client or referral contact on each activity (or the
    // opportunity's client), credited to whoever logged the activity
    const oppContact = new Map(opportunities.map(o => [o.id, o.clientContactId]));
    const touched = new Map<string, Set<string>>();
    for (const a of activities) {
      if (!inPeriod(a.activityDate)) continue;
      const contactId = a.clientContactId || (a.opportunityId ? oppContact.get(a.opportunityId) : undefined);
      if (!contactId) continue;
      const rep = resolve(a.createdByClerkId);
      if (!touched.has(rep)) touched.set(rep, new Set());
      touched.get(rep)!.add(contactId);
    }
    for (const [rep, set] of touched) row(rep).contactsTouched = set.size;

    // Referral partners are owned through their company
    const companyOwner = new Map(companies.map(c => [c.id, c.assignedToClerkId]));
    for (const rc of referralContacts) {
      const rep = resolve(companyOwner.get(rc.referralCompanyId));
      if (rc.stage === "Active Referral") row(rep).activeReferrals++;
      if (inPeriod(rc.stageChangedAt)) {
        const to = STAGE_ORDER.indexOf(rc.stage);
        const from = STAGE_ORDER.indexOf(rc.previousStage as ReferralContactStage);
        // A move up the funnel; a first stage set (no previous) beyond Identified counts too
        if (to > 0 && to > from) row(rep).progressions++;
      }
    }

    return [...byRep.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunities, referralContacts, companies, staffMembers, activities, start, end]);

  const sorted = useMemo(() => {
    const out = [...rows].sort((a, b) => b[sortKey] - a[sortKey] || a.name.localeCompare(b.name));
    // Unassigned is context, not a competitor — keep it at the bottom
    return [...out.filter(r => r.id !== UNASSIGNED), ...out.filter(r => r.id === UNASSIGNED)];
  }, [rows, sortKey]);

  const totals = useMemo(() => {
    const t = Object.fromEntries(COLUMNS.map(c => [c.key, 0])) as Record<MetricKey, number>;
    for (const r of rows) for (const c of COLUMNS) t[c.key] += r[c.key];
    t.expectedCount = rows.reduce((s, r) => s + r.expectedCount, 0);
    return t;
  }, [rows]);

  // Leader per column (ties share it); Unassigned can't lead
  const leaders = useMemo(() => {
    const out = {} as Record<MetricKey, number>;
    for (const c of COLUMNS) {
      out[c.key] = Math.max(0, ...rows.filter(r => r.id !== UNASSIGNED).map(r => r[c.key]));
    }
    return out;
  }, [rows]);

  const competitors = sorted.filter(r => r.id !== UNASSIGNED);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Activity and Progress Leaderboard</h2>
          <p className="text-sm text-gray-500">{fmtRange(start, end)} · click a column to rank by it</p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                period === p.id ? "bg-forest-600 text-white" : "text-gray-600 hover:text-gray-900"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Team totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {COLUMNS.map(c => (
          <div key={c.key} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-xs font-medium text-gray-500">{c.label}</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">
              {c.key === "contactsTouched" && activitiesLoading ? "…" : c.money ? fmt$(totals[c.key]) : totals[c.key]}
            </div>
            <div className="text-[11px] text-gray-400 leading-tight mt-0.5">
              {c.key === "expectedValue" ? `${totals.expectedCount} open opps` : c.sub}
            </div>
          </div>
        ))}
      </div>

      {activitiesError && (
        <p className="text-sm text-red-600">Couldn&apos;t load activities, so Contacts Touched is incomplete. Refresh to retry.</p>
      )}

      {/* Leaderboard */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left font-medium text-gray-500 px-4 py-3 w-10">#</th>
              <th className="text-left font-medium text-gray-500 px-4 py-3">Rep</th>
              {COLUMNS.map(c => (
                <th key={c.key} className="text-right px-4 py-3 whitespace-nowrap">
                  <button
                    onClick={() => setSortKey(c.key)}
                    className={cn("font-medium hover:text-gray-900", sortKey === c.key ? "text-forest-700" : "text-gray-500")}
                  >
                    {c.label}{sortKey === c.key ? " ↓" : ""}
                  </button>
                  <div className="text-[10px] font-normal text-gray-400">{c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const rank = r.id === UNASSIGNED ? null : competitors.indexOf(r) + 1;
              const isMe = r.id === currentUserId;
              return (
                <tr key={r.id} className={cn("border-b border-gray-100 last:border-0", isMe && "bg-forest-50/40", r.id === UNASSIGNED && "text-gray-400")}>
                  <td className="px-4 py-3">
                    {rank && (
                      <span className={cn(
                        "inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold",
                        rank === 1 ? "bg-amber-100 text-amber-800" : rank === 2 ? "bg-gray-200 text-gray-700" : rank === 3 ? "bg-orange-100 text-orange-800" : "text-gray-400"
                      )}>
                        {rank}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    <span className={cn(r.id === UNASSIGNED && "text-gray-400 font-normal")}>{r.name}</span>
                    {isMe && <span className="ml-2 text-[10px] uppercase tracking-wide text-forest-600">You</span>}
                  </td>
                  {COLUMNS.map(c => {
                    const v = r[c.key];
                    const leads = r.id !== UNASSIGNED && v > 0 && v === leaders[c.key];
                    const loading = c.key === "contactsTouched" && activitiesLoading;
                    return (
                      <td key={c.key} className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        <span className={cn(
                          "inline-block rounded-md px-2 py-0.5",
                          leads ? "bg-amber-50 text-amber-800 font-semibold ring-1 ring-amber-200" : v === 0 ? "text-gray-300" : "text-gray-800",
                          sortKey === c.key && !leads && v > 0 && "font-semibold"
                        )}>
                          {loading ? "…" : c.money ? fmt$(v) : v}
                        </span>
                        {c.key === "expectedValue" && r.expectedCount > 0 && (
                          <div className="text-[10px] text-gray-400">{r.expectedCount} open</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-400 space-y-1">
        <p>Opportunities are credited to the assigned rep. Won opps count on their close date, or their expected close date if no close date was recorded. Pipeline is open opps expected to close in the period.</p>
        <p>Contacts Touched counts each client or referral contact once per rep, from activities logged in the period. Referral partners are credited to their company&apos;s owner; Active Referral is a current count, and Stage Moves counts partners whose latest stage change in the period moved them up the funnel.</p>
      </div>
    </div>
  );
}
