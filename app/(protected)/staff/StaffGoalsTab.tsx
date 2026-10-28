"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { nextAnniversary, nextBirthday, normalizeMonthDay } from "@/lib/about-me";
import { AvatarUploadButton } from "@/components/ui/AvatarUploadButton";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface StaffMemberWithGoals {
  id: string;
  displayName: string;
  email: string;
  role: string;
  hireDate?: string;
  birthday?: string; // "MM-DD"
  headshot?: string; // shown to clients on the Partners page when this person is a project's Team Lead
  roleType?: "Staff" | "Team Lead";
  minWeeklyHours?: number;
  targetWeeklyHours?: number;
  maxWeeklyHours?: number;
  skillIds?: string[];
  updatedAt?: string;
}

interface StaffGoalsTabProps {
  members?: StaffMemberWithGoals[];
  canEdit: boolean;
}

interface BulkValues {
  roleType: string;
  minWeeklyHours: string;
  targetWeeklyHours: string;
  maxWeeklyHours: string;
  hireDate: string;
}

type SortField = "name" | "hireDate" | "birthday" | "role" | "min" | "target" | "max" | "updatedAt";
type SortDir = "asc" | "desc";
type SaveState = "idle" | "saving" | "saved" | "error";

const EMPTY_BULK: BulkValues = { roleType: "", minWeeklyHours: "", targetWeeklyHours: "", maxWeeklyHours: "", hireDate: "" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtHireDate(d?: string): string {
  if (!d) return "—";
  const [y, mo, day] = d.split("-");
  return `${mo}/${day}/${y}`;
}

function fmtUpdatedAt(d?: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtBirthday(md?: string): string {
  if (!md) return "—";
  const [m, d] = md.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function exportCSV(rows: StaffMemberWithGoals[]) {
  const header = ["Name", "Email", "Hire Date", "Birthday", "Role Type", "Min Hours", "Target Hours", "Max Hours"];
  const lines = rows.map(r => [
    `"${r.displayName.replace(/"/g, '""')}"`,
    `"${r.email.replace(/"/g, '""')}"`,
    `"${fmtHireDate(r.hireDate)}"`,
    `"${fmtBirthday(r.birthday)}"`,
    `"${r.roleType ?? "Staff"}"`,
    r.minWeeklyHours ?? "",
    r.targetWeeklyHours ?? "",
    r.maxWeeklyHours ?? "",
  ].join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "staff-goals.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Save State Icon ──────────────────────────────────────────────────────────
function SaveIcon({ state }: { state: SaveState }) {
  if (state === "saving") return (
    <svg className="animate-spin h-3.5 w-3.5 text-gray-400 inline-block ml-1" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
  if (state === "saved") return (
    <svg className="h-3.5 w-3.5 text-green-500 inline-block ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
  if (state === "error") return <span className="ml-1 text-red-500 text-xs font-bold" title="Save failed">!</span>;
  return null;
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-t border-gray-100">
      <td className="pl-4 pr-2 py-3 w-8" />
      {[...Array(8)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: i === 0 ? "80%" : "60%" }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Sort Header ──────────────────────────────────────────────────────────────
function SortHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 whitespace-nowrap"
      onClick={() => onSort(field)}
    >
      {label}
      <span className="ml-1 text-gray-300">{active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
    </th>
  );
}

// ─── Hour Input ───────────────────────────────────────────────────────────────
function HourInput({ value, canEdit, onBlur }: { value?: number; canEdit: boolean; onBlur: (v: string) => void }) {
  const [local, setLocal] = useState(value != null ? String(value) : "");
  useEffect(() => { setLocal(value != null ? String(value) : ""); }, [value]);

  if (!canEdit) return <span className="text-gray-700">{value != null ? value : "—"}</span>;
  return (
    <input
      type="number" min={0} value={local} placeholder="—"
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onBlur(e.target.value)}
      className="w-16 text-sm text-gray-800 bg-transparent border border-transparent hover:border-gray-300 focus:border-forest-600 focus:ring-1 focus:ring-forest-600/20 rounded px-1.5 py-0.5 focus:outline-none placeholder-gray-300 text-center transition-colors"
    />
  );
}

// ─── Hire Date Input ──────────────────────────────────────────────────────────
function HireDateInput({ value, canEdit, onBlur }: { value?: string; canEdit: boolean; onBlur: (v: string) => void }) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => { setLocal(value ?? ""); }, [value]);

  if (!canEdit) return <span className="text-gray-600 text-sm">{fmtHireDate(value)}</span>;
  return (
    <input
      type="date" value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onBlur(e.target.value)}
      className="text-sm text-gray-800 bg-transparent border border-transparent hover:border-gray-300 focus:border-forest-600 focus:ring-1 focus:ring-forest-600/20 rounded px-1.5 py-0.5 focus:outline-none transition-colors min-w-0 max-w-full appearance-none [&::-webkit-date-and-time-value]:text-left"
    />
  );
}

// ─── Birthday Input (month + day, no year) ─────────────────────────────────────
// Accepts "2/1", "02-01", "Feb 1", "February 1st"; returns "MM-DD" or null.
function parseBirthday(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/(st|nd|rd|th)\b/g, "");
  const num = t.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})$/);
  if (num) return normalizeMonthDay(`${num[1]}-${num[2]}`);
  const named = t.match(/^([a-z]+)\.?\s+(\d{1,2})$/);
  if (named) {
    const mi = MONTHS.findIndex(m => named[1].startsWith(m.toLowerCase()));
    if (mi >= 0) return normalizeMonthDay(`${mi + 1}-${named[2]}`);
  }
  return null;
}

