"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Tenant } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface Props {
  initialTenants: Tenant[];
  isManager?: boolean;
  isAdmin?: boolean;
}

function HouseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

type SortField = "name" | "location" | "createdAt";
type SortDir = "asc" | "desc";
type ViewMode = "cards" | "table";

export function AdminProjectsClient({ initialTenants, isManager, isAdmin }: Props) {
  const [tenants, setTenants] = useState(initialTenants);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [togglingTTT, setTogglingTTT] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedFilter, setArchivedFilter] = useState("");
  const [archivedSortField, setArchivedSortField] = useState<SortField>("name");
  const [archivedSortDir, setArchivedSortDir] = useState<SortDir>("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [showConsignment, setShowConsignment] = useState(false);
  const [togglingConsignment, setTogglingConsignment] = useState<string | null>(null);
  const [consignmentFilter, setConsignmentFilter] = useState("");
  const [consignmentSortField, setConsignmentSortField] = useState<SortField>("name");
  const [consignmentSortDir, setConsignmentSortDir] = useState<SortDir>("asc");
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  function requestConfirm(message: string, onConfirm: () => void) {
    setPendingConfirm({ message, onConfirm });
  }

  // Location inline editing
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editZip, setEditZip] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  // Active projects view state
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [activeSearch, setActiveSearch] = useState("");
  const [activeSortField, setActiveSortField] = useState<SortField>("name");
  const [activeSortDir, setActiveSortDir] = useState<SortDir>("asc");

  const activeTenants = useMemo(() => {
    const filtered = tenants.filter(t => !t.isArchived && !(t.isConsignmentOnly ?? false)).filter(t => {
      if (!activeSearch) return true;
      const q = activeSearch.toLowerCase();
      const loc = [t.city, t.state].filter(Boolean).join(", ").toLowerCase();
      return t.name.toLowerCase().includes(q) || loc.includes(q) || (t.address ?? "").toLowerCase().includes(q);
    });
    return filtered.sort((a, b) => {
      const d = activeSortDir === "asc" ? 1 : -1;
      if (activeSortField === "name") return d * a.name.localeCompare(b.name);
      if (activeSortField === "location") {
        const av = [a.city, a.state].filter(Boolean).join(", ");
        const bv = [b.city, b.state].filter(Boolean).join(", ");
        return d * av.localeCompare(bv);
      }
      if (activeSortField === "createdAt") {
        return d * (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      }
      return 0;
    });
  }, [tenants, activeSearch, activeSortField, activeSortDir]);

  const sortedArchivedTenants = useMemo(() => {
    const filtered = tenants.filter(t => t.isArchived).filter(t => {
      if (!archivedFilter) return true;
      const q = archivedFilter.toLowerCase();
      const loc = [t.city, t.state].filter(Boolean).join(", ").toLowerCase();
      return t.name.toLowerCase().includes(q) || loc.includes(q);
    });
    return filtered.sort((a, b) => {
      let av = "", bv = "";
      if (archivedSortField === "name") { av = a.name; bv = b.name; }
      else if (archivedSortField === "location") {
        av = [a.city, a.state].filter(Boolean).join(", ");
        bv = [b.city, b.state].filter(Boolean).join(", ");
      } else if (archivedSortField === "createdAt") { av = a.createdAt ?? ""; bv = b.createdAt ?? ""; }
      return archivedSortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [tenants, archivedFilter, archivedSortField, archivedSortDir]);

  const sortedConsignmentTenants = useMemo(() => {
    const filtered = tenants.filter(t => !t.isArchived && (t.isConsignmentOnly ?? false)).filter(t => {
      if (!consignmentFilter) return true;
      const q = consignmentFilter.toLowerCase();
      const loc = [t.city, t.state].filter(Boolean).join(", ").toLowerCase();
      return t.name.toLowerCase().includes(q) || loc.includes(q);
    });
    return filtered.sort((a, b) => {
      let av = "", bv = "";
      if (consignmentSortField === "name") { av = a.name; bv = b.name; }
      else if (consignmentSortField === "location") {
        av = [a.city, a.state].filter(Boolean).join(", ");
        bv = [b.city, b.state].filter(Boolean).join(", ");
      } else if (consignmentSortField === "createdAt") { av = a.createdAt ?? ""; bv = b.createdAt ?? ""; }
      return consignmentSortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [tenants, consignmentFilter, consignmentSortField, consignmentSortDir]);

  function toggleActiveSort(field: SortField) {
    if (activeSortField === field) setActiveSortDir(d => d === "asc" ? "desc" : "asc");
    else { setActiveSortField(field); setActiveSortDir("asc"); }
  }

  function toggleArchivedSort(field: SortField) {
    if (archivedSortField === field) setArchivedSortDir(d => d === "asc" ? "desc" : "asc");
    else { setArchivedSortField(field); setArchivedSortDir("asc"); }
  }

  const archivedCount = tenants.filter(t => t.isArchived).length;
  const consignmentCount = tenants.filter(t => !t.isArchived && (t.isConsignmentOnly ?? false)).length;

  function toggleConsignmentSort(field: SortField) {
    if (consignmentSortField === field) setConsignmentSortDir(d => d === "asc" ? "desc" : "asc");
    else { setConsignmentSortField(field); setConsignmentSortDir("asc"); }
  }

  async function toggleConsignment(tenantId: string, current: boolean) {
    setTogglingConsignment(tenantId);
    const newVal = !current;
    setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, isConsignmentOnly: newVal } : t));
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, isConsignmentOnly: newVal }),
      });
      if (!res.ok) setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, isConsignmentOnly: current } : t));
    } catch {
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, isConsignmentOnly: current } : t));
    } finally {
      setTogglingConsignment(null);
    }
  }

  function startEdit(tenant: Tenant) {
    setEditingId(tenant.id);
    setEditName(tenant.name);
  }

  async function saveName(tenantId: string) {
    if (!editName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, name: editName.trim() }),
      });
      if (!res.ok) return;
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, name: editName.trim() } : t));
      setEditingId(null);
    } finally {
      setSavingName(false);
    }
  }

  function startEditLocation(tenant: Tenant) {
    setEditingLocationId(tenant.id);
    setEditAddress(tenant.address ?? "");
    setEditCity(tenant.city ?? "");
    setEditState(tenant.state ?? "");
    setEditZip(tenant.zip ?? "");
  }

  async function saveLocation(tenantId: string) {
    setSavingLocation(true);
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          address: editAddress.trim(),
          city: editCity.trim(),
          state: editState.trim(),
          zip: editZip.trim(),
        }),
      });
      if (!res.ok) return;
      setTenants(prev => prev.map(t => t.id === tenantId ? {
        ...t,
        address: editAddress.trim(),
        city: editCity.trim(),
        state: editState.trim(),
        zip: editZip.trim(),
      } : t));
      setEditingLocationId(null);
    } finally {
      setSavingLocation(false);
    }
  }

  async function setArchived(tenantId: string, isArchived: boolean) {
    setArchiving(tenantId);
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, isArchived }),
      });
      if (!res.ok) return;
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, isArchived } : t));
    } finally {
      setArchiving(null);
    }
  }

  async function toggleTTT(tenantId: string, currentIsTTT: boolean) {
    setTogglingTTT(tenantId);
    const newValue = !currentIsTTT;
    // Optimistic update
    setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, isTTT: newValue } : t));
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, isTTT: newValue }),
      });
      if (!res.ok) {
        // Revert on failure
        setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, isTTT: currentIsTTT } : t));
      }
    } catch {
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, isTTT: currentIsTTT } : t));
    } finally {
      setTogglingTTT(null);
    }
  }

  function SortArrow({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
    if (field !== current) return <span className="text-gray-300 text-xs">↕</span>;
    return <span className="text-gray-500 text-xs">{dir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div>
      {/* Header: search + view toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={activeSearch}
          onChange={e => setActiveSearch(e.target.value)}
          placeholder="Search projects…"
          className="h-8 px-3 text-sm border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-forest-400 w-52"
        />
        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden ml-auto">
          <button
            onClick={() => setViewMode("cards")}
            title="Card view"
            className={cn("w-8 h-8 flex items-center justify-center transition-colors",
              viewMode === "cards" ? "bg-forest-600 text-white" : "bg-white text-gray-400 hover:text-gray-600")}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("table")}
            title="Table view"
            className={cn("w-8 h-8 flex items-center justify-center transition-colors",
              viewMode === "table" ? "bg-forest-600 text-white" : "bg-white text-gray-400 hover:text-gray-600")}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Card View ── */}
      {viewMode === "cards" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeTenants.map(tenant => (
            <Card key={tenant.id}>
              <CardContent>
                <Link href={`/catalog?tenantId=${tenant.id}`} className="block">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 bg-forest-50 rounded-xl flex items-center justify-center">
                      <HouseIcon className="w-5 h-5 text-forest-600" />
                    </div>
                    <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {editingId === tenant.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); saveName(tenant.id); }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onClick={e => e.preventDefault()}
                      className="w-full font-bold text-gray-900 border-b-2 border-forest-500 bg-transparent focus:outline-none text-base"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 group/name">
                      <h3 className="font-bold text-gray-900">{tenant.name}</h3>
                      {isManager && (
                        <button
                          onClick={e => { e.preventDefault(); startEdit(tenant); }}
                          className="opacity-0 group-hover/name:opacity-100 transition-opacity text-gray-400 hover:text-forest-600"
                          title="Rename project"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  {(tenant.city || tenant.state) && (
                    <p className="text-xs text-gray-400 mt-0.5">{[tenant.city, tenant.state].filter(Boolean).join(", ")}</p>
                  )}
                  <p className="text-sm text-gray-400 mt-1">View catalog</p>
                </Link>
                <div className="border-t border-gray-100 mt-3 pt-2 flex items-center gap-3">
                  {/* TTT badge */}
                  {isAdmin ? (
                    <button
                      onClick={e => { e.preventDefault(); requestConfirm(`Mark "${tenant.name}" as ${(tenant.isTTT ?? false) ? "Client" : "TTT"}?`, () => toggleTTT(tenant.id, tenant.isTTT ?? false)); }}
                      disabled={togglingTTT === tenant.id}
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors",
                        (tenant.isTTT ?? false)
                          ? "bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
                          : "bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200"
                      )}
                      title={`Click to mark as ${(tenant.isTTT ?? false) ? "Client" : "TTT"}`}
                    >
                      {(tenant.isTTT ?? false) ? "TTT" : "Client"}
                    </button>
                  ) : (
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                      (tenant.isTTT ?? false)
                        ? "bg-green-50 text-green-700 border-green-300"
                        : "bg-gray-100 text-gray-500 border-gray-300"
                    )}>
                      {(tenant.isTTT ?? false) ? "TTT" : "Client"}
                    </span>
                  )}
                  {/* Consignment badge */}
                  {(isManager || isAdmin) && (
                    <button
                      onClick={e => { e.preventDefault(); requestConfirm((tenant.isConsignmentOnly ?? false) ? `Mark "${tenant.name}" as Active?` : `Move "${tenant.name}" to Post-Move Consignment?`, () => toggleConsignment(tenant.id, tenant.isConsignmentOnly ?? false)); }}
                      disabled={togglingConsignment === tenant.id}
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors",
                        (tenant.isConsignmentOnly ?? false)
                          ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                          : "bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200"
                      )}
                      title={`Click to ${(tenant.isConsignmentOnly ?? false) ? "mark as Active" : "mark as Consignment Only"}`}
                    >
                      {(tenant.isConsignmentOnly ?? false) ? "Consign Only" : "Active"}
                    </button>
                  )}
                  {editingId === tenant.id ? (
                    <>
                      <button
                        onClick={() => saveName(tenant.id)}
                        disabled={savingName || !editName.trim()}
                        className="text-xs text-forest-600 hover:text-forest-700 font-medium transition-colors disabled:opacity-50"
                      >
                        {savingName ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => requestConfirm(`Archive "${tenant.name}"?`, () => setArchived(tenant.id, true))}
                      disabled={archiving === tenant.id}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                    >
                      {archiving === tenant.id ? "Archiving…" : "Archive"}
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {isManager && (
            <Link href="/onboarding">
              <Card hover className="border-dashed border-gray-300 bg-transparent shadow-none">
                <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-gray-500">New Project</span>
                </CardContent>
              </Card>
            </Link>
          )}

          {activeTenants.length === 0 && activeSearch && (
            <p className="col-span-full text-sm text-gray-400 py-4">No projects match &ldquo;{activeSearch}&rdquo;</p>
          )}
        </div>
      )}

      {/* ── Table View ── */}
      {viewMode === "table" && (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleActiveSort("name")}
                    className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-700 transition-colors">
                    Project <SortArrow field="name" current={activeSortField} dir={activeSortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleActiveSort("location")}
                    className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-700 transition-colors">
                    Location <SortArrow field="location" current={activeSortField} dir={activeSortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleActiveSort("createdAt")}
                    className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-700 transition-colors">
                    Created <SortArrow field="createdAt" current={activeSortField} dir={activeSortDir} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Type</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activeTenants.map(tenant => {
                const addressLine = [tenant.address, [tenant.city, tenant.state].filter(Boolean).join(", "), tenant.zip].filter(Boolean).join(" · ");
                const createdDisplay = tenant.createdAt
                  ? new Date(tenant.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—";
                const editingLoc = editingLocationId === tenant.id;
                return (
                  <tr key={tenant.id} className={cn("group transition-colors", editingLoc ? "bg-gray-50/80" : "hover:bg-gray-50/60")}>
                    <td className="px-4 py-3">
                      {editingId === tenant.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") saveName(tenant.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="font-medium text-gray-900 border-b border-forest-500 bg-transparent focus:outline-none text-sm w-48"
                          />
                          <button onClick={() => saveName(tenant.id)} disabled={savingName || !editName.trim()}
                            className="text-xs text-forest-600 hover:text-forest-700 font-medium disabled:opacity-50">
                            {savingName ? "…" : "Save"}
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Link href={`/catalog?tenantId=${tenant.id}`}
                            className="font-medium text-gray-900 hover:text-forest-700 transition-colors">
                            {tenant.name}
                          </Link>
                          {isManager && (
                            <button
                              onClick={() => startEdit(tenant)}
                              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-forest-600 transition-all"
                              title="Rename"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    {/* Location cell — inline editable */}
                    <td className="px-4 py-3 text-sm">
                      {editingLoc ? (
                        <div className="space-y-1.5">
                          <input
                            autoFocus
                            value={editAddress}
                            onChange={e => setEditAddress(e.target.value)}
                            onKeyDown={e => { if (e.key === "Escape") setEditingLocationId(null); }}
                            placeholder="Street address"
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-forest-500"
                          />
                          <div className="flex gap-1.5">
                            <input
                              value={editCity}
                              onChange={e => setEditCity(e.target.value)}
                              placeholder="City"
                              className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-forest-500"
                            />
                            <input
                              value={editState}
                              onChange={e => setEditState(e.target.value)}
                              placeholder="ST"
                              className="w-14 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-forest-500"
                            />
                            <input
                              value={editZip}
                              onChange={e => setEditZip(e.target.value)}
                              placeholder="Zip"
                              className="w-20 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-forest-500"
                            />
                          </div>
                          <div className="flex gap-2 pt-0.5">
                            <button onClick={() => saveLocation(tenant.id)} disabled={savingLocation}
                              className="text-xs text-forest-600 hover:text-forest-700 font-medium disabled:opacity-50">
                              {savingLocation ? "Saving…" : "Save"}
                            </button>
                            <button onClick={() => setEditingLocationId(null)} className="text-xs text-gray-400 hover:text-gray-600">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group/loc">
                          <span className="text-gray-500">{addressLine || <span className="text-gray-300">—</span>}</span>
                          <button
                            onClick={() => startEditLocation(tenant)}
                            className="opacity-0 group-hover/loc:opacity-100 flex-shrink-0 text-gray-300 hover:text-forest-600 transition-all"
                            title="Edit address"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm whitespace-nowrap">{createdDisplay}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isAdmin ? (
                          <button
                            onClick={() => requestConfirm(`Mark "${tenant.name}" as ${(tenant.isTTT ?? false) ? "Client" : "TTT"}?`, () => toggleTTT(tenant.id, tenant.isTTT ?? false))}
                            disabled={togglingTTT === tenant.id}
                            className={cn(
                              "text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors",
                              (tenant.isTTT ?? false)
                                ? "bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
                                : "bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200"
                            )}
                          >
                            {(tenant.isTTT ?? false) ? "TTT" : "Client"}
                          </button>
                        ) : (
                          <span className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                            (tenant.isTTT ?? false)
                              ? "bg-green-50 text-green-700 border-green-300"
                              : "bg-gray-100 text-gray-500 border-gray-300"
                          )}>
                            {(tenant.isTTT ?? false) ? "TTT" : "Client"}
                          </span>
                        )}
                        {(isManager || isAdmin) && (
                          <button
                            onClick={() => requestConfirm((tenant.isConsignmentOnly ?? false) ? `Mark "${tenant.name}" as Active?` : `Move "${tenant.name}" to Post-Move Consignment?`, () => toggleConsignment(tenant.id, tenant.isConsignmentOnly ?? false))}
                            disabled={togglingConsignment === tenant.id}
                            className={cn(
                              "text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors",
                              (tenant.isConsignmentOnly ?? false)
                                ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                                : "bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200"
                            )}
                            title={`Click to ${(tenant.isConsignmentOnly ?? false) ? "mark as Active" : "mark as Consignment Only"}`}
                          >
                            {(tenant.isConsignmentOnly ?? false) ? "Consign Only" : "Active"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!editingLoc && (
                        <button
                          onClick={() => requestConfirm(`Archive "${tenant.name}"?`, () => setArchived(tenant.id, true))}
                          disabled={archiving === tenant.id}
                          className="text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                        >
                          {archiving === tenant.id ? "…" : "Archive"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {activeTenants.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                    {activeSearch ? `No projects match "${activeSearch}"` : "No active projects"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {isManager && (
            <div className="border-t border-gray-100 px-4 py-2.5">
              <Link href="/onboarding" className="text-sm text-forest-600 hover:text-forest-700 font-medium transition-colors">
                + New Project
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Post-Move Consignment accordion ── */}
      {consignmentCount > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowConsignment(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-800 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showConsignment ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Post-Move Consignment ({consignmentCount})
          </button>

          {showConsignment && (
            <div className="mt-4 opacity-80">
              <div className="mb-3">
                <input
                  type="text"
                  value={consignmentFilter}
                  onChange={e => setConsignmentFilter(e.target.value)}
                  placeholder="Filter by name or location…"
                  className="w-full sm:w-72 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-300"
                />
              </div>

              <div className="border border-amber-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50 border-b border-amber-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-amber-700">
                        <button onClick={() => toggleConsignmentSort("name")}
                          className="flex items-center gap-1 hover:text-amber-900 transition-colors">
                          Project <SortArrow field="name" current={consignmentSortField} dir={consignmentSortDir} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-amber-700">
                        <button onClick={() => toggleConsignmentSort("location")}
                          className="flex items-center gap-1 hover:text-amber-900 transition-colors">
                          Location <SortArrow field="location" current={consignmentSortField} dir={consignmentSortDir} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-amber-700">
                        <button onClick={() => toggleConsignmentSort("createdAt")}
                          className="flex items-center gap-1 hover:text-amber-900 transition-colors">
                          Created <SortArrow field="createdAt" current={consignmentSortField} dir={consignmentSortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100 bg-white">
                    {sortedConsignmentTenants.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">
                          No consignment projects match your filter.
                        </td>
                      </tr>
                    ) : sortedConsignmentTenants.map(tenant => {
                      const location = [tenant.city, tenant.state].filter(Boolean).join(", ");
                      const createdDisplay = tenant.createdAt
                        ? new Date(tenant.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—";
                      return (
                        <tr key={tenant.id} className="hover:bg-amber-50/40 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/catalog?tenantId=${tenant.id}`}
                              className="font-medium text-gray-700 hover:text-gray-900 transition-colors">
                              {tenant.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{location || "—"}</td>
                          <td className="px-4 py-3 text-gray-400">{createdDisplay}</td>
                          <td className="px-4 py-3 text-right">
                            {(isManager || isAdmin) && (
                              <button
                                onClick={() => requestConfirm(`Mark "${tenant.name}" as Active?`, () => toggleConsignment(tenant.id, true))}
                                disabled={togglingConsignment === tenant.id}
                                className="text-xs text-forest-600 hover:text-forest-700 font-medium transition-colors disabled:opacity-50"
                              >
                                {togglingConsignment === tenant.id ? "Moving…" : "Mark Active"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Archived projects accordion ── */}
      {archivedCount > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showArchived ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Archived Projects ({archivedCount})
          </button>

          {showArchived && (
            <div className="mt-4 opacity-70">
              <div className="mb-3">
                <input
                  type="text"
                  value={archivedFilter}
                  onChange={e => setArchivedFilter(e.target.value)}
                  placeholder="Filter by name or location…"
                  className="w-full sm:w-72 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">
                        <button onClick={() => toggleArchivedSort("name")}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors">
                          Project <SortArrow field="name" current={archivedSortField} dir={archivedSortDir} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">
                        <button onClick={() => toggleArchivedSort("location")}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors">
                          Location <SortArrow field="location" current={archivedSortField} dir={archivedSortDir} />
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">
                        <button onClick={() => toggleArchivedSort("createdAt")}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors">
                          Created <SortArrow field="createdAt" current={archivedSortField} dir={archivedSortDir} />
                        </button>
                      </th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {sortedArchivedTenants.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">
                          No archived projects match your filter.
                        </td>
                      </tr>
                    ) : sortedArchivedTenants.map(tenant => {
                      const location = [tenant.city, tenant.state].filter(Boolean).join(", ");
                      const createdDisplay = tenant.createdAt
                        ? new Date(tenant.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—";
                      return (
                        <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/catalog?tenantId=${tenant.id}`}
                              className="font-medium text-gray-500 hover:text-gray-700 transition-colors">
                              {tenant.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-400">{location || "—"}</td>
                          <td className="px-4 py-3 text-gray-400">{createdDisplay}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => requestConfirm(`Unarchive "${tenant.name}"?`, () => setArchived(tenant.id, false))}
                              disabled={archiving === tenant.id}
                              className="text-xs text-forest-600 hover:text-forest-700 font-medium transition-colors disabled:opacity-50"
                            >
                              {archiving === tenant.id ? "Restoring…" : "Unarchive"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Confirmation modal ── */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setPendingConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-gray-700 mb-6">{pendingConfirm.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }}
                className="px-4 py-2 text-sm font-medium bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors"
              >
                Yes, confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
