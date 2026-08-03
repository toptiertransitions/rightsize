"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemPriceHistory, PriceChangeType } from "@/lib/types";
import type { ItemRouteHistory, ItemStatusHistory, FlaggedDonateItem } from "@/lib/airtable";

interface Project { id: string; name: string; }

interface Props {
  history: ItemPriceHistory[];
  routeHistory: ItemRouteHistory[];
  statusHistory: ItemStatusHistory[];
  flaggedItems: FlaggedDonateItem[];
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

const SOURCE_COLORS: Record<string, string> = {
  "Manual Edit":  "bg-blue-900/40 text-blue-300 border border-blue-700/40",
  "Bulk List":    "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40",
  "Bulk Route":   "bg-purple-900/40 text-purple-300 border border-purple-700/40",
  "Auto-Routing": "bg-amber-900/40 text-amber-300 border border-amber-700/40",
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

function SourceChip({ source }: { source: string }) {
  const cls = SOURCE_COLORS[source] ?? "bg-gray-700/40 text-gray-300 border border-gray-600/40";
  return <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{source}</span>;
}

export function ItemsAdmin({ history, routeHistory, statusHistory, flaggedItems, projects, selectedTenantId }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"price" | "route" | "status" | "issues">("issues");
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  function toggleItem(itemId: string) {
    setExpandedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  const byItem = new Map<string, ItemPriceHistory[]>();
  for (const h of history) {
    if (!byItem.has(h.itemId)) byItem.set(h.itemId, []);
    byItem.get(h.itemId)!.push(h);
  }

  const projectMap: Record<string, string> = {};
  for (const p of projects) projectMap[p.id] = p.name;

  const [flagged, setFlagged] = useState(flaggedItems);
  const [clearingId, setClearingId] = useState<string | null>(null);

  const handleClearRoute = async (item: FlaggedDonateItem) => {
    if (!confirm(`Clear the Donate route for "${item.itemName}"?`)) return;
    setClearingId(item.id);
    try {
      const res = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, tenantId: item.tenantId, primaryRoute: null }),
      });
      if (!res.ok) throw new Error("Failed");
      setFlagged(prev => prev.filter(i => i.id !== item.id));
    } catch {
      alert("Failed to clear route. Try again.");
    } finally {
      setClearingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm(`Clear the Donate route on all ${flagged.length} flagged items? This cannot be undone.`)) return;
    for (const item of flagged) {
      await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, tenantId: item.tenantId, primaryRoute: null }),
      }).catch(() => {});
    }
    setFlagged([]);
  };

  const TABS = [
    { id: "issues" as const, label: `Route Issues${flagged.length > 0 ? ` (${flagged.length})` : ""}` },
    { id: "price" as const,  label: "Item Price History" },
    { id: "route" as const,  label: "Route Audit" },
    { id: "status" as const, label: "Statuses" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-forest-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
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

      {tab === "issues" && (
        <>
          <div className="flex items-center justify-between -mt-3">
            <p className="text-sm text-gray-400">
              {flagged.length === 0
                ? "No route issues found."
                : `${flagged.length} item${flagged.length !== 1 ? "s" : ""} with Good/Excellent condition stuck on Donate route (Pending Review).`}
            </p>
            {flagged.length > 0 && (
              <button
                onClick={handleClearAll}
                className="h-8 px-3 rounded-lg bg-red-900/50 border border-red-700/50 text-red-300 text-xs font-medium hover:bg-red-900 transition-colors"
              >
                Clear All Routes
              </button>
            )}
          </div>
          {flagged.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl p-12 text-center">
              <p className="text-gray-500">All clear — no route issues detected.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs">Item</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">Project</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">Route</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">Condition</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">Added By</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">Created</th>
                    <th className="px-3 py-3 pr-5" />
                  </tr>
                </thead>
                <tbody>
                  {flagged.map(item => (
                    <tr key={item.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30">
                      <td className="px-5 py-2.5 text-sm text-white font-medium max-w-[180px] truncate">{item.itemName}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">{projectMap[item.tenantId] ?? item.tenantId}</td>
                      <td className="px-3 py-2.5 text-xs text-amber-400 font-medium">{item.primaryRoute}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                          {item.condition}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">{item.createdBy}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(item.createdAt)}</td>
                      <td className="px-3 py-2.5 pr-5 text-right">
                        <button
                          onClick={() => handleClearRoute(item)}
                          disabled={clearingId === item.id}
                          className="h-7 px-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 disabled:opacity-50 transition-colors"
                        >
                          {clearingId === item.id ? "Clearing…" : "Clear Route"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "price" && (
        <>
          <p className="text-sm text-gray-400 -mt-3">{history.length} change event{history.length !== 1 ? "s" : ""}{selectedTenantId ? " for selected project" : ""}</p>
          {history.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl p-12 text-center">
              <p className="text-gray-500">No price changes recorded yet.</p>
              <p className="text-gray-600 text-xs mt-1">Price changes will appear here once items are listed or repriced.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
              {Array.from(byItem.entries()).map(([itemId, changes]) => {
                const latest = changes[0];
                const listed = changes.find(c => c.changeType === "Listed");
                const originalVal = listed?.newValue ?? changes[changes.length - 1]?.oldValue ?? 0;
                const currentVal = latest.newValue;
                const isExpanded = expandedItemIds.has(itemId);

                return (
                  <div key={itemId} className="border-b border-gray-800 last:border-0">
                    <button
                      type="button"
                      onClick={() => toggleItem(itemId)}
                      className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-gray-800/50 transition-colors"
                    >
                      <svg className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        </>
      )}

      {tab === "route" && (
        <>
          <p className="text-sm text-gray-400 -mt-3">{routeHistory.length} route change{routeHistory.length !== 1 ? "s" : ""}{selectedTenantId ? " for selected project" : ""}</p>
          {routeHistory.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl p-12 text-center">
              <p className="text-gray-500">No route changes recorded yet.</p>
              <p className="text-gray-600 text-xs mt-1">Route changes will appear here as items are reassigned going forward.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs">Date</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">Item</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs hidden sm:table-cell">Project</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">Old Route</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">New Route</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs hidden md:table-cell">By</th>
                    <th className="text-left px-3 py-3 pr-5 text-gray-500 font-medium text-xs">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {routeHistory.map(r => (
                    <tr key={r.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30">
                      <td className="px-5 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(r.changedAt)}</td>
                      <td className="px-3 py-2.5 text-sm text-white font-medium max-w-[180px] truncate">{r.itemName}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 hidden sm:table-cell">{projectMap[r.tenantId] ?? r.tenantId}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">{r.oldRoute || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-amber-300 font-medium">{r.newRoute}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400 hidden md:table-cell">{r.changedBy}</td>
                      <td className="px-3 py-2.5 pr-5"><SourceChip source={r.source} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "status" && (
        <>
          <p className="text-sm text-gray-400 -mt-3">{statusHistory.length} status change{statusHistory.length !== 1 ? "s" : ""}{selectedTenantId ? " for selected project" : ""}</p>
          {statusHistory.length === 0 ? (
            <div className="bg-gray-900 rounded-2xl p-12 text-center">
              <p className="text-gray-500">No status changes recorded yet.</p>
              <p className="text-gray-600 text-xs mt-1">Status changes will appear here as items are updated going forward.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs">Date</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">Item</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs hidden sm:table-cell">Project</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">Old Status</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs">New Status</th>
                    <th className="text-left px-3 py-3 text-gray-500 font-medium text-xs hidden md:table-cell">By</th>
                    <th className="text-left px-3 py-3 pr-5 text-gray-500 font-medium text-xs">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {statusHistory.map(s => (
                    <tr key={s.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30">
                      <td className="px-5 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(s.changedAt)}</td>
                      <td className="px-3 py-2.5 text-sm text-white font-medium max-w-[180px] truncate">{s.itemName}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 hidden sm:table-cell">{projectMap[s.tenantId] ?? s.tenantId}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">{s.oldStatus || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-emerald-300 font-medium">{s.newStatus}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400 hidden md:table-cell">{s.changedBy}</td>
                      <td className="px-3 py-2.5 pr-5"><SourceChip source={s.source} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