function BirthdayInput({ value, canEdit, onSave }: { value?: string; canEdit: boolean; onSave: (v: string) => void }) {
  const [text, setText] = useState(fmtBirthday(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(fmtBirthday(value)); setInvalid(false); }, [value]);

  if (!canEdit) return <span className="text-gray-600 text-sm">{fmtBirthday(value)}</span>;

  const commit = () => {
    if (!text.trim() || text.trim() === "—") {
      setInvalid(false);
      setText(fmtBirthday(""));
      if (value) onSave("");
      return;
    }
    const parsed = parseBirthday(text);
    if (!parsed) { setInvalid(true); return; }
    setInvalid(false);
    setText(fmtBirthday(parsed));
    if (parsed !== value) onSave(parsed);
  };
  return (
    <input
      type="text"
      aria-label="Birthday"
      title={invalid ? "Try a format like Feb 1 or 2/1" : "Type a date like Feb 1 or 2/1"}
      placeholder="e.g. Feb 1"
      value={text === "—" ? "" : text}
      onFocus={e => e.target.select()}
      onChange={e => { setText(e.target.value); setInvalid(false); }}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setText(fmtBirthday(value)); setInvalid(false); }
      }}
      className={`w-20 text-sm text-gray-800 bg-transparent border rounded px-1 py-0.5 focus:outline-none focus:ring-1 transition-colors placeholder-gray-300 ${
        invalid ? "border-red-400 focus:ring-red-400/30" : "border-transparent hover:border-gray-300 focus:border-forest-600 focus:ring-forest-600/20"
      }`}
    />
  );
}

