"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLAN_ACTIVITIES } from "@/lib/types";
import type { PlanEntry, PlanActivity, Room } from "@/lib/types";

// ─── Activity chip colors ──────────────────────────────────────────────────────
const ACTIVITY_COLORS: Record<PlanActivity, string> = {
  "Sorting": "bg-blue-100 text-blue-800",
  "Packing": "bg-indigo-100 text-indigo-800",
  "Selling / Listing": "bg-emerald-100 text-emerald-800",
  "Staging": "bg-purple-100 text-purple-800",
  "Donating": "bg-amber-100 text-amber-800",
  "Discarding": "bg-red-100 text-red-800",
  "Photography": "bg-pink-100 text-pink-800",
  "Moving": "bg-orange-100 text-orange-800",
  "Estate Sale Prep": "bg-teal-100 text-teal-800",
  "Other": "bg-gray-100 text-gray-700",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day; // Monday
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

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── AddFocusModal ─────────────────────────────────────────────────────────────
interface ModalProps {
  tenantId: string;
  rooms: Room[];
  entry?: PlanEntry;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

function AddFocusModal({ tenantId, rooms, entry, defaultDate, onClose, onSaved }: ModalProps) {
  const [date, setDate] = useState(entry?.date ?? defaultDate ?? toISO(new Date()));
  const [activity, setActivity] = useState<PlanActivity>(entry?.activity ?? "Sorting");
  const [roomId, setRoomId] = useState(entry?.roomId ?? "");
  const [customRoom, setCustomRoom] = useState(entry?.roomLabel ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isCustomRoom = roomId === "__custom__";
  const isEdit = !!entry;

  const handleSave = async () => {
    if (!date) { setError("Date is required"); return; }
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...(isEdit ? { id: entry.id } : { tenantId }),
        date,
        activity,
        roomId: isCustomRoom ? "" : roomId || "",
        roomLabel: isCustomRoom ? customRoom.trim() : "",
        notes: notes.trim(),
      };
      const res = await fetch("/api/plan", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = "Failed to save";
        try { const d = await res.json(); msg = d.error ?? msg; } catch {}
        throw new Error(msg);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/plan?id=${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        let msg = "Failed to delete";
        try { const d = await res.json(); msg = d.error ?? msg; } catch {}
        throw new Error(msg);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error deleting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-cream-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? "Edit Focus" : "Add Daily Focus"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
            />
          </div>

          {/* Activity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Activity</label>
            <select
              value={activity}
              onChange={(e) => setActivity(e.target.value as PlanActivity)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
            >
              {PLAN_ACTIVITIES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Room */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Room (optional)</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
            >
              <option value="">— None —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
              <option disabled>─────────────────</option>
              <option value="__custom__">Custom (not in project)</option>
            </select>
          </div>

          {isCustomRoom && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Custom room name</label>
              <input
                type="text"
                value={customRoom}
                onChange={(e) => setCustomRoom(e.target.value)}
                placeholder="e.g. Detached garage"
                className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional context..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 flex gap-3 border-t border-cream-100">
          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="h-11 px-4 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-11 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 h-11 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Focus"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ActivityChip ──────────────────────────────────────────────────────────────
function ActivityChip({
  entry,
  rooms,
  onClick,
}: {
  entry: PlanEntry;
  rooms: Room[];
  onClick?: () => void;
}) {
  const room = entry.roomId ? rooms.find((r) => r.id === entry.roomId) : null;
  const roomLabel = room?.name ?? entry.roomLabel ?? "";
  const colorClass = ACTIVITY_COLORS[entry.activity] ?? "bg-gray-100 text-gray-700";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1 rounded-lg text-xs font-medium leading-snug ${colorClass} ${onClick ? "hover:opacity-80 transition-opacity" : ""}`}
    >
      <div className="truncate">{entry.activity}</div>
      {roomLabel && <div className="truncate opacity-70 text-[10px]">{roomLabel}</div>}
    </button>
  );
}

// ─── PlanClient ────────────────────────────────────────────────────────────────
interface PlanClientProps {
  entries: PlanEntry[];
  rooms: Room[];
  tenantId: string;
  canEdit: boolean;
}

export function PlanClient({ entries, rooms, tenantId, canEdit }: PlanClientProps) {
  const router = useRouter();
  const [view, setView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<PlanEntry | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);

  const entriesByDate = entries.reduce<Record<string, PlanEntry[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});

  const openAdd = (dateISO: string) => {
    setEditEntry(undefined);
    setSelectedDate(dateISO);
    setShowModal(true);
  };

  const openEdit = (entry: PlanEntry) => {
    setEditEntry(entry);
    setSelectedDate(entry.date);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditEntry(undefined);
    setSelectedDate(undefined);
  };

  const onSaved = () => {
    closeModal();
    router.refresh();
  };

  // ── Week view ────────────────────────────────────────────────────────────────
  const weekStart = startOfWeek(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const weekLabel = (() => {
    const s = weekDays[0];
    const e = weekDays[6];
    if (s.getMonth() === e.getMonth()) {
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  })();

  const navigateWeek = (dir: -1 | 1) => {
    setCurrentDate((d) => addDays(d, dir * 7));
  };

  // ── Month view ───────────────────────────────────────────────────────────────
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthLabel = `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  // Build calendar grid (Mon–Sun)
  const calendarDays: (Date | null)[] = [];
  const firstDayOfWeek = monthStart.getDay(); // 0=Sun
  const paddingStart = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  for (let i = 0; i < paddingStart; i++) calendarDays.push(null);
  for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) {
    calendarDays.push(new Date(d));
  }
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  const navigateMonth = (dir: -1 | 1) => {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  };

  const todayISO = toISO(new Date());

  return (
    <>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => view === "week" ? navigateWeek(-1) : navigateMonth(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-800 min-w-[200px] text-center">
            {view === "week" ? weekLabel : monthLabel}
          </span>
          <button
            onClick={() => view === "week" ? navigateWeek(1) : navigateMonth(1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 h-9 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
          >
            Today
          </button>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setView("week")}
            className={`px-4 h-9 text-sm font-medium transition-colors ${
              view === "week" ? "bg-forest-600 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView("month")}
            className={`px-4 h-9 text-sm font-medium transition-colors ${
              view === "month" ? "bg-forest-600 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* ── Weekly View ─────────────────────────────────────────────────────── */}
      {view === "week" && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 divide-x divide-gray-100">
            {weekDays.map((day) => {
              const iso = toISO(day);
              const dayEntries = entriesByDate[iso] ?? [];
              const isToday = iso === todayISO;

              return (
                <div key={iso} className="flex flex-col min-h-[200px]">
                  {/* Header */}
                  <div className={`px-2 py-3 text-center border-b border-gray-100 ${isToday ? "bg-forest-50" : ""}`}>
                    <div className="text-xs text-gray-400 font-medium">{DAY_NAMES[weekDays.indexOf(day)]}</div>
                    <div className={`text-lg font-bold mt-0.5 ${isToday ? "text-forest-700" : "text-gray-800"}`}>
                      {day.getDate()}
                    </div>
                  </div>

                  {/* Entries */}
                  <div className="flex-1 p-1.5 space-y-1">
                    {dayEntries.map((entry) => (
                      <ActivityChip
                        key={entry.id}
                        entry={entry}
                        rooms={rooms}
                        onClick={canEdit ? () => openEdit(entry) : undefined}
                      />
                    ))}
                  </div>

                  {/* Add button */}
                  {canEdit && (
                    <div className="px-1.5 pb-2">
                      <button
                        onClick={() => openAdd(iso)}
                        className="w-full py-1 rounded-lg text-xs text-gray-400 hover:text-forest-600 hover:bg-forest-50 transition-colors"
                      >
                        + Add
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Monthly View ────────────────────────────────────────────────────── */}
      {view === "month" && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Day name headers */}
          <div className="grid grid-cols-7 divide-x divide-gray-100 border-b border-gray-100">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 divide-x divide-gray-100">
            {calendarDays.map((day, i) => {
              if (!day) {
                return <div key={`empty-${i}`} className="min-h-[100px] bg-gray-50/50 border-b border-gray-100" />;
              }
              const iso = toISO(day);
              const dayEntries = entriesByDate[iso] ?? [];
              const isToday = iso === todayISO;
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const overflow = dayEntries.length > 2 ? dayEntries.length - 2 : 0;

              return (
                <div
                  key={iso}
                  className={`min-h-[100px] border-b border-gray-100 p-1.5 flex flex-col ${
                    !isCurrentMonth ? "bg-gray-50/30" : ""
                  } ${canEdit ? "cursor-pointer hover:bg-forest-50/30 transition-colors" : ""}`}
                  onClick={canEdit ? () => openAdd(iso) : undefined}
                >
                  <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? "bg-forest-600 text-white" : isCurrentMonth ? "text-gray-700" : "text-gray-300"
                  }`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5 flex-1">
                    {dayEntries.slice(0, 2).map((entry) => (
                      <div
                        key={entry.id}
                        onClick={(e) => { e.stopPropagation(); if (canEdit) openEdit(entry); }}
                      >
                        <ActivityChip entry={entry} rooms={rooms} />
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="text-[10px] text-gray-400 px-1">+{overflow} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modal ───────────────────────────────────────────────────────────── */}
      {showModal && (
        <AddFocusModal
          tenantId={tenantId}
          rooms={rooms}
          entry={editEntry}
          defaultDate={selectedDate}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
