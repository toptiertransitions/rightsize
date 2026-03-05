"use client";

import { useState } from "react";
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

export function AdminProjectsClient({ initialTenants }: Props) {
  const [tenants, setTenants] = useState(initialTenants);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const activeTenants = tenants.filter(t => !t.isArchived);
  const archivedTenants = tenants.filter(t => t.isArchived);

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
      {archivedTenants.length > 0 && (
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
            Archived Projects ({archivedTenants.length})
          </button>

          {showArchived && (
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {archivedTenants.map(tenant => (
                <Card key={tenant.id} className="opacity-70">
                  <CardContent>
                    <Link href={`/catalog?tenantId=${tenant.id}`} className="block">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                        </div>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                          Archived
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-500">{tenant.name}</h3>
                      <p className="text-sm text-gray-400 mt-0.5">View project</p>
                    </Link>
                    <div className="border-t border-gray-100 mt-3 pt-2">
                      <button
                        onClick={() => setArchived(tenant.id, false)}
                        disabled={archiving === tenant.id}
                        className="text-xs text-forest-600 hover:text-forest-700 font-medium transition-colors disabled:opacity-50"
                      >
                        {archiving === tenant.id ? "Restoring…" : "Unarchive"}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
