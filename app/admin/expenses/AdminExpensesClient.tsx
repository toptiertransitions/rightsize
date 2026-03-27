"use client";

import { useState, useMemo, useEffect } from "react";
import { Pagination } from "../components/Pagination";

const PAGE_SIZE = 25;
import { cn } from "@/lib/utils";
import type { Expense, ExpenseCategory } from "@/lib/types";
import { EXPENSE_CATEGORIES } from "@/lib/types";

interface Props {
  initialExpenses: Expense[];
  allTenants?: { id: string; name: string }[];
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function fmtCurrency(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  "Meals & Entertainment": "bg-orange-100 text-orange-700",
  "Travel & Transportation": "bg-blue-100 text-blue-700",
  "Office Supplies": "bg-gray-100 text-gray-700",
  "Technology & Software": "bg-purple-100 text-purple-700",
  "Marketing & Advertising": "bg-pink-100 text-pink-700",
  "Professional Services": "bg-indigo-100 text-indigo-700",
  "Utilities": "bg-yellow-100 text-yellow-700",
  "Other": "bg-gray-100 text-gray-600",
};

// ─── Receipt viewer (handles both images and PDFs) ──────────────────────────
function pdfProxyUrl(url: string) {
  return `/api/pdf-proxy?url=${encodeURIComponent(url)}`;
}

function ReceiptViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const isPdf = url.includes("/raw/") || /\.pdf($|\?)/i.test(url);
  // Use the proxy for PDFs so the browser receives proper Content-Type headers
  // and opens the file inline rather than downloading it as an unknown type.
  const displayUrl = isPdf ? pdfProxyUrl(url) : url;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className="relative bg-gray-900 rounded-xl overflow-hidden shadow-2xl"
        style={{ width: "min(90vw, 800px)", height: "min(90vh, 700px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg hover:bg-black/80"
        >
          ×
        </button>
        {isPdf ? (
          <iframe src={displayUrl} className="w-full h-full border-0" title="Receipt PDF" />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={displayUrl} alt="Receipt" className="w-full h-full object-contain" />
        )}
        <a
          href={displayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-3 py-1 rounded-full hover:bg-black/80"
        >
          Open in new tab
        </a>
      </div>
    </div>
  );
}

// ─── Inline row editor ──────────────────────────────────────────────────────
function EditRow({
  expense,
  allTenants,
  onSave,
  onCancel,
}: {
  expense: Expense;
  allTenants: { id: string; name: string }[];
  onSave: (updated: Expense) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(expense.date);
  const [vendor, setVendor] = useState(expense.vendor);
  const [total, setTotal] = useState(String(expense.total));
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [description, setDescription] = useState(expense.description);
  const [notes, setNotes] = useState(expense.notes ?? "");
  const [reimbursable, setReimbursable] = useState(expense.reimbursable);
  const [billable, setBillable] = useState(expense.billable ?? false);
  const [tenantId, setTenantId] = useState(expense.tenantId ?? "");
  const [tenantNameInput, setTenantNameInput] = useState(expense.tenantName ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // When tenant dropdown changes, also derive tenantName
  const selectedTenant = allTenants.find(t => t.id === tenantId);
  const tenantName = allTenants.length > 0 ? (selectedTenant?.name ?? "") : tenantNameInput;

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: expense.id,
          date,
          vendor,
          total: parseFloat(total) || 0,
          category,
          description,
          notes,
          reimbursable,
          billable,
          tenantId: tenantId || null,
          tenantName: tenantName || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      onSave(data.expense);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-gray-700 rounded px-2 py-1 text-xs bg-gray-900 text-gray-100 focus:outline-none focus:border-forest-500";

  return (
    <tr className="bg-gray-800 border-b border-gray-700">
      <td className="px-3 py-2" />
      <td className="px-3 py-2"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></td>
      <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{expense.staffName}</td>
      <td className="px-3 py-2"><input value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputCls} /></td>
      <td className="px-3 py-2">
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputCls}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-3 py-2"><input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} className={cn(inputCls, "w-24")} /></td>
      <td className="px-3 py-2"><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} /></td>
      <td className="px-3 py-2"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></td>
      {/* Project */}
      <td className="px-3 py-2">
        {allTenants.length > 0 ? (
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={inputCls}>
            <option value="">— None —</option>
            {allTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ) : (
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Tenant ID" className={inputCls} />
        )}
      </td>
      {/* Billable */}
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)}
          className="rounded border-gray-600 bg-gray-800 text-forest-600 focus:ring-forest-500" />
      </td>
      {/* Reimbursable */}
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={reimbursable} onChange={(e) => setReimbursable(e.target.checked)}
          className="rounded border-gray-600 bg-gray-800 text-forest-600 focus:ring-forest-500" />
      </td>
      {/* Paid At — not editable inline; use Mark as Paid button */}
      <td className="px-3 py-2 text-xs text-gray-500">{expense.paidAt ? fmtDate(expense.paidAt.slice(0, 10)) : "—"}</td>
      {/* Receipt */}
      <td className="px-3 py-2 text-xs text-gray-500">—</td>
      {/* Actions */}
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <button onClick={handleSave} disabled={saving}
              className="px-2 py-1 text-xs bg-forest-600 text-white rounded hover:bg-forest-700 disabled:opacity-50">
              {saving ? "…" : "Save"}
            </button>
            <button onClick={onCancel} className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
              Cancel
            </button>
          </div>
          {saveError && <p className="text-xs text-red-400 whitespace-nowrap">{saveError}</p>}
        </div>
      </td>
    </tr>
  );
}

