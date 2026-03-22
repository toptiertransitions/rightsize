"use client";

import { useState, useRef, useEffect } from "react";
import type { Subcontractor } from "@/lib/types";
import type { Tenant } from "@/lib/types";
import { Pagination } from "@/app/admin/components/Pagination";

const PAGE_SIZE = 20;

// ─── Project Autosearch ────────────────────────────────────────────────────────
function ProjectAutosearch({
  value,
  onChange,
  tenants,
  placeholder = "Search projects…",
}: {
  value: string;
  onChange: (tenantId: string, tenantName: string) => void;
  tenants: Tenant[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sync display value when parent changes
  useEffect(() => { setQuery(value); }, [value]);

  const matches = query.trim()
    ? tenants.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : tenants.slice(0, 8);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-forest-500"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange("", "");
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          <li>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-700"
              onMouseDown={() => { onChange("", ""); setQuery(""); setOpen(false); }}
            >
              — No project —
            </button>
          </li>
          {matches.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700"
                onMouseDown={() => { onChange(t.id, t.name); setQuery(t.name); setOpen(false); }}
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Empty add-row form ────────────────────────────────────────────────────────
const EMPTY_FORM = {
  name: "",
  charges: "",
  scope: "",
  paid: false,
  paidDate: "",
  tenantId: "",
  tenantName: "",
};

type FormState = typeof EMPTY_FORM;

// ─── Inline Edit Row ──────────────────────────────────────────────────────────
function EditRow({
  sub,
  tenants,
  onSave,
  onCancel,
}: {
  sub: Subcontractor;
  tenants: Tenant[];
  onSave: (data: Partial<Subcontractor>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(sub.name);
  const [charges, setCharges] = useState(String(sub.charges));
  const [scope, setScope] = useState(sub.scope);
  const [paid, setPaid] = useState(sub.paid);
  const [paidDate, setPaidDate] = useState(sub.paidDate ?? "");
  const [tenantId, setTenantId] = useState(sub.tenantId ?? "");
  const [tenantName, setTenantName] = useState(sub.tenantName ?? "");
  const [saving, setSaving] = useState(false);

  function handlePaidToggle(val: boolean) {
    setPaid(val);
    if (val && !paidDate) setPaidDate(new Date().toISOString().split("T")[0]);
    if (!val) setPaidDate("");
  }

  async function handleSave() {
    setSaving(true);
    await onSave({
      name,
      charges: Number(charges) || 0,
      scope,
      paid,
      paidDate: paidDate || undefined,
      tenantId: tenantId || undefined,
      tenantName: tenantName || undefined,
    });
    setSaving(false);
  }

  return (
    <tr className="bg-gray-800/60">
      <td className="px-4 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-forest-500"
        />
      </td>
      <td className="px-4 py-2">
        <ProjectAutosearch
          value={tenantName}
          onChange={(id, n) => { setTenantId(id); setTenantName(n); }}
          tenants={tenants}
          placeholder="Search projects…"
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-forest-500"
          placeholder="Scope of work…"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={0}
          step="0.01"
          value={charges}
          onChange={(e) => setCharges(e.target.value)}
          className="w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-forest-500"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          checked={paid}
          onChange={(e) => handlePaidToggle(e.target.checked)}
          className="w-4 h-4 accent-forest-500 cursor-pointer"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="date"
          value={paidDate}
          onChange={(e) => setPaidDate(e.target.value)}
          disabled={!paid}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white disabled:opacity-40 focus:outline-none focus:border-forest-500"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !name}
            className="px-3 py-1 bg-forest-600 hover:bg-forest-500 text-white text-xs rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Add Row ──────────────────────────────────────────────────────────────────
function AddRow({
  tenants,
  onAdd,
  onCancel,
}: {
  tenants: Tenant[];
  onAdd: (data: FormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function handlePaidToggle(val: boolean) {
    setForm((f) => ({
      ...f,
      paid: val,
      paidDate: val && !f.paidDate ? new Date().toISOString().split("T")[0] : val ? f.paidDate : "",
    }));
  }

  async function handleSave() {
    if (!form.name) return;
    setSaving(true);
    await onAdd(form);
    setSaving(false);
  }

  return (
    <tr className="bg-forest-950/20 border-t border-forest-800/40">
      <td className="px-4 py-2">
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Subcontractor name…"
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-forest-500"
          autoFocus
        />
      </td>
      <td className="px-4 py-2">
        <ProjectAutosearch
          value={form.tenantName}
          onChange={(id, n) => setForm((f) => ({ ...f, tenantId: id, tenantName: n }))}
          tenants={tenants}
          placeholder="Search projects…"
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={form.scope}
          onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
          placeholder="Scope of work…"
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-forest-500"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={0}
          step="0.01"
          value={form.charges}
          onChange={(e) => setForm((f) => ({ ...f, charges: e.target.value }))}
          placeholder="0.00"
          className="w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-forest-500"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          checked={form.paid}
          onChange={(e) => handlePaidToggle(e.target.checked)}
          className="w-4 h-4 accent-forest-500 cursor-pointer"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="date"
          value={form.paidDate}
          onChange={(e) => setForm((f) => ({ ...f, paidDate: e.target.value }))}
          disabled={!form.paid}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white disabled:opacity-40 focus:outline-none focus:border-forest-500"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !form.name}
            className="px-3 py-1 bg-forest-600 hover:bg-forest-500 text-white text-xs rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? "Adding…" : "Add"}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main OpsClient ───────────────────────────────────────────────────────────
interface OpsClientProps {
  initialSubcontractors: Subcontractor[];
  tenants: Tenant[];
}

export function OpsClient({ initialSubcontractors, tenants }: OpsClientProps) {
  const [subs, setSubs] = useState<Subcontractor[]>(initialSubcontractors);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const totalUnpaid = subs.filter((s) => !s.paid).reduce((sum, s) => sum + s.charges, 0);
  const totalAll = subs.reduce((sum, s) => sum + s.charges, 0);
  const paginated = subs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleAdd(form: FormState) {
    setError(null);
    try {
      const res = await fetch("/api/subcontractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          charges: Number(form.charges) || 0,
          scope: form.scope,
          paid: form.paid,
          paidDate: form.paidDate || undefined,
          tenantId: form.tenantId || undefined,
          tenantName: form.tenantName || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { subcontractor } = await res.json();
      setSubs((prev) => [subcontractor, ...prev]);
      setShowAdd(false);
      setPage(1);
    } catch (e) {
      setError("Failed to add subcontractor.");
      console.error(e);
    }
  }

  async function handleSave(id: string, data: Partial<Subcontractor>) {
    setError(null);
    try {
      const res = await fetch("/api/subcontractors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...data }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { subcontractor } = await res.json();
      setSubs((prev) => prev.map((s) => (s.id === id ? subcontractor : s)));
      setEditingId(null);
    } catch (e) {
      setError("Failed to save changes.");
      console.error(e);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this subcontractor entry?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/subcontractors?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setSubs((prev) => prev.filter((s) => s.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (e) {
      setError("Failed to delete.");
      console.error(e);
    }
  }

  async function handlePaidToggle(sub: Subcontractor) {
    const newPaid = !sub.paid;
    const newPaidDate = newPaid ? new Date().toISOString().split("T")[0] : null;
    await handleSave(sub.id, { paid: newPaid, paidDate: newPaidDate ?? undefined });
  }

  return (
    <div className="space-y-10">
      {/* ── Item Tracking ────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-white mb-4">Item Tracking</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <a
            href="/catalog"
            className="bg-gray-900 border border-gray-800 hover:border-forest-700 rounded-xl p-5 flex flex-col gap-2 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-forest-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="text-sm font-medium text-white group-hover:text-forest-300 transition-colors">Catalog</span>
            </div>
            <p className="text-xs text-gray-400">View and manage all project items across every project.</p>
            <span className="text-xs text-forest-400 mt-auto">Open Catalog →</span>
          </a>
          <a
            href="/admin"
            className="bg-gray-900 border border-gray-800 hover:border-forest-700 rounded-xl p-5 flex flex-col gap-2 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              <span className="text-sm font-medium text-white group-hover:text-sky-300 transition-colors">All Projects</span>
            </div>
            <p className="text-xs text-gray-400">Browse and manage all active and archived TTT projects.</p>
            <span className="text-xs text-sky-400 mt-auto">Open Projects →</span>
          </a>
          <a
            href="/admin/expenses"
            className="bg-gray-900 border border-gray-800 hover:border-forest-700 rounded-xl p-5 flex flex-col gap-2 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-white group-hover:text-amber-300 transition-colors">Expenses</span>
            </div>
            <p className="text-xs text-gray-400">Review all company expenses submitted by staff members.</p>
            <span className="text-xs text-amber-400 mt-auto">Open Expenses →</span>
          </a>
        </div>
      </section>

      {/* ── Subcontractor Management ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Subcontractor Management</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Track subcontractor work, charges, and payment status across projects.
            </p>
          </div>
          {!showAdd && (
            <button
              onClick={() => { setShowAdd(true); setEditingId(null); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-forest-600 hover:bg-forest-500 text-white text-sm rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Subcontractor
            </button>
          )}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">Total Entries</p>
            <p className="text-xl font-bold text-white">{subs.length}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">Total Charges</p>
            <p className="text-xl font-bold text-white">${totalAll.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-gray-900 border border-amber-900/40 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-400 mb-1">Unpaid Balance</p>
            <p className="text-xl font-bold text-amber-300">${totalUnpaid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-[18%]">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-[20%]">Project</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-[28%]">Scope</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-[12%]">Charges</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 w-[8%]">Paid</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-[10%]">Paid Date</th>
                  <th className="px-4 py-3 w-[4%]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {showAdd && (
                  <AddRow
                    tenants={tenants}
                    onAdd={handleAdd}
                    onCancel={() => setShowAdd(false)}
                  />
                )}
                {paginated.length === 0 && !showAdd && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      No subcontractors yet. Click &ldquo;Add Subcontractor&rdquo; to get started.
                    </td>
                  </tr>
                )}
                {paginated.map((sub) =>
                  editingId === sub.id ? (
                    <EditRow
                      key={sub.id}
                      sub={sub}
                      tenants={tenants}
                      onSave={(data) => handleSave(sub.id, data)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={sub.id} className="hover:bg-gray-800/30 transition-colors group">
                      <td className="px-4 py-3 text-white font-medium">{sub.name}</td>
                      <td className="px-4 py-3">
                        {sub.tenantName ? (
                          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-forest-900/50 text-forest-300 border border-forest-800/50">
                            {sub.tenantName}
                          </span>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs leading-relaxed max-w-xs truncate" title={sub.scope}>
                        {sub.scope || <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-white tabular-nums">
                        ${sub.charges.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handlePaidToggle(sub)}
                          className={`w-8 h-4 rounded-full transition-colors relative ${sub.paid ? "bg-forest-600" : "bg-gray-700"}`}
                          title={sub.paid ? "Mark unpaid" : "Mark paid"}
                        >
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${sub.paid ? "left-4" : "left-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs tabular-nums whitespace-nowrap">
                        {sub.paidDate ? sub.paidDate : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingId(sub.id); setShowAdd(false); }}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(sub.id)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={page}
            totalItems={subs.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      </section>
    </div>
  );
}
