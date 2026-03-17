"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tenant } from "@/lib/types";

type ViewMode = "active" | "archived" | "all";

interface Props {
  tenants: Tenant[];
  basePath?: string;
  title?: string;
  description?: string;
}

export function QuotingProjectPicker({
  tenants,
  basePath = "/quoting",
  title = "Quoting",
  description = "Select a client project to open or create a quote.",
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("active");

  const filtered = tenants.filter(t => {
    if (viewMode === "active" && t.isArchived) return false;
    if (viewMode === "archived" && !t.isArchived) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      [t.city, t.state].filter(Boolean).join(", ").toLowerCase().includes(q)
    );
  });

  function select(tenantId: string) {
    router.push(`${basePath}?tenantId=${tenantId}`);
  }

  return (
    <div className="max-w-lg mx-auto py-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>

      {/* View mode toggle */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3 w-fit">
        {(["active", "archived", "all"] as ViewMode[]).map(m => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`px-4 py-1.5 text-sm capitalize transition-colors ${
              viewMode === m
                ? "bg-forest-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {m === "active" ? "Active" : m === "archived" ? "Archived" : "All"}
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          autoFocus
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search projects by name or location…"
          className="w-full pl-9 pr-4 h-11 rounded-xl border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500"
        />
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            {search
              ? `No projects match "${search}"`
              : viewMode === "archived"
              ? "No archived projects found"
              : "No active projects found"}
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map(t => {
              const location = [t.city, t.state].filter(Boolean).join(", ");
              return (
                <li key={t.id}>
                  <button
                    onClick={() => select(t.id)}
                    className="w-full text-left px-4 py-3 hover:bg-forest-50 transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 group-hover:text-forest-700 transition-colors">{t.name}</span>
                        {t.isArchived && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Archived</span>
                        )}
                      </div>
                      {location && <div className="text-xs text-gray-400 mt-0.5">{location}</div>}
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-forest-500 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-gray-400 mt-2 text-right">{filtered.length} of {tenants.length} projects</p>
      )}
    </div>
  );
}
