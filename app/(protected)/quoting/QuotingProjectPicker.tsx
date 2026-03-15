"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tenant } from "@/lib/types";

export function QuotingProjectPicker({ tenants }: { tenants: Tenant[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    [t.city, t.state].filter(Boolean).join(", ").toLowerCase().includes(search.toLowerCase())
  );

  function select(tenantId: string) {
    router.push(`/quoting?tenantId=${tenantId}`);
  }

  return (
    <div className="max-w-lg mx-auto py-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quoting</h1>
        <p className="text-sm text-gray-500 mt-1">Select a client project to open or create a quote.</p>
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
            {search ? `No projects match "${search}"` : "No active projects found"}
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
                      <div className="text-sm font-medium text-gray-900 group-hover:text-forest-700 transition-colors">{t.name}</div>
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

      {tenants.length > 0 && filtered.length > 0 && (
        <p className="text-xs text-gray-400 mt-2 text-right">{filtered.length} of {tenants.length} projects</p>
      )}
    </div>
  );
}
