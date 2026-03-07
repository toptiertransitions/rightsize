"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

interface TenantOption {
  id: string;
  name: string;
  city?: string;
  state?: string;
  isArchived?: boolean;
}

const SENTINEL_SHORT: Record<string, string> = {
  "__all_active__": "All Active",
  "__all_archived__": "All Archived",
  "__all_time__": "All-Time",
};

const SENTINELS = [
  { id: "__all_active__", label: "All Active Projects" },
  { id: "__all_archived__", label: "All Archived Projects" },
  { id: "__all_time__", label: "All-Time Projects" },
];

export function ProjectSwitcher({
  currentTenantId,
  allowAllProjects,
}: {
  currentTenantId: string | null;
  allowAllProjects?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const isSentinel = currentTenantId ? currentTenantId in SENTINEL_SHORT : false;
  const current = tenants.find((t) => t.id === currentTenantId);
  const buttonLabel = loading
    ? "Loading…"
    : isSentinel
    ? SENTINEL_SHORT[currentTenantId!]
    : current?.name ?? "Select project";

  useEffect(() => {
    const url = allowAllProjects ? "/api/tenants?includeArchived=true" : "/api/tenants";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setTenants(d.tenants ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [allowAllProjects]);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setSearch(""); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const filtered = search.trim()
    ? tenants.filter((t) => t.name.toLowerCase().includes(search.toLowerCase().trim()))
    : tenants;

  const activeTenants = filtered.filter((t) => !t.isArchived);
  const archivedTenants = filtered.filter((t) => t.isArchived);

  function select(id: string) {
    setOpen(false);
    setSearch("");
    window.location.href = `${pathname}?tenantId=${id}`;
  }

  if (!loading && tenants.length === 0 && !allowAllProjects) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-gray-50 border border-gray-200 text-gray-700 hover:bg-white hover:border-gray-300 hover:shadow-sm transition-all max-w-[200px]"
      >
        <span className="truncate">{buttonLabel}</span>
        <svg
          className={`w-3 h-3 flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-64 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="w-full pl-7 pr-3 py-1.5 text-sm rounded-lg bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400 focus:bg-white"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {/* Sentinel options — always shown when allowAllProjects */}
            {allowAllProjects && (
              <>
                {SENTINELS.map(({ id, label }) => {
                  const isActive = id === currentTenantId;
                  return (
                    <button
                      key={id}
                      onClick={() => select(id)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                        isActive ? "bg-forest-50 text-forest-700" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <p className={`text-sm font-medium ${isActive ? "text-forest-700" : "text-gray-800"}`}>{label}</p>
                      {isActive && (
                        <svg className="w-4 h-4 flex-shrink-0 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
                <div className="h-px bg-gray-100 mx-2 my-1" />
              </>
            )}

            {/* Individual tenants */}
            {activeTenants.length === 0 && archivedTenants.length === 0 && !allowAllProjects ? (
              <p className="text-xs text-gray-400 px-3 py-4 text-center">No projects found</p>
            ) : (
              <>
                {activeTenants.map((t) => {
                  const isActive = t.id === currentTenantId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => select(t.id)}
                      className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 transition-colors ${
                        isActive ? "bg-forest-50 text-forest-700" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${isActive ? "text-forest-700" : "text-gray-800"}`}>
                          {t.name}
                        </p>
                        {(t.city || t.state) && (
                          <p className="text-xs text-gray-400 truncate">
                            {[t.city, t.state].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <svg className="w-4 h-4 flex-shrink-0 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}

                {archivedTenants.length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Archived</p>
                    </div>
                    {archivedTenants.map((t) => {
                      const isActive = t.id === currentTenantId;
                      return (
                        <button
                          key={t.id}
                          onClick={() => select(t.id)}
                          className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 transition-colors ${
                            isActive ? "bg-forest-50 text-forest-700" : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${isActive ? "text-forest-700" : "text-gray-600"}`}>
                              {t.name}
                            </p>
                            {(t.city || t.state) && (
                              <p className="text-xs text-gray-400 truncate">
                                {[t.city, t.state].filter(Boolean).join(", ")}
                              </p>
                            )}
                          </div>
                          {isActive && (
                            <svg className="w-4 h-4 flex-shrink-0 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
