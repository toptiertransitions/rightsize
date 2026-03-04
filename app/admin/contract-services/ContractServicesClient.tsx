"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { TIME_FOCUS_AREAS } from "@/lib/types";
import type { ContractSettings, ContractTemplate } from "@/lib/types";

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

// ─── Main Component ────────────────────────────────────────────────────────────
interface ContractServicesClientProps {
  initialSettings: ContractSettings | null;
  initialTemplates: ContractTemplate[];
}

export function ContractServicesClient({ initialSettings, initialTemplates }: ContractServicesClientProps) {
  const router = useRouter();

  // Pricing state
  const [rightsizingRate, setRightsizingRate] = useState(initialSettings?.rightsizingRate ?? 0);
  const [packingRate, setPackingRate] = useState(initialSettings?.packingRate ?? 0);
  const [unpackingRate, setUnpackingRate] = useState(initialSettings?.unpackingRate ?? 0);
  const [savingRates, setSavingRates] = useState(false);
  const [ratesMsg, setRatesMsg] = useState("");

  // Templates state
  const [showModal, setShowModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<ContractTemplate | undefined>(undefined);

  const handleSaveRates = async () => {
    setSavingRates(true); setRatesMsg("");
    try {
      const res = await fetch("/api/contract-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rightsizingRate, packingRate, unpackingRate }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setRatesMsg("Saved!");
      router.refresh();
    } catch {
      setRatesMsg("Error saving rates");
    } finally {
      setSavingRates(false);
    }
  };

  const openAdd = () => { setEditTemplate(undefined); setShowModal(true); };
  const openEdit = (t: ContractTemplate) => { setEditTemplate(t); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditTemplate(undefined); };
  const onSaved = () => { closeModal(); router.refresh(); };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-forest-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div>
                <div className="font-bold text-white text-sm">Rightsize</div>
                <div className="text-[9px] text-gray-400">TTT Admin Console</div>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/admin" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Projects</Link>
              <Link href="/admin/users" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Users</Link>
              <Link href="/admin/local-vendors" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Local Vendors</Link>
              <Link href="/admin/routing-rules" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Routing Rules</Link>
              <Link href="/admin/integrations/circle-hand" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Circle Hand</Link>
              <Link href="/admin/contract-services" className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-white font-medium">Contract & Services</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-3 py-1 rounded-full font-medium">
              🔐 Admin
            </span>
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-white">Contract & Services</h1>
          <p className="text-gray-400 mt-1">Configure pricing rates, contract templates, and focus areas.</p>
        </div>

        {/* Section 1 — Pricing */}
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Pricing ($/hr)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[
              { label: "Rightsizing", value: rightsizingRate, set: setRightsizingRate },
              { label: "Packing", value: packingRate, set: setPackingRate },
              { label: "Unpacking", value: unpackingRate, set: setUnpackingRate },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">{label} $/hr</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveRates}
              disabled={savingRates}
              className="h-10 px-6 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50"
            >
              {savingRates ? "Saving…" : "Save Rates"}
            </button>
            {ratesMsg && <span className={`text-sm ${ratesMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{ratesMsg}</span>}
          </div>
        </section>

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

        {/* Section 3 — Focus Areas (read-only) */}
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Focus Areas</h2>
          <div className="flex flex-wrap gap-2">
            {TIME_FOCUS_AREAS.map((area) => (
              <span key={area} className="px-3 py-1.5 rounded-full text-sm bg-gray-700 text-gray-300 border border-gray-600">
                {area}
              </span>
            ))}
          </div>
        </section>
      </main>

      {showModal && (
        <TemplateModal template={editTemplate} onClose={closeModal} onSaved={onSaved} />
      )}
    </div>
  );
}
