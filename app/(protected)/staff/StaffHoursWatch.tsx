"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { WEEKS, type RiskTier, type StaffEngagement, type StaffSummary } from "@/lib/staff-engagement/score";

// Bottom of Staff Goals: each person's weekly hours against their target,
// with a simple retention-risk read and an on-demand AI Summary for Ops.
// Loads on its own so the Goals table above never waits on it.

interface Report {
  today: string;
  weekStarts: string[];
  currentWeekStart: string;
  staff: StaffEngagement[];
}

const TIER_STYLE: Record<RiskTier, { label: string; badge: string; tile: string }> = {
  High: { label: "High risk", badge: "bg-red-50 text-red-700 ring-red-200", tile: "border-red-200 bg-red-50/50 text-red-800" },
  Watch: { label: "Watch", badge: "bg-amber-50 text-amber-800 ring-amber-200", tile: "border-amber-200 bg-amber-50/50 text-amber-900" },
  Low: { label: "Steady", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", tile: "border-emerald-200 bg-emerald-50/50 text-emerald-800" },
  Dormant: { label: "Dormant", badge: "bg-gray-100 text-gray-600 ring-gray-200", tile: "border-gray-200 bg-gray-50 text-gray-700" },
};
const AI_TIER_STYLE = { High: "border-red-200 bg-red-50/40", Middle: "border-amber-200 bg-amber-50/40", Low: "border-emerald-200 bg-emerald-50/40", Dormant: "border-gray-200 bg-gray-50" } as const;
const AI_TIER_LABEL = {
  High: "Highest risk: act this week",
  Middle: "Middle: worth a nudge",
  Low: "Lowest risk: steady",
  Dormant: "Dormant: no hours in 8+ weeks, re-engage or confirm they've moved on",
} as const;

function fmtWeek(d: string): string {
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day}`;
}

function daysLabel(n: number | null, none = "Never"): string {
  if (n == null) return none;
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  return `${n}d ago`;
}

// 12 complete weeks plus the current week (faded), with a dashed target line
function WeekBars({ s, weekStarts }: { s: StaffEngagement; weekStarts: string[] }) {
  const target = s.targetWeeklyHours ?? 0;
  const values = [...s.weeklyHours, s.currentWeekHours];
  const top = Math.max(1, target * 1.25, ...values);
  const W = 9, GAP = 2, H = 34;
  const y = (v: number) => H - (v / top) * H;
  return (
    <svg width={values.length * (W + GAP)} height={H + 2} className="block" role="img" aria-label={`Weekly hours for ${s.name}`}>
      {values.map((v, i) => {
        const current = i === values.length - 1;
        const tone = current ? "fill-gray-300" :
          !target ? "fill-gray-400" :
          v >= target ? "fill-emerald-500" :
          v >= target * 0.75 ? "fill-amber-400" : "fill-red-400";
        const h = Math.max(v > 0 ? 2 : 1, H - y(v));
        return (
          <rect key={i} x={i * (W + GAP)} y={H - h + 1} width={W} height={h} rx={1.5} className={v > 0 ? tone : "fill-gray-200"}>
            <title>{current ? `This week so far: ${v} hrs` : `Week of ${fmtWeek(weekStarts[i])}: ${v} hrs`}{target ? ` (target ${target})` : ""}</title>
          </rect>
        );
      })}
      {target > 0 && (
        <line x1={0} x2={values.length * (W + GAP) - GAP} y1={y(target) + 1} y2={y(target) + 1} className="stroke-gray-500" strokeWidth={1} strokeDasharray="3 2" />
      )}
    </svg>
  );
}

export function StaffHoursWatch() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const [tier, setTier] = useState<RiskTier | null>(null);
  const [summary, setSummary] = useState<StaffSummary | null>(null);
  const [summaryState, setSummaryState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    fetch("/api/staff/engagement")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setReport)
      .catch(() => setError(true));
  }, []);

  const counts = useMemo(() => {
    const c: Record<RiskTier, number> = { High: 0, Watch: 0, Low: 0, Dormant: 0 };
    for (const s of report?.staff ?? []) c[s.tier]++;
    return c;
  }, [report]);

  const onTarget = report?.staff.filter((s) => s.pctOfTarget != null && s.pctOfTarget >= 1).length ?? 0;
  const withTarget = report?.staff.filter((s) => s.pctOfTarget != null).length ?? 0;
  const shown = (report?.staff ?? []).filter((s) => !tier || s.tier === tier);

  async function runSummary() {
    setSummaryState("loading");
    try {
      const r = await fetch("/api/staff/engagement/summary", { method: "POST" });
      if (!r.ok) throw new Error();
      setSummary(await r.json());
      setSummaryState("idle");
    } catch {
      setSummaryState("error");
    }
  }

  return (
    <section className="mt-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Hours vs Target</h3>
          <p className="text-sm text-gray-500">
            Weekly hours logged over the last {WEEKS} weeks against each person&apos;s target, and who may need attention.
          </p>
        </div>
        <button
          onClick={runSummary}
          disabled={!report || summaryState === "loading"}
          className="inline-flex items-center gap-2 rounded-lg bg-forest-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
        >
          {summaryState === "loading" && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {summaryState === "loading" ? "Reading the numbers…" : summary ? "Refresh AI Summary" : "AI Summary"}
        </button>
      </div>

      {summaryState === "error" && <p className="text-sm text-red-600">Couldn&apos;t write the AI summary. Try again.</p>}

      {summary && (
        <div className="rounded-xl border border-forest-200 bg-forest-50/40 p-4 space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-semibold text-gray-900">AI Summary: retention risk</h4>
            <span className="text-xs text-gray-400">
              {new Date(summary.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
            {summary.overview.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          {(["High", "Middle", "Low", "Dormant"] as const).map((t) => {
            const people = summary.staff.filter((s) => s.tier === t);
            if (!people.length) return null;
            return (
              <div key={t}>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  {AI_TIER_LABEL[t]} ({people.length})
                </div>
                {t === "Low" || t === "Dormant" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {people.map((p) => (
                      <span key={p.name} title={`${p.why} ${p.action}`} className={cn("rounded-full border px-2.5 py-1 text-xs text-gray-700", AI_TIER_STYLE[t])}>{p.name}</span>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {people.map((p) => (
                      <div key={p.name} className={cn("rounded-lg border p-3", AI_TIER_STYLE[t])}>
                        <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                        <p className="text-sm text-gray-700 mt-0.5">{p.why}</p>
                        <p className="text-sm text-forest-800 mt-1"><span className="font-medium">Next step:</span> {p.action}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-gray-400">AI-written from the numbers below. Check the table before acting.</p>
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-600">Couldn&apos;t load hours. Refresh to retry.</p>
      ) : !report ? (
        <div className="h-40 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(["High", "Watch", "Low", "Dormant"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTier(tier === t ? null : t)}
                className={cn("rounded-xl border px-4 py-3 text-left transition-shadow", TIER_STYLE[t].tile, tier === t && "ring-2 ring-offset-1 ring-forest-300")}
              >
                <div className="text-xs font-medium">{TIER_STYLE[t].label}</div>
                <div className="text-2xl font-bold">{counts[t]}</div>
              </button>
            ))}
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="text-xs font-medium text-gray-500">At or above target</div>
              <div className="text-2xl font-bold text-gray-900">{onTarget}<span className="text-sm font-normal text-gray-400"> / {withTarget}</span></div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Staff</th>
                    <th className="px-4 py-3">Risk</th>
                    <th className="px-4 py-3">Last {WEEKS} weeks</th>
                    <th className="px-4 py-3 text-right">4-wk avg / target</th>
                    <th className="px-4 py-3 text-right">Next 2 wks</th>
                    <th className="px-4 py-3 text-right">In app</th>
                    <th className="px-4 py-3">Why · next step</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s.id} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-400">{s.cause}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1", TIER_STYLE[s.tier].badge)}>{TIER_STYLE[s.tier].label}</span>
                      </td>
                      <td className="px-4 py-3"><WeekBars s={s} weekStarts={report.weekStarts} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        <span className="font-semibold text-gray-900">{s.recentAvg}</span>
                        <span className="text-gray-400"> / {s.targetWeeklyHours ?? "—"} hrs</span>
                        {s.pctOfTarget != null && <div className="text-xs text-gray-500">{Math.round(s.pctOfTarget * 100)}% of target</div>}
                        {s.trend != null && Math.abs(s.trend) >= 0.25 && (
                          <div className={cn("text-xs", s.trend < 0 ? "text-red-600" : "text-emerald-600")}>
                            {s.trend < 0 ? "↓" : "↑"} {Math.round(Math.abs(s.trend) * 100)}% vs prior
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        <span className={s.upcomingShifts === 0 ? "text-gray-400" : "text-gray-900"}>{s.upcomingShifts} shift{s.upcomingShifts === 1 ? "" : "s"}</span>
                        {s.invitesDeclined > 0 && <div className="text-xs text-gray-500">{s.invitesDeclined} declined</div>}
                      </td>
                      <td className={cn("px-4 py-3 text-right whitespace-nowrap", (s.daysSinceActive ?? 99) >= 10 ? "text-red-600" : "text-gray-600")}>
                        {daysLabel(s.daysSinceActive, "Unknown")}
                      </td>
                      <td className="px-4 py-3 min-w-[260px]">
                        {s.reasons.length > 0 ? (
                          <div className="text-gray-700" title={s.reasons.join("\n")}>
                            {s.reasons.slice(0, 2).join(" · ")}
                            {s.reasons.length > 2 && <span className="text-gray-400"> +{s.reasons.length - 2} more</span>}
                          </div>
                        ) : (
                          <div className="text-gray-500">On pace with their target</div>
                        )}
                        <div className="text-xs text-forest-700 mt-0.5">{s.action}</div>
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No one in this group.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Bars: green at or above target, amber within 75%, red below; the dashed line is the target and the last, grey bar is this week so far.
            Dormant: no hours in 8+ weeks, no invites in the last 4 and nothing scheduled. Risk adds up simple signals: hours vs target and the trend against the 8 weeks before, days since hours were logged, accepted shifts in the next 2 weeks,
            declined or unanswered invites, days since last in the app, availability below target, time off, working past their max, and being in the first 90 days.
            &quot;Under-scheduled&quot; means low hours while still available and saying yes; &quot;Pulling away&quot; means the signs are coming from them.
          </p>
        </>
      )}
    </section>
  );
}
