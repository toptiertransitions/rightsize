"use client";

import { useState } from "react";
import type { PlanEntry } from "@/lib/types";

// ─── Color palettes ───────────────────────────────────────────────────────────
const PROJECT_COLOR_PALETTE = [
  "bg-teal-100 text-teal-800",
  "bg-indigo-100 text-indigo-800",
  "bg-purple-100 text-purple-800",
  "bg-orange-100 text-orange-800",
  "bg-amber-100 text-amber-800",
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-cyan-100 text-cyan-800",
  "bg-pink-100 text-pink-800",
  "bg-rose-100 text-rose-800",
];

const KEY_DATE_COLORS: Record<string, string> = {
  "Start Date": "bg-emerald-50 text-emerald-800 border border-emerald-300",
  "Move Date": "bg-amber-50 text-amber-800 border border-amber-300",
  "Pickup Date": "bg-blue-50 text-blue-800 border border-blue-300",
  "Estate Sale Date": "bg-purple-50 text-purple-800 border border-purple-300",
  "Close Date": "bg-red-50 text-red-800 border border-red-300",
  "Consign/ProFound Delivery": "bg-teal-50 text-teal-800 border border-teal-300",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const r = new Date(d); r.setDate(d.getDate() + diff); r.setHours(0, 0, 0, 0); return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(d.getDate() + n); return r;
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

const ALL_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WORK_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ─── KeyDateChip ────────────────────────────────────────────────────────────
function KeyDateChip({ entry, projectColor, projectName }: { entry: PlanEntry; projectColor?: string; projectName?: string }) {
  const colorClass = projectColor ?? KEY_DATE_COLORS[entry.activity] ?? "bg-gray-100 text-gray-700";
  return (
    <div className={`w-full text-left px-2 py-1 rounded-lg text-xs font-semibold leading-snug ${colorClass}`}>
      <div className="flex items-center gap-1 truncate">
        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
        </svg>
        <span className="truncate">{entry.activity}</span>
      </div>
      {projectName && <div className="truncate font-medium text-[10px] opacity-70 pl-4">{projectName}</div>}
    </div>
  );
}

// ─── PartnerActiveProjectsCalendar ─────────────────────────────────────────────
export interface PartnerProjectOption {
  tenantId: string;
  name: string;
}

interface Props {
  projects: PartnerProjectOption[];
  entries: PlanEntry[];
  loading?: boolean;
}

export function PartnerActiveProjectsCalendar({ projects, entries, loading }: Props) {
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [showWeekends, setShowWeekends] = useState(false); // 5-day default
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("all");

  const isAllMode = selectedTenantId === "all";
  const visibleEntries = isAllMode ? entries : entries.filter(e => e.tenantId === selectedTenantId);

  const projectColorMap: Record<string, string> = {};
  projects.forEach((p, i) => { projectColorMap[p.tenantId] = PROJECT_COLOR_PALETTE[i % PROJECT_COLOR_PALETTE.length]; });
  const projectNameMap: Record<string, string> = {};
  projects.forEach(p => { projectNameMap[p.tenantId] = p.name; });

  const todayISO = toISO(new Date());
  const entriesByDate = visibleEntries.reduce<Record<string, PlanEntry[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});

  // ── Week ──
  const weekStart = startOfWeek(currentDate);
  const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekDays = showWeekends ? allWeekDays : allWeekDays.slice(0, 5);
  const dayNames = showWeekends ? ALL_DAY_NAMES : WORK_DAY_NAMES;
  const colCount = showWeekends ? 7 : 5;
  const colClass = colCount === 5 ? "grid-cols-5" : "grid-cols-7";
  const weekLabel = (() => {
    const s = weekDays[0]; const e = weekDays[weekDays.length - 1];
    if (s.getMonth() === e.getMonth()) return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  })();

  // ── Day ──
  const dayLabel = `${FULL_DAY_NAMES[currentDate.getDay()]}, ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;

  // ── Month ──
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthLabel = `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  const allCalendarDays: (Date | null)[] = [];
  const firstDayOfWeek = monthStart.getDay();
  const paddingStart = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  for (let i = 0; i < paddingStart; i++) allCalendarDays.push(null);
  for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) allCalendarDays.push(new Date(d));
  while (allCalendarDays.length % 7 !== 0) allCalendarDays.push(null);
  const calendarDays = showWeekends ? allCalendarDays : allCalendarDays.filter((_, i) => i % 7 < 5);

  const navigate = (dir: -1 | 1) => {
    if (view === "week") setCurrentDate(d => addDays(d, dir * 7));
    else if (view === "month") setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else setCurrentDate(d => addDays(d, dir));
  };

  const renderChip = (entry: PlanEntry) => (
    <KeyDateChip
      key={entry.id}
      entry={entry}
      projectColor={isAllMode ? projectColorMap[entry.tenantId] : undefined}
      projectName={isAllMode ? projectNameMap[entry.tenantId] : undefined}
    />
  );

  if (projects.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">No active projects for this partner yet.</p>;
  }

  return (
    <div>
      {/* Project filter */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <button
          onClick={() => setSelectedTenantId("all")}
          className={`h-7 px-3 text-xs rounded-full border transition-colors ${
            isAllMode ? "border-forest-600 bg-forest-50 text-forest-700 font-medium" : "border-gray-200 text-gray-500 hover:border-gray-400"
          }`}
        >
          All Active Projects
        </button>
        {projects.map(p => (
          <button
            key={p.tenantId}
            onClick={() => setSelectedTenantId(p.tenantId)}
            className={`h-7 px-3 text-xs rounded-full border transition-colors ${
              selectedTenantId === p.tenantId ? "border-forest-600 bg-forest-50 text-forest-700 font-medium" : "border-gray-200 text-gray-500 hover:border-gray-400"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          Loading key dates…
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(-1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-gray-800 min-w-[170px] text-center">
                {view === "week" ? weekLabel : view === "month" ? monthLabel : dayLabel}
              </span>
              <button
                onClick={() => navigate(1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 h-8 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
              >
                Today
              </button>
            </div>

            <div className="flex items-center gap-2">
              {view !== "day" && (
                <button
                  onClick={() => setShowWeekends(w => !w)}
                  className={`px-3 h-8 text-xs font-medium rounded-lg border transition-colors ${
                    showWeekends ? "border-gray-200 text-gray-500 hover:bg-gray-50" : "border-forest-600/40 bg-forest-50 text-forest-700"
                  }`}
                >
                  {showWeekends ? "5-Day" : "7-Day"}
                </button>
              )}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(["day", "week", "month"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 h-8 text-xs font-medium capitalize transition-colors ${
                      view === v ? "bg-forest-600 text-white" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Week View */}
          {view === "week" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className={`grid ${colClass} divide-x divide-gray-100`}>
                {weekDays.map((day, idx) => {
                  const iso = toISO(day);
                  const dayEntries = entriesByDate[iso] ?? [];
                  const isToday = iso === todayISO;
                  return (
                    <div key={iso} className="flex flex-col min-h-[160px]">
                      <button
                        type="button"
                        onClick={() => { setCurrentDate(day); setView("day"); }}
                        className={`w-full px-2 py-2.5 text-center border-b border-gray-100 hover:bg-forest-50 transition-colors ${isToday ? "bg-forest-50" : ""}`}
                      >
                        <div className="text-[11px] text-gray-400 font-medium">{dayNames[idx]}</div>
                        <div className={`text-base font-bold mt-0.5 ${isToday ? "text-forest-600" : "text-gray-800"}`}>{day.getDate()}</div>
                      </button>
                      <div className="flex-1 p-1.5 space-y-1">
                        {dayEntries.map(e => renderChip(e))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Day View */}
          {view === "day" && (() => {
            const iso = toISO(currentDate);
            const dayEntries = entriesByDate[iso] ?? [];
            const isToday = iso === todayISO;
            return (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className={`px-4 py-2.5 border-b border-gray-100 ${isToday ? "bg-forest-50" : ""}`}>
                  <p className={`text-sm font-semibold ${isToday ? "text-forest-600" : "text-gray-800"}`}>{dayLabel}</p>
                  {isToday && <p className="text-xs text-forest-600/70 mt-0.5">Today</p>}
                </div>
                <div className="p-3 space-y-2 min-h-[160px]">
                  {dayEntries.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">No key dates scheduled</p>}
                  {dayEntries.map(e => renderChip(e))}
                </div>
              </div>
            );
          })()}

          {/* Month View */}
          {view === "month" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className={`grid ${colClass} divide-x divide-gray-100 border-b border-gray-100`}>
                {(showWeekends ? ALL_DAY_NAMES : WORK_DAY_NAMES).map(d => (
                  <div key={d} className="py-2 text-center text-[11px] font-medium text-gray-400">{d}</div>
                ))}
              </div>
              <div className={`grid ${colClass} divide-x divide-gray-100`}>
                {calendarDays.map((day, i) => {
                  if (!day) return <div key={`e-${i}`} className="min-h-[90px] bg-gray-50/50 border-b border-gray-100" />;
                  const iso = toISO(day);
                  const dayEntries = entriesByDate[iso] ?? [];
                  const isToday = iso === todayISO;
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const isExpanded = expandedDay === iso;
                  const visible = isExpanded ? dayEntries : dayEntries.slice(0, 2);
                  const overflow = dayEntries.length > 2 ? dayEntries.length - 2 : 0;
                  return (
                    <div key={iso} className={`min-h-[90px] border-b border-gray-100 p-1.5 flex flex-col ${!isCurrentMonth ? "bg-gray-50/30" : ""}`}>
                      <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday ? "bg-forest-600 text-white" : isCurrentMonth ? "text-gray-700" : "text-gray-300"
                      }`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5 flex-1">
                        {visible.map(e => renderChip(e))}
                        {overflow > 0 && (
                          <button
                            onClick={() => setExpandedDay(isExpanded ? null : iso)}
                            className="text-[10px] text-forest-600 font-medium px-1 hover:underline text-left"
                          >
                            {isExpanded ? "show less" : `+${overflow} more`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
