"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Skill {
  id: string;
  skillName: string;
  skillCategory: string;
  description?: string;
  isActive: boolean;
}

export interface StaffMemberWithSkills {
  id: string;
  displayName: string;
  email: string;
  role: string;
  hireDate?: string;
  roleType?: "Staff" | "Team Lead";
  skillIds: string[];
}

interface StaffSkillsTabProps {
  members: StaffMemberWithSkills[];
  skills: Skill[];
  canEdit: boolean;
}

type SortMode = "name-asc" | "name-desc" | "skills-desc" | "skills-asc" | "role-asc" | "role-desc";

// ─── Category Colors ──────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  Physical: "bg-orange-100 text-orange-700",
  "Client-Facing": "bg-purple-100 text-purple-700",
  Specialty: "bg-blue-100 text-blue-700",
  Language: "bg-green-100 text-green-700",
  Equipment: "bg-yellow-100 text-yellow-700",
  Certification: "bg-red-100 text-red-700",
};
function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-600";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "").toUpperCase();
}
function fmtHireDate(d?: string) {
  if (!d) return null;
  const [y, mo, day] = d.split("-");
  return `${mo}/${day}/${y}`;
}
function groupByCategory(skills: Skill[]) {
  const map: Record<string, Skill[]> = {};
  for (const s of skills) {
    if (!map[s.skillCategory]) map[s.skillCategory] = [];
    map[s.skillCategory].push(s);
  }
  return map;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function StaffSkillsTab({ members: initialMembers, skills: initialSkills, canEdit }: StaffSkillsTabProps) {
  const [members, setMembers] = useState<StaffMemberWithSkills[]>(initialMembers);
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [loading, setLoading] = useState(true);

  // Self-fetch staff (with skillIds) and available skills on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/staff/goals").then(r => r.ok ? r.json() : null),
      fetch("/api/skills").then(r => r.ok ? r.json() : null),
    ]).then(([goalsData, skillsData]) => {
      if (cancelled) return;
      if (goalsData?.staff) {
        setMembers(goalsData.staff.map((m: { id: string; displayName: string; email: string; role: string; hireDate?: string; roleType?: "Staff" | "Team Lead"; skillIds?: string[] }) => ({
          id: m.id,
          displayName: m.displayName,
          email: m.email,
          role: m.role,
          hireDate: m.hireDate,
          roleType: m.roleType,
          skillIds: m.skillIds ?? [],
        })));
      }
      if (skillsData?.skills) setSkills(skillsData.skills);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [search, setSearch] = useState("");
  const [filterSkillIds, setFilterSkillIds] = useState<string[]>([]);
  const [filterRole, setFilterRole] = useState<"All" | "Staff" | "Team Lead">("All");
  const [sortMode, setSortMode] = useState<SortMode>("name-asc");
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const [skillDropdownSearch, setSkillDropdownSearch] = useState("");
  const skillDropdownRef = useRef<HTMLDivElement>(null);
  // Drawer state
  const [drawerMemberId, setDrawerMemberId] = useState<string | null>(null);
  // Bulk selection (table view)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"assign" | "remove" | null>(null);
  const [bulkSkillPopoverOpen, setBulkSkillPopoverOpen] = useState(false);
  const [bulkSkillSearch, setBulkSkillSearch] = useState("");

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (skillDropdownRef.current && !skillDropdownRef.current.contains(e.target as Node)) {
        setSkillDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleFilterSkill = useCallback((id: string) => {
    setFilterSkillIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  // Filter + sort
  const filtered = members
    .filter(m => {
      const matchName = m.displayName.toLowerCase().includes(search.toLowerCase());
      const matchRole = filterRole === "All" || (m.roleType ?? "Staff") === filterRole;
      const matchSkills = filterSkillIds.length === 0 || filterSkillIds.every(sid => m.skillIds.includes(sid));
      return matchName && matchRole && matchSkills;
    })
    .sort((a, b) => {
      switch (sortMode) {
        case "name-asc": return a.displayName.localeCompare(b.displayName);
        case "name-desc": return b.displayName.localeCompare(a.displayName);
        case "skills-desc": return b.skillIds.length - a.skillIds.length;
        case "skills-asc": return a.skillIds.length - b.skillIds.length;
        case "role-asc": return (a.roleType ?? "Staff").localeCompare(b.roleType ?? "Staff");
        case "role-desc": return (b.roleType ?? "Staff").localeCompare(a.roleType ?? "Staff");
        default: return 0;
      }
    });

  // Patch skills for a single member
  const patchSkills = useCallback(async (memberId: string, skillIds: string[]) => {
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, skillIds } : m));
    await fetch(`/api/staff/${memberId}/skills`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillIds }),
    });
  }, []);

  // Bulk patch
  const bulkPatch = useCallback(async (action: "assign" | "remove", skillId: string) => {
    const ids = Array.from(selectedIds);
    // Optimistic
    setMembers(prev => prev.map(m => {
      if (!ids.includes(m.id)) return m;
      const next = action === "assign"
        ? [...new Set([...m.skillIds, skillId])]
        : m.skillIds.filter(s => s !== skillId);
      return { ...m, skillIds: next };
    }));
    await fetch("/api/staff/skills/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, skillId, staffIds: ids }),
    });
    setBulkSkillPopoverOpen(false);
    setBulkAction(null);
    setSelectedIds(new Set());
  }, [selectedIds]);

  const groupedSkills = groupByCategory(skills.filter(s => s.isActive));
  const filteredSkillDropdown = skills.filter(s =>
    s.isActive && (skillDropdownSearch === "" || s.skillName.toLowerCase().includes(skillDropdownSearch.toLowerCase()))
  );
  const drawerMember = drawerMemberId ? members.find(m => m.id === drawerMemberId) : null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-3 flex-wrap items-center">
          {/* Search */}
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-600/30 focus:border-forest-600 w-48"
          />
          {/* Skill filter dropdown */}
          <div className="relative" ref={skillDropdownRef}>
            <button
              onClick={() => setSkillDropdownOpen(o => !o)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none flex items-center gap-1"
            >
              Filter by Skill
              {filterSkillIds.length > 0 && (
                <span className="ml-1 bg-forest-600 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold">{filterSkillIds.length}</span>
              )}
              <svg className="h-3.5 w-3.5 text-gray-400 ml-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            {skillDropdownOpen && (
              <div className="absolute z-20 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search skills..."
                    value={skillDropdownSearch}
                    onChange={e => setSkillDropdownSearch(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-forest-600/30"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {Object.entries(groupByCategory(filteredSkillDropdown)).map(([cat, catSkills]) => (
                    <div key={cat}>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">{cat}</div>
                      {catSkills.map(s => (
                        <button
                          key={s.id}
                          onClick={() => toggleFilterSkill(s.id)}
                          className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50"
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${filterSkillIds.includes(s.id) ? "bg-forest-600 border-forest-600" : "border-gray-300"}`}>
                            {filterSkillIds.includes(s.id) && (
                              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <span className="text-gray-700">{s.skillName}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {filteredSkillDropdown.length === 0 && (
                    <div className="px-3 py-4 text-sm text-gray-400 text-center">No skills found</div>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Role filter */}
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value as "All" | "Staff" | "Team Lead")}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest-600/30 focus:border-forest-600"
          >
            <option value="All">All Roles</option>
            <option value="Staff">Staff</option>
            <option value="Team Lead">Team Lead</option>
          </select>
        </div>
        {/* View mode + sort */}
        <div className="flex gap-2 items-center">
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none"
          >
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="skills-desc">Most Skills</option>
            <option value="skills-asc">Fewest Skills</option>
            <option value="role-asc">Role A–Z</option>
            <option value="role-desc">Role Z–A</option>
          </select>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("card")}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "card" ? "bg-forest-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >Cards</button>
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "table" ? "bg-forest-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >Table</button>
          </div>
        </div>
      </div>

      {/* Selected skill pills */}
      {filterSkillIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filterSkillIds.map(sid => {
            const sk = skills.find(s => s.id === sid);
            if (!sk) return null;
            return (
              <span key={sid} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor(sk.skillCategory)}`}>
                {sk.skillName}
                <button onClick={() => toggleFilterSkill(sid)} className="ml-0.5 hover:opacity-70">×</button>
              </span>
            );
          })}
          <button onClick={() => setFilterSkillIds([])} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Clear all</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        viewMode === "card" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {[...Array(3)].map((_, j) => <div key={j} className="h-5 w-16 bg-gray-100 rounded-full" />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <SkeletonTable />
        )
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No staff members found matching your filters.
        </div>
      ) : viewMode === "card" ? (
        <CardGrid
          members={filtered}
          skills={skills}
          canEdit={canEdit}
          groupedSkills={groupedSkills}
          onPatchSkills={patchSkills}
        />
      ) : (
        <TableView
          members={filtered}
          skills={skills}
          canEdit={canEdit}
          selectedIds={selectedIds}
          onSelectChange={setSelectedIds}
          onOpenDrawer={setDrawerMemberId}
        />
      )}

      {/* Bulk action bar */}
      {viewMode === "table" && selectedIds.size >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-3 text-sm">
          <span className="font-medium">{selectedIds.size} selected</span>
          <button
            onClick={() => { setBulkAction("assign"); setBulkSkillPopoverOpen(true); }}
            className="bg-forest-600 hover:bg-forest-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            Assign Skill to {selectedIds.size}
          </button>
          <button
            onClick={() => { setBulkAction("remove"); setBulkSkillPopoverOpen(true); }}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            Remove Skill from {selectedIds.size}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-white">×</button>
        </div>
      )}

      {/* Bulk skill popover */}
      {bulkSkillPopoverOpen && bulkAction && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 space-y-4">
            <h3 className="font-semibold text-gray-900">
              {bulkAction === "assign" ? "Assign" : "Remove"} Skill — {selectedIds.size} members
            </h3>
            <input
              autoFocus
              type="text"
              placeholder="Search skills..."
              value={bulkSkillSearch}
              onChange={e => setBulkSkillSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-forest-600/30"
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {skills
                .filter(s => s.isActive && (bulkSkillSearch === "" || s.skillName.toLowerCase().includes(bulkSkillSearch.toLowerCase())))
                .map(s => (
                  <button
                    key={s.id}
                    onClick={() => bulkPatch(bulkAction, s.id)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${categoryColor(s.skillCategory)}`}>{s.skillCategory}</span>
                    <span className="text-gray-800">{s.skillName}</span>
                  </button>
                ))}
            </div>
            <button
              onClick={() => { setBulkSkillPopoverOpen(false); setBulkAction(null); }}
              className="text-sm text-gray-500 hover:text-gray-700 w-full text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawerMember && (
        <SkillDrawer
          member={drawerMember}
          skills={skills}
          onClose={() => setDrawerMemberId(null)}
          onPatchSkills={patchSkills}
        />
      )}
    </div>
  );
}

// ─── Card Grid ────────────────────────────────────────────────────────────────
function CardGrid({
  members, skills, canEdit, groupedSkills, onPatchSkills
}: {
  members: StaffMemberWithSkills[];
  skills: Skill[];
  canEdit: boolean;
  groupedSkills: Record<string, Skill[]>;
  onPatchSkills: (id: string, skillIds: string[]) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {members.map(m => (
        <StaffCard
          key={m.id}
          member={m}
          skills={skills}
          canEdit={canEdit}
          groupedSkills={groupedSkills}
          onPatchSkills={onPatchSkills}
        />
      ))}
    </div>
  );
}

function StaffCard({
  member, skills, canEdit, groupedSkills, onPatchSkills
}: {
  member: StaffMemberWithSkills;
  skills: Skill[];
  canEdit: boolean;
  groupedSkills: Record<string, Skill[]>;
  onPatchSkills: (id: string, skillIds: string[]) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const rt = member.roleType ?? "Staff";

  useEffect(() => {
    if (!addOpen) return;
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setAddOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addOpen]);

  const assignedSkills = member.skillIds
    .map(id => skills.find(s => s.id === id))
    .filter((s): s is Skill => s != null);

  const unassigned = skills.filter(s => s.isActive && !member.skillIds.includes(s.id));
  const filteredUnassigned = unassigned.filter(s =>
    addSearch === "" || s.skillName.toLowerCase().includes(addSearch.toLowerCase())
  );

  function removeSkill(skillId: string) {
    onPatchSkills(member.id, member.skillIds.filter(s => s !== skillId));
  }
  function addSkill(skillId: string) {
    onPatchSkills(member.id, [...member.skillIds, skillId]);
    setAddOpen(false);
    setAddSearch("");
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
          {initials(member.displayName)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{member.displayName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${rt === "Team Lead" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
              {rt}
            </span>
            {member.hireDate && (
              <span className="text-xs text-gray-400">{fmtHireDate(member.hireDate)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
        {assignedSkills.map(s => (
          <span
            key={s.id}
            className={`inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor(s.skillCategory)}`}
          >
            {s.skillName}
            {canEdit && (
              <button
                onClick={() => removeSkill(s.id)}
                className="ml-0.5 hover:opacity-70 leading-none"
                title={`Remove ${s.skillName}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {assignedSkills.length === 0 && (
          <span className="text-xs text-gray-300 italic">No skills assigned</span>
        )}
      </div>

      {canEdit && (
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setAddOpen(o => !o)}
            className="text-xs text-forest-700 border border-forest-200 hover:bg-forest-50 px-2.5 py-1 rounded-full transition-colors font-medium"
          >
            + Add Skill
          </button>
          {addOpen && (
            <div className="absolute z-10 top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search skills..."
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredUnassigned.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-gray-400 text-center">No skills to add</div>
                ) : (
                  Object.entries(groupByCategory(filteredUnassigned)).map(([cat, catSkills]) => (
                    <div key={cat}>
                      <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase bg-gray-50 border-b border-gray-100">{cat}</div>
                      {catSkills.map(s => (
                        <button
                          key={s.id}
                          onClick={() => addSkill(s.id)}
                          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {s.skillName}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────
function TableView({
  members, skills, canEdit, selectedIds, onSelectChange, onOpenDrawer
}: {
  members: StaffMemberWithSkills[];
  skills: Skill[];
  canEdit: boolean;
  selectedIds: Set<string>;
  onSelectChange: (ids: Set<string>) => void;
  onOpenDrawer: (id: string) => void;
}) {
  const allSelected = members.length > 0 && members.every(m => selectedIds.has(m.id));

  function toggleAll() {
    if (allSelected) onSelectChange(new Set());
    else onSelectChange(new Set(members.map(m => m.id)));
  }
  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectChange(next);
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            {canEdit && (
              <th className="px-4 py-3 w-10">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-300 text-forest-600 focus:ring-forest-600/30" />
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Hire Date</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Skills</th>
            {canEdit && <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map(m => {
            const assignedSkills = m.skillIds.map(id => skills.find(s => s.id === id)).filter((s): s is Skill => s != null);
            const rt = m.roleType ?? "Staff";
            return (
              <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
                {canEdit && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleOne(m.id)}
                      className="rounded border-gray-300 text-forest-600 focus:ring-forest-600/30"
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{m.displayName}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rt === "Team Lead" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                    {rt}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{fmtHireDate(m.hireDate) ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {assignedSkills.slice(0, 4).map(s => (
                      <span key={s.id} className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${categoryColor(s.skillCategory)}`}>{s.skillName}</span>
                    ))}
                    {assignedSkills.length > 4 && (
                      <span className="text-xs text-gray-400">+{assignedSkills.length - 4} more</span>
                    )}
                    {assignedSkills.length === 0 && <span className="text-xs text-gray-300 italic">None</span>}
                  </div>
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onOpenDrawer(m.id)}
                      className="text-xs font-medium text-forest-700 border border-forest-200 hover:bg-forest-50 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      Manage Skills
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Skill Drawer ─────────────────────────────────────────────────────────────
function SkillDrawer({
  member, skills, onClose, onPatchSkills
}: {
  member: StaffMemberWithSkills;
  skills: Skill[];
  onClose: () => void;
  onPatchSkills: (id: string, skillIds: string[]) => Promise<void>;
}) {
  const [localSkillIds, setLocalSkillIds] = useState<string[]>(member.skillIds);
  const [saving, setSaving] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState("");

  const grouped = groupByCategory(skills.filter(s => s.isActive && (drawerSearch === "" || s.skillName.toLowerCase().includes(drawerSearch.toLowerCase()))));

  function toggle(skillId: string) {
    setLocalSkillIds(prev => prev.includes(skillId) ? prev.filter(s => s !== skillId) : [...prev, skillId]);
  }

  async function save() {
    setSaving(true);
    await onPatchSkills(member.id, localSkillIds);
    setSaving(false);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full z-50 w-80 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900">{member.displayName}</p>
            <p className="text-xs text-gray-400">Manage skills</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search skills..."
            value={drawerSearch}
            onChange={e => setDrawerSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-forest-600/30"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {Object.entries(grouped).map(([cat, catSkills]) => (
            <div key={cat} className="mb-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{cat}</p>
              {catSkills.map(s => (
                <label key={s.id} className="flex items-center gap-2.5 py-1.5 cursor-pointer hover:bg-gray-50 rounded px-1">
                  <input
                    type="checkbox"
                    checked={localSkillIds.includes(s.id)}
                    onChange={() => toggle(s.id)}
                    className="rounded border-gray-300 text-forest-600 focus:ring-forest-600/30"
                  />
                  <span className="text-sm text-gray-800">{s.skillName}</span>
                  {s.description && (
                    <span className="text-xs text-gray-400 truncate">{s.description}</span>
                  )}
                </label>
              ))}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No skills found</p>
          )}
        </div>
        <div className="px-4 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 bg-forest-600 hover:bg-forest-700 text-white py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Skeleton Table ───────────────────────────────────────────────────────────
function SkeletonTable() {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            {["Name", "Role", "Hire Date", "Skills", "Actions"].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...Array(5)].map((_, i) => (
            <tr key={i} className="border-t border-gray-100">
              {[...Array(5)].map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: j === 3 ? "70%" : "50%" }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
