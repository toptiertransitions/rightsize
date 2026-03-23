"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Expense, ExpenseCategory, Tenant } from "@/lib/types";
import { EXPENSE_CATEGORIES } from "@/lib/types";

// ─── Tenant combobox ───────────────────────────────────────────────────────────
function TenantCombobox({ tenants, value, onChange, inputCls }: {
  tenants: Tenant[];
  value: string;
  onChange: (id: string) => void;
  inputCls?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = tenants.find(t => t.id === value);
  const filtered = query === ""
    ? tenants
    : tenants.filter(t => t.name.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={open ? query : (selected?.name ?? "")}
          placeholder="Search project…"
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          className={cn("pr-6", inputCls ?? "border border-gray-300 rounded-lg px-2 py-1 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-forest-400")}
        />
        {value && !open && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(""); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 leading-none"
          >×</button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-56 max-h-52 overflow-auto bg-white border border-gray-200 rounded-xl shadow-lg">
          <button
            type="button"
            onMouseDown={() => { onChange(""); setOpen(false); setQuery(""); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
          >— No project —</button>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
          ) : filtered.map(t => (
            <button
              key={t.id}
              type="button"
              onMouseDown={() => { onChange(t.id); setOpen(false); setQuery(""); }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-forest-50 transition-colors",
                value === t.id ? "bg-forest-50 text-forest-700 font-medium" : "text-gray-700"
              )}
            >{t.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  initialExpenses: Expense[];
  staffName: string;
  tenants: Tenant[];
  isManagerOrAdmin: boolean;
  sysRole: string | null;
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function fmtCurrency(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function defaultReimbursableForRole(sysRole: string | null): boolean {
  return sysRole === "TTTStaff" || sysRole === "TTTManager";
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

// ─── Inline row editor (existing expense) ──────────────────────────────────────
function EditRow({
  expense,
  tenants,
  onSave,
  onCancel,
}: {
  expense: Expense;
  tenants: Tenant[];
  onSave: (updated: Expense) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(expense.date);
  const [vendor, setVendor] = useState(expense.vendor);
  const [total, setTotal] = useState(String(expense.total));
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [description, setDescription] = useState(expense.description);
  const [notes, setNotes] = useState(expense.notes ?? "");
  const [tenantId, setTenantId] = useState(expense.tenantId ?? "");
  const [reimbursable, setReimbursable] = useState(expense.reimbursable);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const selectedTenant = tenants.find(t => t.id === tenantId);
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
          notes: notes || undefined,
          tenantId: tenantId || null,
          tenantName: selectedTenant?.name || null,
          reimbursable,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      onSave(data.expense);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  const inputCls = "border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400";

  return (
    <tr className="bg-forest-50/60 border-b border-forest-100">
      <td className="px-3 py-2"><input type="checkbox" disabled /></td>
      <td className="px-3 py-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={cn(inputCls, "w-32")} />
      </td>
      <td className="px-3 py-2">
        <input value={vendor} onChange={e => setVendor(e.target.value)} className={cn(inputCls, "w-32")} />
      </td>
      <td className="px-3 py-2">
        <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)} className={cn(inputCls, "w-44")}>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input type="number" step="0.01" value={total} onChange={e => setTotal(e.target.value)} className={cn(inputCls, "w-24")} />
      </td>
      <td className="px-3 py-2">
        <input value={description} onChange={e => setDescription(e.target.value)} className={cn(inputCls, "w-44")} />
      </td>
      <td className="px-3 py-2">
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional…" className={cn(inputCls, "w-36")} />
      </td>
      <td className="px-3 py-2">
        <TenantCombobox tenants={tenants} value={tenantId} onChange={setTenantId} inputCls={cn(inputCls, "w-48")} />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={reimbursable} onChange={e => setReimbursable(e.target.checked)} className="rounded accent-forest-600 w-4 h-4" />
      </td>
      <td className="px-3 py-2">
        {expense.receiptUrl && (
          <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-forest-600 underline">View</a>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button onClick={handleSave} disabled={saving}
            className="text-xs bg-forest-600 text-white px-2 py-1 rounded-lg hover:bg-forest-700 disabled:opacity-50">
            {saving ? "…" : "Save"}
          </button>
          <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
        </div>
      </td>
    </tr>
  );
}

// ─── New expense row (no receipt) ─────────────────────────────────────────────
function NewExpenseRow({
  tenants,
  reimbursableDefault,
  onSave,
  onCancel,
}: {
  tenants: Tenant[];
  reimbursableDefault: boolean;
  onSave: (expense: Expense) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [vendor, setVendor] = useState("");
  const [total, setTotal] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Other");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [reimbursable, setReimbursable] = useState(reimbursableDefault);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!vendor.trim()) return;
    setSaving(true);
    try {
      const selectedTenant = tenants.find(t => t.id === tenantId);
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          vendor: vendor.trim(),
          total: parseFloat(total) || 0,
          category,
          description: description.trim(),
          notes: notes.trim() || undefined,
          tenantId: tenantId || undefined,
          tenantName: selectedTenant?.name || undefined,
          reimbursable,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      onSave(data.expense);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  const inputCls = "border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400";

  return (
    <tr className="bg-amber-50/60 border-b border-amber-100">
      <td className="px-3 py-2"><input type="checkbox" disabled /></td>
      <td className="px-3 py-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={cn(inputCls, "w-32")} />
      </td>
      <td className="px-3 py-2">
        <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={cn(inputCls, "w-32")} autoFocus />
      </td>
      <td className="px-3 py-2">
        <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)} className={cn(inputCls, "w-44")}>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input type="number" step="0.01" value={total} onChange={e => setTotal(e.target.value)} placeholder="0.00" className={cn(inputCls, "w-24")} />
      </td>
      <td className="px-3 py-2">
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What was purchased…" className={cn(inputCls, "w-44")} />
      </td>
      <td className="px-3 py-2">
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional…" className={cn(inputCls, "w-36")} />
      </td>
      <td className="px-3 py-2">
        <TenantCombobox tenants={tenants} value={tenantId} onChange={setTenantId} inputCls={cn(inputCls, "w-48")} />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={reimbursable} onChange={e => setReimbursable(e.target.checked)} className="rounded accent-forest-600 w-4 h-4" />
      </td>
      <td className="px-3 py-2">
        <span className="text-gray-300 text-xs">—</span>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button onClick={handleSave} disabled={saving || !vendor.trim()}
            className="text-xs bg-forest-600 text-white px-2 py-1 rounded-lg hover:bg-forest-700 disabled:opacity-50">
            {saving ? "…" : "Save"}
          </button>
          <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
        </div>
      </td>
    </tr>
  );
}

// ─── Bulk edit bar ─────────────────────────────────────────────────────────────
function BulkEditBar({
  count,
  tenants,
  onApply,
  onDelete,
  onClear,
}: {
  count: number;
  tenants: Tenant[];
  onApply: (data: { category?: ExpenseCategory; date?: string; vendor?: string; tenantId?: string; tenantName?: string; reimbursable?: boolean }) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory | "">("");
  const [date, setDate] = useState("");
  const [vendor, setVendor] = useState("");
  const [tenantId, setTenantId] = useState("");

  function handleApply() {
    const patch: { category?: ExpenseCategory; date?: string; vendor?: string; tenantId?: string; tenantName?: string } = {};
    if (category) patch.category = category as ExpenseCategory;
    if (date) patch.date = date;
    if (vendor) patch.vendor = vendor;
    if (tenantId) {
      patch.tenantId = tenantId;
      patch.tenantName = tenants.find(t => t.id === tenantId)?.name;
    }
    onApply(patch);
    setCategory(""); setDate(""); setVendor(""); setTenantId("");
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-forest-50 border border-forest-200 rounded-xl mb-4">
      <span className="text-sm font-medium text-forest-700">{count} selected</span>
      <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory | "")}
        className="text-sm border border-gray-300 rounded-lg px-2 py-1.5">
        <option value="">Set category…</option>
        {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        className="text-sm border border-gray-300 rounded-lg px-2 py-1.5" />
      <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Set vendor…"
        className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 w-32" />
      <TenantCombobox
        tenants={tenants}
        value={tenantId}
        onChange={setTenantId}
        inputCls="text-sm border border-gray-300 rounded-lg px-2 py-1.5 w-44 focus:outline-none focus:ring-1 focus:ring-forest-400"
      />
      <button onClick={() => onApply({ reimbursable: true })}
        className="text-xs bg-green-100 text-green-700 border border-green-300 px-3 py-1.5 rounded-lg hover:bg-green-200">
        Mark Reimbursable
      </button>
      <button onClick={() => onApply({ reimbursable: false })}
        className="text-xs bg-gray-100 text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-200">
        Mark Non-Reimbursable
      </button>
      <button onClick={handleApply}
        className="text-sm bg-forest-600 text-white px-3 py-1.5 rounded-lg hover:bg-forest-700">
        Apply
      </button>
      <button onClick={onDelete}
        className="text-sm text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">
        Delete Selected
      </button>
      <button onClick={onClear} className="text-sm text-gray-500 hover:text-gray-700">Clear</button>
    </div>
  );
}

type ReimbursableFilter = "all" | "reimbursable" | "non-reimbursable";

// ─── Main client ───────────────────────────────────────────────────────────────
export function ExpensesClient({ initialExpenses, staffName, tenants, isManagerOrAdmin, sysRole }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewRow, setShowNewRow] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [allCompanyView, setAllCompanyView] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [reimbursableFilter, setReimbursableFilter] = useState<ReimbursableFilter>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredExpenses = expenses.filter(e => {
    if (reimbursableFilter === "reimbursable") return e.reimbursable;
    if (reimbursableFilter === "non-reimbursable") return !e.reimbursable;
    return true;
  });

  const totalSpend = filteredExpenses.reduce((s, e) => s + e.total, 0);
  const reimbursableTotal = filteredExpenses.filter(e => e.reimbursable).reduce((s, e) => s + e.total, 0);

  // ── All Company toggle ─────────────────────────────────────────────────────
  async function switchView(toAllCompany: boolean) {
    setAllCompanyView(toAllCompany);
    setSelected(new Set());
    setEditingId(null);
    setShowNewRow(false);
    if (toAllCompany) {
      setLoadingAll(true);
      try {
        const res = await fetch("/api/expenses?allCompany=true");
        const data = await res.json();
        if (data.expenses) setExpenses(data.expenses);
      } catch { /* ignore */ }
      finally { setLoadingAll(false); }
    } else {
      setExpenses(initialExpenses);
    }
  }

  useEffect(() => {
    if (!allCompanyView) setExpenses(initialExpenses);
  }, [initialExpenses, allCompanyView]);

  // ── Upload + AI analysis ──────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      setUploadError("File is too large. Please upload a file under 4.5 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    setUploadError("");
    setShowNewRow(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { photoUrl, photoPublicId } = await uploadRes.json();

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptUrl: photoUrl, receiptPublicId: photoPublicId }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      setExpenses(prev => [data.expense, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(prev =>
      prev.size === filteredExpenses.length ? new Set() : new Set(filteredExpenses.map(e => e.id))
    );
  }

  // ── Bulk edit ─────────────────────────────────────────────────────────────
  async function handleBulkApply(patch: { category?: ExpenseCategory; date?: string; vendor?: string; tenantId?: string; tenantName?: string; reimbursable?: boolean }) {
    const ids = [...selected];
    await Promise.all(ids.map(id =>
      fetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      })
    ));
    setExpenses(prev => prev.map(e => selected.has(e.id) ? { ...e, ...patch } : e));
    setSelected(new Set());
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} expense(s)?`)) return;
    const ids = [...selected];
    await Promise.all(ids.map(id => fetch(`/api/expenses?id=${id}`, { method: "DELETE" })));
    setExpenses(prev => prev.filter(e => !selected.has(e.id)));
    setSelected(new Set());
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  async function handleToggleReimbursable(expense: Expense) {
    const next = !expense.reimbursable;
    await fetch("/api/expenses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: expense.id, reimbursable: next }),
    });
    setExpenses(prev => prev.map(e => e.id === expense.id ? { ...e, reimbursable: next } : e));
  }

  const showStaffCol = allCompanyView;
  // colspan for footer: checkbox + date + vendor + category + total = 5, then desc + notes + project + reimbursable + receipt + actions
  const footerTrailingCols = showStaffCol ? 7 : 6;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {allCompanyView ? "All Company Expenses" : "My Expenses"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loadingAll ? "Loading…" : `${filteredExpenses.length} expense${filteredExpenses.length !== 1 ? "s" : ""} · ${fmtCurrency(totalSpend)} total${reimbursableFilter === "all" && reimbursableTotal > 0 ? ` · ${fmtCurrency(reimbursableTotal)} reimbursable` : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* All Company toggle */}
          {isManagerOrAdmin && (
            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
              <button
                onClick={() => switchView(false)}
                className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-all", !allCompanyView ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
              >My Expenses</button>
              <button
                onClick={() => switchView(true)}
                className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-all", allCompanyView ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
              >All Company</button>
            </div>
          )}

          {!allCompanyView && (
            <>
              {/* Log expense without receipt */}
              <button
                onClick={() => { setShowNewRow(true); setEditingId(null); }}
                disabled={showNewRow}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Log Expense
              </button>

              {/* Upload receipt */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".heic,.heif,image/*,application/pdf"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                id="receipt-upload"
              />
              <label
                htmlFor="receipt-upload"
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-colors",
                  uploading ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-forest-600 text-white hover:bg-forest-700"
                )}
              >
                {uploading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Analyzing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Upload Receipt
                  </>
                )}
              </label>
            </>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{uploadError}</div>
      )}

      {/* Reimbursable filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500 font-medium">Reimbursable:</span>
        {(["all", "reimbursable", "non-reimbursable"] as ReimbursableFilter[]).map(f => (
          <button key={f} onClick={() => setReimbursableFilter(f)}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-medium transition-all border",
              reimbursableFilter === f
                ? f === "reimbursable" ? "bg-green-600 text-white border-green-600"
                : f === "non-reimbursable" ? "bg-gray-600 text-white border-gray-600"
                : "bg-forest-600 text-white border-forest-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            )}>
            {f === "all" ? "All" : f === "reimbursable" ? "Reimbursable" : "Non-Reimbursable"}
          </button>
        ))}
      </div>

      {/* Bulk edit bar */}
      {selected.size > 0 && (
        <BulkEditBar
          count={selected.size}
          tenants={tenants}
          onApply={handleBulkApply}
          onDelete={handleBulkDelete}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* Table */}
      {loadingAll ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-sm text-gray-400">Loading all expenses…</div>
      ) : !showNewRow && filteredExpenses.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">No expenses logged yet.</p>
          <p className="text-gray-400 text-xs mt-1">Upload a receipt to scan it automatically, or click Log Expense to enter details manually.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-3 text-left w-8">
                    <input type="checkbox" checked={selected.size === filteredExpenses.length && filteredExpenses.length > 0}
                      onChange={toggleAll} className="rounded" />
                  </th>
                  <th className="px-3 py-3 text-left">Date</th>
                  <th className="px-3 py-3 text-left">Vendor</th>
                  <th className="px-3 py-3 text-left">Category</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3 text-left">Description</th>
                  <th className="px-3 py-3 text-left">Notes</th>
                  <th className="px-3 py-3 text-left">Project</th>
                  {showStaffCol && <th className="px-3 py-3 text-left">Staff</th>}
                  <th className="px-3 py-3 text-center">Reimbursable</th>
                  <th className="px-3 py-3 text-left">Receipt</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* New expense row (no receipt) */}
                {showNewRow && (
                  <NewExpenseRow
                    tenants={tenants}
                    reimbursableDefault={defaultReimbursableForRole(sysRole)}
                    onSave={expense => {
                      setExpenses(prev => [expense, ...prev]);
                      setShowNewRow(false);
                    }}
                    onCancel={() => setShowNewRow(false)}
                  />
                )}

                {filteredExpenses.map(expense =>
                  editingId === expense.id ? (
                    <EditRow
                      key={expense.id}
                      expense={expense}
                      tenants={tenants}
                      onSave={updated => {
                        setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e));
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={expense.id}
                      className={cn("border-b border-gray-100 hover:bg-gray-50 transition-colors",
                        selected.has(expense.id) && "bg-forest-50"
                      )}>
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selected.has(expense.id)}
                          onChange={() => toggleSelect(expense.id)} className="rounded" />
                      </td>
                      <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{fmtDate(expense.date)}</td>
                      <td className="px-3 py-3 font-medium text-gray-900">{expense.vendor || "—"}</td>
                      <td className="px-3 py-3">
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", CATEGORY_COLORS[expense.category] || "bg-gray-100 text-gray-600")}>
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900 tabular-nums">
                        {expense.total > 0 ? fmtCurrency(expense.total) : "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-600 max-w-xs truncate">{expense.description || "—"}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs max-w-[120px] truncate">{expense.notes || "—"}</td>
                      <td className="px-3 py-3">
                        {expense.tenantName ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-forest-100 text-forest-700 whitespace-nowrap">
                            {expense.tenantName}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      {showStaffCol && (
                        <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">{expense.staffName || "—"}</td>
                      )}
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => handleToggleReimbursable(expense)}
                          title={expense.reimbursable ? "Reimbursable — click to toggle" : "Not reimbursable — click to toggle"}
                          className={cn(
                            "inline-flex items-center justify-center w-6 h-6 rounded-full border transition-colors",
                            expense.reimbursable
                              ? "bg-green-100 border-green-400 text-green-600 hover:bg-green-200"
                              : "bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200"
                          )}
                        >
                          {expense.reimbursable ? (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        {expense.receiptUrl ? (
                          <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-forest-600 underline hover:text-forest-800">View</a>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setEditingId(expense.id)}
                            className="text-xs text-gray-500 hover:text-forest-600 px-2 py-1 rounded hover:bg-gray-100">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(expense.id)}
                            className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  <td colSpan={4} className="px-3 py-3 text-gray-700">
                    Total ({filteredExpenses.length} expense{filteredExpenses.length !== 1 ? "s" : ""})
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">{fmtCurrency(totalSpend)}</td>
                  <td colSpan={footerTrailingCols} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
