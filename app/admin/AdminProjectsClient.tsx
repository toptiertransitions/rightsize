"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Pagination } from "./components/Pagination";
import type { Tenant } from "@/lib/types";

const PAGE_SIZE = 25;

type ViewFilter = "active" | "archived" | "all";
type TypeFilter = "all" | "ttt" | "client";

interface ProjectRow {
  id: string;
  name: string;
  isTTT: boolean;
  isConsignmentOnly: boolean;
  memberCount: number;
  createdAt: string;
  isArchived: boolean;
  address?: string;
  city?: string;
  state?: string;
  destAddress?: string;
  destCity?: string;
  destState?: string;
  destZip?: string;
}

interface Props {
  tenants: Tenant[];
  memberCountByTenant: Record<string, number>;
  isAdmin?: boolean;
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function DestEditCell({ row }: { row: ProjectRow }) {
  const [open, setOpen] = useState(false);
  const [destAddress, setDestAddress] = useState(row.destAddress ?? "");
  const [destCity, setDestCity] = useState(row.destCity ?? "");
  const [destState, setDestState] = useState(row.destState ?? "");
  const [destZip, setDestZip] = useState(row.destZip ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "h-7 px-2 rounded border border-gray-600 text-xs bg-gray-800 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-400 w-full";

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: row.id,
          destAddress: destAddress.trim() || null,
          destCity: destCity.trim() || null,
          destState: destState.trim() || null,
          destZip: destZip.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Save failed");
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDestAddress(row.destAddress ?? "");
    setDestCity(row.destCity ?? "");
    setDestState(row.destState ?? "");
    setDestZip(row.destZip ?? "");
    setError(null);
    setOpen(false);
  }

  const displayParts = [row.destAddress, row.destCity, row.destState].filter(Boolean);

  if (open) {
    return (
      <div className="flex flex-col gap-1.5 py-1">
        <input type="text" placeholder="Street" value={destAddress} onChange={e => setDestAddress(e.target.value)} className={inputCls} autoFocus />
        <input type="text" placeholder="City" value={destCity} onChange={e => setDestCity(e.target.value)} className={inputCls} />
        <div className="flex gap-1">
          <input type="text" placeholder="State" value={destState} onChange={e => setDestState(e.target.value)} className={`${inputCls} w-20`} />
          <input type="text" placeholder="Zip" value={destZip} onChange={e => setDestZip(e.target.value)} className={inputCls} />
        </div>
        <div className="flex gap-1 mt-0.5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-6 px-2.5 rounded text-xs font-medium bg-forest-700 text-white hover:bg-forest-600 disabled:opacity-60 transition-colors"
          >
            {saving ? "…" : "Save"}
          </button>
          <button
            onClick={handleCancel}
            className="h-6 px-2.5 rounded text-xs text-gray-400 border border-gray-600 hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group/dest">
      {displayParts.length > 0 ? (
        <span className="text-gray-300 text-sm">{displayParts.join(", ")}</span>
      ) : (
        <span className="text-gray-600 text-xs">—</span>
      )}
      <button
        onClick={() => setOpen(true)}
        className="text-gray-500 hover:text-gray-300 opacity-0 group-hover/dest:opacity-100 transition-all"
        title="Edit destination address"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

export function AdminProjectsClient({ tenants, memberCountByTenant, isAdmin = false }: Props) {
  const [view, setView] = useState<ViewFilter>("active");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const rows: ProjectRow[] = useMemo(
    () =>
      tenants.map((t) => ({
        id: t.id,
        name: t.name,
        isTTT: t.isTTT ?? false,
        isConsignmentOnly: t.isConsignmentOnly ?? false,
        memberCount: memberCountByTenant[t.id] ?? 0,
        createdAt: t.createdAt,
        isArchived: t.isArchived ?? false,
        address: t.address,
        city: t.city,
        state: t.state,
        destAddress: t.destAddress,
        destCity: t.destCity,
        destState: t.destState,
        destZip: t.destZip,
      })),
    [tenants, memberCountByTenant]
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (view === "active") list = list.filter((r) => !r.isArchived);
    else if (view === "archived") list = list.filter((r) => r.isArchived);
    if (typeFilter === "ttt") list = list.filter((r) => r.isTTT);
    else if (typeFilter === "client") list = list.filter((r) => !r.isTTT);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, view, typeFilter, search]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleViewChange(v: ViewFilter) { setView(v); setPage(1); }
  function handleTypeChange(v: TypeFilter) { setTypeFilter(v); setPage(1); }
  function handleSearch(s: string) { setSearch(s); setPage(1); }

  const activeRows = rows.filter((r) => !r.isArchived);
  const activeCount = activeRows.length;
  const archivedCount = rows.filter((r) => r.isArchived).length;
  const tttCount = activeRows.filter((r) => r.isTTT).length;
  const clientCount = activeRows.filter((r) => !r.isTTT).length;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Active / Archived / All */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {(["active", "archived", "all"] as ViewFilter[]).map((v) => {
            const label =
              v === "active" ? `Active (${activeCount})`
              : v === "archived" ? `Archived (${archivedCount})`
              : `All (${rows.length})`;
            return (
              <button
                key={v}
                onClick={() => handleViewChange(v)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  view === v ? "bg-gray-600 text-white" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* TTT / Client type filter */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => handleTypeChange("all")}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              typeFilter === "all" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            All Types
          </button>
          <button
            onClick={() => handleTypeChange("ttt")}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              typeFilter === "ttt" ? "bg-green-800 text-green-200" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            TTT <span className="text-xs font-normal opacity-70">({tttCount})</span>
          </button>
          <button
            onClick={() => handleTypeChange("client")}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              typeFilter === "client" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Client <span className="text-xs font-normal opacity-70">({clientCount})</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Project</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Members</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Address</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden xl:table-cell">Destination</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden xl:table-cell">Created</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500">
                    {search
                      ? "No projects match your search."
                      : view === "archived"
                      ? "No archived projects."
                      : "No projects match the selected filter."}
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{r.name}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          r.isTTT
                            ? "bg-green-900/40 text-green-400 border border-green-800/60"
                            : "bg-gray-700/60 text-gray-400 border border-gray-700"
                        }`}>
                          {r.isTTT ? "TTT" : "Client"}
                        </span>
                        {r.isConsignmentOnly && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-900/40 text-amber-400 border border-amber-800/60">
                            Consign
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{r.memberCount}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {r.address || r.city ? (
                        <span className="text-gray-300 text-sm">
                          {[r.address, r.city, r.state].filter(Boolean).join(", ")}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell min-w-[180px]">
                      {isAdmin ? (
                        <DestEditCell row={r} />
                      ) : (
                        [r.destAddress, r.destCity, r.destState].filter(Boolean).length > 0 ? (
                          <span className="text-gray-300 text-sm">
                            {[r.destAddress, r.destCity, r.destState].filter(Boolean).join(", ")}
                          </span>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden xl:table-cell">
                      {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {r.isArchived ? (
                        <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Archived</span>
                      ) : (
                        <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/impersonate?tenantId=${r.id}`}
                        className="text-xs text-forest-400 hover:text-forest-300 font-medium whitespace-nowrap"
                      >
                        Enter as Staff →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
}
