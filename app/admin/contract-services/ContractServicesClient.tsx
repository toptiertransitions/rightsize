"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminHeader } from "../components/AdminHeader";
import type { ContractSettings, ContractTemplate, Service, DiscountCode } from "@/lib/types";

// ─── Template Modal ────────────────────────────────────────────────────────────
interface TemplateModalProps {
  template?: ContractTemplate;
  onClose: () => void;
  onSaved: () => void;
}

function TemplateModal({ template, onClose, onSaved }: TemplateModalProps) {
  const isEdit = !!template;
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) { setError("Name and body are required"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/contract-templates", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: template.id, name, body, isActive } : { name, body, isActive }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to save");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/contract-templates?id=${template.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to delete");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error deleting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-white">{isEdit ? "Edit Template" : "Add Template"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Active</label>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? "bg-forest-600" : "bg-gray-600"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Template Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Service Agreement"
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Contract Body *</label>
            <p className="text-xs text-gray-500 mb-2">
              Placeholders: {`{{clientName}}`}, {`{{projectAddress}}`}, {`{{totalCost}}`}, {`{{rightsizingHours}}`}, {`{{packingHours}}`}, {`{{unpackingHours}}`}, {`{{signDate}}`}
            </p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400 resize-y font-mono"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="px-6 py-4 flex gap-3 border-t border-gray-700 flex-shrink-0">
          {isEdit && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} disabled={loading}
              className="h-10 px-4 rounded-xl border border-red-700 text-red-400 text-sm font-medium hover:bg-red-900/30 transition-colors disabled:opacity-50">
              Delete
            </button>
          )}
          {isEdit && confirmDelete && (
            <button onClick={handleDelete} disabled={loading}
              className="h-10 px-4 rounded-xl bg-red-700 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50">
              Yes, Delete
            </button>
          )}
          <button onClick={confirmDelete ? () => setConfirmDelete(false) : onClose} disabled={loading}
            className="flex-1 h-10 rounded-xl border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
            Cancel
          </button>
          {!confirmDelete && (
            <button onClick={handleSave} disabled={loading}
              className="flex-1 h-10 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50">
              {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Template"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Estimator Logic Card ──────────────────────────────────────────────────────
// ─── Service Estimator Card ────────────────────────────────────────────────────
function ServiceEstimatorCard({ services }: { services: Service[] }) {
  // Only show active, non-"Other Service" services
  const estimableServices = services.filter(s => s.isActive && s.name !== "Other Service");

  // Local editable rates keyed by service id
  const [rates, setRates] = useState<Record<string, { low: number; avg: number; high: number }>>(() =>
    Object.fromEntries(estimableServices.map(s => [s.id, {
      low: s.estimatorLow,
      avg: s.estimatorAvg,
      high: s.estimatorHigh,
    }]))
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const setRate = (id: string, field: "low" | "avg" | "high", val: number) => {
    setRates(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  const handleSaveAll = async () => {
    setSaving(true); setMsg("");
    try {
      await Promise.all(estimableServices.map(s =>
        fetch("/api/admin/services", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: s.id,
            estimatorLow: rates[s.id]?.low ?? 0,
            estimatorAvg: rates[s.id]?.avg ?? 0,
            estimatorHigh: rates[s.id]?.high ?? 0,
          }),
        })
      ));
      setMsg("Saved!");
    } catch {
      setMsg("Error saving");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  if (estimableServices.length === 0) {
    return (
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-white mb-2">Estimator Logic</h2>
        <p className="text-sm text-gray-500">No services yet. Add services above first.</p>
      </section>
    );
  }

  // Live preview at 1,000 SF
  const previewSF = 1000;
  const previewTotals = estimableServices.map(s => ({
    name: s.name,
    low: (previewSF / 100) * (rates[s.id]?.low ?? 0),
    avg: (previewSF / 100) * (rates[s.id]?.avg ?? 0),
    high: (previewSF / 100) * (rates[s.id]?.high ?? 0),
  }));
  const totalLow = previewTotals.reduce((sum, r) => sum + r.low, 0);
  const totalHigh = previewTotals.reduce((sum, r) => sum + r.high, 0);

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Estimator Logic</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Hours per 100 SF by density level — used by the Quoting tool. Each service uses source room SF × density multiplier.
        </p>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_100px_100px_100px] gap-3 items-center">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Service</div>
        <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider text-center">Low</div>
        <div className="text-xs font-semibold text-forest-400 uppercase tracking-wider text-center">Average</div>
        <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider text-center">High</div>
      </div>

      {/* Service rows */}
      <div className="space-y-2">
        {estimableServices.map(s => {
          const r = rates[s.id] ?? { low: 0, avg: 0, high: 0 };
          return (
            <div key={s.id} className="grid grid-cols-[1fr_100px_100px_100px] gap-3 items-center">
              <div className="text-sm text-gray-200 font-medium truncate">{s.name}</div>
              {(["low", "avg", "high"] as const).map((field, fi) => (
                <div key={field} className="relative">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={r[field]}
                    onChange={e => setRate(s.id, field, Number(e.target.value))}
                    className={`w-full h-9 px-2 pr-8 rounded-lg border bg-gray-800 text-white text-sm text-right focus:outline-none focus:ring-1 ${
                      fi === 0 ? "border-blue-800 focus:ring-blue-500"
                      : fi === 1 ? "border-forest-800 focus:ring-forest-500"
                      : "border-orange-800 focus:ring-orange-500"
                    }`}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 pointer-events-none">h</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Live preview */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Preview at {previewSF.toLocaleString()} SF</p>
        <p className="text-xs text-gray-500 mb-3">Estimated hours if all services applied at average density</p>
        <div className="space-y-1">
          {previewTotals.filter(r => r.avg > 0).map(r => (
            <div key={r.name} className="flex items-center justify-between text-xs">
              <span className="text-gray-400">{r.name}</span>
              <span className="text-gray-300 tabular-nums">
                {r.low.toFixed(1)} – {r.high.toFixed(1)} hrs
              </span>
            </div>
          ))}
        </div>
        {totalLow > 0 || totalHigh > 0 ? (
          <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-500">Total range</span>
            <span className="text-sm font-bold text-white tabular-nums">
              {totalLow.toFixed(1)} – {totalHigh.toFixed(1)} hrs
            </span>
          </div>
        ) : null}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="h-10 px-6 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save All Rates"}
        </button>
        {msg && <span className={`text-sm ${msg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{msg}</span>}
      </div>
    </section>
  );
}

// ─── Default service data ──────────────────────────────────────────────────────
const DEFAULT_SERVICES = [
  { name: "Coordinating", description: "We act as your single point of contact for all vendors coordinated across your move, including movers, cleaners, realtors, and more.", hourlyRate: 0, sortOrder: 1, isActive: true },
  { name: "Rightsizing", description: "We work with you to decide what comes with you and what doesn't, sorting through years of belongings to help you feel confident in every decision.", hourlyRate: 0, sortOrder: 2, isActive: true },
  { name: "Packing to Move", description: "Our team carefully packs and labels all boxes and furniture going to your new home, protecting your items for a safe move.", hourlyRate: 0, sortOrder: 3, isActive: true },
  { name: "Packing for Donation/Dispersal", description: "We pack and organize items you're donating, gifting, or dispersing to family, so nothing gets lost in the shuffle.", hourlyRate: 0, sortOrder: 4, isActive: true },
  { name: "Managing Moving Day", description: "We're on-site to oversee the movers, ensure everything gets on (and off) the truck correctly, and keep the day running smoothly.", hourlyRate: 0, sortOrder: 5, isActive: true },
  { name: "Unpacking", description: "We unpack boxes and get your new home set up so you can feel at home from day one.", hourlyRate: 0, sortOrder: 6, isActive: true },
  { name: "Setting Up Your Space", description: "We arrange furniture, hang art, and make sure every room feels intentional and livable.", hourlyRate: 0, sortOrder: 7, isActive: true },
  { name: "Donating/Dispersal", description: "We coordinate drop-offs, pickups, and family hand-offs for items leaving the home.", hourlyRate: 0, sortOrder: 8, isActive: true },
  { name: "Cleaning", description: "A thorough clean of your home once everything is packed up and moved out, leaving it move-out ready.", hourlyRate: 0, sortOrder: 9, isActive: true },
  { name: "Other Service", description: "", hourlyRate: 0, sortOrder: 10, isActive: true },
];

// ─── Service Modal ─────────────────────────────────────────────────────────────
interface ServiceModalProps {
  service?: Service;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: (s: Service) => void;
  onDeleted?: (id: string) => void;
}

function ServiceModal({ service, nextSortOrder, onClose, onSaved, onDeleted }: ServiceModalProps) {
  const isEdit = !!service;
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [hourlyRate, setHourlyRate] = useState(service?.hourlyRate ?? 0);
  const [sortOrder, setSortOrder] = useState(service?.sortOrder ?? nextSortOrder);
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/services", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit
          ? { id: service.id, name, description, hourlyRate, sortOrder, isActive }
          : { name, description, hourlyRate, sortOrder, isActive }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to save"); }
      const { service: saved } = await res.json();
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!service) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/services?id=${service.id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to delete"); }
      onDeleted?.(service.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error deleting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-white">{isEdit ? "Edit Service" : "Add Service"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Active</label>
            <button type="button" onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? "bg-forest-600" : "bg-gray-600"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Service Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coordinating"
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Client-Facing Description</label>
            <p className="text-xs text-gray-500 mb-1">Shown in quotes and contracts to describe what this service includes.</p>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              className="w-full px-3 py-2 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400 resize-y" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Hourly Rate ($/hr)</label>
              <input type="number" min={0} step={0.01} value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Sort Order</label>
              <input type="number" min={1} step={1} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="px-6 py-4 flex gap-3 border-t border-gray-700 flex-shrink-0">
          {isEdit && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} disabled={loading}
              className="h-10 px-4 rounded-xl border border-red-700 text-red-400 text-sm font-medium hover:bg-red-900/30 transition-colors disabled:opacity-50">
              Delete
            </button>
          )}
          {isEdit && confirmDelete && (
            <button onClick={handleDelete} disabled={loading}
              className="h-10 px-4 rounded-xl bg-red-700 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50">
              Yes, Delete
            </button>
          )}
          <button onClick={confirmDelete ? () => setConfirmDelete(false) : onClose} disabled={loading}
            className="flex-1 h-10 rounded-xl border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
            Cancel
          </button>
          {!confirmDelete && (
            <button onClick={handleSave} disabled={loading}
              className="flex-1 h-10 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50">
              {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Service"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Services Section ──────────────────────────────────────────────────────────
function ServicesSection({ initialServices }: { initialServices: Service[] }) {
  const [services, setServices] = useState<Service[]>(initialServices);
  const [showModal, setShowModal] = useState(false);
  const [editService, setEditService] = useState<Service | undefined>(undefined);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [defaultsMsg, setDefaultsMsg] = useState("");

  const nextSortOrder = services.length > 0 ? Math.max(...services.map(s => s.sortOrder)) + 1 : 1;

  const openAdd = () => { setEditService(undefined); setShowModal(true); };
  const openEdit = (s: Service) => { setEditService(s); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditService(undefined); };

  const onSaved = (saved: Service) => {
    setServices(prev => {
      const idx = prev.findIndex(s => s.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved].sort((a, b) => a.sortOrder - b.sortOrder);
    });
    closeModal();
  };

  const onDeleted = (id: string) => {
    setServices(prev => prev.filter(s => s.id !== id));
    closeModal();
  };

  const loadDefaults = async () => {
    setLoadingDefaults(true);
    setDefaultsMsg("");
    try {
      const existingNames = new Set(services.map(s => s.name.toLowerCase()));
      const toCreate = DEFAULT_SERVICES.filter(d => !existingNames.has(d.name.toLowerCase()));
      if (toCreate.length === 0) {
        setDefaultsMsg("All default services already exist.");
        return;
      }
      const created: Service[] = [];
      for (const d of toCreate) {
        const res = await fetch("/api/admin/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        });
        if (res.ok) { const { service } = await res.json(); created.push(service); }
      }
      setServices(prev => [...prev, ...created].sort((a, b) => a.sortOrder - b.sortOrder));
      setDefaultsMsg(`Added ${created.length} default service${created.length !== 1 ? "s" : ""}.`);
    } catch {
      setDefaultsMsg("Error loading defaults.");
    } finally {
      setLoadingDefaults(false);
      setTimeout(() => setDefaultsMsg(""), 4000);
    }
  };

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-base font-semibold text-white">Services</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            These are the services shown in the daily focus planner, time tracking, and quotes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadDefaults} disabled={loadingDefaults}
            className="h-9 px-3 rounded-xl border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
            {loadingDefaults ? "Loading…" : "Load Defaults"}
          </button>
          <button onClick={openAdd}
            className="h-9 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Service
          </button>
        </div>
      </div>

      {defaultsMsg && (
        <p className={`text-sm mb-3 ${defaultsMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{defaultsMsg}</p>
      )}

      {services.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No services yet. Click &quot;Load Defaults&quot; to add the standard service list.
        </div>
      ) : (
        <div className="space-y-2 mt-4">
          {services.map((s) => (
            <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors bg-gray-800/30">
              <div className="flex items-center justify-center w-6 h-6 mt-0.5 text-xs text-gray-600 tabular-nums flex-shrink-0">
                {s.sortOrder}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{s.name}</span>
                  {!s.isActive && (
                    <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">inactive</span>
                  )}
                  {s.hourlyRate > 0 && (
                    <span className="text-xs text-gray-500">${s.hourlyRate}/hr</span>
                  )}
                </div>
                {s.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{s.description}</p>
                )}
              </div>
              <button onClick={() => openEdit(s)} className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors flex-shrink-0">
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ServiceModal
          service={editService}
          nextSortOrder={nextSortOrder}
          onClose={closeModal}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </section>
  );
}

// ─── QBO Integration Section ───────────────────────────────────────────────────
function QBOIntegrationSection({ services }: { services: Service[] }) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<{ connected: boolean; companyName?: string } | null>(null);
  const [qboItems, setQboItems] = useState<Array<{ Id: string; Name: string }>>([]);
  const [mappings, setMappings] = useState<Record<string, string>>(() =>
    Object.fromEntries(services.filter((s) => s.qboItemId).map((s) => [s.id, s.qboItemId!]))
  );
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [savingMapping, setSavingMapping] = useState(false);
  const [msg, setMsg] = useState("");

  const activeServices = services.filter((s) => s.isActive && s.name !== "Other Service");

  useEffect(() => {
    // Check for OAuth callback result in URL
    const qboParam = searchParams.get("qbo");
    if (qboParam === "connected") setMsg("QuickBooks connected successfully!");
    if (qboParam === "error") {
      const errMsg = searchParams.get("msg") || "Connection failed";
      setMsg(`Connection error: ${errMsg}`);
    }

    fetch("/api/qbo/status")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        if (data.connected) {
          setLoadingItems(true);
          setItemsError(null);
          fetch("/api/qbo/items")
            .then((r) => r.json())
            .then((d) => {
              if (d.error) setItemsError(d.error);
              else setQboItems(d.items || []);
            })
            .catch((e) => setItemsError(e?.message || "Failed to load QBO items"))
            .finally(() => setLoadingItems(false));
        }
      })
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoadingStatus(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    const res = await fetch("/api/qbo/auth");
    const { url } = await res.json();
    window.location.href = url;
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect QuickBooks? This will remove the stored tokens.")) return;
    await fetch("/api/qbo/disconnect", { method: "DELETE" });
    setStatus({ connected: false });
    setQboItems([]);
    setMsg("QuickBooks disconnected.");
  };

  const handleSaveMapping = async () => {
    setSavingMapping(true);
    setMsg("");
    try {
      const changed = activeServices.filter(
        (s) => (s.qboItemId || "") !== (mappings[s.id] || "")
      );
      await Promise.all(
        changed.map((s) =>
          fetch("/api/qbo/service-mapping", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serviceId: s.id, qboItemId: mappings[s.id] || "" }),
          })
        )
      );
      setMsg("Service mapping saved!");
    } catch {
      setMsg("Error saving mapping");
    } finally {
      setSavingMapping(false);
      setTimeout(() => setMsg(""), 4000);
    }
  };

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">QuickBooks Online</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Connect your QBO account to create invoices directly from signed service agreements.
        </p>
      </div>

      {/* Connection status */}
      {loadingStatus ? (
        <p className="text-sm text-gray-500">Checking connection…</p>
      ) : status?.connected ? (
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Connected{status.companyName ? ` — ${status.companyName}` : ""}
          </span>
          <button
            onClick={handleDisconnect}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div>
          <button
            onClick={handleConnect}
            className="h-10 px-5 rounded-xl bg-[#2CA01C] text-white text-sm font-medium hover:bg-[#25891A] transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.5 14.5v-9l7 4.5-7 4.5z" />
            </svg>
            Connect to QuickBooks
          </button>
          <p className="text-xs text-gray-500 mt-2">
            You&apos;ll be redirected to Intuit to authorize access.
          </p>
        </div>
      )}

      {/* Service → QBO Item mapping */}
      {status?.connected && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-300">Service Mapping</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Map each TTT service to a QBO service item. Unmapped services will be auto-matched by name when an invoice is created.
            </p>
          </div>

          {loadingItems ? (
            <p className="text-sm text-gray-500">Loading QBO items…</p>
          ) : itemsError ? (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
              Error loading QBO items: {itemsError}
            </p>
          ) : (
            <div className="space-y-2">
              {activeServices.map((svc) => (
                <div key={svc.id} className="grid grid-cols-[1fr_1fr] gap-3 items-center">
                  <div className="text-sm text-gray-300 font-medium truncate">{svc.name}</div>
                  <select
                    value={mappings[svc.id] || ""}
                    onChange={(e) =>
                      setMappings((prev) => ({ ...prev, [svc.id]: e.target.value }))
                    }
                    className="h-9 px-2 rounded-lg border border-gray-700 bg-gray-800 text-white text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
                  >
                    <option value="">— auto-match by name —</option>
                    {qboItems.map((item) => (
                      <option key={item.Id} value={item.Id}>
                        {item.Name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {qboItems.length === 0 && !loadingItems && !itemsError && (
            <p className="text-xs text-amber-400">
              No service items found in QBO. Make sure items are Service or NonInventory type and active in QuickBooks, or leave unmapped to auto-create on invoice generation.
            </p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveMapping}
              disabled={savingMapping || loadingItems}
              className="h-10 px-5 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50"
            >
              {savingMapping ? "Saving…" : "Save Mapping"}
            </button>
            {msg && (
              <span
                className={`text-sm ${
                  msg.startsWith("Error") || msg.startsWith("Connection error")
                    ? "text-red-400"
                    : "text-green-400"
                }`}
              >
                {msg}
              </span>
            )}
          </div>
        </div>
      )}

      {msg && !status?.connected && (
        <p
          className={`text-sm ${
            msg.startsWith("Error") || msg.startsWith("Connection error")
              ? "text-red-400"
              : "text-green-400"
          }`}
        >
          {msg}
        </p>
      )}
    </section>
  );
}

// ─── Not In Scope Section ─────────────────────────────────────────────────────
function NotInScopeSection({ initialSettings }: { initialSettings: ContractSettings | null }) {
  const [text, setText] = useState(initialSettings?.notInScopeDefault ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/contract-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notInScopeDefault: text }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setMsg("Saved!");
    } catch {
      setMsg("Error saving");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">Not In Scope Text</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Default text for the &quot;Not Included in this Scope&quot; section on all new quotes. Staff can edit this text per-quote.
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="List items or services not covered by this agreement…"
        className="w-full px-3 py-2.5 rounded-xl border border-gray-700 bg-gray-800 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forest-500 resize-y mb-4"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="h-10 px-5 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Default Text"}
        </button>
        {msg && (
          <span className={`text-sm ${msg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
            {msg}
          </span>
        )}
      </div>
    </section>
  );
}

// ─── Discount Codes Section ────────────────────────────────────────────────────
function DiscountCodesSection() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, { contractId: string; tenantName: string; status: string; discountAmount: number; totalCost: number; createdAt: string }[]>>({});
  const [usageLoading, setUsageLoading] = useState<string | null>(null);

  // Add/Edit form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formPercent, setFormPercent] = useState("");
  const [formMax, setFormMax] = useState("");
  const [formExpires, setFormExpires] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/discount-codes").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setCodes(data.codes ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setFormCode(""); setFormLabel(""); setFormPercent(""); setFormMax(""); setFormExpires(""); setFormActive(true);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (c: DiscountCode) => {
    setEditing(c);
    setFormCode(c.code); setFormLabel(c.label); setFormPercent(String(c.discountPercent));
    setFormMax(c.maxDiscount != null ? String(c.maxDiscount) : "");
    setFormExpires(c.expiresAt ? c.expiresAt.slice(0, 10) : "");
    setFormActive(c.isActive);
    setFormError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formCode.trim() || !formLabel.trim() || !formPercent) { setFormError("Code, label, and percent are required"); return; }
    const pct = parseFloat(formPercent);
    if (isNaN(pct) || pct < 1 || pct > 100) { setFormError("Percent must be 1–100"); return; }
    setSaving(true); setFormError("");
    try {
      const body: Record<string, unknown> = {
        code: formCode.toUpperCase().trim(),
        label: formLabel.trim(),
        discountPercent: pct,
        maxDiscount: formMax ? parseFloat(formMax) : undefined,
        expiresAt: formExpires || undefined,
        isActive: formActive,
      };
      if (editing) body.id = editing.id;
      const res = await fetch("/api/admin/discount-codes", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/discount-codes?id=${id}`, { method: "DELETE" });
    if (res.ok) { setConfirmDeleteId(null); await load(); }
  };

  const toggleUsage = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (usageMap[id]) return;
    setUsageLoading(id);
    const res = await fetch(`/api/admin/discount-codes?usageId=${id}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setUsageMap((prev) => ({ ...prev, [id]: data.usage ?? [] }));
    }
    setUsageLoading(null);
  };

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white">Discount Codes</h2>
          <p className="text-xs text-gray-400 mt-0.5">Create codes for quoting discounts. Applied codes reduce the contract total — not hourly rates.</p>
        </div>
        <button
          onClick={openAdd}
          className="h-9 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Code
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="mb-4 p-4 bg-gray-800 rounded-xl border border-gray-600 space-y-3">
          <p className="text-sm font-medium text-white">{editing ? "Edit Discount Code" : "New Discount Code"}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Code *</label>
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                placeholder="SUMMER25"
                className="w-full h-9 px-3 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Label / Description *</label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="Summer 2025 Promotion"
                className="w-full h-9 px-3 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Discount % *</label>
              <input
                type="number"
                min={1}
                max={100}
                value={formPercent}
                onChange={(e) => setFormPercent(e.target.value)}
                placeholder="20"
                className="w-full h-9 px-3 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Max Discount $ (optional)</label>
              <input
                type="number"
                min={0}
                value={formMax}
                onChange={(e) => setFormMax(e.target.value)}
                placeholder="250"
                className="w-full h-9 px-3 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Expiration Date (optional)</label>
              <input
                type="date"
                value={formExpires}
                onChange={(e) => setFormExpires(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="w-4 h-4 rounded accent-forest-600"
                />
                <span className="text-sm text-gray-300">Active</span>
              </label>
            </div>
          </div>
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving} className="h-9 px-5 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Code"}
            </button>
            <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-xl border border-gray-600 text-gray-300 text-sm hover:bg-gray-700 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm py-4">Loading…</p>
      ) : codes.length === 0 ? (
        <p className="text-gray-500 text-sm py-4">No discount codes yet. Add one above.</p>
      ) : (
        <div className="border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Label</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Discount</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Max $</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Expires</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c, i) => {
                const isExpired = c.expiresAt ? new Date(c.expiresAt) < new Date() : false;
                const isOpen = expandedId === c.id;
                return (
                  <>
                    <tr
                      key={c.id}
                      className={`border-b border-gray-800 ${i % 2 === 0 ? "" : "bg-gray-800/20"} cursor-pointer hover:bg-gray-800/40 transition-colors`}
                      onClick={() => toggleUsage(c.id)}
                    >
                      <td className="px-4 py-3 font-mono text-white font-medium">{c.code}</td>
                      <td className="px-4 py-3 text-gray-300">{c.label}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{c.discountPercent}%</td>
                      <td className="px-4 py-3 text-right text-gray-400">{c.maxDiscount != null ? fmt(c.maxDiscount) : "—"}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {c.expiresAt ? (
                          <span className={isExpired ? "text-red-400" : ""}>{new Date(c.expiresAt).toLocaleDateString()}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          !c.isActive || isExpired ? "bg-gray-700 text-gray-400" : "bg-green-900/40 text-green-400"
                        }`}>
                          {!c.isActive ? "Inactive" : isExpired ? "Expired" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(c)} className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors">Edit</button>
                          {confirmDeleteId === c.id ? (
                            <>
                              <button onClick={() => handleDelete(c.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-gray-700 transition-colors">Confirm</button>
                              <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors">Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(c.id)} className="text-xs text-gray-400 hover:text-red-400 px-2 py-1 rounded hover:bg-gray-700 transition-colors">Delete</button>
                          )}
                          <span className="text-gray-600 ml-1">{isOpen ? "▲" : "▼"}</span>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${c.id}-usage`} className="border-b border-gray-800 bg-gray-800/50">
                        <td colSpan={7} className="px-4 py-3">
                          {usageLoading === c.id ? (
                            <p className="text-xs text-gray-400">Loading usage…</p>
                          ) : (usageMap[c.id]?.length ?? 0) === 0 ? (
                            <p className="text-xs text-gray-500">No quotes have used this code yet.</p>
                          ) : (
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Usage ({usageMap[c.id].length} quote{usageMap[c.id].length !== 1 ? "s" : ""})</p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500">
                                    <th className="text-left font-medium pb-1">Client / Project</th>
                                    <th className="text-left font-medium pb-1">Status</th>
                                    <th className="text-right font-medium pb-1">Discount Applied</th>
                                    <th className="text-right font-medium pb-1">Contract Total</th>
                                    <th className="text-left font-medium pb-1">Date</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {usageMap[c.id].map((u) => (
                                    <tr key={u.contractId} className="border-t border-gray-700/50">
                                      <td className="py-1.5 text-gray-300">{u.tenantName}</td>
                                      <td className="py-1.5">
                                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                          u.status === "Signed" ? "bg-green-900/40 text-green-400" :
                                          u.status === "Sent" ? "bg-blue-900/40 text-blue-400" :
                                          u.status === "Draft" ? "bg-gray-700 text-gray-400" :
                                          "bg-gray-700 text-gray-500"
                                        }`}>{u.status}</span>
                                      </td>
                                      <td className="py-1.5 text-right text-blue-400">−{fmt(u.discountAmount)}</td>
                                      <td className="py-1.5 text-right text-gray-300">{fmt(u.totalCost)}</td>
                                      <td className="py-1.5 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
interface ContractServicesClientProps {
  initialSettings: ContractSettings | null;
  initialTemplates: ContractTemplate[];
  initialServices: Service[];
}

export function ContractServicesClient({ initialSettings, initialTemplates, initialServices }: ContractServicesClientProps) {
  const router = useRouter();

  // Templates state
  const [showModal, setShowModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<ContractTemplate | undefined>(undefined);

  const openAdd = () => { setEditTemplate(undefined); setShowModal(true); };
  const openEdit = (t: ContractTemplate) => { setEditTemplate(t); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditTemplate(undefined); };
  const onSaved = () => { closeModal(); router.refresh(); };

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="contract-services" />

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-white">Contract & Services</h1>
          <p className="text-gray-400 mt-1">Manage services, contract templates, and estimator logic.</p>
        </div>

        {/* Section 1 — Services */}
        <ServicesSection initialServices={initialServices} />

        {/* Section 2 — Contract Templates */}
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Contract Templates</h2>
            <button
              onClick={openAdd}
              className="h-9 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Template
            </button>
          </div>
          {initialTemplates.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">No templates yet.</p>
          ) : (
            <div className="border border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Active</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {initialTemplates.map((t, i) => (
                    <tr key={t.id} className={`border-b border-gray-800 ${i % 2 === 0 ? "" : "bg-gray-800/20"}`}>
                      <td className="px-4 py-3 font-medium text-white">{t.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block w-2 h-2 rounded-full ${t.isActive ? "bg-green-400" : "bg-gray-600"}`} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEdit(t)} className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Section 3 — Not In Scope Default Text */}
        <NotInScopeSection initialSettings={initialSettings} />

        {/* Section 4 — Estimator Logic */}
        <ServiceEstimatorCard services={initialServices} />

        {/* Section 5 — QuickBooks Online */}
        <QBOIntegrationSection services={initialServices} />

        {/* Section 6 — Discount Codes */}
        <DiscountCodesSection />
      </main>

      {showModal && (
        <TemplateModal template={editTemplate} onClose={closeModal} onSaved={onSaved} />
      )}
    </div>
  );
}
