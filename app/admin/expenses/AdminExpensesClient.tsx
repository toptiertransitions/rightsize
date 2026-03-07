"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Expense, ExpenseCategory } from "@/lib/types";
import { EXPENSE_CATEGORIES } from "@/lib/types";

interface Props {
  initialExpenses: Expense[];
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

// ─── Inline row editor ──────────────────────────────────────────────────────
function EditRow({
  expense,
  onSave,
  onCancel,
}: {
  expense: Expense;
  onSave: (updated: Expense) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(expense.date);
  const [vendor, setVendor] = useState(expense.vendor);
  const [total, setTotal] = useState(String(expense.total));
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [description, setDescription] = useState(expense.description);
  const [notes, setNotes] = useState(expense.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
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
      }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      onSave(data.expense);
    }
  }

  const inputCls = "w-full border border-gray-700 rounded px-2 py-1 text-xs bg-gray-900 text-gray-100 focus:outline-none focus:border-forest-500";

  return (
    <tr className="bg-gray-800">
      <td className="px-4 py-2"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></td>
      <td className="px-4 py-2 text-xs text-gray-400">{expense.staffName}</td>
      <td className="px-4 py-2"><input value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputCls} /></td>
      <td className="px-4 py-2">
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputCls}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-4 py-2"><input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} className={cn(inputCls, "w-24")} /></td>
      <td className="px-4 py-2"><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} /></td>
      <td className="px-4 py-2"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></td>
      <td className="px-4 py-2">—</td>
      <td className="px-4 py-2">
        <div className="flex gap-1">
          <button onClick={handleSave} disabled={saving}
            className="px-2 py-1 text-xs bg-forest-600 text-white rounded hover:bg-forest-700 disabled:opacity-50">
            {saving ? "…" : "Save"}
          </button>
          <button onClick={onCancel} className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Receipt image modal ────────────────────────────────────────────────────
function ReceiptModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Receipt" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
        <button onClick={onClose}
          className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg hover:bg-black/80">
          ×
        </button>
      </div>
    </div>
  );
}

export function AdminExpensesClient({ initialExpenses }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | "All">("All");
  const [filterStaff, setFilterStaff] = useState<string>("All");
  const [sortKey, setSortKey] = useState<"date" | "total" | "staffName" | "category">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [bulkCategory, setBulkCategory] = useState<ExpenseCategory>("Other");
  const [deleting, setDeleting] = useState(false);

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
          (e.notes ?? "").toLowerCase().includes(q)
      );
    }
    if (filterCategory !== "All") list = list.filter((e) => e.category === filterCategory);
    if (filterStaff !== "All") list = list.filter((e) => e.staffName === filterStaff);
    list = [...list].sort((a, b) => {
      let va: string | number = a[sortKey] ?? "";
      let vb: string | number = b[sortKey] ?? "";
      if (sortKey === "total") { va = Number(va); vb = Number(vb); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [expenses, search, filterCategory, filterStaff, sortKey, sortDir]);

  const grandTotal = filtered.reduce((s, e) => s + (e.total ?? 0), 0);

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

  function handleSaved(updated: Expense) {
    setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setEditingId(null);
  }

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k ? (
      <span className="ml-1 text-forest-400">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  const thCls = "px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none";

  return (
    <div className="space-y-4">
      {receiptUrl && <ReceiptModal url={receiptUrl} onClose={() => setReceiptUrl(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Expenses</h1>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} record{filtered.length !== 1 ? "s" : ""} · {fmtCurrency(grandTotal)} total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search vendor, name, description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-700 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-forest-500 w-64"
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
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="px-4 py-3 w-10">
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
                <th className={thCls}>Receipt</th>
                <th className={thCls}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500 text-sm">No expenses found.</td>
                </tr>
              )}
              {filtered.map((expense) =>
                editingId === expense.id ? (
                  <EditRow key={expense.id} expense={expense} onSave={handleSaved} onCancel={() => setEditingId(null)} />
                ) : (
                  <tr key={expense.id} className={cn("hover:bg-gray-800/50 transition-colors", selected.has(expense.id) && "bg-gray-800/40")}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(expense.id)} onChange={() => toggleSelect(expense.id)}
                        className="rounded border-gray-600 bg-gray-800 text-forest-600 focus:ring-forest-500" />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">{fmtDate(expense.date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">{expense.staffName}</td>
                    <td className="px-4 py-3 text-sm text-gray-200 font-medium">{expense.vendor || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-medium", CATEGORY_COLORS[expense.category])}>
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-200 font-semibold whitespace-nowrap">{fmtCurrency(expense.total)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 max-w-[200px] truncate">{expense.description || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[150px] truncate">{expense.notes || "—"}</td>
                    <td className="px-4 py-3">
                      {expense.receiptUrl ? (
                        <button onClick={() => setReceiptUrl(expense.receiptUrl!)}
                          className="text-xs text-forest-400 hover:text-forest-300 underline">
                          View
                        </button>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
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
                  <td colSpan={5} className="px-4 py-2 text-xs text-gray-400 text-right font-medium">
                    Total ({filtered.length} expenses):
                  </td>
                  <td className="px-4 py-2 text-sm font-bold text-white">{fmtCurrency(grandTotal)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
