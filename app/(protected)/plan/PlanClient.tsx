"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PLAN_ACTIVITIES } from "@/lib/types";
import type { PlanEntry, PlanActivity, PlanHelper, Room, ProjectFile, TimeEntry, Contract, WeeklySchedule, TimeOffEntry } from "@/lib/types";
import { FloorplansSection } from "./FloorplansSection";
import { HoursWorkedSection } from "./HoursWorkedSection";

// ─── Activity chip colors ──────────────────────────────────────────────────────
const ACTIVITY_COLOR_PALETTE = [
  "bg-teal-100 text-teal-800",
  "bg-forest-100 text-forest-800",
  "bg-indigo-100 text-indigo-800",
  "bg-purple-100 text-purple-800",
  "bg-orange-100 text-orange-800",
  "bg-amber-100 text-amber-800",
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-cyan-100 text-cyan-800",
  "bg-gray-100 text-gray-700",
];

// Fallback static map for old activity names
const LEGACY_ACTIVITY_COLORS: Record<string, string> = {
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

function getActivityColor(activity: string, serviceList: string[]): string {
  if (LEGACY_ACTIVITY_COLORS[activity]) return LEGACY_ACTIVITY_COLORS[activity];
  const idx = serviceList.indexOf(activity);
  if (idx >= 0) return ACTIVITY_COLOR_PALETTE[idx % ACTIVITY_COLOR_PALETTE.length];
  return "bg-gray-100 text-gray-700";
}

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
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── AddFocusModal ─────────────────────────────────────────────────────────────
interface TTTUser {
  name: string;
  email: string;
  role: string;
  weeklySchedule?: WeeklySchedule | null;
  timeOff?: TimeOffEntry[];
}

// Day-of-week key matching WeeklySchedule keys
const ISO_TO_DAY: Record<number, keyof WeeklySchedule> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

type AvailabilityConflict =
  | { kind: "time_off"; date: string }
  | { kind: "day_off"; day: string }
  | { kind: "outside_hours"; day: string; schedStart: string; schedEnd: string };

function checkAvailabilityConflict(
  user: TTTUser,
  date: string,
  startTime: string,
  endTime: string,
): AvailabilityConflict | null {
  // Time-off check
  if (user.timeOff && user.timeOff.length > 0) {
    const match = user.timeOff.find(t => t.date === date);
    if (match) {
      if (match.allDay) return { kind: "time_off", date };
      // Partial-day time off — only flag if shift overlaps
      if (startTime && endTime && match.startTime && match.endTime) {
        const shiftStart = startTime;
        const shiftEnd = endTime;
        const offStart = match.startTime;
        const offEnd = match.endTime;
        if (shiftStart < offEnd && shiftEnd > offStart) {
          return { kind: "time_off", date };
        }
      } else {
        return { kind: "time_off", date };
      }
    }
  }

  // Weekly schedule check
  if (user.weeklySchedule && date) {
    const [y, mo, d] = date.split("-").map(Number);
    const dayOfWeek = new Date(y, mo - 1, d).getDay();
    const dayKey = ISO_TO_DAY[dayOfWeek];
    const daySched = user.weeklySchedule[dayKey];
    if (!daySched.available) {
      return { kind: "day_off", day: dayKey };
    }
    if (startTime && endTime) {
      if (startTime < daySched.start || endTime > daySched.end) {
        return {
          kind: "outside_hours",
          day: dayKey,
          schedStart: daySched.start,
          schedEnd: daySched.end,
        };
      }
    }
  }

  return null;
}

function fmt12simple(t: string) {
  if (!t) return "";
  const [hStr, m] = t.split(":");
  const h = parseInt(hStr, 10);
  return `${h % 12 || 12}:${m}${h < 12 ? "am" : "pm"}`;
}

interface ModalProps {
  tenantId: string;
  rooms: Room[];
  entry?: PlanEntry;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
  services?: string[];
  canManageTTTHelpers: boolean;
  tenantOptions?: TenantOption[];
}

function AddFocusModal({ tenantId, rooms, entry, defaultDate, onClose, onSaved, services, canManageTTTHelpers, tenantOptions }: ModalProps) {
  const activityOptions = services && services.length > 0 ? services : PLAN_ACTIVITIES;
  const [date, setDate] = useState(entry?.date ?? defaultDate ?? toISO(new Date()));
  const [activity, setActivity] = useState<PlanActivity>(entry?.activity ?? (services?.[0] ?? "Coordinating"));
  // In all-projects mode (tenantId=""), track which project is selected
  const [selectedTenantId, setSelectedTenantId] = useState(entry?.tenantId ?? "");
  const [dynamicRooms, setDynamicRooms] = useState<Room[]>(rooms);
  const [roomId, setRoomId] = useState(entry?.roomId ?? "");
  const [customRoom, setCustomRoom] = useState(entry?.roomLabel ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [startTime, setStartTime] = useState(entry?.startTime ?? "");
  const [endTime, setEndTime] = useState(entry?.endTime ?? "");
  const [helpers, setHelpers] = useState<PlanHelper[]>(entry?.helpers ?? []);
  const [helperInput, setHelperInput] = useState("");
  const [googleEventId, setGoogleEventId] = useState(entry?.googleEventId ?? "");
  const [addressMode, setAddressMode] = useState<"origin" | "destination" | "custom">("origin");
  const [addressText, setAddressText] = useState("");
  const [calLoading, setCalLoading] = useState<"send" | "sync" | null>(null);
  const [calError, setCalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tttUsers, setTttUsers] = useState<TTTUser[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);

  // Effective tenant ID: use prop if set, otherwise fall back to selected
  const effectiveTenantId = tenantId || selectedTenantId;

  const isCustomRoom = roomId === "__custom__";
  const isEdit = !!entry;

  const handleRemoveHelper = (email: string) => {
    setHelpers(prev => prev.filter(h => h.email !== email));
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
      .then(d => { if (d.entry?.helpers?.length) setHelpers(d.entry.helpers); })
      .catch(() => {})
      .finally(() => setCalLoading(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load TTT team members for the staff picker
  useEffect(() => {
    fetch("/api/plan/ttt-users")
      .then(r => r.json())
      .then(d => { if (d.users) setTttUsers(d.users); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch rooms dynamically when in all-projects mode and a project is selected
  useEffect(() => {
    if (!effectiveTenantId || rooms.length > 0) return;
    fetch(`/api/rooms?tenantId=${effectiveTenantId}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.rooms)) setDynamicRooms(d.rooms); })
      .catch(() => {});
  }, [effectiveTenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute origin/destination address strings from the selected tenant
  const selectedTenant = tenantOptions?.find(t => t.id === effectiveTenantId);
  const originAddress = [selectedTenant?.address, selectedTenant?.city, selectedTenant?.state, selectedTenant?.zip].filter(Boolean).join(", ");
  const destAddress = [selectedTenant?.destAddress, selectedTenant?.destCity, selectedTenant?.destState, selectedTenant?.destZip].filter(Boolean).join(", ");

  // Initialize addressText on mount (or when tenant changes in all-projects mode)
  useEffect(() => {
    if (entry?.address) {
      // Editing an existing entry — show whatever was saved
      setAddressText(entry.address);
    } else {
      // New entry — pre-fill with origin address
      setAddressText(originAddress);
    }
  }, [effectiveTenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the user changes the address mode dropdown, update the text field
  const handleAddressModeChange = (mode: "origin" | "destination" | "custom") => {
    setAddressMode(mode);
    if (mode === "origin") setAddressText(originAddress);
    else if (mode === "destination") setAddressText(destAddress);
    else setAddressText("");
  };

  // Core invite-send logic — accepts an explicit helpers array to avoid stale state
  const sendCalendarInvites = async (helpersToSend: PlanHelper[]) => {
    if (!isEdit || !entry?.id) return;
    setCalLoading("send");
    setCalError("");
    try {
      const res = await fetch("/api/plan/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planEntryId: entry.id,
          action: "send",
          helpers: helpersToSend,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          notes: notes.trim() || undefined,
          address: addressText.trim() || undefined,
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

  const handleSendInvites = () => sendCalendarInvites(helpers);

  const handleSyncRSVPs = async () => {
    if (!entry?.id || !googleEventId) return;
    setCalLoading("sync");
    setCalError("");
    try {
      const res = await fetch("/api/plan/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planEntryId: entry.id, action: "sync" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Sync failed");
      if (d.entry?.helpers?.length) setHelpers(d.entry.helpers);
    } catch (e) {
      setCalError(e instanceof Error ? e.message : "Failed to sync RSVPs");
    } finally {
      setCalLoading(null);
    }
  };

  // Adding a helper by email in edit mode immediately fires the calendar invite
  const addHelper = async () => {
    const email = helperInput.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (helpers.find(h => h.email === email)) return;
    const updated: PlanHelper[] = [...helpers, { email, status: "pending" }];
    setHelpers(updated);
    setHelperInput("");
    // Don't auto-send here in edit mode — the save handler calls action:"update" which
    // PATCHes the Google Calendar event (with sendUpdates:"all") and Google sends invite
    // emails to newly added attendees at that point. Auto-sending immediately caused a
    // race condition: add helper → invite sent → remove helper before saving → save
    // PATCHes Google Calendar without that helper → Google sends them a cancellation.
  };

  // Adding a TTT team member via the staff picker
  const addTeamMember = async (user: TTTUser) => {
    if (helpers.find(h => h.email === user.email)) return;
    const updated: PlanHelper[] = [...helpers, { email: user.email, status: "pending" }];
    setHelpers(updated);
    setTeamSearch("");
    setShowTeamDropdown(false);
    // Same rationale as addHelper: don't auto-send on add, let save handle it.
  };

  // Derived lists for two-section display
  const tttEmailSet = new Set(tttUsers.map(u => u.email.toLowerCase()));
  const teamHelpers = helpers.filter(h => tttEmailSet.has(h.email.toLowerCase()));
  const emailHelpers = helpers.filter(h => !tttEmailSet.has(h.email.toLowerCase()));
  const filteredTTTUsers = tttUsers.filter(u =>
    !helpers.find(h => h.email.toLowerCase() === u.email.toLowerCase()) &&
    (u.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
     u.email.toLowerCase().includes(teamSearch.toLowerCase()))
  );

  const handleSave = async () => {
    if (!date) { setError("Date is required"); return; }
    if (!isEdit && !effectiveTenantId) { setError("Please select a project"); return; }
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...(isEdit ? { id: entry.id } : { tenantId: effectiveTenantId }),
        date,
        activity,
        roomId: isCustomRoom ? "" : roomId || "",
        roomLabel: isCustomRoom ? customRoom.trim() : "",
        notes: notes.trim(),
        address: addressText.trim() || undefined,
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
            address: addressText.trim() || undefined,
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
          {/* Project selector — only shown in all-projects mode (tenantId="") when creating */}
          {!isEdit && !tenantId && tenantOptions && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Project</label>
              <select
                value={selectedTenantId}
                onChange={e => { setSelectedTenantId(e.target.value); setDynamicRooms([]); setRoomId(""); }}
                className={inputCls}
              >
                <option value="">— Select project —</option>
                {tenantOptions.filter(t => !t.isArchived).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>

          {/* Activity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Activity</label>
            <select value={activity} onChange={e => setActivity(e.target.value as PlanActivity)} className={inputCls}>
              {activityOptions.map(a => <option key={a} value={a}>{a}</option>)}
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
              {dynamicRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
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

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Address <span className="text-xs text-gray-400 font-normal">(for calendar invites)</span>
            </label>
            <select
              value={addressMode}
              onChange={e => handleAddressModeChange(e.target.value as "origin" | "destination" | "custom")}
              className={`${inputCls} mb-2`}
            >
              <option value="origin">Project Origin</option>
              <option value="destination" disabled={!destAddress}>Project Destination{!destAddress ? " (none set)" : ""}</option>
              <option value="custom">Custom / Manual</option>
            </select>
            <input
              type="text"
              value={addressText}
              onChange={e => setAddressText(e.target.value)}
              placeholder={addressMode === "custom" ? "Enter address…" : "No address on file for this project"}
              className={inputCls}
            />
          </div>

          {/* ── Team Members (TTT staff picker) ─────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Team Members <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            {canManageTTTHelpers ? (
              <div className="relative">
                <input
                  type="text"
                  value={teamSearch}
                  onChange={e => { setTeamSearch(e.target.value); setShowTeamDropdown(true); }}
                  onFocus={() => setShowTeamDropdown(true)}
                  onBlur={() => setTimeout(() => setShowTeamDropdown(false), 150)}
                  placeholder="Search by name…"
                  className={inputCls}
                />
                {showTeamDropdown && teamSearch && filteredTTTUsers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                    {filteredTTTUsers.map(user => (
                      <button
                        key={user.email}
                        type="button"
                        onMouseDown={() => addTeamMember(user)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-forest-50 transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
                          <p className="text-xs text-gray-400 truncate">{user.email}</p>
                        </div>
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                          {user.role.replace("TTT", "")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {showTeamDropdown && teamSearch && filteredTTTUsers.length === 0 && tttUsers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-sm z-10 px-4 py-3">
                    <p className="text-sm text-gray-400">No team members found</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2.5 h-11 px-3 rounded-xl border border-gray-200 bg-gray-50">
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-sm text-gray-400">Only Top Tier Managers can invite team members</span>
              </div>
            )}
            {teamHelpers.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {teamHelpers.map(h => {
                  const member = tttUsers.find(u => u.email.toLowerCase() === h.email.toLowerCase());
                  const conflict = member ? checkAvailabilityConflict(member, date, startTime, endTime) : null;
                  return (
                    <div key={h.email} className="bg-indigo-50 border border-indigo-100 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2.5 px-3 py-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          h.status === "accepted" ? "bg-green-500" :
                          h.status === "declined" ? "bg-red-500" : "bg-yellow-400"
                        }`} title={h.status} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{member?.name ?? h.email}</p>
                          {member && <p className="text-[11px] text-indigo-500 truncate">{member.role}</p>}
                        </div>
                        {isEdit && canManageTTTHelpers && (
                          <select
                            value={h.status}
                            onChange={e => setHelpers(prev => prev.map(x =>
                              x.email === h.email ? { ...x, status: e.target.value as PlanHelper["status"] } : x
                            ))}
                            className="text-xs border border-indigo-200 rounded-lg px-1.5 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-forest-400"
                          >
                            <option value="pending">Pending</option>
                            <option value="accepted">Accepted</option>
                            <option value="declined">Declined</option>
                          </select>
                        )}
                        {canManageTTTHelpers && (
                          <button
                            type="button"
                            onClick={() => handleRemoveHelper(h.email)}
                            className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      {conflict && (
                        <div className="flex items-center gap-1.5 px-3 pb-2 pt-0">
                          <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          </svg>
                          <span className="text-[11px] text-amber-700 font-medium">
                            {conflict.kind === "time_off" && "Has time off on this date"}
                            {conflict.kind === "day_off" && `Not available on ${conflict.day}s`}
                            {conflict.kind === "outside_hours" && `Available ${conflict.day} ${fmt12simple(conflict.schedStart)}–${fmt12simple(conflict.schedEnd)}`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Invite Helpers (free-form email) ────────────────────────────── */}
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
                disabled={!!calLoading}
                className="h-10 px-4 rounded-xl border border-forest-300 text-forest-700 text-sm font-medium hover:bg-forest-50 transition-colors disabled:opacity-50"
              >
                {calLoading === "send" ? "Sending…" : "Add"}
              </button>
            </div>
            {emailHelpers.length > 0 && (
              <div className="space-y-1.5">
                {emailHelpers.map(h => (
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
                          onChange={e => setHelpers(prev => prev.map(x =>
                            x.email === h.email ? { ...x, status: e.target.value as PlanHelper["status"] } : x
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
                        onClick={() => handleRemoveHelper(h.email)}
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
                      ? <p className="text-xs text-green-600">{calLoading === "sync" ? "Syncing RSVPs…" : "Invites sent · tap Sync Status to refresh"}</p>
                      : <p className="text-xs text-gray-400">No invites sent yet</p>
                    }
                  </div>
                </div>
                <div className="flex gap-2">
                  {googleEventId && (
                    <button
                      type="button"
                      onClick={handleSyncRSVPs}
                      disabled={!!calLoading}
                      className="h-9 px-3 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50 font-medium"
                    >
                      {calLoading === "sync" ? "Syncing…" : "Sync Status"}
                    </button>
                  )}
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
          {isEdit && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} disabled={loading}
              className="h-11 px-4 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50">
              Delete
            </button>
          )}
          {isEdit && confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 font-medium whitespace-nowrap">
                {googleEventId ? "Cancel invites too?" : "Sure?"}
              </span>
              <button onClick={handleDelete} disabled={loading}
                className="h-9 px-3 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                Yes, delete
              </button>
              <button onClick={() => setConfirmDelete(false)} disabled={loading}
                className="h-9 px-3 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
                No
              </button>
            </div>
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
function ActivityChip({ entry, rooms, onClick, projectName, serviceList, tttUsers, syncFailed }: { entry: PlanEntry; rooms: Room[]; onClick?: () => void; projectName?: string; serviceList?: string[]; tttUsers?: TTTUser[]; syncFailed?: boolean }) {
  const room = entry.roomId ? rooms.find(r => r.id === entry.roomId) : null;
  const roomLabel = room?.name ?? entry.roomLabel ?? "";
  const colorClass = getActivityColor(entry.activity, serviceList ?? []);

  const timeLabel = entry.startTime
    ? entry.endTime
      ? `${formatTime(entry.startTime)} – ${formatTime(entry.endTime)}`
      : formatTime(entry.startTime)
    : "";

  const MAX_VISIBLE = 4;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1 rounded-lg text-xs font-medium leading-snug ${colorClass} ${onClick ? "hover:opacity-80 transition-opacity" : ""}`}
    >
      <div className="truncate">{entry.activity}</div>
      {projectName && <div className="truncate font-semibold text-[10px] opacity-80">{projectName}</div>}
      {roomLabel && <div className="truncate opacity-70 text-[10px]">{roomLabel}</div>}
      {timeLabel && <div className="truncate opacity-70 text-[10px]">{timeLabel}</div>}
      {entry.helpers && entry.helpers.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          {entry.helpers.slice(0, MAX_VISIBLE).map((h, i) => {
            const tttUser = tttUsers?.find(u => u.email.toLowerCase() === h.email.toLowerCase());
            const displayName = tttUser
              ? (tttUser.name.split(" ")[0] ?? tttUser.name)
              : h.email.split("@")[0];
            return (
              <span key={i} className="flex items-center gap-0.5" title={`${h.email}: ${h.status}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  h.status === "accepted" ? "bg-green-500" :
                  h.status === "declined" ? "bg-red-500" : "bg-yellow-400"
                }`} />
                <span className="text-[9px] opacity-80 max-w-[52px] truncate">{displayName}</span>
              </span>
            );
          })}
          {entry.helpers.length > MAX_VISIBLE && (
            <span className="text-[9px] opacity-60">+{entry.helpers.length - MAX_VISIBLE}</span>
          )}
          {syncFailed && (
            <span title="Calendar sync failed — open shift to retry" className="text-[9px] opacity-70">⚠</span>
          )}
        </div>
      )}
    </button>
  );
}

// ─── PlanClient ────────────────────────────────────────────────────────────────
interface TenantOption {
  id: string;
  name: string;
  isArchived?: boolean;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  destAddress?: string;
  destCity?: string;
  destState?: string;
  destZip?: string;
}

interface PlanClientProps {
  primaryContract?: Contract | null;
  isManager?: boolean;
  isStaff?: boolean;
  entries: PlanEntry[];
  rooms: Room[];
  tenantId: string;
  canEdit: boolean;
  projectFiles: ProjectFile[];
  timeEntries: TimeEntry[];
  isAdmin: boolean;
  estimatedHours?: number;
  estimatedServiceHours?: Array<{ serviceId: string; serviceName: string; hours: number }>;
  tenantOptions?: TenantOption[];  // manager/staff: all projects for name lookup
  currentTenantId?: string;        // which project is selected ("" = All)
  services?: string[];             // dynamic service names from Airtable
}

export function PlanClient({ entries, rooms, tenantId, canEdit, projectFiles, timeEntries, isAdmin, estimatedHours, estimatedServiceHours, tenantOptions, currentTenantId, services, primaryContract, isManager, isStaff }: PlanClientProps) {
  const router = useRouter();
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [showWeekends, setShowWeekends] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<PlanEntry | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // TTT users for resolving helper names on calendar chips
  const [tttUsers, setTttUsers] = useState<TTTUser[]>([]);
  useEffect(() => {
    fetch("/api/plan/ttt-users")
      .then(r => r.json())
      .then(d => { if (d.users) setTttUsers(d.users); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // In "All Projects" mode (currentTenantId is one of the sentinel values)
  const isAllProjectsMode = currentTenantId === "__all_active__" || currentTenantId === "__all_archived__" || currentTenantId === "__all_time__" || currentTenantId === "__my_projects__";
  const isMyProjectsMode = currentTenantId === "__my_projects__";
  // Allow editing in __all_active__ when canEdit=true (TTTManager/TTTAdmin); block in archived/all-time/my-projects
  const isReadOnlySentinel = currentTenantId === "__all_archived__" || currentTenantId === "__all_time__" || currentTenantId === "__my_projects__";
  const effectiveCanEdit = canEdit && !isReadOnlySentinel;

  // Tenant name lookup for "All" mode chips
  const tenantNameMap: Record<string, string> = {};
  if (tenantOptions) {
    for (const t of tenantOptions) tenantNameMap[t.id] = t.name;
  }

  // Project name map for FloorplansSection in "All" mode
  const projectNamesMap: Record<string, string> = tenantNameMap;

  // Live entries — start from server data, get patched with RSVP syncs
  const [liveEntries, setLiveEntries] = useState(entries);
  useEffect(() => { setLiveEntries(entries); }, [entries]);

  // Entries where background RSVP sync failed (shows ⚠ on calendar chip)
  const [failedSyncIds, setFailedSyncIds] = useState<Set<string>>(new Set());

  // Background-sync RSVPs for any entry with a googleEventId (staggered 400ms apart)
  // Uses a ref so the interval always sees the latest liveEntries without re-registering
  const liveEntriesRef = useRef(liveEntries);
  useEffect(() => { liveEntriesRef.current = liveEntries; }, [liveEntries]);

  const runRsvpSync = useCallback(() => {
    const toSync = liveEntriesRef.current.filter(e => e.googleEventId);
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
              setFailedSyncIds(prev => { const next = new Set(prev); next.delete(entry.id); return next; });
            } else if (d.error) {
              setFailedSyncIds(prev => new Set(prev).add(entry.id));
            }
          })
          .catch(() => {
            setFailedSyncIds(prev => new Set(prev).add(entry.id));
          });
      }, i * 400);
    });
  }, []);

  // Run once on mount, then every 3 minutes
  useEffect(() => {
    runRsvpSync();
    const interval = setInterval(runRsvpSync, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [runRsvpSync]);

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
  const navigateDay  = (dir: -1 | 1) => setCurrentDate(d => addDays(d, dir));

  const dayLabel = `${FULL_DAY_NAMES[currentDate.getDay()]}, ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;

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
      {/* ── Staff: All My Projects toggle ───────────────────────────────────── */}
      {isStaff && (
        <>
          <div className="flex items-center gap-3 mb-5 px-4 py-3 bg-white rounded-2xl border border-gray-200 shadow-sm">
            <button
              type="button"
              onClick={() => isMyProjectsMode ? setShowProjectPicker(true) : router.push("/plan")}
              aria-pressed={isMyProjectsMode}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 cursor-pointer ${
                isMyProjectsMode ? "bg-forest-500 hover:bg-forest-600" : "bg-gray-300 hover:bg-gray-400"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-150 ${
                isMyProjectsMode ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => isMyProjectsMode ? setShowProjectPicker(true) : router.push("/plan")}
            >
              <p className="text-sm font-semibold text-gray-800">All My Projects</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {isMyProjectsMode
                  ? "Your shifts across all projects — click to filter by project"
                  : "Viewing a single project — toggle to see all your shifts"}
              </p>
            </div>
          </div>

          {/* ── Project picker modal ──────────────────────────────────────── */}
          {showProjectPicker && tenantOptions && (
            <div
              className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4"
              onClick={() => setShowProjectPicker(false)}
            >
              <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-base font-bold text-gray-900">Select a view</h3>
                  <button
                    onClick={() => setShowProjectPicker(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="py-2 max-h-80 overflow-y-auto">
                  {/* All My Projects option */}
                  <button
                    type="button"
                    onClick={() => setShowProjectPicker(false)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left bg-forest-50 hover:bg-forest-100 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-forest-500 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-forest-700">All My Projects</p>
                      <p className="text-xs text-forest-600/70">Your shifts across all projects</p>
                    </div>
                    <svg className="w-4 h-4 text-forest-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>

                  {/* Divider */}
                  <div className="px-5 py-2">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Projects</p>
                  </div>

                  {/* Active projects */}
                  {tenantOptions.filter(t => !t.isArchived).map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setShowProjectPicker(false); router.push(`/plan?tenantId=${t.id}`); }}
                      className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="flex-1 text-sm font-medium text-gray-800 truncate">{t.name}</p>
                      <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}

                  {/* Archived projects */}
                  {tenantOptions.some(t => t.isArchived) && (
                    <>
                      <div className="px-5 py-2 mt-1">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Archived</p>
                      </div>
                      {tenantOptions.filter(t => t.isArchived).map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => { setShowProjectPicker(false); router.push(`/plan?tenantId=${t.id}`); }}
                          className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                          </div>
                          <p className="flex-1 text-sm font-medium text-gray-500 truncate">{t.name}</p>
                          <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => view === "week" ? navigateWeek(-1) : view === "month" ? navigateMonth(-1) : navigateDay(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-800 min-w-[180px] text-center">
            {view === "week" ? weekLabel : view === "month" ? monthLabel : dayLabel}
          </span>
          <button
            onClick={() => view === "week" ? navigateWeek(1) : view === "month" ? navigateMonth(1) : navigateDay(1)}
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
          {/* Weekend toggle — hidden in day view */}
          {view !== "day" && (
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
          )}

          {/* Day / Week / Month toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView("day")}
              className={`px-3 h-9 text-sm font-medium transition-colors ${
                view === "day" ? "bg-forest-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-3 h-9 text-sm font-medium transition-colors ${
                view === "week" ? "bg-forest-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView("month")}
              className={`px-3 h-9 text-sm font-medium transition-colors ${
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
                  {/* Header — click to jump to day view */}
                  <button
                    type="button"
                    onClick={() => { setCurrentDate(day); setView("day"); }}
                    className={`w-full px-2 py-3 text-center border-b border-gray-100 hover:bg-forest-50 transition-colors ${isToday ? "bg-forest-50" : ""}`}
                  >
                    <div className="text-xs text-gray-400 font-medium">{dayNames[idx]}</div>
                    <div className={`text-lg font-bold mt-0.5 ${isToday ? "text-forest-700" : "text-gray-800"}`}>
                      {day.getDate()}
                    </div>
                  </button>

                  {/* Entries */}
                  <div className="flex-1 p-1.5 space-y-1">
                    {dayEntries.map(entry => (
                      <ActivityChip
                        key={entry.id}
                        entry={entry}
                        rooms={rooms}
                        onClick={effectiveCanEdit ? () => openEdit(entry) : undefined}
                        projectName={isAllProjectsMode ? tenantNameMap[entry.tenantId] : undefined}
                        serviceList={services}
                        tttUsers={tttUsers}
                        syncFailed={failedSyncIds.has(entry.id)}
                      />
                    ))}
                  </div>

                  {/* Add button */}
                  {effectiveCanEdit && (
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

      {/* ── Day View ────────────────────────────────────────────────────────── */}
      {view === "day" && (() => {
        const iso = toISO(currentDate);
        const dayEntries = entriesByDate[iso] ?? [];
        const isToday = iso === todayISO;
        return (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className={`px-4 py-3 border-b border-gray-100 ${isToday ? "bg-forest-50" : ""}`}>
              <p className={`text-sm font-semibold ${isToday ? "text-forest-700" : "text-gray-800"}`}>{dayLabel}</p>
              {isToday && <p className="text-xs text-forest-500 mt-0.5">Today</p>}
            </div>
            <div className="p-3 space-y-2 min-h-[200px]">
              {dayEntries.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No events scheduled</p>
              )}
              {dayEntries.map(entry => (
                <ActivityChip
                  key={entry.id}
                  entry={entry}
                  rooms={rooms}
                  onClick={effectiveCanEdit ? () => openEdit(entry) : undefined}
                  projectName={isAllProjectsMode ? tenantNameMap[entry.tenantId] : undefined}
                  serviceList={services}
                  tttUsers={tttUsers}
                  syncFailed={failedSyncIds.has(entry.id)}
                />
              ))}
              {effectiveCanEdit && (
                <button
                  onClick={() => openAdd(iso)}
                  className="w-full py-2 rounded-lg text-sm text-gray-400 hover:text-forest-600 hover:bg-forest-50 transition-colors border border-dashed border-gray-200 hover:border-forest-300 mt-1"
                >
                  + Add event
                </button>
              )}
            </div>
          </div>
        );
      })()}

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
                  } ${effectiveCanEdit ? "cursor-pointer hover:bg-forest-50/30 transition-colors" : ""}`}
                  onClick={effectiveCanEdit ? () => openAdd(iso) : undefined}
                >
                  <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? "bg-forest-600 text-white" : isCurrentMonth ? "text-gray-700" : "text-gray-300"
                  }`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5 flex-1">
                    {dayEntries.slice(0, 2).map(entry => (
                      <div key={entry.id} onClick={e => { e.stopPropagation(); if (effectiveCanEdit) openEdit(entry); }}>
                        <ActivityChip
                          entry={entry}
                          rooms={rooms}
                          projectName={isAllProjectsMode ? tenantNameMap[entry.tenantId] : undefined}
                          serviceList={services}
                          tttUsers={tttUsers}
                          syncFailed={failedSyncIds.has(entry.id)}
                        />
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

      {/* ── Hours Worked ─────────────────────────────────────────────────────── */}
      <HoursWorkedSection
        key={`hours-${currentTenantId ?? tenantId}`}
        timeEntries={timeEntries}
        isAdmin={isAdmin}
        estimatedHours={estimatedHours}
        estimatedServiceHours={estimatedServiceHours}
        tenantId={tenantId}
        canEditEstimate={!isAllProjectsMode}
        planEntries={liveEntries}
        services={services}
        primaryContract={primaryContract}
        isManager={isManager}
      />

      {/* ── Floorplans & Images ──────────────────────────────────────────────── */}
      <div className="mt-10">
        <FloorplansSection
          key={`floorplans-${currentTenantId ?? tenantId}`}
          tenantId={tenantId}
          canEdit={effectiveCanEdit}
          initialFiles={projectFiles}
          projectNames={isAllProjectsMode ? projectNamesMap : undefined}
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
          services={services}
          canManageTTTHelpers={!!(isManager || isAdmin)}
          tenantOptions={tenantOptions}
        />
      )}
    </>
  );
}
