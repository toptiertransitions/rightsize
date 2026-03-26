"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { StaffMember, PlanEntry } from "@/lib/types";
import { DEFAULT_WEEKLY_SCHEDULE } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────
type CalendarView = "week5" | "week7" | "month" | "day";

type StaffDayStatus =
  | { kind: "available"; start: string; end: string }
  | { kind: "timeOff"; allDay: boolean; start?: string; end?: string }
  | { kind: "unavailable" };

// ─── Activity colors ──────────────────────────────────────────────────────────
const LEGACY_ACTIVITY_COLORS: Record<string, string> = {
  "Sorting":          "bg-blue-100 text-blue-800",
  "Packing":          "bg-indigo-100 text-indigo-800",
  "Selling / Listing":"bg-emerald-100 text-emerald-800",
  "Staging":          "bg-purple-100 text-purple-800",
  "Donating":         "bg-amber-100 text-amber-800",
  "Discarding":       "bg-red-100 text-red-800",
  "Photography":      "bg-pink-100 text-pink-800",
  "Moving":           "bg-orange-100 text-orange-800",
  "Estate Sale Prep": "bg-teal-100 text-teal-800",
  "Other":            "bg-gray-100 text-gray-700",
};

function getActivityColor(activity: string): string {
  return LEGACY_ACTIVITY_COLORS[activity] ?? "bg-gray-100 text-gray-700";
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const result = new Date(d);
  result.setDate(d.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(d.getDate() + n);
  return result;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function fmt12(t?: string): string {
  if (!t) return "";
  const [hStr, m] = t.split(":");
  const h = parseInt(hStr, 10);
  return `${h % 12 || 12}:${m}${h < 12 ? "am" : "pm"}`;
}

const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
type DayKey = typeof DAY_KEYS[number];

function getDayKey(iso: string): DayKey {
  const [y, mo, d] = iso.split("-").map(Number);
  return DAY_KEYS[new Date(y, mo - 1, d).getDay()];
}

function getStaffDayStatus(member: StaffMember, iso: string): StaffDayStatus {
  const off = member.timeOff?.find(e => e.date === iso);
  if (off) return { kind: "timeOff", allDay: off.allDay, start: off.startTime, end: off.endTime };
  const dayKey = getDayKey(iso);
  const sched = member.weeklySchedule?.[dayKey] ?? DEFAULT_WEEKLY_SCHEDULE[dayKey];
  if (!sched.available) return { kind: "unavailable" };
  return { kind: "available", start: sched.start, end: sched.end };
}

function getMemberShifts(member: StaffMember, dayEntries: PlanEntry[]): PlanEntry[] {
  return dayEntries.filter(e =>
    e.helpers?.some(h => h.email.toLowerCase() === member.email.toLowerCase())
  );
}

function initials(name: string): string {
  return name.split(" ").map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2);
}

function MemberAvatar({ member, sizePx, className }: {
  member: StaffMember; sizePx: number; className?: string;
}) {
  const name = member.displayName || member.email;
  if (member.profileImageUrl) {
    return (
      <div className="rounded-full overflow-hidden flex-shrink-0" style={{ width: sizePx, height: sizePx }}>
        <Image src={member.profileImageUrl} alt={name} width={sizePx} height={sizePx} className="object-cover w-full h-full" />
      </div>
    );
  }
  return (
    <div className={`rounded-full flex items-center justify-center flex-shrink-0 font-bold ${className ?? ""}`}
      style={{ width: sizePx, height: sizePx, fontSize: sizePx * 0.38 }}>
      {initials(name)}
    </div>
  );
}

interface DateRange { from: Date; to: Date; days: Date[] }

function getDateRange(view: CalendarView, currentDate: Date): DateRange {
  if (view === "day") {
    return { from: currentDate, to: currentDate, days: [currentDate] };
  }
  if (view === "week5") {
    const mon = startOfWeek(currentDate);
    return { from: mon, to: addDays(mon, 4), days: Array.from({ length: 5 }, (_, i) => addDays(mon, i)) };
  }
  if (view === "week7") {
    const mon = startOfWeek(currentDate);
    return { from: mon, to: addDays(mon, 6), days: Array.from({ length: 7 }, (_, i) => addDays(mon, i)) };
  }
  // month
  const som = startOfMonth(currentDate);
  const eom = endOfMonth(currentDate);
  const gridStart = startOfWeek(som);
  const eomDay = eom.getDay();
  const gridEnd = eomDay === 0 ? eom : addDays(eom, 7 - eomDay);
  const days: Date[] = [];
  let d = new Date(gridStart);
  while (d <= gridEnd) { days.push(new Date(d)); d = addDays(d, 1); }
  return { from: gridStart, to: gridEnd, days };
}

function formatHeaderDate(d: Date): string {
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatWeekRange(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  return `${first.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${last.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

// ─── Compact row (week view, all-staff mode) ──────────────────────────────────
// One row per person per day — status + shift info all inline.
function CompactMemberRow({
  member, iso, shifts, tenantMap,
}: {
  member: StaffMember;
  iso: string;
  shifts: PlanEntry[];
  tenantMap: Record<string, string>;
}) {
  const status = getStaffDayStatus(member, iso);
  const name = member.displayName || member.email;
  const firstName = name.split(" ")[0];
  const isScheduled = status.kind === "available" && shifts.length > 0;

  // Color scheme per state
  const rowCls =
    isScheduled                  ? "bg-sky-50 border-l-2 border-sky-400" :
    status.kind === "available"  ? "bg-green-50 border-l-2 border-green-400" :
    status.kind === "timeOff"    ? "bg-amber-50 border-l-2 border-amber-400" :
                                   "bg-gray-50 border-l-2 border-gray-200";
  const textCls =
    isScheduled                  ? "text-sky-800" :
    status.kind === "available"  ? "text-green-800" :
    status.kind === "timeOff"    ? "text-amber-700" :
                                   "text-gray-300";
  const avatarCls =
    isScheduled                  ? "bg-sky-200 text-sky-800" :
    status.kind === "available"  ? "bg-green-200 text-green-800" :
    status.kind === "timeOff"    ? "bg-amber-200 text-amber-700" :
                                   "bg-gray-200 text-gray-400";

  // Right-side label
  let rightLabel: string;
  if (isScheduled) {
    const first = shifts[0];
    const extra = shifts.length > 1 ? ` +${shifts.length - 1}` : "";
    const proj = tenantMap[first.tenantId];
    rightLabel = proj ? `${first.activity} · ${proj}${extra}` : `${first.activity}${extra}`;
  } else if (status.kind === "available") {
    rightLabel = fmt12(status.start);
  } else if (status.kind === "timeOff") {
    rightLabel = status.allDay ? "Off" : fmt12(status.start) || "Off";
  } else {
    rightLabel = "";
  }

  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] ${rowCls} ${textCls}`}>
      <MemberAvatar member={member} sizePx={20} className={avatarCls} />
      <span className="font-medium truncate flex-shrink-0" style={{ maxWidth: 60 }}>{firstName}</span>
      {rightLabel && (
        <span className="ml-auto whitespace-nowrap opacity-75 text-[10px] truncate" style={{ maxWidth: 100 }}>
          {rightLabel}
        </span>
      )}
    </div>
  );
}

