"use client";

import { useState } from "react";
import type { TimeEntry, PlanEntry, Contract } from "@/lib/types";
import { TIME_FOCUS_AREAS } from "@/lib/types";

// ─── Contract hours helpers ───────────────────────────────────────────────────
interface ServiceHours { serviceName: string; hours: number }

function getContractServiceHours(contract: Contract): ServiceHours[] {
  if (contract.lineItems && contract.lineItems.length > 0) {
    return contract.lineItems.map((li) => ({ serviceName: li.serviceName, hours: li.hours }));
  }
  const legacy: ServiceHours[] = [];
  if (contract.rightsizingHours > 0) legacy.push({ serviceName: "Rightsizing", hours: contract.rightsizingHours });
  if (contract.packingHours > 0)     legacy.push({ serviceName: "Packing",      hours: contract.packingHours });
  if (contract.unpackingHours > 0)   legacy.push({ serviceName: "Unpacking",    hours: contract.unpackingHours });
  return legacy;
}

function getContractTotalHours(contract: Contract): number {
  return getContractServiceHours(contract).reduce((s, li) => s + li.hours, 0);
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

const FOCUS_COLOR_PALETTE = [
  "#14b8a6", // teal  - Coordinating
  "#16a34a", // green - Rightsizing
  "#6366f1", // indigo - Packing to Move
  "#a855f7", // purple - Packing for Donation/Dispersal
  "#f97316", // orange - Managing Moving Day
  "#f59e0b", // amber - Unpacking
  "#3b82f6", // blue  - Setting Up Your Space
  "#10b981", // emerald - Donating/Dispersal
  "#06b6d4", // cyan  - Cleaning
  "#78716c", // stone - Other Service
];

const LEGACY_FOCUS_COLORS: Record<string, string> = {
  Sorting:      "#3b82f6",
  Packing:      "#6366f1",
  Staging:      "#a855f7",
  Coordination: "#14b8a6",
  Admin:        "#6b7280",
  Travel:       "#f97316",
  Other:        "#78716c",
};

function getFocusColor(area: string, serviceList: string[]): string {
  if (LEGACY_FOCUS_COLORS[area]) return LEGACY_FOCUS_COLORS[area];
  const idx = serviceList.indexOf(area);
  if (idx >= 0) return FOCUS_COLOR_PALETTE[idx % FOCUS_COLOR_PALETTE.length];
  return "#78716c";
}

function fmtMins(mins: number): string {
  const h = Math.round((mins / 60) * 10) / 10;
  return `${h}h`;
}

function fmtHours(h: number): string {
  return `${Math.round(h * 10) / 10}h`;
}

function fmtDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function fmt12(t?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
}

// ─── Edit modal ───────────────────────────────────────────────────────────────
interface EditModalProps {
  entry: TimeEntry;
  onClose: () => void;
  onSaved: (entry: TimeEntry) => void;
}

function EditEntryModal({ entry, onClose, onSaved }: EditModalProps) {
  const [date, setDate] = useState(entry.date);
  const [focusArea, setFocusArea] = useState(entry.focusArea);
  const [startTime, setStartTime] = useState(entry.startTime);
  const [endTime, setEndTime] = useState(entry.endTime);
  const [travelMiles, setTravelMiles] = useState(entry.travelMiles != null ? String(entry.travelMiles) : "");
  const [travelMinutes, setTravelMinutes] = useState(entry.travelMinutes != null ? String(entry.travelMinutes) : "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function calcDuration(s: string, e: string): number {
    if (!s || !e) return 0;
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }

  const duration = calcDuration(startTime, endTime);

  async function handleSave() {
    if (!date || !startTime || !endTime) { setError("Date, start and end time are required."); return; }
    if (duration <= 0) { setError("End time must be after start time."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/time-entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          date,
          focusArea,
          startTime,
          endTime,
          durationMinutes: duration,
          travelMiles: travelMiles !== "" ? parseFloat(travelMiles) : undefined,
          travelMinutes: travelMinutes !== "" ? parseInt(travelMinutes, 10) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Save failed"); return; }
      const { entry: updated } = await res.json();
      onSaved(updated);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Edit Time Entry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Focus Area</label>
            <select value={focusArea} onChange={e => setFocusArea(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              {TIME_FOCUS_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {duration > 0 && (
            <p className="text-xs text-gray-500">Duration: {fmtMins(duration)}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Travel Time (min)</label>
              <input type="number" min="0" value={travelMinutes} onChange={e => setTravelMinutes(e.target.value)}
                placeholder="Optional" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Travel Miles</label>
              <input type="number" min="0" step="0.1" value={travelMiles} onChange={e => setTravelMiles(e.target.value)}
                placeholder="Optional" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HoursWorkedSection ───────────────────────────────────────────────────────
interface Props {
  timeEntries: TimeEntry[];
  isAdmin: boolean;
  isManager?: boolean;
  estimatedHours?: number;
  tenantId: string;
  canEditEstimate?: boolean; // defaults to isAdmin; pass false in "All Projects" modes
  planEntries?: PlanEntry[];
  services?: string[];
  primaryContract?: Contract | null;
}

export function HoursWorkedSection({ timeEntries, isAdmin, isManager, estimatedHours: initialEstimatedHours, tenantId, canEditEstimate, planEntries, services, primaryContract }: Props) {
  const serviceList = services && services.length > 0 ? services : TIME_FOCUS_AREAS;

  // Derive estimated hours from signed primary contract if available
  const contractServiceHours = primaryContract ? getContractServiceHours(primaryContract) : [];
  const contractTotalHours = primaryContract ? getContractTotalHours(primaryContract) : 0;
  const isLockedByContract = contractTotalHours > 0;

  const showEstimateEdit = !isLockedByContract && (canEditEstimate ?? isAdmin);

  const [entries, setEntries] = useState(timeEntries);
  const [showLog, setShowLog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [estimatedHours, setEstimatedHours] = useState(
    isLockedByContract ? contractTotalHours : (initialEstimatedHours ?? 0)
  );
  const [editingEst, setEditingEst] = useState(false);
  const [estInput, setEstInput] = useState(String(initialEstimatedHours ?? ""));
  const [estSaving, setEstSaving] = useState(false);

  // Accordion open states (manager-only per-service breakdowns)
  const [estOpen, setEstOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [remOpen, setRemOpen] = useState(false);

  const totalMins = entries.reduce((s, e) => s + e.durationMinutes, 0);

  // Scheduled = TTT Staff helper shifts on plan calendar
  // Build per-service map so we can show breakdown and subtract per-service from Remaining
  const scheduledByServiceMap = new Map<string, number>();
  for (const pe of (planEntries ?? [])) {
    if (!pe.startTime || !pe.endTime) continue;
    const [sh, sm] = pe.startTime.split(":").map(Number);
    const [eh, em] = pe.endTime.split(":").map(Number);
    const shiftMins = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
    if (shiftMins === 0) continue;
    const helperCount = (pe.helpers ?? []).filter(h => h.status !== "declined").length;
    if (helperCount === 0) continue;
    const key = (pe.activity as string) || "Other";
    scheduledByServiceMap.set(key, (scheduledByServiceMap.get(key) ?? 0) + helperCount * shiftMins);
  }
  const scheduledMins = Array.from(scheduledByServiceMap.values()).reduce((s, m) => s + m, 0);
  const scheduledBreakdown = Array.from(scheduledByServiceMap.entries())
    .filter(([, mins]) => mins > 0)
    .map(([area, mins]) => ({ area, mins }))
    .sort((a, b) => {
      const ai = serviceList.indexOf(a.area);
      const bi = serviceList.indexOf(b.area);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.area.localeCompare(b.area);
    });

  const estimatedTotalMins = Math.round(estimatedHours * 60);
  const remainingMins = estimatedHours > 0
    ? Math.max(0, estimatedTotalMins - totalMins - scheduledMins)
    : 0;
  const pctLogged = estimatedHours > 0 ? Math.min(100, (totalMins / estimatedTotalMins) * 100) : 0;
  const pctScheduled = estimatedHours > 0
    ? Math.min(100 - pctLogged, (scheduledMins / estimatedTotalMins) * 100)
    : 0;

  const focusBreakdownMap = new Map<string, number>();
  for (const e of entries) {
    focusBreakdownMap.set(e.focusArea, (focusBreakdownMap.get(e.focusArea) ?? 0) + e.durationMinutes);
  }
  // Sort by service list order, then alphabetically for unknowns
  const focusBreakdown = Array.from(focusBreakdownMap.entries())
    .filter(([, mins]) => mins > 0)
    .map(([area, mins]) => ({ area, mins }))
    .sort((a, b) => {
      const ai = serviceList.indexOf(a.area);
      const bi = serviceList.indexOf(b.area);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.area.localeCompare(b.area);
    });

  // Per-service remaining breakdown (manager accordion on Remaining card)
  // Matches contract service names to logged focusArea and scheduled activity by name (case-insensitive)
  const remainingByService = contractServiceHours.map((sh) => {
    const nameLower = sh.serviceName.toLowerCase();
    const loggedMins = Array.from(focusBreakdownMap.entries())
      .filter(([area]) => area.toLowerCase() === nameLower)
      .reduce((s, [, mins]) => s + mins, 0);
    const scheduledForService = Array.from(scheduledByServiceMap.entries())
      .filter(([area]) => area.toLowerCase() === nameLower)
      .reduce((s, [, mins]) => s + mins, 0);
    const remainingMins = Math.max(0, Math.round(sh.hours * 60) - loggedMins - scheduledForService);
    return { serviceName: sh.serviceName, estimatedHours: sh.hours, loggedMins, scheduledForService, remainingMins };
  });

  async function saveEstimate() {
    const h = parseFloat(estInput);
    if (isNaN(h) || h < 0) { setEditingEst(false); return; }
    setEstSaving(true);
    try {
      await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, estimatedHours: h }),
      });
      setEstimatedHours(h);
    } finally {
      setEstSaving(false);
      setEditingEst(false);
    }
  }

  function exportCSV() {
    const rows = [
      ["Date", "Staff", "Project", "Focus Area", "Start", "End", "Duration (min)", "Travel Miles", "Travel Time (min)", "Notes"],
      ...entries.map(e => [
        e.date, e.staffName, e.projectName, e.focusArea,
        e.startTime, e.endTime, String(e.durationMinutes),
        e.travelMiles != null ? String(e.travelMiles) : "",
        e.travelMinutes != null ? String(e.travelMinutes) : "",
        e.notes ?? "",
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hours-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Hours</h2>
        {isAdmin && entries.length > 0 && (
          <button onClick={exportCSV} className="text-xs text-forest-600 hover:text-forest-700 font-medium">
            Export CSV
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">

        {/* ── Estimated ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Estimated</div>
          {showEstimateEdit && editingEst ? (
            <div className="flex items-center gap-1 mt-1">
              <input type="number" min="0" value={estInput} onChange={e => setEstInput(e.target.value)}
                className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-sm" />
              <span className="text-xs text-gray-500">hrs</span>
              <button onClick={saveEstimate} disabled={estSaving}
                className="text-xs text-forest-600 ml-1 font-medium disabled:opacity-60">
                {estSaving ? "…" : "Save"}
              </button>
              <button onClick={() => setEditingEst(false)} className="text-xs text-gray-400 ml-1">✕</button>
            </div>
          ) : (
            <div className="flex items-end gap-1">
              <span className="text-xl font-bold text-gray-900">
                {estimatedHours > 0 ? fmtHours(estimatedHours) : "—"}
              </span>
              {showEstimateEdit && (
                <button onClick={() => { setEstInput(String(estimatedHours || "")); setEditingEst(true); }}
                  className="text-[11px] text-gray-400 hover:text-forest-600 mb-0.5 ml-1">
                  edit
                </button>
              )}
            </div>
          )}
          {isLockedByContract && (
            <p className="text-[10px] text-gray-400 mt-1 leading-tight">
              Locked by signed quote
            </p>
          )}
          {/* Manager accordion */}
          {isManager && contractServiceHours.length > 0 && (
            <>
              <button
                onClick={() => setEstOpen(p => !p)}
                className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 mt-2"
              >
                <ChevronIcon open={estOpen} />
                <span>By service</span>
              </button>
              {estOpen && (
                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                  {contractServiceHours.map((sh) => (
                    <div key={sh.serviceName} className="flex justify-between items-center">
                      <span className="text-[11px] text-gray-500 truncate pr-1">{sh.serviceName}</span>
                      <span className="text-[11px] font-semibold text-gray-700 shrink-0">{fmtHours(sh.hours)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Logged ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Logged</div>
          <div className="text-xl font-bold text-gray-900">{totalMins > 0 ? fmtMins(totalMins) : "—"}</div>
          {/* Manager accordion */}
          {isManager && focusBreakdown.length > 0 && (
            <>
              <button
                onClick={() => setLogOpen(p => !p)}
                className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 mt-2"
              >
                <ChevronIcon open={logOpen} />
                <span>By service</span>
              </button>
              {logOpen && (
                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                  {focusBreakdown.map(({ area, mins }) => (
                    <div key={area} className="flex justify-between items-center gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getFocusColor(area, serviceList) }} />
                        <span className="text-[11px] text-gray-500 truncate">{area}</span>
                      </div>
                      <span className="text-[11px] font-semibold text-gray-700 shrink-0">{fmtMins(mins)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Scheduled ── */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-xs text-amber-600 mb-1">Scheduled</div>
          <div className="text-xl font-bold text-amber-700">{scheduledMins > 0 ? fmtMins(scheduledMins) : "—"}</div>
          {/* Manager accordion */}
          {isManager && scheduledBreakdown.length > 0 && (
            <>
              <button
                onClick={() => setSchedOpen(p => !p)}
                className="flex items-center gap-0.5 text-[10px] text-amber-500 hover:text-amber-700 mt-2"
              >
                <ChevronIcon open={schedOpen} />
                <span>By service</span>
              </button>
              {schedOpen && (
                <div className="mt-2 pt-2 border-t border-amber-200 space-y-1.5">
                  {scheduledBreakdown.map(({ area, mins }) => (
                    <div key={area} className="flex justify-between items-center gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getFocusColor(area, serviceList) }} />
                        <span className="text-[11px] text-amber-700 truncate">{area}</span>
                      </div>
                      <span className="text-[11px] font-semibold text-amber-700 shrink-0">{fmtMins(mins)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Remaining to Schedule ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Remaining to Schedule</div>
          <div className={`text-xl font-bold ${
            estimatedHours > 0
              ? remainingMins > 0 ? "text-gray-900" : "text-emerald-600"
              : "text-gray-400"
          }`}>
            {estimatedHours > 0
              ? remainingMins > 0 ? fmtMins(remainingMins) : "Done"
              : "—"}
          </div>
          {/* Manager accordion */}
          {isManager && remainingByService.length > 0 && (
            <>
              <button
                onClick={() => setRemOpen(p => !p)}
                className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 mt-2"
              >
                <ChevronIcon open={remOpen} />
                <span>By service</span>
              </button>
              {remOpen && (
                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                  {remainingByService.map(({ serviceName, remainingMins: rm, scheduledForService: sf }) => (
                    <div key={serviceName} className="flex justify-between items-center">
                      <span className="text-[11px] text-gray-500 truncate pr-1">{serviceName}</span>
                      <div className="text-right shrink-0">
                        <span className={`text-[11px] font-semibold ${rm === 0 ? "text-emerald-600" : "text-gray-700"}`}>
                          {rm === 0 ? "Done" : fmtMins(rm)}
                        </span>
                        {sf > 0 && rm > 0 && (
                          <span className="text-[10px] text-amber-500 block">{fmtMins(sf)} sched.</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

      </div>

      {/* Progress bar */}
      {estimatedHours > 0 && (totalMins > 0 || scheduledMins > 0) && (
        <div className="mb-4">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-forest-500 transition-all" style={{ width: `${pctLogged}%` }} />
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${pctScheduled}%` }} />
          </div>
          <div className="text-xs text-gray-400 mt-1">{Math.round(pctLogged + pctScheduled)}% covered (logged + scheduled)</div>
        </div>
      )}

      {/* Focus area breakdown */}
      {focusBreakdown.length > 0 && (
        <div className="mb-5">
          <div className="text-xs text-gray-500 mb-2">By Focus Area</div>
          <div className="flex h-3 rounded-full overflow-hidden">
            {focusBreakdown.map(({ area, mins }) => (
              <div key={area}
                style={{ width: `${(mins / totalMins) * 100}%`, backgroundColor: getFocusColor(area, serviceList) }}
                title={`${area}: ${fmtMins(mins)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {focusBreakdown.map(({ area, mins }) => (
              <div key={area} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getFocusColor(area, serviceList) }} />
                <span className="text-xs text-gray-600">{area}</span>
                <span className="text-xs text-gray-400">{fmtMins(mins)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shift log */}
      {entries.length > 0 && (
        <div>
          <button onClick={() => setShowLog(v => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
            <svg className={`w-3.5 h-3.5 transition-transform ${showLog ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Shift Log ({entries.length} {entries.length === 1 ? "entry" : "entries"})
          </button>

          {showLog && (
            <div className="mt-2 space-y-1.5">
              {entries.map(e => (
                <div key={e.id}
                  className="flex items-start justify-between py-2.5 px-3 bg-white border border-gray-100 rounded-lg">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: getFocusColor(e.focusArea, serviceList) }} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {fmtDate(e.date)} · {e.focusArea} · {fmtMins(e.durationMinutes)}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {fmt12(e.startTime)} – {fmt12(e.endTime)}
                        {isAdmin && ` · ${e.staffName}`}
                        {e.travelMinutes ? ` · ${e.travelMinutes}min travel` : ""}
                        {e.travelMiles ? ` · ${e.travelMiles}mi` : ""}
                        {e.notes ? ` · ${e.notes}` : ""}
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <button onClick={() => setEditingEntry(e)}
                      className="text-xs text-gray-400 hover:text-forest-600 ml-3 flex-shrink-0 font-medium">
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-sm text-gray-400">No hours logged for this project yet.</p>
      )}

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={(updated) => {
            setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
            setEditingEntry(null);
          }}
        />
      )}
    </div>
  );
}
