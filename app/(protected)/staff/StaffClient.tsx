"use client";

import type { StaffMember, WeeklySchedule, TimeOffEntry } from "@/lib/types";
import { DEFAULT_WEEKLY_SCHEDULE } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Day = typeof DAYS[number];

function fmt12(t: string) {
  if (!t) return "";
  const [hStr, m] = t.split(":");
  const h = parseInt(hStr, 10);
  return `${h % 12 || 12}:${m}${h < 12 ? "am" : "pm"}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  const [y, mo, day] = d.split("-").map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

const ROLE_COLORS: Record<string, string> = {
  TTTAdmin:   "bg-purple-100 text-purple-700",
  TTTManager: "bg-blue-100 text-blue-700",
  TTTStaff:   "bg-gray-100 text-gray-700",
};
const ROLE_LABELS: Record<string, string> = {
  TTTAdmin: "Admin", TTTManager: "Manager", TTTStaff: "Staff",
};

// ─── Day Cell ─────────────────────────────────────────────────────────────────
function DayCell({ day, schedule }: { day: Day; schedule: WeeklySchedule }) {
  const d = schedule[day];
  if (!d.available) {
    return <span className="text-[10px] text-gray-300 font-medium">Off</span>;
  }
  return (
    <span className="text-[10px] text-forest-700 font-medium leading-tight whitespace-nowrap">
      {fmt12(d.start)}<br />{fmt12(d.end)}
    </span>
  );
}

// ─── Time-off Pills ───────────────────────────────────────────────────────────
function TimeOffPills({ entries }: { entries: TimeOffEntry[] }) {
  const today = todayStr();
  const upcoming = entries
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  if (!upcoming.length) {
    return <span className="text-xs text-gray-300">None scheduled</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {upcoming.map((e) => (
        <span
          key={e.id}
          className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium"
          title={e.allDay ? "All day" : `${fmt12(e.startTime ?? "")}–${fmt12(e.endTime ?? "")}`}
        >
          {fmtDate(e.date)}
          {!e.allDay && (
            <span className="opacity-70 ml-0.5">
              {fmt12(e.startTime ?? "")}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

// ─── Member Card ──────────────────────────────────────────────────────────────
function MemberCard({ member }: { member: StaffMember }) {
  const schedule = member.weeklySchedule ?? DEFAULT_WEEKLY_SCHEDULE;
  const timeOff = member.timeOff ?? [];
  const hasSchedule = !!member.weeklySchedule;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Name + role */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-forest-100 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-forest-700">
              {(member.displayName || member.email).charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{member.displayName || member.email}</p>
            <p className="text-xs text-gray-400 truncate">{member.email}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role] ?? "bg-gray-100 text-gray-600"}`}>
          {ROLE_LABELS[member.role] ?? member.role}
        </span>
      </div>

      {/* Weekly grid */}
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Weekly Schedule</p>
        {hasSchedule ? (
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((day) => (
              <div key={day} className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-semibold text-gray-400 uppercase">{day}</span>
                <div className="text-center min-h-[30px] flex items-center justify-center">
                  <DayCell day={day} schedule={schedule} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">Not set — ask them to update via their home page.</p>
        )}
      </div>

      {/* Time off */}
      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Upcoming Time Off</p>
        <TimeOffPills entries={timeOff} />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  members: StaffMember[];
}

export function StaffClient({ members }: Props) {
  const today = todayStr();

  // Summary counts
  const totalOut = members.filter((m) =>
    (m.timeOff ?? []).some((e) => e.date === today)
  ).length;

  if (members.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Staff Availability</h1>
        <p className="text-gray-500">No active staff members found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Staff Availability</h1>
        <p className="text-gray-500 mt-1 text-sm">
          {members.length} active staff member{members.length !== 1 ? "s" : ""}.
          {totalOut > 0 && (
            <span className="ml-2 text-amber-600 font-medium">{totalOut} out today.</span>
          )}
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {members.map((m) => (
          <MemberCard key={m.id} member={m} />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-10 pt-6 border-t border-gray-100 flex items-center gap-6 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-forest-500 inline-block" />
          Available hours
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Time off
        </div>
        <p className="ml-auto italic">Staff update their own availability from the Home page.</p>
      </div>
    </div>
  );
}
