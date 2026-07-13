"use client";

import { useState, useMemo } from "react";
import type { Item } from "@/lib/types";
import { getQAIssues, AI_FIXABLE_FIELDS, isAIFixable } from "@/lib/pf-qa";
import type { QAFixField } from "@/lib/pf-qa";

interface Props {
  items: Item[];
  onClose: () => void;
  onItemFixed: (id: string, updates: Partial<Item>) => void;
}

type Step = "select" | "running" | "done";

interface ItemProgress {
  id: string;
  name: string;
  status: "pending" | "running" | "done" | "error";
  updates?: Partial<Item>;
  error?: string;
}

function IssueChip({ label, critical }: { label: string; critical: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
      critical ? "bg-red-950 text-red-400 border border-red-800" : "bg-amber-950 text-amber-400 border border-amber-800"
    }`}>
      {critical ? "●" : "◐"} {label}
    </span>
  );
}

// Derive unique values for filter dropdowns from the full item list
function uniqueSorted(vals: (string | undefined)[]): string[] {
  return [...new Set(vals.filter((v): v is string => !!v))].sort();
}

export function BulkAIFixModal({ items, onClose, onItemFixed }: Props) {
  const [step, setStep] = useState<Step>("select");

  // Filters
  const [routeFilter, setRouteFilter] = useState("ProFoundFinds Consignment");
  const [statusFilter, setStatusFilter] = useState("Listed");
  const [siteFilter, setSiteFilter] = useState<"all" | "yes" | "no">("yes");

  const allRoutes = useMemo(() => uniqueSorted(items.map(i => i.primaryRoute)), [items]);
  const allStatuses = useMemo(() => uniqueSorted(items.map(i => i.status)), [items]);

  // Filtered + fixable items
  const fixableItems = useMemo(() => {
    return items
      .filter(item => {
        if (routeFilter && item.primaryRoute !== routeFilter) return false;
        if (statusFilter && item.status !== statusFilter) return false;
        if (siteFilter === "yes" && !item.storefrontActive) return false;
        if (siteFilter === "no" && item.storefrontActive) return false;
        const issues = getQAIssues(item);
        return issues.some(isAIFixable);
      })
      .sort((a, b) => {
        const aIssues = getQAIssues(a);
        const bIssues = getQAIssues(b);
        const aCrit = aIssues.some(i => i.severity === "critical" && isAIFixable(i)) ? 0 : 1;
        const bCrit = bIssues.some(i => i.severity === "critical" && isAIFixable(i)) ? 0 : 1;
        return aCrit - bCrit || a.itemName.localeCompare(b.itemName);
      });
  }, [items, routeFilter, statusFilter, siteFilter]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const item of items) {
      const issues = getQAIssues(item);
      if (issues.some(isAIFixable)) ids.add(item.id);
    }
    return ids;
  });
  const [fixFields, setFixFields] = useState<Set<QAFixField>>(
    new Set(AI_FIXABLE_FIELDS.map(f => f.key))
  );
  const [progress, setProgress] = useState<ItemProgress[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const filteredIds = fixableItems.map(i => i.id);
    const allChecked = filteredIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allChecked) filteredIds.forEach(id => next.delete(id));
      else filteredIds.forEach(id => next.add(id));
      return next;
    });
  }

  function toggleField(key: QAFixField) {
    setFixFields(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleFix() {
    const toFix = fixableItems.filter(i => selectedIds.has(i.id));
    if (!toFix.length || !fixFields.size) return;


    const initialProgress: ItemProgress[] = toFix.map(item => ({
      id: item.id,
      name: item.itemName,
      status: "pending",
    }));
    setProgress(initialProgress);
    setStep("running");

    let done = 0;
    let errors = 0;

    for (const item of toFix) {
      setProgress(prev => prev.map(p => p.id === item.id ? { ...p, status: "running" } : p));

      // Only send fields that apply to this item's actual issues
      const itemIssues = getQAIssues(item);
      const relevantFields = [...fixFields].filter(field =>
        itemIssues.some(issue => issue.field === field && isAIFixable(issue))
      );

      if (!relevantFields.length) {
        setProgress(prev => prev.map(p => p.id === item.id ? { ...p, status: "done", updates: {} } : p));
        done++;
        setDoneCount(done);
        continue;
      }

      try {
        const res = await fetch("/api/admin/pf-bulk-ai-fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            tenantId: item.tenantId,
            itemName: item.itemName,
            category: item.category,
            condition: item.condition,
            conditionNotes: item.conditionNotes,
            listingDescriptionEbay: item.listingDescriptionEbay,
            photoUrl: item.photos?.[0]?.url,
            fixFields: relevantFields,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || "AI fix failed");
        }

        const updates = data.updates as Partial<Item>;
        setProgress(prev => prev.map(p => p.id === item.id ? { ...p, status: "done", updates } : p));
        onItemFixed(item.id, updates);
        done++;
        setDoneCount(done);
      } catch (e) {
        const error = e instanceof Error ? e.message : "Unknown error";
        setProgress(prev => prev.map(p => p.id === item.id ? { ...p, status: "error", error } : p));
        errors++;
        setErrorCount(errors);
      }
    }

    setStep("done");
  }

  const selectedCount = selectedIds.size;
  const totalFixable = fixableItems.length;
  const filteredSelectedCount = fixableItems.filter(i => selectedIds.has(i.id)).length;
  const allSelected = filteredSelectedCount === totalFixable && totalFixable > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={step === "select" ? onClose : undefined} />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Fix Listing Issues with AI</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === "select"
                ? `${totalFixable} item${totalFixable !== 1 ? "s" : ""} with AI-fixable issues`
                : step === "running"
                ? "Claude is reviewing and improving your listings…"
                : `${doneCount} updated${errorCount > 0 ? `, ${errorCount} failed` : ""}`}
            </p>
          </div>
          {step !== "running" && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── STEP: SELECT ── */}
          {step === "select" && (
            <div className="p-6">
              {totalFixable === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">✓</div>
                  <p className="text-white font-semibold">No AI-fixable issues found</p>
                  <p className="text-gray-400 text-sm mt-1">All active listed items have names, descriptions, and condition notes.</p>
                </div>
              ) : (
                <>
                  {/* Filters */}
                  <div className="mb-4 p-4 bg-gray-800/60 rounded-xl border border-gray-700">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Filter items</p>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={routeFilter}
                        onChange={e => setRouteFilter(e.target.value)}
                        className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#2E6B4F]"
                      >
                        <option value="">All Routes</option>
                        {allRoutes.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#2E6B4F]"
                      >
                        <option value="">All Statuses</option>
                        {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <select
                        value={siteFilter}
                        onChange={e => setSiteFilter(e.target.value as "all" | "yes" | "no")}
                        className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#2E6B4F]"
                      >
                        <option value="all">All (Site)</option>
                        <option value="yes">Site: Active</option>
                        <option value="no">Site: Inactive</option>
                      </select>
                    </div>
                  </div>

                  {/* Issue type toggles */}
                  <div className="mb-5 p-4 bg-gray-800/60 rounded-xl border border-gray-700">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Fix these issue types</p>
                    <div className="flex flex-wrap gap-2">
                      {AI_FIXABLE_FIELDS.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => toggleField(key)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                            fixFields.has(key)
                              ? "bg-[#2E6B4F] border-[#2E6B4F] text-white"
                              : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500"
                          }`}
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                            fixFields.has(key) ? "bg-white/20 border-white/40" : "border-gray-600"
                          }`}>
                            {fixFields.has(key) && "✓"}
                          </span>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Select-all row */}
                  <div className="flex items-center gap-3 mb-3 px-1">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-[#2E6B4F] focus:ring-[#2E6B4F] focus:ring-offset-gray-900 cursor-pointer"
                    />
                    <span className="text-xs text-gray-400 font-medium">
                      {allSelected ? "Deselect all" : `Select all ${totalFixable} filtered item${totalFixable !== 1 ? "s" : ""}`}
                    </span>
                  </div>

                  {/* Item list */}
                  <div className="space-y-2">
                    {fixableItems.map(item => {
                      const issues = getQAIssues(item).filter(isAIFixable);
                      const selected = selectedIds.has(item.id);
                      const photoUrl = item.photos?.[0]?.url;
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                            selected
                              ? "bg-gray-800 border-[#2E6B4F]/60"
                              : "bg-gray-800/40 border-gray-700 hover:border-gray-600"
                          }`}
                        >
                          {/* Checkbox */}
                          <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                            selected ? "bg-[#2E6B4F] border-[#2E6B4F]" : "border-gray-600"
                          }`}>
                            {selected && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12"><path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                          </div>

                          {/* Thumbnail */}
                          {photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-700" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-700 shrink-0 flex items-center justify-center">
                              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{item.itemName}</p>
                            <p className="text-xs text-gray-500 mb-1.5">{item.category} · {item.condition}</p>
                            <div className="flex flex-wrap gap-1">
                              {issues.map((issue, i) => (
                                <IssueChip key={i} label={issue.label} critical={issue.severity === "critical"} />
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STEP: RUNNING ── */}
          {step === "running" && (
            <div className="p-6">
              {/* Overall progress bar */}
              <div className="mb-6">
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>{doneCount + errorCount} of {progress.length} processed</span>
                  <span>{Math.round(((doneCount + errorCount) / progress.length) * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2E6B4F] rounded-full transition-all duration-500"
                    style={{ width: `${((doneCount + errorCount) / progress.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Per-item status */}
              <div className="space-y-2">
                {progress.map(p => (
                  <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    p.status === "done" ? "bg-green-950/30 border-green-800/50" :
                    p.status === "error" ? "bg-red-950/30 border-red-800/50" :
                    p.status === "running" ? "bg-[#2E6B4F]/10 border-[#2E6B4F]/40" :
                    "bg-gray-800/30 border-gray-700/50"
                  }`}>
                    {/* Status icon */}
                    <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                      {p.status === "pending" && <div className="w-2 h-2 rounded-full bg-gray-600" />}
                      {p.status === "running" && (
                        <svg className="w-4 h-4 text-[#2E6B4F] animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                      {p.status === "done" && <span className="text-green-400 text-sm">✓</span>}
                      {p.status === "error" && <span className="text-red-400 text-sm">✗</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{p.name}</p>
                      {p.status === "running" && <p className="text-xs text-[#2E6B4F]">Claude is reviewing…</p>}
                      {p.status === "done" && p.updates && (
                        <p className="text-xs text-green-400">
                          Updated: {Object.keys(p.updates).map(k =>
                            k === "itemName" ? "name" : k === "listingDescriptionEbay" ? "description" : "condition notes"
                          ).join(", ")}
                        </p>
                      )}
                      {p.status === "error" && <p className="text-xs text-red-400 truncate">{p.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP: DONE ── */}
          {step === "done" && (
            <div className="p-6">
              <div className="text-center mb-6 p-4 bg-green-950/30 border border-green-800/50 rounded-xl">
                <div className="text-3xl mb-2">✓</div>
                <p className="text-white font-semibold">{doneCount} item{doneCount !== 1 ? "s" : ""} updated</p>
                {errorCount > 0 && <p className="text-red-400 text-sm mt-1">{errorCount} failed — see details below</p>}
              </div>

              <div className="space-y-3">
                {progress.map(p => (
                  <div key={p.id} className={`p-3 rounded-xl border ${
                    p.status === "done" ? "bg-gray-800/60 border-gray-700" : "bg-red-950/20 border-red-800/50"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={p.status === "done" ? "text-green-400" : "text-red-400"}>
                        {p.status === "done" ? "✓" : "✗"}
                      </span>
                      <span className="text-sm font-medium text-white">{p.name}</span>
                    </div>
                    {p.status === "done" && p.updates && Object.entries(p.updates).length > 0 && (
                      <div className="space-y-2 ml-5">
                        {(p.updates as Record<string, string>).itemName && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">New Name</p>
                            <p className="text-sm text-gray-200">{(p.updates as Record<string, string>).itemName}</p>
                          </div>
                        )}
                        {(p.updates as Record<string, string>).conditionNotes && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Condition Notes</p>
                            <p className="text-sm text-gray-200">{(p.updates as Record<string, string>).conditionNotes}</p>
                          </div>
                        )}
                        {(p.updates as Record<string, string>).listingDescriptionEbay && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Description</p>
                            <p className="text-sm text-gray-200 line-clamp-3">{(p.updates as Record<string, string>).listingDescriptionEbay}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {p.status === "error" && (
                      <p className="text-xs text-red-400 ml-5">{p.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "select" && totalFixable > 0 && (
          <div className="px-6 py-4 border-t border-gray-800 shrink-0 flex items-center justify-between gap-3">
            <span className="text-sm text-gray-400">
              {filteredSelectedCount > 0
                ? `${filteredSelectedCount} item${filteredSelectedCount !== 1 ? "s" : ""} selected`
                : "No items selected"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFix}
                disabled={filteredSelectedCount === 0 || fixFields.size === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2E6B4F] hover:bg-[#245a40] text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Fix {filteredSelectedCount} item{filteredSelectedCount !== 1 ? "s" : ""} with AI
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="px-6 py-4 border-t border-gray-800 shrink-0 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-[#2E6B4F] hover:bg-[#245a40] text-white text-sm font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