export function AdminExpensesClient({ initialExpenses, allTenants = [] }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | "All">("All");
  const [filterStaff, setFilterStaff] = useState<string>("All");
  const [filterReimbursable, setFilterReimbursable] = useState<"All" | "Yes" | "No" | "Unpaid">("All");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"date" | "total" | "staffName" | "category">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [bulkCategory, setBulkCategory] = useState<ExpenseCategory>("Other");
  const [deleting, setDeleting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const staffNames = useMemo(() => {
    const names = Array.from(new Set(expenses.map((e) => e.staffName))).sort();
    return ["All", ...names];
  }, [expenses]);

  const filtered = useMemo(() => {
    let list = expenses;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.vendor.toLowerCase().includes(q) ||
          e.staffName.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.notes ?? "").toLowerCase().includes(q) ||
          (e.tenantName ?? "").toLowerCase().includes(q)
      );
    }
    if (filterCategory !== "All") list = list.filter((e) => e.category === filterCategory);
    if (filterStaff !== "All") list = list.filter((e) => e.staffName === filterStaff);
    if (filterReimbursable === "Yes") list = list.filter((e) => e.reimbursable);
    if (filterReimbursable === "No") list = list.filter((e) => !e.reimbursable);
    if (filterReimbursable === "Unpaid") list = list.filter((e) => e.reimbursable && !e.paidAt);
    list = [...list].sort((a, b) => {
      let va: string | number = a[sortKey] ?? "";
      let vb: string | number = b[sortKey] ?? "";
      if (sortKey === "total") { va = Number(va); vb = Number(vb); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [expenses, search, filterCategory, filterStaff, filterReimbursable, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [search, filterCategory, filterStaff, filterReimbursable]);

  const grandTotal = filtered.reduce((s, e) => s + (e.total ?? 0), 0);
  const reimbursableTotal = filtered.filter(e => e.reimbursable && !e.paidAt).reduce((s, e) => s + (e.total ?? 0), 0);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e.id)));
  }

  async function bulkApplyCategory() {
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch("/api/expenses", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, category: bulkCategory }),
        }).then((r) => r.json())
      )
    );
    setExpenses((prev) =>
      prev.map((e) => (selected.has(e.id) ? { ...e, category: bulkCategory } : e))
    );
    setSelected(new Set());
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selected.size} expense(s)?`)) return;
    setDeleting(true);
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch(`/api/expenses?id=${id}`, { method: "DELETE" })
      )
    );
    setExpenses((prev) => prev.filter((e) => !selected.has(e.id)));
    setSelected(new Set());
    setDeleting(false);
  }

  async function markAsPaid(expense: Expense) {
    setMarkingPaid(expense.id);
    const paidAt = new Date().toISOString().slice(0, 10);
    const res = await fetch("/api/expenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: expense.id, paidAt }),
    });
    if (res.ok) {
      const data = await res.json();
      setExpenses((prev) => prev.map((e) => e.id === expense.id ? data.expense : e));
    }
    setMarkingPaid(null);
  }

  async function unmarkPaid(expense: Expense) {
    setMarkingPaid(expense.id);
    const res = await fetch("/api/expenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: expense.id, paidAt: null }),
    });
    if (res.ok) {
      const data = await res.json();
      setExpenses((prev) => prev.map((e) => e.id === expense.id ? data.expense : e));
    }
    setMarkingPaid(null);
  }

  function handleSaved(updated: Expense) {
    setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setEditingId(null);
  }

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k ? (
      <span className="ml-1 text-forest-400">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  const thCls = "px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none whitespace-nowrap";
  const thCentered = "px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap";

  return (
    <div className="space-y-4">
      {receiptUrl && <ReceiptViewer url={receiptUrl} onClose={() => setReceiptUrl(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Expenses</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} record{filtered.length !== 1 ? "s" : ""} · {fmtCurrency(grandTotal)} total
            {reimbursableTotal > 0 && (
              <span className="ml-2 text-amber-400">· {fmtCurrency(reimbursableTotal)} reimbursable unpaid</span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search vendor, name, project, description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-700 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-forest-500 w-72"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as ExpenseCategory | "All")}
          className="border border-gray-700 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 focus:outline-none focus:border-forest-500"
        >
          <option value="All">All Categories</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select
          value={filterStaff}
          onChange={(e) => setFilterStaff(e.target.value)}
          className="border border-gray-700 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 focus:outline-none focus:border-forest-500"
        >
          {staffNames.map((n) => <option key={n}>{n}</option>)}
        </select>
        <select
          value={filterReimbursable}
          onChange={(e) => setFilterReimbursable(e.target.value as typeof filterReimbursable)}
          className="border border-gray-700 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 focus:outline-none focus:border-forest-500"
        >
          <option value="All">All Expenses</option>
          <option value="Yes">Reimbursable</option>
          <option value="No">Non-Reimbursable</option>
          <option value="Unpaid">Reimbursable – Unpaid</option>
        </select>
      </div>

      {/* Bulk edit bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2">
          <span className="text-sm text-gray-300 font-medium">{selected.size} selected</span>
          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value as ExpenseCategory)}
            className="border border-gray-700 rounded px-2 py-1 text-xs bg-gray-900 text-gray-100 focus:outline-none"
          >
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button onClick={bulkApplyCategory}
            className="px-3 py-1 text-xs bg-forest-600 text-white rounded hover:bg-forest-700">
            Apply Category
          </button>
          <button onClick={bulkDelete} disabled={deleting}
            className="px-3 py-1 text-xs bg-red-700 text-white rounded hover:bg-red-800 disabled:opacity-50">
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button onClick={() => setSelected(new Set())}
            className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-600 bg-gray-800 text-forest-600 focus:ring-forest-500" />
                </th>
                <th className={thCls} onClick={() => toggleSort("date")}>Date <SortIcon k="date" /></th>
                <th className={thCls} onClick={() => toggleSort("staffName")}>Staff <SortIcon k="staffName" /></th>
                <th className={thCls}>Vendor</th>
                <th className={thCls} onClick={() => toggleSort("category")}>Category <SortIcon k="category" /></th>
                <th className={thCls} onClick={() => toggleSort("total")}>Total <SortIcon k="total" /></th>
                <th className={thCls}>Description</th>
                <th className={thCls}>Notes</th>
                <th className={thCls}>Project</th>
                <th className={thCentered}>Billable</th>
                <th className={thCentered}>Reimburse</th>
                <th className={thCls}>Paid</th>
                <th className={thCls}>Receipt</th>
                <th className={thCls}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-12 text-center text-gray-500 text-sm">No expenses found.</td>
                </tr>
              )}
              {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((expense) =>
                editingId === expense.id ? (
                  <EditRow
                    key={expense.id}
                    expense={expense}
                    allTenants={allTenants}
                    onSave={handleSaved}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <tr key={expense.id} className={cn("hover:bg-gray-800/50 transition-colors", selected.has(expense.id) && "bg-gray-800/40")}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(expense.id)} onChange={() => toggleSelect(expense.id)}
                        className="rounded border-gray-600 bg-gray-800 text-forest-600 focus:ring-forest-500" />
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-300 whitespace-nowrap">{fmtDate(expense.date)}</td>
                    <td className="px-3 py-3 text-sm text-gray-300 whitespace-nowrap">{expense.staffName}</td>
                    <td className="px-3 py-3 text-sm text-gray-200 font-medium">{expense.vendor || "—"}</td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-medium", CATEGORY_COLORS[expense.category])}>
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-200 font-semibold whitespace-nowrap">{fmtCurrency(expense.total)}</td>
                    <td className="px-3 py-3 text-sm text-gray-400 max-w-[180px] truncate">{expense.description || "—"}</td>
                    <td className="px-3 py-3 text-sm text-gray-500 max-w-[120px] truncate">{expense.notes || "—"}</td>
                    {/* Project */}
                    <td className="px-3 py-3 text-sm text-gray-400 whitespace-nowrap">
                      {expense.tenantName ? (
                        <span className="bg-gray-800 border border-gray-700 px-2 py-0.5 rounded text-xs text-gray-300">{expense.tenantName}</span>
                      ) : "—"}
                    </td>
                    {/* Billable */}
                    <td className="px-3 py-3 text-center">
                      {expense.billable ? (
                        <span className="inline-block w-4 h-4 rounded-full bg-blue-500" title="Billable" />
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>
                    {/* Reimbursable */}
                    <td className="px-3 py-3 text-center">
                      {expense.reimbursable ? (
                        <span className="inline-block text-[10px] font-semibold bg-amber-900/40 border border-amber-700 text-amber-400 px-1.5 py-0.5 rounded">Yes</span>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>
                    {/* Paid */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {expense.reimbursable ? (
                        expense.paidAt ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-green-400 font-medium">{fmtDate(expense.paidAt.slice(0, 10))}</span>
                            <button
                              onClick={() => unmarkPaid(expense)}
                              disabled={markingPaid === expense.id}
                              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                              title="Undo paid"
                            >
                              ↩
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => markAsPaid(expense)}
                            disabled={markingPaid === expense.id}
                            className="text-[10px] font-semibold bg-amber-900/30 border border-amber-700 text-amber-400 hover:bg-amber-900/60 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                          >
                            {markingPaid === expense.id ? "…" : "Mark Paid"}
                          </button>
                        )
                      ) : (
                        <span className="text-gray-700 text-xs">—</span>
                      )}
                    </td>
                    {/* Receipt */}
                    <td className="px-3 py-3">
                      {expense.receiptUrl ? (
                        <button onClick={() => setReceiptUrl(expense.receiptUrl!)}
                          className="text-xs text-forest-400 hover:text-forest-300 underline">
                          View
                        </button>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="px-3 py-3">
                      <button onClick={() => setEditingId(expense.id)}
                        className="text-xs text-gray-400 hover:text-white transition-colors">
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t border-gray-700 bg-gray-800/50">
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-xs text-gray-400 text-right font-medium">
                    Total ({filtered.length} expenses):
                  </td>
                  <td className="px-3 py-2 text-sm font-bold text-white">{fmtCurrency(grandTotal)}</td>
                  <td colSpan={8} />
                </tr>
              </tfoot>
            )}
          </table>
          <Pagination currentPage={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}
