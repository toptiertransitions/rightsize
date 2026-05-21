"use client";

import { useState, useMemo } from "react";
import type { ReferralContact, ReferralCompany, StaffMember } from "@/lib/types";

interface Props {
  referralContacts: ReferralContact[];
  companies: ReferralCompany[];
  currentUserId: string;
  staffMembers: StaffMember[];
  onContactUpdated: (id: string, updates: Partial<ReferralContact>) => void;
}

interface Task {
  contactId: string;
  contactName: string;
  companyName: string;
  date: string;
  note: string;
  ownerClerkId: string;
}

type ViewMode = "week" | "day" | "month";
type SortCol = "date" | "contact" | "company";

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

function daysInMonth(dateStr: string): number {
  const [y, m] = dateStr.slice(0, 7).split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function fmtDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function fmtWeekRange(start: string): string {
  const end = addDays(start, 6);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

const ACTIVITY_TYPES = ["Call", "Meeting", "Email", "Text Message", "Note", "Task"] as const;
type ActivityType = typeof ACTIVITY_TYPES[number];

interface ConfirmState {
  tasks: Task[];
  activityType: ActivityType;
  activityDate: string;
  activityNote: string;
}

export default function TasksTab({ referralContacts, companies, currentUserId, staffMembers, onContactUpdated }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterSearch, setFilterSearch] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  // "all" or a clerkUserId — defaults to the logged-in user
  const [userFilter, setUserFilter] = useState<string>(currentUserId);

  const companyMap = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);

  // Sales staff who can own contacts (for the filter bar)
  const salesStaff = useMemo(
    () => staffMembers.filter(s => s.role === "TTTSales" || s.role === "TTTAdmin" || s.role === "TTTManager"),
    [staffMembers]
  );

  // All tasks across every contact with a next step (excluding already-completed this session)
  const allTasks = useMemo<Task[]>(() => {
    return referralContacts
      .filter(rc => rc.nextStepDate || rc.nextStepNote)
      .filter(rc => !completedIds.has(rc.id))
      .map(rc => ({
        contactId: rc.id,
        contactName: rc.name,
        companyName: companyMap.get(rc.referralCompanyId)?.name ?? "—",
        date: rc.nextStepDate ?? today,
        note: rc.nextStepNote ?? "",
        ownerClerkId: companyMap.get(rc.referralCompanyId)?.assignedToClerkId ?? "",
      }));
  }, [referralContacts, companyMap, completedIds, today]);

  // Apply owner filter
  const visibleTasks = useMemo(
    () => userFilter === "all" ? allTasks : allTasks.filter(t => t.ownerClerkId === userFilter),
    [allTasks, userFilter]
  );

  // Calendar period bounds
  const periodStart = useMemo(() => {
    if (viewMode === "week") return startOfWeek(anchor);
    if (viewMode === "day") return anchor;
    return startOfMonth(anchor);
  }, [viewMode, anchor]);

  const periodDays = useMemo(() => {
    if (viewMode === "day") return [anchor];
    if (viewMode === "week") return Array.from({ length: 7 }, (_, i) => addDays(periodStart, i));
    const n = daysInMonth(periodStart);
    return Array.from({ length: n }, (_, i) => addDays(periodStart, i));
  }, [viewMode, periodStart, anchor]);

  function navigate(dir: 1 | -1) {
    if (viewMode === "day") setAnchor(a => addDays(a, dir));
    else if (viewMode === "week") setAnchor(a => addDays(startOfWeek(a), dir * 7));
    else {
      const [y, m] = anchor.slice(0, 7).split("-").map(Number);
      const nd = new Date(y, m - 1 + dir, 1);
      setAnchor(nd.toISOString().slice(0, 10));
    }
  }

  function periodLabel() {
    if (viewMode === "day") return fmtDisplay(anchor);
    if (viewMode === "week") return fmtWeekRange(periodStart);
    return fmtMonthLabel(periodStart);
  }

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of visibleTasks) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return map;
  }, [visibleTasks]);

  // Sorted/filtered table rows
  const tableRows = useMemo(() => {
    let rows = visibleTasks.filter(t =>
      !filterSearch ||
      t.contactName.toLowerCase().includes(filterSearch.toLowerCase()) ||
      t.companyName.toLowerCase().includes(filterSearch.toLowerCase()) ||
      t.note.toLowerCase().includes(filterSearch.toLowerCase())
    );
    rows = [...rows].sort((a, b) => {
      let v = 0;
      if (sortCol === "date") v = a.date.localeCompare(b.date);
      else if (sortCol === "contact") v = a.contactName.localeCompare(b.contactName);
      else v = a.companyName.localeCompare(b.companyName);
      return sortDir === "asc" ? v : -v;
    });
    return rows;
  }, [visibleTasks, filterSearch, sortCol, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(tableRows.map(t => t.contactId))); }
  function clearAll() { setSelected(new Set()); }

  function openConfirm(tasks: Task[]) {
    if (!tasks.length) return;
    const firstTask = tasks[0];
    setConfirm({
      tasks,
      activityType: "Call",
      activityDate: firstTask.date <= today ? today : firstTask.date,
      activityNote: tasks.length === 1 ? firstTask.note : `Completed ${tasks.length} tasks`,
    });
    setSaveError("");
  }

  async function commitComplete() {
    if (!confirm) return;
    setSaving(true);
    setSaveError("");
    try {
      for (const task of confirm.tasks) {
        // 1. Log activity on referral contact
        const actRes = await fetch("/api/crm/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientContactId: task.contactId,
            type: confirm.activityType,
            activityDate: confirm.activityDate,
            note: confirm.activityNote || task.note || "Completed task",
          }),
        });
        if (!actRes.ok) {
          const err = await actRes.text().catch(() => actRes.statusText);
          throw new Error(`Failed to log activity: ${err}`);
        }

        // 2. Clear next step fields + update lastActivityDate on the referral contact
        const contactRes = await fetch("/api/crm/contacts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: task.contactId,
            nextStepDate: null,
            nextStepNote: "",
            lastActivityDate: confirm.activityDate,
          }),
        });
        if (!contactRes.ok) {
          const err = await contactRes.text().catch(() => contactRes.statusText);
          throw new Error(`Failed to update contact: ${err}`);
        }

        // 3. Optimistically update parent state — no page refresh needed
        onContactUpdated(task.contactId, {
          lastActivityDate: confirm.activityDate,
          nextStepDate: undefined,
          nextStepNote: undefined,
        });
      }

      setCompletedIds(prev => {
        const next = new Set(prev);
        confirm.tasks.forEach(t => next.add(t.contactId));
        return next;
      });
      setSelected(new Set());
      setConfirm(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const isOverdue = (date: string) => date < today;
  const isSoon = (date: string) => date >= today && date <= addDays(today, 7);

  function dayBg(date: string) {
    if (date === today) return "bg-green-50 border-green-200";
    return "bg-white border-gray-100";
  }

  function chipColor(date: string) {
    if (isOverdue(date)) return "bg-red-100 text-red-700";
    if (isSoon(date)) return "bg-amber-100 text-amber-700";
    return "bg-blue-100 text-blue-700";
  }

  const SortIcon = ({ col }: { col: SortCol }) => (
    <span className="ml-1 text-gray-400">
      {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  // Count tasks per owner for filter pills
  const taskCountByOwner = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of allTasks) {
      m.set(t.ownerClerkId, (m.get(t.ownerClerkId) ?? 0) + 1);
    }
    return m;
  }, [allTasks]);

  const currentUserName = salesStaff.find(s => s.clerkUserId === currentUserId)?.displayName ?? "Me";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Tasks</h2>
          <p className="text-sm text-gray-500 mt-0.5">Next steps across referral contacts</p>
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => openConfirm(visibleTasks.filter(t => selected.has(t.contactId)))}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Complete {selected.size} selected
          </button>
        )}
      </div>

      {/* Owner filter */}
      <div className="flex flex-wrap items-center gap-2">
        {/* My Tasks pill */}
        <button
          onClick={() => setUserFilter(currentUserId)}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            userFilter === currentUserId
              ? "bg-forest-600 text-white border-forest-600"
              : "border-gray-300 text-gray-600 hover:border-forest-400"
          }`}
        >
          My Tasks
          {taskCountByOwner.get(currentUserId) != null && (
            <span className={`ml-1.5 ${userFilter === currentUserId ? "opacity-75" : "text-gray-400"}`}>
              {taskCountByOwner.get(currentUserId)}
            </span>
          )}
        </button>

        {/* Other staff pills */}
        {salesStaff
          .filter(s => s.clerkUserId !== currentUserId)
          .filter(s => (taskCountByOwner.get(s.clerkUserId) ?? 0) > 0)
          .map(s => (
            <button
              key={s.clerkUserId}
              onClick={() => setUserFilter(s.clerkUserId)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                userFilter === s.clerkUserId
                  ? "bg-forest-600 text-white border-forest-600"
                  : "border-gray-300 text-gray-600 hover:border-forest-400"
              }`}
            >
              {s.displayName}
              <span className={`ml-1.5 ${userFilter === s.clerkUserId ? "opacity-75" : "text-gray-400"}`}>
                {taskCountByOwner.get(s.clerkUserId)}
              </span>
            </button>
          ))}

        {/* All Tasks pill */}
        <button
          onClick={() => setUserFilter("all")}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
            userFilter === "all"
              ? "bg-forest-600 text-white border-forest-600"
              : "border-gray-300 text-gray-600 hover:border-forest-400"
          }`}
        >
          All Tasks
          <span className={`ml-1.5 ${userFilter === "all" ? "opacity-75" : "text-gray-400"}`}>
            {allTasks.length}
          </span>
        </button>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Calendar controls */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-[200px] text-center">{periodLabel()}</span>
            <button onClick={() => navigate(1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </button>
            <button onClick={() => setAnchor(today)} className="ml-2 text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-600">Today</button>
          </div>
          <div className="flex gap-1">
            {(["day", "week", "month"] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${viewMode === m ? "bg-forest-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Week view */}
        {viewMode === "week" && (
          <div className="grid grid-cols-7 divide-x divide-gray-100">
            {periodDays.map(day => {
              const tasks = tasksByDay.get(day) ?? [];
              const isToday = day === today;
              return (
                <div key={day} className={`min-h-[100px] p-2 ${dayBg(day)} border-b border-gray-100`}>
                  <p className={`text-xs font-semibold mb-1.5 ${isToday ? "text-green-700" : "text-gray-500"}`}>
                    {new Date(day + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                  </p>
                  <div className="space-y-1">
                    {tasks.map(t => (
                      <button key={t.contactId} onClick={() => openConfirm([t])}
                        className={`w-full text-left text-xs px-1.5 py-1 rounded ${chipColor(t.date)} hover:opacity-80 transition-opacity`}>
                        <span className="font-medium block truncate">{t.contactName}</span>
                        {t.note && <span className="block truncate opacity-75">{t.note}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Day view */}
        {viewMode === "day" && (
          <div className="p-4">
            {(tasksByDay.get(anchor) ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No tasks for this day</p>
            ) : (
              <div className="space-y-2">
                {(tasksByDay.get(anchor) ?? []).map(t => (
                  <div key={t.contactId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{t.contactName}</p>
                      <p className="text-xs text-gray-500">{t.companyName}</p>
                      {t.note && <p className="text-xs text-gray-600 mt-1">{t.note}</p>}
                    </div>
                    <button onClick={() => openConfirm([t])}
                      className="ml-4 flex-shrink-0 text-xs px-3 py-1.5 bg-green-700 text-white rounded-lg hover:bg-green-800 font-medium">
                      Complete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Month view */}
        {viewMode === "month" && (
          <div>
            <div className="grid grid-cols-7 border-b border-gray-100">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500">{d}</div>
              ))}
            </div>
            {(() => {
              const firstDay = new Date(periodStart + "T00:00:00").getDay();
              const cells: (string | null)[] = [...Array(firstDay).fill(null), ...periodDays];
              while (cells.length % 7 !== 0) cells.push(null);
              const weeks: (string | null)[][] = [];
              for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
              return weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 divide-x divide-gray-100 border-b border-gray-100">
                  {week.map((day, di) => {
                    if (!day) return <div key={di} className="min-h-[80px] bg-gray-50" />;
                    const tasks = tasksByDay.get(day) ?? [];
                    const isToday = day === today;
                    return (
                      <div key={day} className={`min-h-[80px] p-1.5 ${isToday ? "bg-green-50" : "bg-white"}`}>
                        <p className={`text-xs font-semibold mb-1 ${isToday ? "text-green-700" : "text-gray-600"}`}>
                          {new Date(day + "T00:00:00").getDate()}
                        </p>
                        <div className="space-y-0.5">
                          {tasks.slice(0, 2).map(t => (
                            <button key={t.contactId} onClick={() => openConfirm([t])}
                              className={`w-full text-left text-xs px-1 py-0.5 rounded truncate ${chipColor(t.date)} hover:opacity-80`}>
                              {t.contactName}
                            </button>
                          ))}
                          {tasks.length > 2 && (
                            <p className="text-xs text-gray-400 pl-1">+{tasks.length - 2} more</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search tasks…"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-forest-500"
            />
            {tableRows.length > 0 && (
              selected.size === tableRows.length
                ? <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-700">Deselect all</button>
                : <button onClick={selectAll} className="text-xs text-gray-500 hover:text-gray-700">Select all</button>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {tableRows.length} task{tableRows.length !== 1 ? "s" : ""}
            {userFilter !== "all" && userFilter === currentUserId ? " · My Tasks" : userFilter !== "all" ? ` · ${salesStaff.find(s => s.clerkUserId === userFilter)?.displayName ?? ""}` : ""}
          </p>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox"
                  checked={selected.size === tableRows.length && tableRows.length > 0}
                  onChange={e => e.target.checked ? selectAll() : clearAll()}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => toggleSort("date")}>
                Date <SortIcon col="date" />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => toggleSort("contact")}>
                Contact <SortIcon col="contact" />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => toggleSort("company")}>
                Company <SortIcon col="company" />
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Next Step Note</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400">
                  {visibleTasks.length === 0
                    ? userFilter === currentUserId
                      ? "No open tasks for you — all your next steps are clear!"
                      : "No open tasks for this filter"
                    : "No tasks match your search"}
                </td>
              </tr>
            )}
            {tableRows.map(task => {
              const isSelected = selected.has(task.contactId);
              return (
                <tr key={task.contactId}
                  className={`border-b border-gray-100 transition-colors ${isSelected ? "bg-green-50" : "hover:bg-gray-50"}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(task.contactId)} className="rounded border-gray-300" />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${chipColor(task.date)}`}>
                      {isOverdue(task.date) ? "Overdue · " : ""}{fmtDisplay(task.date)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{task.contactName}</td>
                  <td className="px-4 py-3 text-gray-600">{task.companyName}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{task.note || <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openConfirm([task])}
                      className="text-xs px-3 py-1.5 bg-green-700 text-white rounded-lg hover:bg-green-800 font-medium transition-colors"
                    >
                      Complete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Log Activity modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Log Completed Task</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {confirm.tasks.length === 1
                  ? `${confirm.tasks[0].contactName} · ${confirm.tasks[0].companyName}`
                  : `${confirm.tasks.length} contacts`}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Activity type */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Activity Type</label>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_TYPES.map(t => (
                    <button key={t} type="button"
                      onClick={() => setConfirm(c => c ? { ...c, activityType: t } : c)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                        confirm.activityType === t
                          ? "bg-forest-600 text-white border-forest-600"
                          : "border-gray-300 text-gray-600 hover:border-forest-400"
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Activity Date</label>
                <input type="date" value={confirm.activityDate}
                  onChange={e => setConfirm(c => c ? { ...c, activityDate: e.target.value } : c)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Note</label>
                <textarea
                  rows={3}
                  value={confirm.activityNote}
                  onChange={e => setConfirm(c => c ? { ...c, activityNote: e.target.value } : c)}
                  placeholder="What happened?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none"
                />
              </div>

              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setConfirm(null)} disabled={saving}
                className="text-sm px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={commitComplete} disabled={saving}
                className="text-sm px-5 py-2 bg-green-700 text-white rounded-lg font-semibold hover:bg-green-800 disabled:opacity-50 flex items-center gap-2">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {saving ? "Saving…" : "Log Activity"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
