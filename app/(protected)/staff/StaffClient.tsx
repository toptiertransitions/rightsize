"use client";

import { useState, useCallback, useId, useRef, useEffect } from "react";
import type { StaffMember, WeeklySchedule, TimeOffEntry, CrateLocation, InventoryContainer, InventoryItem, Subcontractor } from "@/lib/types";
import { DEFAULT_WEEKLY_SCHEDULE } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Day = typeof DAYS[number];
const TOTAL_CRATES = 310;

function fmt12(t: string) {
  if (!t) return "";
  const [hStr, m] = t.split(":");
  const h = parseInt(hStr, 10);
  return `${h % 12 || 12}:${m}${h < 12 ? "am" : "pm"}`;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d: string) {
  const [y, mo, day] = d.split("-").map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function uid() { return Math.random().toString(36).slice(2, 10); }

const ROLE_COLORS: Record<string, string> = {
  TTTAdmin: "bg-purple-100 text-purple-700",
  TTTManager: "bg-blue-100 text-blue-700",
  TTTStaff: "bg-gray-100 text-gray-700",
};
const ROLE_LABELS: Record<string, string> = { TTTAdmin: "Admin", TTTManager: "Manager", TTTStaff: "Staff" };

// ─── Staff sub-components ─────────────────────────────────────────────────────
function DayCell({ day, schedule }: { day: Day; schedule: WeeklySchedule }) {
  const d = schedule[day];
  if (!d.available) return <span className="text-[10px] text-gray-300 font-medium">Off</span>;
  return (
    <span className="text-[10px] text-forest-700 font-medium leading-tight whitespace-nowrap">
      {fmt12(d.start)}<br />{fmt12(d.end)}
    </span>
  );
}

function TimeOffPills({ entries }: { entries: TimeOffEntry[] }) {
  const today = todayStr();
  const upcoming = entries.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  if (!upcoming.length) return <span className="text-xs text-gray-300">None scheduled</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {upcoming.map(e => (
        <span key={e.id} className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium"
          title={e.allDay ? "All day" : `${fmt12(e.startTime ?? "")}–${fmt12(e.endTime ?? "")}`}>
          {fmtDate(e.date)}
          {!e.allDay && <span className="opacity-70 ml-0.5">{fmt12(e.startTime ?? "")}</span>}
        </span>
      ))}
    </div>
  );
}

