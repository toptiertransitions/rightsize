"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface StaffPickerProject {
  id: string;
  name: string;
}

export function StaffProjectPicker({ projects }: { projects: StaffPickerProject[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Header persists the last-viewed real project to localStorage on every
  // page that carries ?tenantId= — checking it here means a TTT user who
  // arrives from Plan/Catalog/Vendors/etc. with a project already selected
  // lands straight on that project's Partners view instead of re-picking.
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    let persisted: string | null = null;
    try { persisted = localStorage.getItem("rz_tenantId"); } catch {}
    if (persisted) {
      router.replace(`/partners?tenantId=${persisted}`);
      return;
    }
    setCheckedStorage(true);
  }, [router]);

  if (!checkedStorage) return null;

  const q = query.trim().toLowerCase();
  const matches = [...projects]
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Your Partners</h1>
      <p className="text-gray-500 mb-6">Search for a project to preview its Partners page.</p>

      <div className="relative mb-5">
        <svg className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {matches.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400 text-center">
            No projects match &ldquo;{query}&rdquo;
          </p>
        ) : (
          matches.map((p) => (
            <Link
              key={p.id}
              href={`/partners?tenantId=${p.id}`}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-800 truncate">{p.name}</span>
              <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