// ─── Upcoming Celebrations (next 30 days) ─────────────────────────────────────
function UpcomingCelebrations({ members }: { members: StaffMemberWithGoals[] }) {
  const today = localToday();
  const items = members
    .flatMap(m => {
      const out: { key: string; name: string; label: string; date: string; daysAway: number }[] = [];
      const b = nextBirthday(m.birthday, today);
      if (b && b.daysAway <= 30) out.push({ key: `${m.id}-b`, name: m.displayName, label: "Birthday", date: b.date, daysAway: b.daysAway });
      const a = nextAnniversary(m.hireDate, today);
      if (a && a.daysAway <= 30) out.push({ key: `${m.id}-a`, name: m.displayName, label: `${a.years} yr anniversary`, date: a.date, daysAway: a.daysAway });
      return out;
    })
    .sort((x, y) => x.daysAway - y.daysAway);

  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-forest-200 bg-forest-50/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-2">Upcoming Celebrations · Next 30 Days</p>
      <div className="flex flex-wrap gap-2">
        {items.map(i => (
          <span key={i.key} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-forest-200 px-3 py-1 text-xs text-gray-700">
            <span className="font-semibold text-gray-900">{i.name}</span>
            <span>{i.label}</span>
            <span className={i.daysAway <= 7 ? "font-semibold text-forest-700" : "text-gray-400"}>
              {i.daysAway === 0 ? "Today" : i.daysAway === 1 ? "Tomorrow" : new Date(i.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Bulk Edit Bar ────────────────────────────────────────────────────────────
function BulkEditBar({ count, values, onChange, onApply, onClear, saving }: {
  count: number;
  values: BulkValues;
  onChange: (v: BulkValues) => void;
  onApply: () => void;
  onClear: () => void;
  saving: boolean;
}) {
  const hasAnyValue = values.roleType !== "" || values.minWeeklyHours !== "" ||
    values.targetWeeklyHours !== "" || values.maxWeeklyHours !== "" || values.hireDate !== "";

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 bg-forest-50 border border-forest-200 rounded-xl">
      <div className="flex items-center gap-2 text-sm font-semibold text-forest-800 whitespace-nowrap mr-1">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-forest-600 text-white text-xs font-bold">{count}</span>
        {count === 1 ? "row selected" : "rows selected"}
      </div>
      <div className="flex flex-wrap gap-3 flex-1">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Role Type</label>
          <select
            value={values.roleType}
            onChange={e => onChange({ ...values, roleType: e.target.value })}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-forest-600/30 bg-white"
          >
            <option value="">— no change —</option>
            <option value="Staff">Staff</option>
            <option value="Team Lead">Team Lead</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Min Hrs/wk</label>
          <input
            type="number" min={0} placeholder="—" value={values.minWeeklyHours}
            onChange={e => onChange({ ...values, minWeeklyHours: e.target.value })}
            className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-forest-600/30 text-center bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Target Hrs/wk</label>
          <input
            type="number" min={0} placeholder="—" value={values.targetWeeklyHours}
            onChange={e => onChange({ ...values, targetWeeklyHours: e.target.value })}
            className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-forest-600/30 text-center bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Max Hrs/wk</label>
          <input
            type="number" min={0} placeholder="—" value={values.maxWeeklyHours}
            onChange={e => onChange({ ...values, maxWeeklyHours: e.target.value })}
            className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-forest-600/30 text-center bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Hire Date</label>
          <input
            type="date" value={values.hireDate}
            onChange={e => onChange({ ...values, hireDate: e.target.value })}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-forest-600/30 bg-white min-w-0 max-w-full appearance-none [&::-webkit-date-and-time-value]:text-left"
          />
        </div>
      </div>
      <div className="flex gap-2 ml-auto">
        <button
          onClick={onClear} disabled={saving}
          className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          Clear
        </button>
        <button
          onClick={onApply} disabled={saving || !hasAnyValue}
          className="text-sm font-semibold bg-forest-600 hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          {saving ? "Saving…" : `Apply to ${count}`}
        </button>
      </div>
    </div>
  );
}

// ─── Goals Row ────────────────────────────────────────────────────────────────
function GoalsRow({ member, canEdit, saveState, selected, onSelect, onRoleToggle, onNumberBlur, onHireDateBlur, onBirthdaySave, onHeadshotSave }: {
  member: StaffMemberWithGoals;
  canEdit: boolean;
  saveState: SaveState;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onRoleToggle: (id: string, current?: "Staff" | "Team Lead") => void;
  onNumberBlur: (id: string, field: "minWeeklyHours" | "targetWeeklyHours" | "maxWeeklyHours", val: string) => void;
  onHireDateBlur: (id: string, val: string) => void;
  onBirthdaySave: (id: string, val: string) => void;
  onHeadshotSave: (id: string, url: string) => Promise<void>;
}) {
  const rt = member.roleType ?? "Staff";

  return (
    <tr className={`border-t border-gray-100 transition-colors ${selected ? "bg-forest-50/40" : "hover:bg-gray-50/50"}`}>
      {/* Checkbox */}
      <td className="pl-4 pr-2 py-3 w-8">
        {canEdit && (
          <input
            type="checkbox" checked={selected}
            onChange={e => onSelect(member.id, e.target.checked)}
            className="rounded border-gray-300 text-forest-600 focus:ring-forest-600/30 cursor-pointer"
          />
        )}
      </td>
      {/* Name */}
      <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">
        <div className="flex items-center gap-3">
          <AvatarUploadButton
            size={32}
            name={member.displayName}
            folder="staff-headshots"
            value={member.headshot}
            disabled={!canEdit}
            onSave={url => onHeadshotSave(member.id, url)}
          />
          <span>
            {member.displayName}
            <SaveIcon state={saveState} />
          </span>
        </div>
      </td>
      {/* Hire Date */}
      <td className="px-4 py-3">
        <HireDateInput value={member.hireDate} canEdit={canEdit} onBlur={v => onHireDateBlur(member.id, v)} />
      </td>
      {/* Birthday */}
      <td className="px-4 py-3 whitespace-nowrap">
        <BirthdayInput value={member.birthday} canEdit={canEdit} onSave={v => onBirthdaySave(member.id, v)} />
      </td>
      {/* Role Type */}
      <td className="px-4 py-3">
        {canEdit ? (
          <button
            onClick={() => onRoleToggle(member.id, member.roleType)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              rt === "Team Lead"
                ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
            }`}
          >{rt}</button>
        ) : (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            rt === "Team Lead" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
          }`}>{rt}</span>
        )}
      </td>
      {/* Min */}
      <td className="px-4 py-3">
        <HourInput value={member.minWeeklyHours} canEdit={canEdit} onBlur={v => onNumberBlur(member.id, "minWeeklyHours", v)} />
      </td>
      {/* Target */}
      <td className="px-4 py-3">
        <HourInput value={member.targetWeeklyHours} canEdit={canEdit} onBlur={v => onNumberBlur(member.id, "targetWeeklyHours", v)} />
      </td>
      {/* Max */}
      <td className="px-4 py-3">
        <HourInput value={member.maxWeeklyHours} canEdit={canEdit} onBlur={v => onNumberBlur(member.id, "maxWeeklyHours", v)} />
      </td>
      {/* Last Updated */}
      <td className="px-4 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
        {fmtUpdatedAt(member.updatedAt)}
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function StaffGoalsTab({ members: initialMembers, canEdit }: StaffGoalsTabProps) {
  const [members, setMembers] = useState<StaffMemberWithGoals[]>(initialMembers ?? []);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"All" | "Staff" | "Team Lead">("All");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Bulk edit state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkValues, setBulkValues] = useState<BulkValues>(EMPTY_BULK);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff/goals?includeTeamLeads=1")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data?.staff) setMembers(data.staff); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const setSaveState = useCallback((id: string, state: SaveState) => {
    setSaveStates(prev => ({ ...prev, [id]: state }));
    if (state === "saved") {
      if (savedTimers.current[id]) clearTimeout(savedTimers.current[id]);
      savedTimers.current[id] = setTimeout(() => {
        setSaveStates(prev => ({ ...prev, [id]: "idle" }));
      }, 2000);
    }
  }, []);

  const patchGoals = useCallback(async (id: string, fields: Record<string, unknown>) => {
    setSaveState(id, "saving");
    try {
      const res = await fetch("/api/staff/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      if (!res.ok) throw new Error("Failed");
      setSaveState(id, "saved");
    } catch {
      setSaveState(id, "error");
    }
  }, [setSaveState]);

  const handleRoleToggle = useCallback((id: string, current?: "Staff" | "Team Lead") => {
    const next: "Staff" | "Team Lead" = current === "Team Lead" ? "Staff" : "Team Lead";
    setMembers(prev => prev.map(m => m.id === id ? { ...m, roleType: next, updatedAt: new Date().toISOString() } : m));
    patchGoals(id, { roleType: next });
  }, [patchGoals]);

  const handleNumberBlur = useCallback((
    id: string,
    field: "minWeeklyHours" | "targetWeeklyHours" | "maxWeeklyHours",
    rawValue: string
  ) => {
    const num = rawValue === "" ? undefined : Number(rawValue);
    setMembers(prev => prev.map(m => m.id === id ? { ...m, [field]: num, updatedAt: new Date().toISOString() } : m));
    patchGoals(id, { [field]: num ?? null });
  }, [patchGoals]);

  const handleHireDateBlur = useCallback((id: string, value: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, hireDate: value || undefined, updatedAt: new Date().toISOString() } : m));
    patchGoals(id, { hireDate: value || null });
  }, [patchGoals]);

  const handleBirthdaySave = useCallback((id: string, value: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, birthday: value || undefined, updatedAt: new Date().toISOString() } : m));
    patchGoals(id, { birthday: value || null });
  }, [patchGoals]);

  // Saves immediately; throws so the avatar shows the error inline.
  const handleHeadshotSave = useCallback(async (id: string, url: string) => {
    const res = await fetch("/api/staff/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, headshot: url || null }),
    });
    if (!res.ok) throw new Error("Upload failed");
    setMembers(prev => prev.map(m => m.id === id ? { ...m, headshot: url || undefined, updatedAt: new Date().toISOString() } : m));
  }, []);

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) { setSortDir(d => d === "asc" ? "desc" : "asc"); return prev; }
      setSortDir("asc");
      return field;
    });
  }, []);

  // Filter + sort
  const filtered = members
    .filter(m => {
      const matchName = m.displayName.toLowerCase().includes(search.toLowerCase());
      const matchRole = filterRole === "All" || (m.roleType ?? "Staff") === filterRole;
      return matchName && matchRole;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": cmp = a.displayName.localeCompare(b.displayName); break;
        case "hireDate": cmp = (a.hireDate ?? "").localeCompare(b.hireDate ?? ""); break;
        case "birthday": cmp = (a.birthday ?? "").localeCompare(b.birthday ?? ""); break;
        case "role": cmp = (a.roleType ?? "Staff").localeCompare(b.roleType ?? "Staff"); break;
        case "min": cmp = (a.minWeeklyHours ?? 0) - (b.minWeeklyHours ?? 0); break;
        case "target": cmp = (a.targetWeeklyHours ?? 0) - (b.targetWeeklyHours ?? 0); break;
        case "max": cmp = (a.maxWeeklyHours ?? 0) - (b.maxWeeklyHours ?? 0); break;
        case "updatedAt": cmp = (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const allFilteredSelected = filtered.length > 0 && filtered.every(m => selectedIds.has(m.id));
  const someFilteredSelected = filtered.some(m => selectedIds.has(m.id));

  function handleSelectAll(checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      filtered.forEach(m => checked ? next.add(m.id) : next.delete(m.id));
      return next;
    });
  }

  function handleSelectRow(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function handleBulkApply() {
    if (selectedIds.size === 0 || bulkSaving) return;
    const fields: Record<string, unknown> = {};
    if (bulkValues.roleType) fields.roleType = bulkValues.roleType;
    if (bulkValues.minWeeklyHours !== "") fields.minWeeklyHours = Number(bulkValues.minWeeklyHours);
    if (bulkValues.targetWeeklyHours !== "") fields.targetWeeklyHours = Number(bulkValues.targetWeeklyHours);
    if (bulkValues.maxWeeklyHours !== "") fields.maxWeeklyHours = Number(bulkValues.maxWeeklyHours);
    if (bulkValues.hireDate !== "") fields.hireDate = bulkValues.hireDate;
    if (Object.keys(fields).length === 0) return;

    setBulkSaving(true);
    const ids = [...selectedIds];
    ids.forEach(id => setSaveState(id, "saving"));

    await Promise.all(ids.map(id =>
      fetch("/api/staff/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      })
        .then(res => { if (!res.ok) throw new Error(); setSaveState(id, "saved"); })
        .catch(() => setSaveState(id, "error"))
    ));

    // Optimistic update
    setMembers(prev => prev.map(m => {
      if (!selectedIds.has(m.id)) return m;
      return {
        ...m,
        ...(fields.roleType != null ? { roleType: fields.roleType as "Staff" | "Team Lead" } : {}),
        ...(fields.minWeeklyHours != null ? { minWeeklyHours: fields.minWeeklyHours as number } : {}),
        ...(fields.targetWeeklyHours != null ? { targetWeeklyHours: fields.targetWeeklyHours as number } : {}),
        ...(fields.maxWeeklyHours != null ? { maxWeeklyHours: fields.maxWeeklyHours as number } : {}),
        ...(fields.hireDate != null ? { hireDate: fields.hireDate as string } : {}),
        updatedAt: new Date().toISOString(),
      };
    }));

    setSelectedIds(new Set());
    setBulkValues(EMPTY_BULK);
    setBulkSaving(false);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-600/30 focus:border-forest-600 w-52"
          />
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value as "All" | "Staff" | "Team Lead")}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest-600/30 focus:border-forest-600"
          >
            <option value="All">All Role Types</option>
            <option value="Staff">Staff</option>
            <option value="Team Lead">Team Lead</option>
          </select>
        </div>
        <button
          onClick={() => exportCSV(filtered)}
          className="text-sm font-medium text-forest-700 border border-forest-200 px-3 py-1.5 rounded-lg hover:bg-forest-50 transition-colors whitespace-nowrap"
        >
          Export CSV
        </button>
      </div>

      {!loading && <UpcomingCelebrations members={members} />}

      {/* Bulk Edit Bar */}
      {canEdit && selectedIds.size > 0 && (
        <BulkEditBar
          count={selectedIds.size}
          values={bulkValues}
          onChange={setBulkValues}
          onApply={handleBulkApply}
          onClear={() => { setSelectedIds(new Set()); setBulkValues(EMPTY_BULK); }}
          saving={bulkSaving}
        />
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="bg-gray-50">
                {/* Select-all checkbox */}
                <th className="pl-4 pr-2 py-3 w-8">
                  {canEdit && !loading && filtered.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={el => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                      onChange={e => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-forest-600 focus:ring-forest-600/30 cursor-pointer"
                    />
                  )}
                </th>
                <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Hire Date" field="hireDate" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Birthday" field="birthday" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Role Type" field="role" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Min Hrs" field="min" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Target Hrs" field="target" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Max Hrs" field="max" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Last Updated" field="updatedAt" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No staff members found. Adjust your filters.
                  </td>
                </tr>
              ) : (
                filtered.map(m => (
                  <GoalsRow
                    key={m.id}
                    member={m}
                    canEdit={canEdit}
                    saveState={saveStates[m.id] ?? "idle"}
                    selected={selectedIds.has(m.id)}
                    onSelect={handleSelectRow}
                    onRoleToggle={handleRoleToggle}
                    onNumberBlur={handleNumberBlur}
                    onHireDateBlur={handleHireDateBlur}
                    onBirthdaySave={handleBirthdaySave}
                    onHeadshotSave={handleHeadshotSave}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && filtered.length > 0 && !loading && (
        <p className="text-xs text-gray-400">
          Click any cell to edit inline. Select rows with checkboxes for bulk edits.
        </p>
      )}
    </div>
  );
}