function MemberCard({ member }: { member: StaffMember }) {
  const schedule = member.weeklySchedule ?? DEFAULT_WEEKLY_SCHEDULE;
  const timeOff = member.timeOff ?? [];
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-forest-100 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-forest-700">{(member.displayName || member.email).charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{member.displayName || member.email}</p>
            <p className="text-xs text-gray-400 truncate">{member.email}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role] ?? "bg-gray-100 text-gray-600"}`}>
          {ROLE_LABELS[member.role] ?? member.role}
        </span>
      </div>
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Weekly Schedule</p>
        {member.weeklySchedule ? (
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map(day => (
              <div key={day} className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-semibold text-gray-400 uppercase">{day}</span>
                <div className="text-center min-h-[30px] flex items-center justify-center">
                  <DayCell day={day} schedule={schedule} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">Not set — ask them to update via their home page.</p>
        )}
      </div>
      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Upcoming Time Off</p>
        <TimeOffPills entries={timeOff} />
      </div>
    </div>
  );
}

// ─── Crate Tracker Modal ──────────────────────────────────────────────────────
interface CrateModalProps {
  locations: CrateLocation[];
  tenants: { id: string; name: string }[];
  onClose: () => void;
  onChange: (locations: CrateLocation[]) => void;
}

function CrateTrackerModal({ locations, tenants, onClose, onChange }: CrateModalProps) {
  const [locs, setLocs] = useState<CrateLocation[]>(locations);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [addMode, setAddMode] = useState<"storage" | "project" | null>(null);
  const [newName, setNewName] = useState("");
  const [newTenantId, setNewTenantId] = useState("");
  const [newCount, setNewCount] = useState("0");
  const [error, setError] = useState("");

  const total = locs.reduce((s, l) => s + l.crateCount, 0);
  const storageLocs = locs.filter(l => l.type === "Storage");
  const projectLocs = locs.filter(l => l.type === "Project");

  async function updateCount(id: string, delta: number, exact?: number) {
    const loc = locs.find(l => l.id === id);
    if (!loc) return;
    const newCount = exact !== undefined ? Math.max(0, exact) : Math.max(0, loc.crateCount + delta);
    setSaving(id);
    try {
      const res = await fetch("/api/supply/crates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, crateCount: newCount }),
      });
      if (!res.ok) throw new Error();
      const { location } = await res.json();
      const updated = locs.map(l => l.id === id ? location : l);
      setLocs(updated);
      onChange(updated);
    } catch { setError("Failed to update"); }
    finally { setSaving(null); }
  }

  async function saveName(id: string) {
    if (!editName.trim()) { setEditingId(null); return; }
    setSaving(id);
    try {
      const res = await fetch("/api/supply/crates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: editName.trim() }),
      });
      if (!res.ok) throw new Error();
      const { location } = await res.json();
      const updated = locs.map(l => l.id === id ? location : l);
      setLocs(updated);
      onChange(updated);
      setEditingId(null);
    } catch { setError("Failed to rename"); }
    finally { setSaving(null); }
  }

  async function deleteLocation(id: string) {
    if (!confirm("Remove this location?")) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/supply/crates?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const updated = locs.filter(l => l.id !== id);
      setLocs(updated);
      onChange(updated);
    } catch { setError("Failed to delete"); }
    finally { setSaving(null); }
  }

  async function addLocation() {
    if (addMode === "storage" && !newName.trim()) return;
    if (addMode === "project" && !newTenantId) return;
    setSaving("new");
    try {
      const name = addMode === "project"
        ? (tenants.find(t => t.id === newTenantId)?.name ?? "Project")
        : newName.trim();
      const res = await fetch("/api/supply/crates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: addMode === "project" ? "Project" : "Storage",
          crateCount: Math.max(0, parseInt(newCount) || 0),
          ...(addMode === "project" ? { tenantId: newTenantId } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      const { location } = await res.json();
      const updated = [...locs, location].sort((a, b) => a.name.localeCompare(b.name));
      setLocs(updated);
      onChange(updated);
      setAddMode(null);
      setNewName(""); setNewTenantId(""); setNewCount("0");
    } catch { setError("Failed to add"); }
    finally { setSaving(null); }
  }

  const totalOk = total === TOTAL_CRATES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Crate Tracker</h2>
            <p className="text-xs text-gray-400 mt-0.5">Track where all {TOTAL_CRATES} crates are located</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold ${totalOk ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${totalOk ? "bg-emerald-500" : "bg-red-500"}`} />
              {total} / {TOTAL_CRATES}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Storage Locations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Storage Locations</h3>
              <button onClick={() => { setAddMode("storage"); setNewName(""); setNewCount("0"); }}
                className="text-xs text-forest-600 hover:text-forest-700 font-medium">
                + Add Location
              </button>
            </div>
            {addMode === "storage" && (
              <div className="flex items-center gap-2 mb-2 p-3 bg-forest-50 rounded-xl border border-forest-100">
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Location name"
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400" />
                <input type="number" min="0" value={newCount} onChange={e => setNewCount(e.target.value)}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-forest-400" />
                <span className="text-xs text-gray-400">crates</span>
                <button onClick={addLocation} disabled={saving === "new" || !newName.trim()}
                  className="px-3 py-1.5 bg-forest-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 hover:bg-forest-700">
                  {saving === "new" ? "…" : "Add"}
                </button>
                <button onClick={() => setAddMode(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>
            )}
            <div className="space-y-1.5">
              {storageLocs.length === 0 && <p className="text-xs text-gray-400 italic">No storage locations yet.</p>}
              {storageLocs.map(loc => (
                <LocationRow key={loc.id} loc={loc} saving={saving} editingId={editingId} editName={editName}
                  onEditStart={() => { setEditingId(loc.id); setEditName(loc.name); }}
                  onEditChange={setEditName}
                  onEditSave={() => saveName(loc.id)}
                  onEditCancel={() => setEditingId(null)}
                  onCountChange={(delta, exact) => updateCount(loc.id, delta, exact)}
                  onDelete={() => deleteLocation(loc.id)} />
              ))}
            </div>
          </div>

          {/* Project Locations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Projects</h3>
              <button onClick={() => { setAddMode("project"); setNewTenantId(""); setNewCount("0"); }}
                className="text-xs text-forest-600 hover:text-forest-700 font-medium">
                + Assign Project
              </button>
            </div>
            {addMode === "project" && (
              <div className="flex items-center gap-2 mb-2 p-3 bg-forest-50 rounded-xl border border-forest-100">
                <select autoFocus value={newTenantId} onChange={e => setNewTenantId(e.target.value)}
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-forest-400">
                  <option value="">Select project…</option>
                  {tenants.filter(t => !projectLocs.some(l => l.tenantId === t.id)).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <input type="number" min="0" value={newCount} onChange={e => setNewCount(e.target.value)}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-forest-400" />
                <span className="text-xs text-gray-400">crates</span>
                <button onClick={addLocation} disabled={saving === "new" || !newTenantId}
                  className="px-3 py-1.5 bg-forest-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 hover:bg-forest-700">
                  {saving === "new" ? "…" : "Add"}
                </button>
                <button onClick={() => setAddMode(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>
            )}
            <div className="space-y-1.5">
              {projectLocs.length === 0 && <p className="text-xs text-gray-400 italic">No crates assigned to projects.</p>}
              {projectLocs.map(loc => (
                <LocationRow key={loc.id} loc={loc} saving={saving} editingId={editingId} editName={editName}
                  onEditStart={() => { setEditingId(loc.id); setEditName(loc.name); }}
                  onEditChange={setEditName}
                  onEditSave={() => saveName(loc.id)}
                  onEditCancel={() => setEditingId(null)}
                  onCountChange={(delta, exact) => updateCount(loc.id, delta, exact)}
                  onDelete={() => deleteLocation(loc.id)} />
              ))}
            </div>
          </div>
        </div>

        {!totalOk && (
          <div className="px-6 py-3 border-t border-red-100 bg-red-50">
            <p className="text-xs text-red-600 font-medium">
              {total < TOTAL_CRATES
                ? `${TOTAL_CRATES - total} crates unaccounted for — total should equal ${TOTAL_CRATES}.`
                : `${total - TOTAL_CRATES} crates over the total of ${TOTAL_CRATES} — check your counts.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Location Row ─────────────────────────────────────────────────────────────
interface LocationRowProps {
  loc: CrateLocation;
  saving: string | null;
  editingId: string | null;
  editName: string;
  onEditStart: () => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onCountChange: (delta: number, exact?: number) => void;
  onDelete: () => void;
}

function LocationRow({ loc, saving, editingId, editName, onEditStart, onEditChange, onEditSave, onEditCancel, onCountChange, onDelete }: LocationRowProps) {
  const isEditing = editingId === loc.id;
  const isSaving = saving === loc.id;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100 group">
      {/* Name */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={editName} onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") onEditSave(); if (e.key === "Escape") onEditCancel(); }}
              className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400" />
            <button onClick={onEditSave} className="text-xs text-forest-600 font-medium px-1.5">Save</button>
            <button onClick={onEditCancel} className="text-xs text-gray-400 px-1">✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 truncate">{loc.name}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${loc.type === "Storage" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
              {loc.type === "Storage" ? "Storage" : "Project"}
            </span>
          </div>
        )}
      </div>

      {/* Count controls */}
      {!isEditing && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onCountChange(-1)} disabled={isSaving || loc.crateCount === 0}
            className="w-6 h-6 rounded-md bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 disabled:opacity-30 flex items-center justify-center text-sm font-medium transition-colors">
            −
          </button>
          <input
            type="number" min="0" value={loc.crateCount}
            onChange={e => onCountChange(0, parseInt(e.target.value) || 0)}
            disabled={isSaving}
            className="w-12 text-center border border-gray-200 rounded-lg px-1 py-0.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-forest-400 bg-white"
          />
          <button onClick={() => onCountChange(1)} disabled={isSaving}
            className="w-6 h-6 rounded-md bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 disabled:opacity-30 flex items-center justify-center text-sm font-medium transition-colors">
            +
          </button>
          {isSaving && <span className="text-xs text-gray-400 ml-1">…</span>}
        </div>
      )}

      {/* Actions */}
      {!isEditing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onEditStart} className="text-xs text-gray-400 hover:text-forest-600 font-medium px-1 transition-colors">
            Edit
          </button>
          <button onClick={onDelete} className="text-xs text-gray-300 hover:text-red-500 font-medium px-1 transition-colors">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Inventory Modal ──────────────────────────────────────────────────────────
