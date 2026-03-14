"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Tenant } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/Card";

interface Props {
  initialTenants: Tenant[];
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

export function AdminProjectsClient({ initialTenants }: Props) {
  const [tenants, setTenants] = useState(initialTenants);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedFilter, setArchivedFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const activeTenants = tenants.filter(t => !t.isArchived);

  const sortedArchivedTenants = useMemo(() => {
    const filtered = tenants.filter(t => t.isArchived).filter(t => {
      if (!archivedFilter) return true;
      const q = archivedFilter.toLowerCase();
      const loc = [t.city, t.state].filter(Boolean).join(", ").toLowerCase();
      return t.name.toLowerCase().includes(q) || loc.includes(q);
    });
    return filtered.sort((a, b) => {
      let av = "", bv = "";
      if (sortField === "name") { av = a.name; bv = b.name; }
      else if (sortField === "location") {
        av = [a.city, a.state].filter(Boolean).join(", ");
        bv = [b.city, b.state].filter(Boolean).join(", ");
      } else if (sortField === "createdAt") { av = a.createdAt ?? ""; bv = b.createdAt ?? ""; }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [tenants, archivedFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const archivedCount = tenants.filter(t => t.isArchived).length;

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

  return (
    <div>
      {/* Active projects grid */}
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
                <h3 className="font-bold text-gray-900">{tenant.name}</h3>
                <p className="text-sm text-gray-400 mt-0.5">View catalog</p>
              </Link>
              <div className="border-t border-gray-100 mt-3 pt-2">
                <button
                  onClick={() => setArchived(tenant.id, true)}
                  disabled={archiving === tenant.id}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                >
                  {archiving === tenant.id ? "Archiving…" : "Archive"}
                </button>
              </div>
            </CardContent>
          </Card>
        ))}

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
      </div>

      {/* Archived projects accordion */}
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
              {/* Filter input */}
              <div className="mb-3">
                <input
                  type="text"
                  value={archivedFilter}
                  onChange={e => setArchivedFilter(e.target.value)}
                  placeholder="Filter by name or location…"
                  className="w-full sm:w-72 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
              </div>

              {/* Table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">
                        <button
                          onClick={() => toggleSort("name")}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                        >
                          Project
                          {sortField === "name" ? (
                            <span className="text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>
                          ) : (
                            <span className="text-gray-300">↕</span>
                          )}
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">
                        <button
                          onClick={() => toggleSort("location")}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                        >
                          Location
                          {sortField === "location" ? (
                            <span className="text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>
                          ) : (
                            <span className="text-gray-300">↕</span>
                          )}
                        </button>
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">
                        <button
                          onClick={() => toggleSort("createdAt")}
                          className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                        >
                          Created
                          {sortField === "createdAt" ? (
                            <span className="text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>
                          ) : (
                            <span className="text-gray-300">↕</span>
                          )}
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
                            <Link
                              href={`/catalog?tenantId=${tenant.id}`}
                              className="font-medium text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              {tenant.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-400">{location || "—"}</td>
                          <td className="px-4 py-3 text-gray-400">{createdDisplay}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setArchived(tenant.id, false)}
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
    </div>
  );
}
