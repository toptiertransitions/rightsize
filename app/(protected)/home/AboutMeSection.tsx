import { Award, Cake, Target } from "lucide-react";
import type { Celebration, WeekHours } from "@/lib/about-me";

// Home page "About Me" for TTTStaff / TTTTeamLead / TTTManager. Only the
// signed-in user's own data: weekly hours vs goal, birthday, work anniversary.
// Goals, birthday and hire date are maintained on /staff > Staff Goals.

function hrs(minutes: number): string {
  const h = minutes / 60;
  return h % 1 === 0 ? String(h) : h.toFixed(1);
}

function fmtMonthDay(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function fmtWeek(weekStart: string): string {
  return new Date(weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function countdown(daysAway: number): string {
  if (daysAway === 0) return "Today!";
  if (daysAway === 1) return "Tomorrow";
  return `In ${daysAway} days`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function AboutMeSection({
  weeks,
  targetHours,
  minHours,
  streak,
  dayOfWeek,
  birthday,
  anniversary,
  yearsOfService,
  hireDate,
}: {
  weeks: WeekHours[];
  targetHours?: number;
  minHours?: number;
  streak: number;
  dayOfWeek: number;
  birthday: Celebration | null;
  anniversary: Celebration | null;
  yearsOfService: number | null;
  hireDate?: string;
}) {
  const current = weeks[weeks.length - 1];
  const past = weeks.slice(0, -1);
  const avgMinutes = past.length ? past.reduce((s, w) => s + w.minutes, 0) / past.length : 0;
  const goalMinutes = targetHours ? targetHours * 60 : 0;
  const pct = goalMinutes ? Math.min(100, Math.round((current.minutes / goalMinutes) * 100)) : 0;
  const remaining = goalMinutes ? Math.max(0, goalMinutes - current.minutes) : 0;
  // Bar chart scale: tallest week or the goal, whichever is higher
  const scale = Math.max(goalMinutes, minHours ? minHours * 60 : 0, ...weeks.map((w) => w.minutes), 60);

  return (
    <section className="mt-10 mb-10">
      <h2 className="text-base font-semibold text-gray-900 mb-4">About Me</h2>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Weekly hours goal */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <Target className="w-3.5 h-3.5" /> Weekly Hours Goal
              </p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {hrs(current.minutes)}
                <span className="text-base font-medium text-gray-400"> {targetHours ? `of ${targetHours} hrs` : "hrs"} this week</span>
              </p>
              {targetHours ? (
                <p className="mt-1 text-sm text-gray-500">
                  {remaining === 0
                    ? "Goal reached this week. Nice work!"
                    : `${hrs(remaining)} hrs to go, ${7 - dayOfWeek === 0 ? "last day of the week" : `${7 - dayOfWeek} day${7 - dayOfWeek === 1 ? "" : "s"} left`}`}
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-500">No weekly goal set yet. Your manager can add one.</p>
              )}
            </div>
            {streak > 0 && (
              <div className="shrink-0 rounded-xl bg-forest-50 px-3 py-2 text-center">
                <p className="text-lg font-bold text-forest-700">{streak}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-forest-600">week streak</p>
              </div>
            )}
          </div>

          {targetHours ? (
            <div className="mt-4 h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-forest-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          ) : null}

          {/* 8-week trend */}
          <div className="mt-6">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500">Last {weeks.length} weeks</p>
              <p className="text-xs text-gray-400">Avg {hrs(Math.round(avgMinutes))} hrs/wk{minHours ? ` · Min ${minHours}` : ""}</p>
            </div>
            <div className="relative h-32">
              {goalMinutes > 0 && (
                <div
                  className="absolute inset-x-0 border-t border-dashed border-forest-400 z-10"
                  style={{ bottom: `${(goalMinutes / scale) * 100}%` }}
                >
                  <span className="absolute right-0 -top-4 text-[10px] font-medium text-forest-600">Goal {targetHours}</span>
                </div>
              )}
              <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-2">
                {weeks.map((w, i) => {
                  const isCurrent = i === weeks.length - 1;
                  const hit = goalMinutes > 0 && w.minutes >= goalMinutes;
                  return (
                    <div key={w.weekStart} className="flex-1 h-full flex flex-col justify-end items-center group">
                      <span className="text-[10px] text-gray-500 mb-0.5 tabular-nums">{w.minutes ? hrs(w.minutes) : ""}</span>
                      <div
                        className={`w-full rounded-t-md ${hit ? "bg-forest-600" : isCurrent ? "bg-forest-300" : "bg-gray-300"}`}
                        style={{ height: `${Math.max(2, (w.minutes / scale) * 100)}%` }}
                        title={`Week of ${fmtWeek(w.weekStart)}: ${hrs(w.minutes)} hrs`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-1.5 flex gap-1.5 sm:gap-2">
              {weeks.map((w, i) => (
                <span key={w.weekStart} className="flex-1 text-center text-[10px] text-gray-400 truncate">
                  {i === weeks.length - 1 ? "This wk" : fmtWeek(w.weekStart)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Celebrations */}
        <div className="grid gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Award className="w-3.5 h-3.5" /> Work Anniversary
            </p>
            {anniversary && hireDate ? (
              <>
                <p className="mt-2 text-lg font-bold text-gray-900">
                  {yearsOfService ? `${yearsOfService} year${yearsOfService === 1 ? "" : "s"} with TTT` : "Your first year with TTT"}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {ordinal(anniversary.years ?? 1)} anniversary {fmtMonthDay(anniversary.date)}
                  <span className={`ml-1.5 font-medium ${anniversary.daysAway <= 7 ? "text-forest-700" : "text-gray-400"}`}>· {countdown(anniversary.daysAway)}</span>
                </p>
                <p className="mt-2 text-xs text-gray-400">Started {new Date(hireDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Hire date not set yet. Your manager can add it.</p>
            )}
          </div>

          <div className={`rounded-2xl border p-5 ${birthday?.daysAway === 0 ? "border-forest-300 bg-forest-50" : "border-gray-200 bg-white"}`}>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Cake className="w-3.5 h-3.5" /> Birthday
            </p>
            {birthday ? (
              <>
                <p className="mt-2 text-lg font-bold text-gray-900">
                  {birthday.daysAway === 0 ? "Happy birthday!" : fmtMonthDay(birthday.date)}
                </p>
                <p className={`mt-1 text-sm ${birthday.daysAway <= 7 ? "text-forest-700 font-medium" : "text-gray-500"}`}>
                  {birthday.daysAway === 0 ? "The whole team is celebrating you today." : countdown(birthday.daysAway)}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Birthday not set yet. Your manager can add it.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