// ─── Full status card (day view / single-staff week view) ─────────────────────
function StatusCard({ member, iso }: { member: StaffMember; iso: string }) {
  const status = getStaffDayStatus(member, iso);
  if (status.kind === "available") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <p className="text-xs font-semibold text-green-800">Available</p>
        <p className="text-xs text-green-700 mt-0.5">{fmt12(status.start)} – {fmt12(status.end)}</p>
      </div>
    );
  }
  if (status.kind === "timeOff") {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <p className="text-xs font-semibold text-amber-700">Time Off</p>
        <p className="text-xs text-amber-600 mt-0.5">
          {status.allDay ? "All day" : `${fmt12(status.start)} – ${fmt12(status.end)}`}
        </p>
      </div>
    );
  }
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      <p className="text-xs font-medium text-gray-300">Day Off</p>
    </div>
  );
}

// ─── Shift card (day view / single-staff detail) ──────────────────────────────
function ShiftCard({ entry, projectName }: { entry: PlanEntry; projectName?: string }) {
  const colorCls = getActivityColor(entry.activity);
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${colorCls}`}>
      <span className="font-semibold">{entry.activity}</span>
      {projectName && (
        <span className="opacity-70 font-normal truncate">{projectName}</span>
      )}
      {(entry.startTime || entry.endTime) && (
        <span className="ml-auto whitespace-nowrap opacity-60 font-normal text-[11px]">
          {fmt12(entry.startTime)}{entry.endTime ? `–${fmt12(entry.endTime)}` : ""}
        </span>
      )}
    </div>
  );
}

// ─── Scheduled status card (day view, member has shifts) ─────────────────────
function ScheduledStatusCard({
  member, iso, shifts, tenantMap,
}: {
  member: StaffMember;
  iso: string;
  shifts: PlanEntry[];
  tenantMap: Record<string, string>;
}) {
  const status = getStaffDayStatus(member, iso);
  // If on time off or day off, show that instead
  if (status.kind !== "available") return <StatusCard member={member} iso={iso} />;

  return (
    <div className="space-y-1.5">
      <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
        <p className="text-xs font-semibold text-sky-800">Scheduled — {fmt12(status.start)} – {fmt12(status.end)}</p>
      </div>
      {shifts.map(e => (
        <ShiftCard key={e.id} entry={e} projectName={tenantMap[e.tenantId]} />
      ))}
    </div>
  );
}

// ─── Day summary badge (week header) ─────────────────────────────────────────
function DaySummaryBadge({
  members, iso, entriesByDate,
}: {
  members: StaffMember[];
  iso: string;
  entriesByDate: Record<string, PlanEntry[]>;
}) {
  const dayEntries = entriesByDate[iso] ?? [];
  const scheduled = members.filter(m =>
    getStaffDayStatus(m, iso).kind === "available" && getMemberShifts(m, dayEntries).length > 0
  ).length;
  const avail = members.filter(m =>
    getStaffDayStatus(m, iso).kind === "available" && getMemberShifts(m, dayEntries).length === 0
  ).length;
  const off = members.filter(m => getStaffDayStatus(m, iso).kind === "timeOff").length;

  if (scheduled === 0 && avail === 0 && off === 0) return null;
  return (
    <div className="flex gap-1 mt-0.5 flex-wrap justify-center">
      {scheduled > 0 && <span className="text-[10px] text-sky-700 font-medium">{scheduled} sched</span>}
      {avail > 0 && <span className="text-[10px] text-green-700 font-medium">{scheduled > 0 ? "· " : ""}{avail} avail</span>}
      {off > 0 && <span className="text-[10px] text-amber-600 font-medium">· {off} off</span>}
    </div>
  );
}

// ─── Controls bar ─────────────────────────────────────────────────────────────
interface ControlsProps {
  view: CalendarView;
  setView: (v: CalendarView) => void;
  navLabel: string;
  navigate: (d: -1 | 1) => void;
  goToday: () => void;
  selectedStaffEmail: string;
  setSelectedStaffEmail: (v: string) => void;
  activeMembers: StaffMember[];
  loading: boolean;
}

function CalendarControls({
  view, setView, navLabel, navigate, goToday,
  selectedStaffEmail, setSelectedStaffEmail, activeMembers, loading,
}: ControlsProps) {
  const VIEW_LABELS: Record<CalendarView, string> = {
    day: "Day", week5: "Week (5d)", week7: "7-Day", month: "Month",
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
        {(["day", "week5", "week7", "month"] as CalendarView[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => navigate(-1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors text-base leading-none"
          aria-label="Previous"
        >‹</button>
        <button
          onClick={goToday}
          className="px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >Today</button>
        <button
          onClick={() => navigate(1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors text-base leading-none"
          aria-label="Next"
        >›</button>
      </div>
      <span className="text-sm font-semibold text-gray-700">
        {navLabel}
        {loading && <span className="ml-2 text-xs font-normal text-gray-400">Loading…</span>}
      </span>
      <div className="ml-auto">
        <select
          value={selectedStaffEmail}
          onChange={e => setSelectedStaffEmail(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
        >
          <option value="__all__">All Staff</option>
          {activeMembers.map(m => (
            <option key={m.email} value={m.email}>{m.displayName || m.email}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CalendarLegend() {
  return (
    <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-6 text-xs text-gray-400 flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded inline-block bg-sky-50 border-l-2 border-sky-400" />
        Scheduled on shift
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded inline-block bg-green-50 border-l-2 border-green-400" />
        Available
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded inline-block bg-amber-50 border-l-2 border-amber-400" />
        Time Off
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded inline-block bg-gray-50 border-l-2 border-gray-200" />
        Day Off
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
interface Props {
  members: StaffMember[];
  tenants: { id: string; name: string }[];
}

export function StaffCalendarTab({ members, tenants }: Props) {
  const [view, setView] = useState<CalendarView>("week5");
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedStaffEmail, setSelectedStaffEmail] = useState("__all__");
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
  const activeMembers = members.filter(m => m.isActive);
  const filteredMembers = selectedStaffEmail === "__all__"
    ? activeMembers
    : activeMembers.filter(m => m.email === selectedStaffEmail);

  const { from, to, days } = getDateRange(view, currentDate);
  const todayISO = toISO(new Date());

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/staff/calendar?from=${toISO(from)}&to=${toISO(to)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error as string);
        setEntries((data.entries ?? []) as PlanEntry[]);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [view, toISO(currentDate)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Index entries by date
  const entriesByDate: Record<string, PlanEntry[]> = {};
  for (const entry of entries) {
    if (!entriesByDate[entry.date]) entriesByDate[entry.date] = [];
    entriesByDate[entry.date].push(entry);
  }

  function navigate(direction: -1 | 1) {
    setCurrentDate(prev => {
      if (view === "day") return addDays(prev, direction);
      if (view === "week5" || view === "week7") return addDays(prev, direction * 7);
      return new Date(prev.getFullYear(), prev.getMonth() + direction, 1);
    });
  }

  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCurrentDate(d);
  }

  const navLabel = view === "month"
    ? formatMonthYear(currentDate)
    : view === "day"
    ? currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : formatWeekRange(days);

  // ─── Month view ──────────────────────────────────────────────────────────────
  if (view === "month") {
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    const monthIdx = currentDate.getMonth();

    return (
      <div className="space-y-4">
        <CalendarControls
          view={view} setView={setView} navLabel={navLabel}
          navigate={navigate} goToday={goToday}
          selectedStaffEmail={selectedStaffEmail} setSelectedStaffEmail={setSelectedStaffEmail}
          activeMembers={activeMembers} loading={loading}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase">{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
              {week.map(day => {
                const iso = toISO(day);
                const isCurrentMonth = day.getMonth() === monthIdx;
                const isToday = iso === todayISO;
                const dayEntries = entriesByDate[iso] ?? [];

                const scheduled = filteredMembers.filter(m =>
                  getStaffDayStatus(m, iso).kind === "available" && getMemberShifts(m, dayEntries).length > 0
                ).length;
                const avail = filteredMembers.filter(m =>
                  getStaffDayStatus(m, iso).kind === "available" && getMemberShifts(m, dayEntries).length === 0
                ).length;
                const timeOff = filteredMembers.filter(m => getStaffDayStatus(m, iso).kind === "timeOff").length;
                const unavail = filteredMembers.filter(m => getStaffDayStatus(m, iso).kind === "unavailable").length;

                return (
                  <button
                    key={iso}
                    onClick={() => { setCurrentDate(new Date(day)); setView("day"); }}
                    className={`min-h-[90px] p-2 text-left border-r border-gray-100 last:border-r-0 hover:bg-gray-50 transition-colors ${!isCurrentMonth ? "opacity-40" : ""}`}
                  >
                    <div className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold mb-1.5 ${
                      isToday ? "bg-forest-600 text-white" : "text-gray-700"
                    }`}>
                      {day.getDate()}
                    </div>
                    <div className="flex gap-0.5 flex-wrap mb-1">
                      {Array.from({ length: Math.min(scheduled, 6) }).map((_, i) => (
                        <span key={`s${i}`} className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
                      ))}
                      {Array.from({ length: Math.min(avail, 6) }).map((_, i) => (
                        <span key={`a${i}`} className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      ))}
                      {Array.from({ length: Math.min(timeOff, 4) }).map((_, i) => (
                        <span key={`t${i}`} className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                      ))}
                      {Array.from({ length: Math.min(unavail, 3) }).map((_, i) => (
                        <span key={`u${i}`} className="w-1.5 h-1.5 rounded-full bg-gray-200 inline-block" />
                      ))}
                    </div>
                    {dayEntries.length > 0 && (
                      <span className="text-[10px] font-medium text-sky-700 bg-sky-50 rounded-full px-1.5 py-0.5">
                        {dayEntries.length} shift{dayEntries.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <CalendarLegend />
      </div>
    );
  }

  // ─── Day view ─────────────────────────────────────────────────────────────────
  if (view === "day") {
    const iso = toISO(currentDate);
    const dayEntries = entriesByDate[iso] ?? [];

    return (
      <div className="space-y-4">
        <CalendarControls
          view={view} setView={setView} navLabel={navLabel}
          navigate={navigate} goToday={goToday}
          selectedStaffEmail={selectedStaffEmail} setSelectedStaffEmail={setSelectedStaffEmail}
          activeMembers={activeMembers} loading={loading}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          {filteredMembers.length === 0 ? (
            <p className="text-sm text-gray-400">No staff members to display.</p>
          ) : filteredMembers.map(member => {
            const memberShifts = getMemberShifts(member, dayEntries);
            const isScheduled = getStaffDayStatus(member, iso).kind === "available" && memberShifts.length > 0;
            return (
              <div
                key={member.id}
                className={`bg-white border rounded-xl p-4 flex items-start gap-4 ${
                  isScheduled ? "border-sky-200" : "border-gray-200"
                }`}
              >
                <MemberAvatar
                  member={member} sizePx={36}
                  className={isScheduled ? "bg-sky-100 text-sky-700" : "bg-forest-100 text-forest-700"}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{member.displayName || member.email}</p>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {member.role}
                    </span>
                    {isScheduled && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                        On Shift
                      </span>
                    )}
                  </div>
                  {isScheduled ? (
                    <ScheduledStatusCard member={member} iso={iso} shifts={memberShifts} tenantMap={tenantMap} />
                  ) : (
                    <>
                      <StatusCard member={member} iso={iso} />
                      {memberShifts.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {memberShifts.map(e => (
                            <ShiftCard key={e.id} entry={e} projectName={tenantMap[e.tenantId]} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <CalendarLegend />
      </div>
    );
  }

  // ─── Week view (5-day or 7-day) ───────────────────────────────────────────────
  const colCount = days.length;
  const singleStaff = selectedStaffEmail !== "__all__";

  return (
    <div className="space-y-4">
      <CalendarControls
        view={view} setView={setView} navLabel={navLabel}
        navigate={navigate} goToday={goToday}
        selectedStaffEmail={selectedStaffEmail} setSelectedStaffEmail={setSelectedStaffEmail}
        activeMembers={activeMembers} loading={loading}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${colCount}, minmax(150px, 1fr))` }}
        >
          {/* Day headers */}
          {days.map(day => {
            const iso = toISO(day);
            const isToday = iso === todayISO;
            return (
              <div
                key={`hdr-${iso}`}
                className={`px-3 py-2 text-center border-b border-r border-gray-200 last:border-r-0 ${
                  isToday ? "bg-forest-50" : "bg-gray-50"
                }`}
              >
                <p className={`text-xs font-semibold ${isToday ? "text-forest-700" : "text-gray-600"}`}>
                  {formatHeaderDate(day)}
                </p>
                <DaySummaryBadge members={filteredMembers} iso={iso} entriesByDate={entriesByDate} />
              </div>
            );
          })}

          {/* Day columns */}
          {days.map(day => {
            const iso = toISO(day);
            const isToday = iso === todayISO;
            const dayEntries = entriesByDate[iso] ?? [];

            return (
              <div
                key={`col-${iso}`}
                className={`border-r border-gray-100 last:border-r-0 p-1.5 space-y-0.5 ${
                  isToday ? "bg-forest-50/30" : ""
                }`}
              >
                {singleStaff ? (
                  // Single staff: full status card + shift cards
                  filteredMembers.map(member => {
                    const memberShifts = getMemberShifts(member, dayEntries);
                    const isScheduled = getStaffDayStatus(member, iso).kind === "available" && memberShifts.length > 0;
                    return (
                      <div key={member.id} className="space-y-1">
                        {isScheduled ? (
                          <ScheduledStatusCard member={member} iso={iso} shifts={memberShifts} tenantMap={tenantMap} />
                        ) : (
                          <>
                            <StatusCard member={member} iso={iso} />
                            {memberShifts.map(e => (
                              <ShiftCard key={e.id} entry={e} projectName={tenantMap[e.tenantId]} />
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })
                ) : (
                  // All staff: one compact row per person, shift info inline
                  filteredMembers.map(member => (
                    <CompactMemberRow
                      key={member.id}
                      member={member}
                      iso={iso}
                      shifts={getMemberShifts(member, dayEntries)}
                      tenantMap={tenantMap}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
      <CalendarLegend />
    </div>
  );
}
