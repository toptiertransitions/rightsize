"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PLAN_ACTIVITIES } from "@/lib/types";
import type { PlanEntry, PlanActivity, PlanHelper, Room, ProjectFile } from "@/lib/types";
import { FloorplansSection } from "./FloorplansSection";

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
  const day = d.getDay();
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

// Format "HH:MM" → "h:mm AM/PM"
function formatTime(t?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

const ALL_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WORKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

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
  const [startTime, setStartTime] = useState(entry?.startTime ?? "");
  const [endTime, setEndTime] = useState(entry?.endTime ?? "");
  const [helpers, setHelpers] = useState<PlanHelper[]>(entry?.helpers ?? []);
  const [helperInput, setHelperInput] = useState("");
  const [googleEventId, setGoogleEventId] = useState(entry?.googleEventId ?? "");
  const [calLoading, setCalLoading] = useState<"send" | "sync" | null>(null);
  const [calError, setCalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isCustomRoom = roomId === "__custom__";
  const isEdit = !!entry;

  const addHelper = () => {
    const email = helperInput.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (helpers.find(h => h.email === email)) return;
    setHelpers(prev => [...prev, { email, status: "pending" }]);
    setHelperInput("");
  };

  const handleRemoveHelper = (index: number) => {
    setHelpers(prev => prev.filter((_, xi) => xi !== index));
  };

  // Auto-sync RSVPs when the modal opens for an entry that has invites sent
  useEffect(() => {
    if (!isEdit || !entry?.googleEventId) return;
    setCalLoading("sync");
    fetch("/api/plan/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planEntryId: entry.id, action: "sync" }),
    })
      .then(r => r.json())
      .then(d => { if (d.entry?.helpers) setHelpers(d.entry.helpers); })
      .catch(() => {})
      .finally(() => setCalLoading(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendInvites = async () => {
    if (!isEdit) return;
    setCalLoading("send");
    setCalError("");
    try {
      const res = await fetch("/api/plan/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // pass current helpers so they're saved + used even if not yet saved
        body: JSON.stringify({
          planEntryId: entry!.id,
          action: "send",
          helpers,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to send invites");
      setGoogleEventId(d.entry?.googleEventId || "");
    } catch (e) {
      setCalError(e instanceof Error ? e.message : "Failed to send invites");
    } finally {
      setCalLoading(null);
    }
  };

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
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        helpers,
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

      const savedData = await res.json().catch(() => ({}));

      if (isEdit && googleEventId) {
        // Auto-update existing calendar event (covers time/date/notes/helper changes)
        await fetch("/api/plan/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planEntryId: entry!.id, action: "update" }),
        }).catch(() => {});
      } else if (!isEdit && helpers.length && savedData.entry?.id) {
        // Auto-send invites when creating a new entry with helpers
        await fetch("/api/plan/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planEntryId: savedData.entry.id,
            action: "send",
            helpers,
            startTime: startTime || undefined,
            endTime: endTime || undefined,
            notes: notes.trim() || undefined,
          }),
        }).catch(() => {});
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
      // Cancel Google Calendar event first so attendees receive cancellation emails
      if (googleEventId) {
        await fetch("/api/plan/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planEntryId: entry.id, action: "cancel" }),
        }).catch(() => {}); // don't block delete if cancellation fails
      }
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

  const inputCls = "w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-cream-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? "Edit Focus" : "Add Daily Focus"}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>

          {/* Activity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Activity</label>
            <select value={activity} onChange={e => setActivity(e.target.value as PlanActivity)} className={inputCls}>
              {PLAN_ACTIVITIES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Time range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Time <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">Start</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full h-11 pl-12 pr-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">End</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-full h-11 pl-10 pr-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
                />
              </div>
            </div>
          </div>

          {/* Room */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Room <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
            <select value={roomId} onChange={e => setRoomId(e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              <option disabled>─────────────────</option>
              <option value="__custom__">Custom (not in project)</option>
            </select>
          </div>

          {isCustomRoom && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Custom room name</label>
              <input type="text" value={customRoom} onChange={e => setCustomRoom(e.target.value)}
                placeholder="e.g. Detached garage" className={inputCls} />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Any additional context..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none" />
          </div>

          {/* Helper invites */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Invite Helpers <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={helperInput}
                onChange={e => setHelperInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addHelper(); } }}
                placeholder="email@example.com"
                className="flex-1 h-10 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
              />
              <button
                type="button"
                onClick={addHelper}
                className="h-10 px-4 rounded-xl border border-forest-300 text-forest-700 text-sm font-medium hover:bg-forest-50 transition-colors"
              >
                Add
              </button>
            </div>
            {helpers.length > 0 && (
              <div className="space-y-1.5">
                {helpers.map((h, i) => (
                  <div key={h.email} className="bg-gray-50 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2.5 px-3 py-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        h.status === "accepted" ? "bg-green-500" :
                        h.status === "declined" ? "bg-red-500" : "bg-yellow-400"
                      }`} title={h.status} />
                      <span className="text-sm text-gray-700 flex-1 truncate">{h.email}</span>
                      {isEdit && (
                        <select
                          value={h.status}
                          onChange={e => setHelpers(prev => prev.map((x, xi) =>
                            xi === i ? { ...x, status: e.target.value as PlanHelper["status"] } : x
                          ))}
                          className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-forest-400"
                        >
                          <option value="pending">Pending</option>
                          <option value="accepted">Accepted</option>
                          <option value="declined">Declined</option>
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveHelper(i)}
                        className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {h.comment && (
                      <div className="px-3 pb-2 ml-5">
                        <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
                          &ldquo;{h.comment}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Google Calendar Invites (edit mode + helpers present) */}
          {isEdit && helpers.length > 0 && (
            <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h14c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/>
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Google Calendar</p>
                    {googleEventId
                      ? <p className="text-xs text-green-600">{calLoading === "sync" ? "Syncing RSVPs…" : "Invites sent"}</p>
                      : <p className="text-xs text-gray-400">No invites sent yet</p>
                    }
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSendInvites}
                    disabled={!!calLoading}
                    className="h-9 px-3 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
                  >
                    {calLoading === "send" ? "Sending…" : googleEventId ? "Update Invites" : "Send Invites"}
                  </button>
                </div>
              </div>
              {calError && <p className="text-xs text-red-600 mt-2">{calError}</p>}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-3 border-t border-cream-100 flex-shrink-0">
          {isEdit && (
            <button onClick={handleDelete} disabled={loading}
              className="h-11 px-4 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50">
              Delete
            </button>
          )}
          <button onClick={onClose} disabled={loading}
            className="flex-1 h-11 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 h-11 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50">
            {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Focus"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ActivityChip ──────────────────────────────────────────────────────────────
function ActivityChip({ entry, rooms, onClick }: { entry: PlanEntry; rooms: Room[]; onClick?: () => void }) {
  const room = entry.roomId ? rooms.find(r => r.id === entry.roomId) : null;
  const roomLabel = room?.name ?? entry.roomLabel ?? "";
  const colorClass = ACTIVITY_COLORS[entry.activity] ?? "bg-gray-100 text-gray-700";

  const timeLabel = entry.startTime
    ? entry.endTime
      ? `${formatTime(entry.startTime)} – ${formatTime(entry.endTime)}`
      : formatTime(entry.startTime)
    : "";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1 rounded-lg text-xs font-medium leading-snug ${colorClass} ${onClick ? "hover:opacity-80 transition-opacity" : ""}`}
    >
      <div className="truncate">{entry.activity}</div>
      {roomLabel && <div className="truncate opacity-70 text-[10px]">{roomLabel}</div>}
      {timeLabel && <div className="truncate opacity-70 text-[10px]">{timeLabel}</div>}
      {entry.helpers && entry.helpers.length > 0 && (
        <div className="flex items-center gap-0.5 mt-0.5">
          {entry.helpers.slice(0, 6).map((h, i) => (
            <span
              key={i}
              title={`${h.email}: ${h.status}`}
              className={`w-1.5 h-1.5 rounded-full ${
                h.status === "accepted" ? "bg-green-500" :
                h.status === "declined" ? "bg-red-500" : "bg-yellow-400"
              }`}
            />
          ))}
          {entry.helpers.length > 6 && (
            <span className="text-[9px] opacity-60 ml-0.5">+{entry.helpers.length - 6}</span>
          )}
        </div>
      )}
    </button>
  );
}

// ─── PlanClient ────────────────────────────────────────────────────────────────
interface PlanClientProps {
  entries: PlanEntry[];
  rooms: Room[];
  tenantId: string;
  canEdit: boolean;
  projectFiles: ProjectFile[];
}

export function PlanClient({ entries, rooms, tenantId, canEdit, projectFiles }: PlanClientProps) {
  const router = useRouter();
  const [view, setView] = useState<"week" | "month">("week");
  const [showWeekends, setShowWeekends] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<PlanEntry | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);

  // Live entries — start from server data, get patched with RSVP syncs
  const [liveEntries, setLiveEntries] = useState(entries);
  useEffect(() => { setLiveEntries(entries); }, [entries]);

  // Background-sync RSVPs for any entry with a googleEventId (staggered 400ms apart)
  useEffect(() => {
    const toSync = entries.filter(e => e.googleEventId);
    if (!toSync.length) return;
    toSync.forEach((entry, i) => {
      setTimeout(() => {
        fetch("/api/plan/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planEntryId: entry.id, action: "sync" }),
        })
          .then(r => r.json())
          .then(d => {
            if (d.entry) {
              setLiveEntries(prev => prev.map(e => e.id === d.entry.id ? d.entry : e));
            }
          })
          .catch(() => {}); // silent — never block the UI
      }, i * 400);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const entriesByDate = liveEntries.reduce<Record<string, PlanEntry[]>>((acc, e) => {
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
  const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekDays = showWeekends ? allWeekDays : allWeekDays.slice(0, 5);
  const dayNames = showWeekends ? ALL_DAY_NAMES : WORKDAY_NAMES;
  const colCount = showWeekends ? 7 : 5;

  const weekLabel = (() => {
    const s = weekDays[0];
    const e = weekDays[weekDays.length - 1];
    if (s.getMonth() === e.getMonth()) {
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  })();

  const navigateWeek = (dir: -1 | 1) => setCurrentDate(d => addDays(d, dir * 7));

  // ── Month view ───────────────────────────────────────────────────────────────
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthLabel = `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  // Build Mon-first 7-column calendar grid
  const allCalendarDays: (Date | null)[] = [];
  const firstDayOfWeek = monthStart.getDay();
  const paddingStart = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  for (let i = 0; i < paddingStart; i++) allCalendarDays.push(null);
  for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) allCalendarDays.push(new Date(d));
  while (allCalendarDays.length % 7 !== 0) allCalendarDays.push(null);

  // When hiding weekends: strip Sat (index%7===5) and Sun (index%7===6)
  const calendarDays = showWeekends
    ? allCalendarDays
    : allCalendarDays.filter((_, i) => i % 7 < 5);

  const navigateMonth = (dir: -1 | 1) =>
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + dir, 1));

  const todayISO = toISO(new Date());

  const colClass = colCount === 5 ? "grid-cols-5" : "grid-cols-7";

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
          <span className="text-sm font-semibold text-gray-800 min-w-[180px] text-center">
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

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Weekend toggle */}
          <button
            onClick={() => setShowWeekends(w => !w)}
            className={`px-3 h-9 text-sm font-medium rounded-lg border transition-colors ${
              showWeekends
                ? "border-gray-200 text-gray-500 hover:bg-gray-50"
                : "border-forest-400 bg-forest-50 text-forest-700"
            }`}
            title={showWeekends ? "Hide weekends (5-day view)" : "Show weekends (7-day view)"}
          >
            {showWeekends ? "5-Day" : "7-Day"}
          </button>

          {/* Week / Month toggle */}
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
      </div>

      {/* ── Weekly View ─────────────────────────────────────────────────────── */}
      {view === "week" && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className={`grid ${colClass} divide-x divide-gray-100`}>
            {weekDays.map((day, idx) => {
              const iso = toISO(day);
              const dayEntries = entriesByDate[iso] ?? [];
              const isToday = iso === todayISO;

              return (
                <div key={iso} className="flex flex-col min-h-[200px]">
                  {/* Header */}
                  <div className={`px-2 py-3 text-center border-b border-gray-100 ${isToday ? "bg-forest-50" : ""}`}>
                    <div className="text-xs text-gray-400 font-medium">{dayNames[idx]}</div>
                    <div className={`text-lg font-bold mt-0.5 ${isToday ? "text-forest-700" : "text-gray-800"}`}>
                      {day.getDate()}
                    </div>
                  </div>

                  {/* Entries */}
                  <div className="flex-1 p-1.5 space-y-1">
                    {dayEntries.map(entry => (
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
          <div className={`grid ${colClass} divide-x divide-gray-100 border-b border-gray-100`}>
            {(showWeekends ? ALL_DAY_NAMES : WORKDAY_NAMES).map(d => (
              <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className={`grid ${colClass} divide-x divide-gray-100`}>
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
                    {dayEntries.slice(0, 2).map(entry => (
                      <div key={entry.id} onClick={e => { e.stopPropagation(); if (canEdit) openEdit(entry); }}>
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

      {/* ── Floorplans & Images ──────────────────────────────────────────────── */}
      <div className="mt-10">
        <FloorplansSection
          tenantId={tenantId}
          canEdit={canEdit}
          initialFiles={projectFiles}
        />
      </div>

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
