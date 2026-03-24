"use client";

import { useState, useEffect } from "react";
import type { WeeklySchedule, TimeOffEntry, DaySchedule } from "@/lib/types";
import { DEFAULT_WEEKLY_SCHEDULE } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS = [
  { key: "Mon" as const, label: "Monday" },
  { key: "Tue" as const, label: "Tuesday" },
  { key: "Wed" as const, label: "Wednesday" },
  { key: "Thu" as const, label: "Thursday" },
  { key: "Fri" as const, label: "Friday" },
  { key: "Sat" as const, label: "Saturday" },
  { key: "Sun" as const, label: "Sunday" },
];

function fmt12(t: string) {
  if (!t) return "";
  const [hStr, m] = t.split(":");
  const h = parseInt(hStr, 10);
  return `${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── Weekly Schedule Tab ──────────────────────────────────────────────────────
function WeeklyTab({
  schedule,
  onChange,
}: {
  schedule: WeeklySchedule;
  onChange: (s: WeeklySchedule) => void;
}) {
  function setDay(key: keyof WeeklySchedule, patch: Partial<DaySchedule>) {
    onChange({ ...schedule, [key]: { ...schedule[key], ...patch } });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-4">
        Set your typical working hours for each day of the week. These are used for shift scheduling — you can still be assigned outside these hours.
      </p>
      {DAYS.map(({ key, label }) => {
        const day = schedule[key];
        return (
          <div
            key={key}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              day.available
                ? "border-forest-200 bg-forest-50/40"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            {/* Toggle */}
            <button
              type="button"
              onClick={() => setDay(key, { available: !day.available })}
              className={`relative flex-shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                day.available ? "bg-forest-600" : "bg-gray-300"
              }`}
              aria-label={day.available ? "Mark unavailable" : "Mark available"}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                  day.available ? "translate-x-[18px]" : "translate-x-[3px]"
                }`}
              />
            </button>

            {/* Day label */}
            <span
              className={`w-24 text-sm font-medium ${
                day.available ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {label}
            </span>

            {/* Time range */}
            {day.available ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={day.start}
                  onChange={(e) => setDay(key, { start: e.target.value })}
                  className="h-8 px-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="time"
                  value={day.end}
                  onChange={(e) => setDay(key, { end: e.target.value })}
                  className="h-8 px-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400"
                />
              </div>
            ) : (
              <span className="flex-1 text-xs text-gray-400">Not available</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Time Off Tab ─────────────────────────────────────────────────────────────
function TimeOffTab({
  entries,
  onChange,
  onAutoSave,
}: {
  entries: TimeOffEntry[];
  onChange: (e: TimeOffEntry[]) => void;
  onAutoSave: (e: TimeOffEntry[]) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);

  const upcoming = [...entries]
    .filter((e) => e.date >= todayStr())
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = [...entries]
    .filter((e) => e.date < todayStr())
    .sort((a, b) => b.date.localeCompare(a.date));

  async function persist(updated: TimeOffEntry[]) {
    setAutoSaving(true);
    setAutoSaved(false);
    try {
      await onAutoSave(updated);
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    } finally {
      setAutoSaving(false);
    }
  }

  async function add() {
    if (!date) return;
    const entry: TimeOffEntry = {
      id: uid(),
      date,
      allDay,
      ...(allDay ? {} : { startTime, endTime }),
    };
    const updated = [...entries, entry];
    onChange(updated);
    await persist(updated);
    // Reset date input to blank for next entry
    setDate("");
  }

  async function remove(id: string) {
    const updated = entries.filter((e) => e.id !== id);
    onChange(updated);
    await persist(updated);
  }

  function fmtDate(d: string) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  }

  const EntryRow = ({ entry }: { entry: TimeOffEntry }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div>
        <span className="text-sm font-medium text-gray-900">{fmtDate(entry.date)}</span>
        <span className="ml-2 text-xs text-gray-500">
          {entry.allDay
            ? "All day"
            : `${fmt12(entry.startTime ?? "")} – ${fmt12(entry.endTime ?? "")}`}
        </span>
      </div>
      <button
        onClick={() => remove(entry.id)}
        disabled={autoSaving}
        className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
        title="Remove"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">
        Add specific days or time blocks when you won't be available. Past dates are kept for records.
      </p>

      {/* Add entry */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add unavailable date</p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={date}
            min={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400"
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded border-gray-300 text-forest-600 focus:ring-forest-400"
            />
            All day
          </label>
        </div>

        {!allDay && (
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400"
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={add}
            disabled={!date || autoSaving}
            className="h-8 px-4 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-40"
          >
            {autoSaving ? "Saving…" : "Add date"}
          </button>
          {autoSaved && (
            <span className="text-xs text-green-600 font-medium">Saved</span>
          )}
        </div>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upcoming</p>
          <div className="bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-100">
            {upcoming.map((e) => <EntryRow key={e.id} entry={e} />)}
          </div>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <details className="group">
          <summary className="text-xs text-gray-400 cursor-pointer list-none flex items-center gap-1 hover:text-gray-600 select-none">
            <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {past.length} past date{past.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-2 bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-100">
            {past.map((e) => <EntryRow key={e.id} entry={e} />)}
          </div>
        </details>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">No time-off dates added yet.</p>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function AvailabilityModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"schedule" | "timeoff">("schedule");
  const [schedule, setSchedule] = useState<WeeklySchedule>(DEFAULT_WEEKLY_SCHEDULE);
  const [timeOff, setTimeOff] = useState<TimeOffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/availability")
      .then((r) => r.json())
      .then((d) => {
        if (d.weeklySchedule) setSchedule(d.weeklySchedule);
        if (d.timeOff) setTimeOff(d.timeOff);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveToApi(payload: { weeklySchedule?: WeeklySchedule; timeOff?: TimeOffEntry[] }) {
    const res = await fetch("/api/availability", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "Failed to save");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await saveToApi({ weeklySchedule: schedule, timeOff });
      onClose(); // close immediately on success
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoSaveTimeOff(updated: TimeOffEntry[]) {
    await saveToApi({ timeOff: updated });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">My Availability</h2>
            <p className="text-xs text-gray-500 mt-0.5">Used for shift planning — no bookings blocked automatically.</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {(["schedule", "timeoff"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? "text-forest-700 border-b-2 border-forest-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "schedule" ? "Weekly Schedule" : "Time Off"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : tab === "schedule" ? (
            <WeeklyTab schedule={schedule} onChange={setSchedule} />
          ) : (
            <TimeOffTab entries={timeOff} onChange={setTimeOff} onAutoSave={handleAutoSaveTimeOff} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="text-sm">
            {error && <span className="text-red-500">{error}</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="h-9 px-5 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AvailabilitySection (inline card on home page) ───────────────────────────
export function AvailabilitySection() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="mt-8">
        <h2 className="text-base font-semibold text-gray-900 mb-4">My Availability</h2>
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-700 font-medium">Schedule &amp; time off</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Set your weekly hours and block specific days for shift planning.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex-shrink-0 h-9 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors"
          >
            Set Availability
          </button>
        </div>
      </section>

      {open && <AvailabilityModal onClose={() => setOpen(false)} />}
    </>
  );
}
