"use client";

import { useState, useMemo } from "react";
import type { TimeEntry, FocusArea } from "@/lib/types";
import { TIME_FOCUS_AREAS } from "@/lib/types";

interface TenantOption {
  id: string;
  name: string;
}

interface StaffOption {
  id: string;
  name: string;
}

interface Props {
  initialEntries: TimeEntry[];
  tenants: TenantOption[];
  isAdmin: boolean;
  isManager?: boolean;
  currentUserId: string;
  currentUserName: string;
  staffMembers?: StaffOption[];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getWeekStart(refDate: Date): Date {
  const d = new Date(refDate);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime12(time24: string): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function computeDuration(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

function todayISO(): string {
  return toISODate(new Date());
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(entries: TimeEntry[]) {
  const header = ["Date", "Staff Name", "Project", "Focus Area", "Start Time", "End Time", "Duration (hrs)", "Travel Time (min)", "Travel Miles", "Notes"];
  const rows = entries.map(e => [
    e.date,
    e.staffName,
    e.projectName,
    e.focusArea,
    formatTime12(e.startTime),
    formatTime12(e.endTime),
    (e.durationMinutes / 60).toFixed(2),
    e.travelMinutes != null ? String(e.travelMinutes) : "",
    e.travelMiles != null ? String(e.travelMiles) : "",
    e.notes ?? "",
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `time-entries-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Entry Row ────────────────────────────────────────────────────────────────
function EntryRow({
  entry, canViewAll, currentUserId, onEdit,
}: {
  entry: TimeEntry;
  canViewAll: boolean;
  currentUserId: string;
  onEdit: (e: TimeEntry) => void;
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-gray-600 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">
            {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{entry.focusArea}</span>
          {canViewAll && <span className="text-xs text-gray-500">{entry.staffName}</span>}
        </div>
        <p className="text-sm font-medium text-white mt-0.5 truncate">{entry.projectName}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatTime12(entry.startTime)} – {formatTime12(entry.endTime)}
          {" "}<span className="text-forest-400 font-medium">({formatDuration(entry.durationMinutes)})</span>
          {entry.travelMinutes ? <span className="text-gray-500"> · {entry.travelMinutes}min travel</span> : null}
          {entry.travelMiles ? <span className="text-gray-500"> · {entry.travelMiles}mi</span> : null}
        </p>
        {entry.notes && <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.notes}</p>}
      </div>
      {(entry.clerkUserId === currentUserId || canViewAll) && (
        <button
          onClick={() => onEdit(entry)}
          className="text-xs text-gray-400 hover:text-white transition-colors shrink-0 px-2 py-1 rounded hover:bg-gray-700"
        >
          Edit
        </button>
      )}
    </div>
  );
}

// ─── Log Time Modal ───────────────────────────────────────────────────────────
interface ModalProps {
  entry?: TimeEntry;
  tenants: TenantOption[];
  onClose: () => void;
  onSaved: (entry: TimeEntry) => void;
  onDeleted?: (id: string) => void;
  staffMembers?: StaffOption[];
  currentUserId: string;
  currentUserName: string;
}

function LogTimeModal({ entry, tenants, onClose, onSaved, onDeleted, staffMembers, currentUserId, currentUserName }: ModalProps) {
  const [date, setDate] = useState(entry?.date ?? todayISO());
  const [tenantId, setTenantId] = useState(entry?.tenantId ?? (tenants[0]?.id ?? ""));
  const [focusArea, setFocusArea] = useState<FocusArea>(entry?.focusArea ?? "Sorting");
  const [startTime, setStartTime] = useState(entry?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(entry?.endTime ?? "17:00");
  const [travelMiles, setTravelMiles] = useState(entry?.travelMiles != null ? String(entry.travelMiles) : "");
  const [travelMinutes, setTravelMinutes] = useState(entry?.travelMinutes != null ? String(entry.travelMinutes) : "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [forUserId, setForUserId] = useState(currentUserId);
  const [forUserName, setForUserName] = useState(currentUserName);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const duration = useMemo(() => computeDuration(startTime, endTime), [startTime, endTime]);
  const selectedProject = tenants.find(t => t.id === tenantId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) { setError("Select a project"); return; }
    if (duration <= 0) { setError("End time must be after start time"); return; }
    setSaving(true);
    setError("");
    try {
      const body = {
        tenantId,
        projectName: selectedProject?.name ?? "",
        date,
        startTime,
        endTime,
        durationMinutes: duration,
        focusArea,
        travelMiles: travelMiles ? parseFloat(travelMiles) : undefined,
        travelMinutes: travelMinutes ? parseInt(travelMinutes) : undefined,
        notes: notes || undefined,
        ...(entry ? { id: entry.id } : {}),
        ...(!entry && forUserId !== currentUserId ? { staffUserId: forUserId, staffName: forUserName } : {}),
      };
      const res = await fetch("/api/time-entries", {
        method: entry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      const data = await res.json();
      onSaved(data.entry);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry || !onDeleted) return;
    if (!confirm("Delete this time entry?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/time-entries?id=${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      onDeleted(entry.id);
    } catch (err) {
      setError(String(err));
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">{entry ? "Edit Time Entry" : "Log Time"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!entry && staffMembers && staffMembers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Log for</label>
              <select value={forUserId} onChange={e => {
                const s = staffMembers.find(m => m.id === e.target.value);
                setForUserId(e.target.value);
                setForUserName(s?.name ?? currentUserName);
              }}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500">
                <option value={currentUserId}>{currentUserName} (me)</option>
                {staffMembers.filter(m => m.id !== currentUserId).map(m =>
                  <option key={m.id} value={m.id}>{m.name}</option>
                )}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Project</label>
            <select value={tenantId} onChange={e => setTenantId(e.target.value)} required
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500">
              {tenants.length === 0 && <option value="">No projects</option>}
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Focus Area</label>
            <select value={focusArea} onChange={e => setFocusArea(e.target.value as FocusArea)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500">
              {TIME_FOCUS_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500" />
            </div>
          </div>

          {duration > 0 && (
            <p className="text-xs text-forest-400 font-medium">Duration: {formatDuration(duration)}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Travel Time <span className="text-gray-600">(round trip, optional)</span>
              </label>
              <div className="relative">
                <input type="number" min="0" step="1" value={travelMinutes} onChange={e => setTravelMinutes(e.target.value)}
                  placeholder="0"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500 pr-12" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">min</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Travel Miles <span className="text-gray-600">(optional)</span>
              </label>
              <input type="number" min="0" step="0.1" value={travelMiles} onChange={e => setTravelMiles(e.target.value)}
                placeholder="0.0"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Notes <span className="text-gray-600">(optional)</span>
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-forest-500 resize-none" />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            {entry && onDeleted && (
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
            <div className="flex-1" />
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg text-sm bg-forest-600 text-white hover:bg-forest-500 transition-colors disabled:opacity-50">
              {saving ? "Saving…" : entry ? "Save Changes" : "Log Time"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TimeTrackerClient({ initialEntries, tenants, isAdmin, isManager = false, currentUserId, currentUserName, staffMembers }: Props) {
  const [entries, setEntries] = useState<TimeEntry[]>(initialEntries);
  const [staffFilter, setStaffFilter] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | undefined>(undefined);
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());

  // ── Derived permissions ───────────────────────────────────────────────────
  const canViewAll = isAdmin || isManager;

  // ── Current week bounds (fixed to today's week) ───────────────────────────
  const currentWeekStart = useMemo(() => getWeekStart(new Date()), []);
  const currentWeekEnd = useMemo(() => addDays(currentWeekStart, 6), [currentWeekStart]);
  const currentWeekStartISO = useMemo(() => toISODate(currentWeekStart), [currentWeekStart]);
  const currentWeekEndISO = useMemo(() => toISODate(currentWeekEnd), [currentWeekEnd]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);

  const weekLabel = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(currentWeekStart)} – ${fmt(currentWeekEnd)}`;
  }, [currentWeekStart, currentWeekEnd]);

  // ── Filtered entries ─────────────────────────────────────────────────────
  const visibleEntries = useMemo(() => {
    if (canViewAll && staffFilter) return entries.filter(e => e.clerkUserId === staffFilter);
    return entries;
  }, [entries, canViewAll, staffFilter]);

  // ── This week ────────────────────────────────────────────────────────────
  const thisWeekEntries = useMemo(() =>
    visibleEntries.filter(e => e.date >= currentWeekStartISO && e.date <= currentWeekEndISO),
    [visibleEntries, currentWeekStartISO, currentWeekEndISO]
  );

  const dayTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of thisWeekEntries) map.set(e.date, (map.get(e.date) ?? 0) + e.durationMinutes);
    return map;
  }, [thisWeekEntries]);

  const weekTotal = useMemo(() => thisWeekEntries.reduce((s, e) => s + e.durationMinutes, 0), [thisWeekEntries]);

  // ── Past weeks grouped ────────────────────────────────────────────────────
  const pastWeekGroups = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const e of visibleEntries) {
      if (!e.date || e.date >= currentWeekStartISO) continue;
      const d = new Date(e.date + "T12:00:00");
      if (isNaN(d.getTime())) continue; // skip invalid dates
      const ws = toISODate(getWeekStart(d));
      if (!map.has(ws)) map.set(ws, []);
      map.get(ws)!.push(e);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([ws, wEntries]) => {
        const start = new Date(ws + "T12:00:00");
        const end = addDays(start, 6);
        const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return {
          key: ws,
          label: `${fmt(start)} – ${fmt(end)}`,
          totalMins: wEntries.reduce((s, e) => s + e.durationMinutes, 0),
          entries: [...wEntries].sort((a, b) => b.date.localeCompare(a.date)),
        };
      });
  }, [visibleEntries, currentWeekStartISO]);

  // ── Staff list (admin or manager) ────────────────────────────────────────
  const staffList = useMemo(() => {
    if (!canViewAll) return [];
    const seen = new Map<string, string>();
    for (const e of entries) if (!seen.has(e.clerkUserId)) seen.set(e.clerkUserId, e.staffName);
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [entries, canViewAll]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openNew() { setEditEntry(undefined); setShowModal(true); }
  function openEdit(entry: TimeEntry) { setEditEntry(entry); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditEntry(undefined); }

  function handleSaved(saved: TimeEntry) {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    closeModal();
  }

  function handleDeleted(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
    closeModal();
  }

  function toggleWeek(key: string) {
    setOpenWeeks(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  }

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayStr = todayISO();

  return (
    <div>
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {canViewAll && staffList.length > 0 && (
          <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-forest-500">
            <option value="">All Staff</option>
            {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <div className="flex-1" />
        {canViewAll && (
          <button onClick={() => exportCSV(visibleEntries)}
            className="px-4 py-2 rounded-xl text-sm text-gray-300 hover:text-white bg-gray-800 border border-gray-700 hover:border-gray-600 transition-colors">
            Export CSV
          </button>
        )}
        <button onClick={openNew}
          className="px-4 py-2 rounded-xl text-sm bg-forest-600 text-white hover:bg-forest-500 transition-colors font-medium">
          + Log Time
        </button>
      </div>

      {/* This week label + day grid */}
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">
        This Week · {weekLabel}
      </p>
      <div className="grid grid-cols-8 gap-2 mb-6">
        {weekDays.map((day, i) => {
          const iso = toISODate(day);
          const mins = dayTotals.get(iso) ?? 0;
          const isToday = iso === todayStr;
          return (
            <div key={iso} className={`bg-gray-800 border rounded-xl p-3 text-center ${isToday ? "border-forest-500" : "border-gray-700"}`}>
              <p className="text-xs text-gray-400 mb-1">{DAY_LABELS[i]}</p>
              <p className="text-xs font-medium text-white">{day.toLocaleDateString("en-US", { day: "numeric" })}</p>
              <p className={`text-xs mt-1 font-semibold ${mins > 0 ? "text-forest-400" : "text-gray-600"}`}>
                {mins > 0 ? formatDuration(mins) : "—"}
              </p>
            </div>
          );
        })}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Total</p>
          <p className="text-xs font-medium text-white">&nbsp;</p>
          <p className={`text-xs mt-1 font-bold ${weekTotal > 0 ? "text-white" : "text-gray-600"}`}>
            {weekTotal > 0 ? formatDuration(weekTotal) : "—"}
          </p>
        </div>
      </div>

      {/* This week entries */}
      <div className="space-y-2">
        {thisWeekEntries.length === 0 ? (
          <div className="text-center py-10 text-gray-600">
            <p className="text-sm">No entries this week.</p>
            <button onClick={openNew} className="mt-2 text-sm text-forest-400 hover:text-forest-300 transition-colors">
              + Log time
            </button>
          </div>
        ) : (
          thisWeekEntries.map(entry => (
            <EntryRow key={entry.id} entry={entry} canViewAll={canViewAll} currentUserId={currentUserId} onEdit={openEdit} />
          ))
        )}
      </div>

      {/* Past weeks accordion */}
      {pastWeekGroups.length > 0 && (
        <div className="mt-6 border-t border-gray-800 pt-4 space-y-0.5">
          {pastWeekGroups.map(({ key, label, totalMins, entries: wEntries }) => {
            const isOpen = openWeeks.has(key);
            return (
              <div key={key}>
                <button
                  onClick={() => toggleWeek(key)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-800 transition-colors text-left group"
                >
                  <div className="flex items-center gap-2">
                    <svg className={`w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-all duration-150 ${isOpen ? "rotate-90" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm text-gray-500 group-hover:text-gray-300 transition-colors">{label}</span>
                  </div>
                  <span className="text-xs text-gray-600 font-medium group-hover:text-gray-400 transition-colors">
                    {formatDuration(totalMins)}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-2 mt-1 mb-2 pl-5">
                    {wEntries.map(entry => (
                      <EntryRow key={entry.id} entry={entry} canViewAll={canViewAll} currentUserId={currentUserId} onEdit={openEdit} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <LogTimeModal
          entry={editEntry}
          tenants={tenants}
          onClose={closeModal}
          onSaved={handleSaved}
          onDeleted={editEntry ? handleDeleted : undefined}
          staffMembers={staffMembers}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
        />
      )}
    </div>
  );
}
