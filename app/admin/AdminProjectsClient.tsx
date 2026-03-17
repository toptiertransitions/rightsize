"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Pagination } from "./components/Pagination";
import type { Tenant } from "@/lib/types";

const PAGE_SIZE = 25;

type ViewFilter = "active" | "archived" | "all";

interface ProjectRow {
  id: string;
  name: string;
  plan: string;
  memberCount: number;
  createdAt: string;
  isArchived: boolean;
}

interface Props {
  tenants: Tenant[];
  memberCountByTenant: Record<string, number>;
}

export function AdminProjectsClient({ tenants, memberCountByTenant }: Props) {
  const [view, setView] = useState<ViewFilter>("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const rows: ProjectRow[] = useMemo(
    () =>
      tenants.map((t) => ({
        id: t.id,
        name: t.name,
        plan: t.plan ?? "standard",
        memberCount: memberCountByTenant[t.id] ?? 0,
        createdAt: t.createdAt,
        isArchived: t.isArchived ?? false,
      })),
    [tenants, memberCountByTenant]
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (view === "active") list = list.filter((r) => !r.isArchived);
    else if (view === "archived") list = list.filter((r) => r.isArchived);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, view, search]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleViewChange(v: ViewFilter) {
    setView(v);
    setPage(1);
  }
  function handleSearch(s: string) {
    setSearch(s);
    setPage(1);
  }

  const activeCount = rows.filter((r) => !r.isArchived).length;
  const archivedCount = rows.filter((r) => r.isArchived).length;

  return (
    <div>
      {/* Controls row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        {/* Toggle */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 self-start">
          {(["active", "archived", "all"] as ViewFilter[]).map((v) => {
            const label = v === "active" ? `Active (${activeCount})` : v === "archived" ? `Archived (${archivedCount})` : `All (${rows.length})`;
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Members</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Created</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    {search ? "No projects match your search." : view === "archived" ? "No archived projects." : "No active projects."}
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{r.name}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full capitalize">{r.plan}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{r.memberCount}</td>
                    <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">
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
