"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemPriceHistory, PriceChangeType } from "@/lib/types";

interface Project { id: string; name: string; }

interface Props {
  history: ItemPriceHistory[];
  projects: Project[];
  selectedTenantId: string;
}

const CHANGE_TYPE_COLORS: Record<PriceChangeType, string> = {
  "Listed":       "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40",
  "Manual Edit":  "bg-blue-900/40 text-blue-300 border border-blue-700/40",
  "Price Drop 1": "bg-amber-900/40 text-amber-300 border border-amber-700/40",
  "Price Drop 2": "bg-orange-900/40 text-orange-300 border border-orange-700/40",
  "Reverted":     "bg-gray-700/40 text-gray-300 border border-gray-600/40",
  "Sale Price":   "bg-purple-900/40 text-purple-300 border border-purple-700/40",
};

function fmt(v: number) {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function pctChange(oldVal: number, newVal: number): string {
  if (!oldVal) return "—";
  const pct = ((newVal - oldVal) / oldVal) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

export function ItemsAdmin({ history, projects, selectedTenantId }: Props) {
  const router = useRouter();
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  function toggleItem(itemId: string) {
    setExpandedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  // Group by itemId for the summary view
  const byItem = new Map<string, ItemPriceHistory[]>();
  for (const h of history) {
    if (!byItem.has(h.itemId)) byItem.set(h.itemId, []);
    byItem.get(h.itemId)!.push(h);
  }

  const projectMap: Record<string, string> = {};
  for (const p of projects) projectMap[p.id] = p.name;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Item Price History</h1>
          <p className="text-sm text-gray-400 mt-0.5">{history.length} change event{history.length !== 1 ? "s" : ""}{selectedTenantId ? ` for selected project` : ""}</p>
        </div>
        <select
          value={selectedTenantId}
          onChange={e => router.push(e.target.value ? `/admin/items?tenantId=${e.target.value}` : "/admin/items")}
          className="h-9 pl-3 pr-8 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-forest-500"
        >
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {history.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-12 text-center">
          <p className="text-gray-500">No price changes recorded yet.</p>
          <p className="text-gray-600 text-xs mt-1">Price changes will appear here once items are listed or repriced.</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
          {/* Summary rows — one per unique item */}
          {Array.from(byItem.entries()).map(([itemId, changes]) => {
            const latest = changes[0]; // already sorted newest-first
            const listed = changes.find(c => c.changeType === "Listed");
            const originalVal = listed?.newValue ?? changes[changes.length - 1]?.oldValue ?? 0;
            const currentVal = latest.newValue;
            const isExpanded = expandedItemIds.has(itemId);

            return (
              <div key={itemId} className="border-b border-gray-800 last:border-0">
                {/* Summary row */}
                <button
                  type="button"
                  onClick={() => toggleItem(itemId)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-gray-800/50 transition-colors"
                >
                  <svg
                    className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{latest.itemName}</p>
                    <p className="text-xs text-gray-500">{projectMap[latest.tenantId] ?? latest.tenantId}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-right flex-shrink-0">
                    <div>
                      <p className="text-gray-500">Original</p>
                      <p className="text-white font-medium">{originalVal ? fmt(originalVal) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Current</p>
                      <p className="text-white font-medium">{fmt(currentVal)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Change</p>
                      <p className={`font-medium ${currentVal < (originalVal || currentVal) ? "text-red-400" : "text-gray-300"}`}>
                        {originalVal ? pctChange(originalVal, currentVal) : "—"}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-gray-500">Events</p>
                      <p className="text-gray-300 font-medium">{changes.length}</p>
                    </div>
                  </div>
                </button>

                {/* Expanded change log */}
                {isExpanded && (
                  <div className="border-t border-gray-800 bg-gray-950/50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left px-6 py-2 text-gray-500 font-medium">Date</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Type</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Old Value</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">New Value</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Change</th>
                          <th className="text-left px-3 py-2 pr-6 text-gray-500 font-medium">By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map(c => (
                          <tr key={c.id} className="border-b border-gray-800/50 last:border-0">
                            <td className="px-6 py-2.5 text-gray-400">{fmtDate(c.changedAt)}</td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${CHANGE_TYPE_COLORS[c.changeType] ?? "bg-gray-700/40 text-gray-300"}`}>
                                {c.changeType}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-400">{c.oldValue ? fmt(c.oldValue) : "—"}</td>
                            <td className="px-3 py-2.5 text-right text-white font-medium">{fmt(c.newValue)}</td>
                            <td className={`px-3 py-2.5 text-right font-medium ${c.newValue < c.oldValue ? "text-red-400" : c.newValue > c.oldValue ? "text-emerald-400" : "text-gray-500"}`}>
                              {c.oldValue ? pctChange(c.oldValue, c.newValue) : "—"}
                            </td>
                            <td className="px-3 py-2.5 pr-6 text-gray-400 truncate max-w-[120px]">{c.changedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