interface InventoryModalProps {
  containers: InventoryContainer[];
  onClose: () => void;
  onChange: (containers: InventoryContainer[]) => void;
}

function InventoryModal({ containers: initialContainers, onClose, onChange }: InventoryModalProps) {
  const [containers, setContainers] = useState<InventoryContainer[]>(initialContainers);
  const [activeContainerId, setActiveContainerId] = useState<string>(initialContainers[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemUnit, setEditItemUnit] = useState("");
  const [addingContainer, setAddingContainer] = useState(false);
  const [newContainerName, setNewContainerName] = useState("");
  const [error, setError] = useState("");

  const active = containers.find(c => c.id === activeContainerId) ?? containers[0];
  const hqContainers = containers.filter(c => c.containerType === "HQ");
  const kitContainers = containers.filter(c => c.containerType === "Kit");

  async function saveItems(containerId: string, items: InventoryItem[]) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/supply/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: containerId, items }),
      });
      if (!res.ok) throw new Error();
      const { container } = await res.json();
      const updated = containers.map(c => c.id === containerId ? container : c);
      setContainers(updated);
      onChange(updated);
    } catch { setError("Failed to save"); }
    finally { setSaving(false); }
  }

  function addItem() {
    if (!newItemName.trim() || !active) return;
    const items: InventoryItem[] = [
      ...active.items,
      { id: uid(), name: newItemName.trim(), quantity: Math.max(1, parseInt(newItemQty) || 1), unit: newItemUnit.trim() || undefined },
    ];
    saveItems(active.id, items);
    setNewItemName(""); setNewItemQty("1"); setNewItemUnit(""); setAddingItem(false);
  }

  function updateItemQty(itemId: string, delta: number, exact?: number) {
    if (!active) return;
    const items = active.items.map(it => {
      if (it.id !== itemId) return it;
      const q = exact !== undefined ? Math.max(0, exact) : Math.max(0, it.quantity + delta);
      return { ...it, quantity: q };
    });
    saveItems(active.id, items);
  }

  function saveItemName(itemId: string) {
    if (!active || !editItemName.trim()) { setEditingItemId(null); return; }
    const items = active.items.map(it =>
      it.id === itemId ? { ...it, name: editItemName.trim(), unit: editItemUnit.trim() || undefined } : it
    );
    saveItems(active.id, items);
    setEditingItemId(null);
  }

  function deleteItem(itemId: string) {
    if (!active || !confirm("Remove this item?")) return;
    const items = active.items.filter(it => it.id !== itemId);
    saveItems(active.id, items);
  }

  async function addContainer() {
    if (!newContainerName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/supply/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newContainerName.trim(), containerType: "Kit" }),
      });
      if (!res.ok) throw new Error();
      const { container } = await res.json();
      const updated = [...containers, container];
      setContainers(updated);
      onChange(updated);
      setActiveContainerId(container.id);
      setNewContainerName(""); setAddingContainer(false);
    } catch { setError("Failed to create kit"); }
    finally { setSaving(false); }
  }

  async function deleteContainer(id: string) {
    if (!confirm("Delete this kit and all its items?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/supply/inventory?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const updated = containers.filter(c => c.id !== id);
      setContainers(updated);
      onChange(updated);
      if (activeContainerId === id) setActiveContainerId(updated[0]?.id ?? "");
    } catch { setError("Failed to delete kit"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Inventory</h2>
            <p className="text-xs text-gray-400 mt-0.5">Manage HQ stock and project kits</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Container tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 pb-0 overflow-x-auto">
          {/* HQ section */}
          {hqContainers.map(c => (
            <button key={c.id} onClick={() => setActiveContainerId(c.id)}
              className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${activeContainerId === c.id ? "text-forest-700 border-forest-600 bg-forest-50" : "text-gray-500 border-transparent hover:text-gray-700"}`}>
              {c.name}
            </button>
          ))}
          {hqContainers.length > 0 && kitContainers.length > 0 && (
            <div className="w-px h-4 bg-gray-200 mx-1 self-center" />
          )}
          {/* Kit section */}
          {kitContainers.map(c => (
            <button key={c.id} onClick={() => setActiveContainerId(c.id)}
              className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${activeContainerId === c.id ? "text-forest-700 border-forest-600 bg-forest-50" : "text-gray-500 border-transparent hover:text-gray-700"}`}>
              {c.name}
            </button>
          ))}
          {addingContainer ? (
            <div className="flex items-center gap-1.5 ml-1">
              <input autoFocus value={newContainerName} onChange={e => setNewContainerName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addContainer(); if (e.key === "Escape") setAddingContainer(false); }}
                placeholder="Kit name" className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-forest-400" />
              <button onClick={addContainer} disabled={saving}
                className="text-xs text-forest-600 font-medium hover:text-forest-700 disabled:opacity-50">Save</button>
              <button onClick={() => setAddingContainer(false)} className="text-xs text-gray-400">✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingContainer(true)}
              className="ml-1 px-2 py-1.5 text-xs text-gray-400 hover:text-forest-600 transition-colors whitespace-nowrap">
              + New Kit
            </button>
          )}
        </div>
        <div className="h-px bg-gray-100 mx-6" />

        {/* Items list */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>}

          {!active ? (
            <p className="text-sm text-gray-400 text-center py-8">No containers found.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{active.items.length} item{active.items.length !== 1 ? "s" : ""}</span>
                  {saving && <span className="text-xs text-gray-400">Saving…</span>}
                </div>
                <div className="flex items-center gap-3">
                  {active.containerType === "Kit" && (
                    <button onClick={() => deleteContainer(active.id)}
                      className="text-xs text-gray-300 hover:text-red-500 transition-colors">
                      Delete Kit
                    </button>
                  )}
                  <button onClick={() => { setAddingItem(true); setNewItemName(""); setNewItemQty("1"); setNewItemUnit(""); }}
                    className="text-xs text-forest-600 hover:text-forest-700 font-medium">
                    + Add Item
                  </button>
                </div>
              </div>

              {addingItem && (
                <div className="flex items-center gap-2 mb-3 p-3 bg-forest-50 rounded-xl border border-forest-100">
                  <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAddingItem(false); }}
                    placeholder="Item name" className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400" />
                  <input type="number" min="1" value={newItemQty} onChange={e => setNewItemQty(e.target.value)}
                    className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-forest-400" />
                  <input value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)}
                    placeholder="unit" className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400" />
                  <button onClick={addItem} disabled={!newItemName.trim()}
                    className="px-3 py-1.5 bg-forest-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 hover:bg-forest-700">
                    Add
                  </button>
                  <button onClick={() => setAddingItem(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                </div>
              )}

              {active.items.length === 0 && !addingItem ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">No items yet.</p>
                  <button onClick={() => setAddingItem(true)} className="mt-2 text-xs text-forest-600 hover:text-forest-700 font-medium">
                    + Add your first item
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {active.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100 group">
                      {editingItemId === item.id ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input autoFocus value={editItemName} onChange={e => setEditItemName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveItemName(item.id); if (e.key === "Escape") setEditingItemId(null); }}
                            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400" />
                          <input value={editItemUnit} onChange={e => setEditItemUnit(e.target.value)}
                            placeholder="unit" className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400" />
                          <button onClick={() => saveItemName(item.id)} className="text-xs text-forest-600 font-medium px-1.5">Save</button>
                          <button onClick={() => setEditingItemId(null)} className="text-xs text-gray-400 px-1">✕</button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-800">{item.name}</span>
                            {item.unit && <span className="text-xs text-gray-400 ml-1">({item.unit})</span>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => updateItemQty(item.id, -1)} disabled={saving || item.quantity === 0}
                              className="w-6 h-6 rounded-md bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 disabled:opacity-30 flex items-center justify-center text-sm font-medium transition-colors">
                              −
                            </button>
                            <input type="number" min="0" value={item.quantity}
                              onChange={e => updateItemQty(item.id, 0, parseInt(e.target.value) || 0)}
                              disabled={saving}
                              className="w-12 text-center border border-gray-200 rounded-lg px-1 py-0.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-forest-400 bg-white" />
                            <button onClick={() => updateItemQty(item.id, 1)} disabled={saving}
                              className="w-6 h-6 rounded-md bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 disabled:opacity-30 flex items-center justify-center text-sm font-medium transition-colors">
                              +
                            </button>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => { setEditingItemId(item.id); setEditItemName(item.name); setEditItemUnit(item.unit ?? ""); }}
                              className="text-xs text-gray-400 hover:text-forest-600 font-medium px-1 transition-colors">
                              Edit
                            </button>
                            <button onClick={() => deleteItem(item.id)}
                              className="text-xs text-gray-300 hover:text-red-500 font-medium px-1 transition-colors">
                              ✕
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Supply Tracking Tab ──────────────────────────────────────────────────────
interface SupplyProps {
  crateLocations: CrateLocation[];
  inventoryContainers: InventoryContainer[];
  tenants: { id: string; name: string }[];
}

function SupplyTrackingTab({ crateLocations: initialCrates, inventoryContainers: initialInventory, tenants }: SupplyProps) {
  const [crateLocations, setCrateLocations] = useState(initialCrates);
  const [inventoryContainers, setInventoryContainers] = useState(initialInventory);
  const [showCrates, setShowCrates] = useState(false);
  const [showInventory, setShowInventory] = useState(false);

  const totalCrates = crateLocations.reduce((s, l) => s + l.crateCount, 0);
  const totalItems = inventoryContainers.reduce((s, c) => s + c.items.reduce((ss, i) => ss + i.quantity, 0), 0);
  const cratesOk = totalCrates === TOTAL_CRATES;

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* Crates card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Crates</p>
              <div className="flex items-end gap-2">
                <span className={`text-3xl font-bold ${cratesOk ? "text-gray-900" : "text-red-600"}`}>{totalCrates}</span>
                <span className="text-sm text-gray-400 mb-0.5">/ {TOTAL_CRATES}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{crateLocations.length} location{crateLocations.length !== 1 ? "s" : ""}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cratesOk ? "bg-blue-50" : "bg-red-50"}`}>
              <svg className={`w-5 h-5 ${cratesOk ? "text-blue-500" : "text-red-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
          </div>
          {/* Mini location list */}
          {crateLocations.length > 0 && (
            <div className="space-y-1 mb-4">
              {crateLocations.slice(0, 4).map(l => (
                <div key={l.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 truncate pr-2">{l.name}</span>
                  <span className="font-semibold text-gray-700 shrink-0">{l.crateCount}</span>
                </div>
              ))}
              {crateLocations.length > 4 && (
                <p className="text-xs text-gray-400">+{crateLocations.length - 4} more</p>
              )}
            </div>
          )}
          <button onClick={() => setShowCrates(true)}
            className="w-full py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-800 transition-colors">
            Manage Crates
          </button>
        </div>

        {/* Inventory card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Inventory</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-gray-900">{totalItems}</span>
                <span className="text-sm text-gray-400 mb-0.5">items</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{inventoryContainers.length} container{inventoryContainers.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
          {/* Mini container list */}
          {inventoryContainers.length > 0 && (
            <div className="space-y-1 mb-4">
              {inventoryContainers.slice(0, 4).map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0 pr-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${c.containerType === "HQ" ? "bg-purple-50 text-purple-600" : "bg-amber-50 text-amber-600"}`}>
                      {c.containerType}
                    </span>
                    <span className="text-gray-500 truncate">{c.name}</span>
                  </div>
                  <span className="font-semibold text-gray-700 shrink-0">{c.items.reduce((s, i) => s + i.quantity, 0)}</span>
                </div>
              ))}
              {inventoryContainers.length > 4 && (
                <p className="text-xs text-gray-400">+{inventoryContainers.length - 4} more</p>
              )}
            </div>
          )}
          <button onClick={() => setShowInventory(true)}
            className="w-full py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-gray-800 transition-colors">
            Manage Inventory
          </button>
        </div>
      </div>

      {showCrates && (
        <CrateTrackerModal
          locations={crateLocations}
          tenants={tenants}
          onClose={() => setShowCrates(false)}
          onChange={setCrateLocations}
        />
      )}
      {showInventory && (
        <InventoryModal
          containers={inventoryContainers}
          onClose={() => setShowInventory(false)}
          onChange={setInventoryContainers}
        />
      )}
    </div>
  );
}

// ─── Subcontractor Tab ────────────────────────────────────────────────────────
const SUB_PAGE_SIZE = 20;

function SubProjectAutosearch({
  value,
  onChange,
  tenants,
  placeholder = "Search projects…",
}: {
  value: string;
  onChange: (tenantId: string, tenantName: string) => void;
  tenants: { id: string; name: string }[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const matches = query.trim()
    ? tenants.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : tenants.slice(0, 8);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-forest-500"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange("", "");
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          <li>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
              onMouseDown={() => { onChange("", ""); setQuery(""); setOpen(false); }}
            >
              — No project —
            </button>
          </li>
          {matches.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                onMouseDown={() => { onChange(t.id, t.name); setQuery(t.name); setOpen(false); }}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubEditRow({
  sub,
  tenants,
  onSave,
  onCancel,
}: {
  sub: Subcontractor;
  tenants: { id: string; name: string }[];
  onSave: (data: Partial<Subcontractor>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(sub.name);
  const [charges, setCharges] = useState(String(sub.charges));
  const [scope, setScope] = useState(sub.scope);
  const [paid, setPaid] = useState(sub.paid);
  const [paidDate, setPaidDate] = useState(sub.paidDate ?? "");
  const [tenantId, setTenantId] = useState(sub.tenantId ?? "");
  const [tenantName, setTenantName] = useState(sub.tenantName ?? "");
  const [saving, setSaving] = useState(false);

  function handlePaidToggle(val: boolean) {
    setPaid(val);
    if (val && !paidDate) setPaidDate(new Date().toISOString().split("T")[0]);
    if (!val) setPaidDate("");
  }

  async function handleSave() {
    setSaving(true);
    await onSave({ name, charges: Number(charges) || 0, scope, paid, paidDate: paidDate || undefined, tenantId: tenantId || undefined, tenantName: tenantName || undefined });
    setSaving(false);
  }

  const inputCls = "w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-forest-500";

  return (
    <tr className="bg-forest-50/40">
      <td className="px-4 py-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </td>
      <td className="px-4 py-2">
        <SubProjectAutosearch value={tenantName} onChange={(id, n) => { setTenantId(id); setTenantName(n); }} tenants={tenants} />
      </td>
      <td className="px-4 py-2">
        <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Scope of work…" className={inputCls} />
      </td>
      <td className="px-4 py-2">
        <input type="number" min={0} step="0.01" value={charges} onChange={(e) => setCharges(e.target.value)} className="w-28 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-forest-500" />
      </td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={paid} onChange={(e) => handlePaidToggle(e.target.checked)} className="w-4 h-4 accent-forest-500 cursor-pointer" />
      </td>
      <td className="px-4 py-2">
        <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} disabled={!paid} className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 disabled:opacity-40 focus:outline-none focus:border-forest-500" />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving || !name} className="px-3 py-1 bg-forest-600 hover:bg-forest-500 text-white text-xs rounded-lg disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onCancel} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

const SUB_EMPTY_FORM = { name: "", charges: "", scope: "", paid: false, paidDate: "", tenantId: "", tenantName: "" };
type SubFormState = typeof SUB_EMPTY_FORM;

function SubAddRow({ tenants, onAdd, onCancel }: { tenants: { id: string; name: string }[]; onAdd: (data: SubFormState) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<SubFormState>(SUB_EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function handlePaidToggle(val: boolean) {
    setForm((f) => ({ ...f, paid: val, paidDate: val && !f.paidDate ? new Date().toISOString().split("T")[0] : val ? f.paidDate : "" }));
  }

  async function handleSave() {
    if (!form.name) return;
    setSaving(true);
    await onAdd(form);
    setSaving(false);
  }

  const inputCls = "w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-forest-500";

  return (
    <tr className="bg-forest-50/60 border-t border-forest-200/50">
      <td className="px-4 py-2">
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Subcontractor name…" className={inputCls} autoFocus />
      </td>
      <td className="px-4 py-2">
        <SubProjectAutosearch value={form.tenantName} onChange={(id, n) => setForm((f) => ({ ...f, tenantId: id, tenantName: n }))} tenants={tenants} />
      </td>
      <td className="px-4 py-2">
        <input value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} placeholder="Scope of work…" className={inputCls} />
      </td>
      <td className="px-4 py-2">
        <input type="number" min={0} step="0.01" value={form.charges} onChange={(e) => setForm((f) => ({ ...f, charges: e.target.value }))} placeholder="0.00" className="w-28 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-forest-500" />
      </td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={form.paid} onChange={(e) => handlePaidToggle(e.target.checked)} className="w-4 h-4 accent-forest-500 cursor-pointer" />
      </td>
      <td className="px-4 py-2">
        <input type="date" value={form.paidDate} onChange={(e) => setForm((f) => ({ ...f, paidDate: e.target.value }))} disabled={!form.paid} className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 disabled:opacity-40 focus:outline-none focus:border-forest-500" />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving || !form.name} className="px-3 py-1 bg-forest-600 hover:bg-forest-500 text-white text-xs rounded-lg disabled:opacity-50 transition-colors">
            {saving ? "Adding…" : "Add"}
          </button>
          <button onClick={onCancel} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

function SubcontractorTab({ initialSubs, tenants }: { initialSubs: Subcontractor[]; tenants: { id: string; name: string }[] }) {
  const [subs, setSubs] = useState<Subcontractor[]>(initialSubs);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalUnpaid = subs.filter((s) => !s.paid).reduce((sum, s) => sum + s.charges, 0);
  const totalAll = subs.reduce((sum, s) => sum + s.charges, 0);
  const totalPages = Math.ceil(subs.length / SUB_PAGE_SIZE);
  const paginated = subs.slice((page - 1) * SUB_PAGE_SIZE, page * SUB_PAGE_SIZE);

  async function handleAdd(form: SubFormState) {
    setError(null);
    try {
      const res = await fetch("/api/subcontractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, charges: Number(form.charges) || 0, scope: form.scope, paid: form.paid, paidDate: form.paidDate || undefined, tenantId: form.tenantId || undefined, tenantName: form.tenantName || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { subcontractor } = await res.json();
      setSubs((prev) => [subcontractor, ...prev]);
      setShowAdd(false);
      setPage(1);
    } catch (e) {
      setError("Failed to add subcontractor.");
      console.error(e);
    }
  }

  async function handleSave(id: string, data: Partial<Subcontractor>) {
    setError(null);
    try {
      const res = await fetch("/api/subcontractors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { subcontractor } = await res.json();
      setSubs((prev) => prev.map((s) => (s.id === id ? subcontractor : s)));
      setEditingId(null);
    } catch (e) {
      setError("Failed to save changes.");
      console.error(e);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this subcontractor entry?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/subcontractors?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setSubs((prev) => prev.filter((s) => s.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (e) {
      setError("Failed to delete.");
      console.error(e);
    }
  }

  async function handlePaidToggle(sub: Subcontractor) {
    const newPaid = !sub.paid;
    const newPaidDate = newPaid ? new Date().toISOString().split("T")[0] : undefined;
    await handleSave(sub.id, { paid: newPaid, paidDate: newPaidDate });
  }

  return (
    <div>
      {/* Header + Add button */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-500">Track subcontractor work, charges, and payment status across projects.</p>
        </div>
        {!showAdd && (
          <button
            onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-forest-600 hover:bg-forest-500 text-white text-sm rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Subcontractor
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Total Entries</p>
          <p className="text-xl font-bold text-gray-900">{subs.length}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Total Charges</p>
          <p className="text-xl font-bold text-gray-900">${totalAll.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-600 mb-1">Unpaid Balance</p>
          <p className="text-xl font-bold text-amber-700">${totalUnpaid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-[18%]">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-[20%]">Project</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-[28%]">Scope</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-[12%]">Charges</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 w-[8%]">Paid</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-[10%]">Paid Date</th>
                <th className="px-4 py-3 w-[4%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {showAdd && (
                <SubAddRow tenants={tenants} onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
              )}
              {paginated.length === 0 && !showAdd && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    No subcontractors yet. Click &ldquo;Add Subcontractor&rdquo; to get started.
                  </td>
                </tr>
              )}
              {paginated.map((sub) =>
                editingId === sub.id ? (
                  <SubEditRow key={sub.id} sub={sub} tenants={tenants} onSave={(data) => handleSave(sub.id, data)} onCancel={() => setEditingId(null)} />
                ) : (
                  <tr key={sub.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3 text-gray-900 font-medium">{sub.name}</td>
                    <td className="px-4 py-3">
                      {sub.tenantName ? (
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-forest-50 text-forest-700 border border-forest-200">
                          {sub.tenantName}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs leading-relaxed max-w-xs truncate" title={sub.scope}>
                      {sub.scope || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-900 tabular-nums">
                      ${sub.charges.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handlePaidToggle(sub)}
                        className={`w-8 h-4 rounded-full transition-colors relative ${sub.paid ? "bg-forest-500" : "bg-gray-300"}`}
                        title={sub.paid ? "Mark unpaid" : "Mark paid"}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${sub.paid ? "left-4" : "left-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs tabular-nums whitespace-nowrap">
                      {sub.paidDate ? fmtDate(sub.paidDate) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingId(sub.id); setShowAdd(false); }}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(sub.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
            <span className="tabular-nums">
              Showing {(page - 1) * SUB_PAGE_SIZE + 1}–{Math.min(page * SUB_PAGE_SIZE, subs.length)} of {subs.length}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2.5 py-1 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">‹ Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2.5 py-1 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  members: StaffMember[];
  crateLocations: CrateLocation[];
  inventoryContainers: InventoryContainer[];
  tenants: { id: string; name: string }[];
  subcontractors: Subcontractor[];
}

export function StaffClient({ members, crateLocations, inventoryContainers, tenants, subcontractors }: Props) {
  const [activeTab, setActiveTab] = useState<"availability" | "supply" | "subcontractors">("availability");
  const today = todayStr();
  const totalOut = members.filter(m => (m.timeOff ?? []).some(e => e.date === today)).length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ops</h1>
        <p className="text-gray-500 mt-1 text-sm">Staff availability, crate tracking, and inventory management.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-8">
        {([
          { key: "availability", label: "Staff Availability" },
          { key: "supply", label: "Supply Tracking" },
          { key: "subcontractors", label: "Subcontractor Management" },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? "border-forest-600 text-forest-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Staff Availability Tab */}
      {activeTab === "availability" && (
        <div>
          <div className="mb-6">
            <p className="text-sm text-gray-500">
              {members.length} active staff member{members.length !== 1 ? "s" : ""}.
              {totalOut > 0 && <span className="ml-2 text-amber-600 font-medium">{totalOut} out today.</span>}
            </p>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">No active staff members found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {members.map(m => <MemberCard key={m.id} member={m} />)}
            </div>
          )}
          <div className="mt-10 pt-6 border-t border-gray-100 flex items-center gap-6 text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-forest-500 inline-block" />
              Available hours
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              Time off
            </div>
            <p className="ml-auto italic">Staff update their own availability from the Home page.</p>
          </div>
        </div>
      )}

      {/* Supply Tracking Tab */}
      {activeTab === "supply" && (
        <SupplyTrackingTab
          crateLocations={crateLocations}
          inventoryContainers={inventoryContainers}
          tenants={tenants}
        />
      )}

      {/* Subcontractor Management Tab */}
      {activeTab === "subcontractors" && (
        <SubcontractorTab initialSubs={subcontractors} tenants={tenants} />
      )}
    </div>
  );
}
