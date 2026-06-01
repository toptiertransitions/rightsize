"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface StaffMemberWithGoals {
  id: string;
  displayName: string;
  email: string;
  role: string;
  hireDate?: string;
  roleType?: "Staff" | "Team Lead";
  minWeeklyHours?: number;
  targetWeeklyHours?: number;
  maxWeeklyHours?: number;
  updatedAt?: string;
}

interface StaffGoalsTabProps {
  members: StaffMemberWithGoals[];
  canEdit: boolean;
}

type SortField = "name" | "hireDate" | "role" | "min" | "target" | "max" | "updatedAt";
type SortDir = "asc" | "desc";

type SaveState = "idle" | "saving" | "saved" | "error";

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
  } catch {
    return "—";
  }
}

function exportCSV(rows: StaffMemberWithGoals[]) {
  const header = ["Name", "Email", "Hire Date", "Role Type", "Min Hours", "Target Hours", "Max Hours"];
  const lines = rows.map(r => [
    `"${r.displayName.replace(/"/g, '""')}"`,
    `"${r.email.replace(/"/g, '""')}"`,
    `"${fmtHireDate(r.hireDate)}"`,
    `"${r.roleType ?? "Staff"}"`,
    r.minWeeklyHours ?? "",
    r.targetWeeklyHours ?? "",
    r.maxWeeklyHours ?? "",
  ].join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "staff-goals.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Save State Icon ──────────────────────────────────────────────────────────
function SaveIcon({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <svg className="animate-spin h-3.5 w-3.5 text-gray-400 inline-block ml-1" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V0a12 12 0 100 24v-4l-3 3 3 3V24a12 12 0 010-24z" />
      </svg>
    );
  }
  if (state === "saved") {
    return (
      <svg className="h-3.5 w-3.5 text-green-500 inline-block ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (state === "error") {
    return <span className="ml-1 text-red-500 text-xs font-bold" title="Save failed">!</span>;
  }
  return null;
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-t border-gray-100">
      {[...Array(7)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: i === 0 ? "80%" : "60%" }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Sort Header ──────────────────────────────────────────────────────────────
function SortHeader({
  label, field, sortField, sortDir, onSort
}: {
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
      <span className="ml-1 text-gray-300">
        {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </th>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function StaffGoalsTab({ members: initialMembers, canEdit }: StaffGoalsTabProps) {
  const [members, setMembers] = useState<StaffMemberWithGoals[]>(initialMembers);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"All" | "Staff" | "Team Lead">("All");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff/goals")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data?.staff) {
          setMembers(data.staff);
        }
      })
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

  const patchGoals = useCallback(async (id: string, field: string, value: unknown) => {
    setSaveState(id, "saving");
    try {
      const res = await fetch("/api/staff/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
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
    patchGoals(id, "roleType", next);
  }, [patchGoals]);

  const handleNumberBlur = useCallback((
    id: string,
    field: "minWeeklyHours" | "targetWeeklyHours" | "maxWeeklyHours",
    rawValue: string
  ) => {
    const num = rawValue === "" ? undefined : Number(rawValue);
    setMembers(prev => prev.map(m => m.id === id ? { ...m, [field]: num, updatedAt: new Date().toISOString() } : m));
    patchGoals(id, field, num ?? null);
  }, [patchGoals]);

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
        case "role": cmp = (a.roleType ?? "Staff").localeCompare(b.roleType ?? "Staff"); break;
        case "min": cmp = (a.minWeeklyHours ?? 0) - (b.minWeeklyHours ?? 0); break;
        case "target": cmp = (a.targetWeeklyHours ?? 0) - (b.targetWeeklyHours ?? 0); break;
        case "max": cmp = (a.maxWeeklyHours ?? 0) - (b.maxWeeklyHours ?? 0); break;
        case "updatedAt": cmp = (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

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

      {/* Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="bg-gray-50">
              <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Hire Date" field="hireDate" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
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
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                  No staff members found. Adjust your filters.
                </td>
              </tr>
            ) : (
              filtered.map(m => {
                const saveState = saveStates[m.id] ?? "idle";
                return (
                  <GoalsRow
                    key={m.id}
                    member={m}
                    canEdit={canEdit}
                    saveState={saveState}
                    onRoleToggle={handleRoleToggle}
                    onNumberBlur={handleNumberBlur}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Goals Row ────────────────────────────────────────────────────────────────
function GoalsRow({
  member,
  canEdit,
  saveState,
  onRoleToggle,
  onNumberBlur,
}: {
  member: StaffMemberWithGoals;
  canEdit: boolean;
  saveState: SaveState;
  onRoleToggle: (id: string, current?: "Staff" | "Team Lead") => void;
  onNumberBlur: (id: string, field: "minWeeklyHours" | "targetWeeklyHours" | "maxWeeklyHours", val: string) => void;
}) {
  const rt = member.roleType ?? "Staff";

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
      {/* Name */}
      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
        {member.displayName}
        <SaveIcon state={saveState} />
      </td>
      {/* Hire Date */}
      <td className="px-4 py-3 text-gray-600">{fmtHireDate(member.hireDate)}</td>
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
          >
            {rt}
          </button>
        ) : (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            rt === "Team Lead" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
          }`}>
            {rt}
          </span>
        )}
      </td>
      {/* Min */}
      <td className="px-4 py-3">
        <HourInput
          value={member.minWeeklyHours}
          canEdit={canEdit}
          onBlur={v => onNumberBlur(member.id, "minWeeklyHours", v)}
        />
      </td>
      {/* Target */}
      <td className="px-4 py-3">
        <HourInput
          value={member.targetWeeklyHours}
          canEdit={canEdit}
          onBlur={v => onNumberBlur(member.id, "targetWeeklyHours", v)}
        />
      </td>
      {/* Max */}
      <td className="px-4 py-3">
        <HourInput
          value={member.maxWeeklyHours}
          canEdit={canEdit}
          onBlur={v => onNumberBlur(member.id, "maxWeeklyHours", v)}
        />
      </td>
      {/* Last Updated */}
      <td className="px-4 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
        {fmtUpdatedAt(member.updatedAt)}
      </td>
    </tr>
  );
}

// ─── Hour Input ───────────────────────────────────────────────────────────────
function HourInput({ value, canEdit, onBlur }: {
  value?: number; canEdit: boolean; onBlur: (v: string) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setLocal(value != null ? String(value) : "");
  }, [value]);

  if (!canEdit) {
    return <span className="text-gray-700">{value != null ? value : "—"}</span>;
  }

  return (
    <input
      type="number"
      min={0}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => onBlur(e.target.value)}
      placeholder="—"
      className="w-16 text-sm text-gray-800 bg-transparent border border-transparent hover:border-gray-300 focus:border-forest-600 focus:ring-1 focus:ring-forest-600/20 rounded px-1.5 py-0.5 focus:outline-none placeholder-gray-300 text-center transition-colors"
    />
  );
}
