"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { EstimatorSection } from "@/app/(protected)/rooms/EstimatorSection";
import { AddRoomButton } from "@/app/(protected)/rooms/RoomsClient";
import type { Tenant, Room, ContractSettings, ContractTemplate, Contract, DensityLevel, RoomType, Service } from "@/lib/types";

interface Props {
  tenant: Tenant;
  rooms: Room[];
  settings: ContractSettings | null;
  templates: ContractTemplate[];
  existingContracts: Contract[];
  recipients: { name: string; email: string; role: string }[];
  services: Service[];
}

type Mode = "rooms" | "quick";

const STATUS_STYLES: Record<string, { pill: string; label: string }> = {
  Draft:    { pill: "bg-yellow-100 text-yellow-700", label: "Draft" },
  Sent:     { pill: "bg-blue-100 text-blue-700",     label: "Sent" },
  Signed:   { pill: "bg-green-100 text-green-700",   label: "Signed" },
  Archived: { pill: "bg-gray-100 text-gray-400",     label: "Archived" },
};

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function makeSyntheticRoom(density: DensityLevel, sqFt: number, index: number): Room {
  return {
    id: `synthetic-${density}-${index}`,
    airtableId: "",
    tenantId: "",
    name: density === "Medium" ? "Average Density Area" : `${density} Density Area`,
    roomType: "Other" as RoomType,
    squareFeet: sqFt,
    density,
    createdAt: "",
  };
}

// ─── Quote Card ───────────────────────────────────────────────────────────────
function QuoteCard({
  contract,
  tenantId,
  isEditing,
  onEdit,
  onDelete,
  onSetPrimary,
  onArchive,
}: {
  contract: Contract;
  tenantId: string;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
  onArchive: () => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isArchived = contract.status === "Archived";
  const isSigned = contract.status === "Signed";
  const style = STATUS_STYLES[contract.status] ?? STATUS_STYLES.Draft;
  const date = new Date(contract.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const lineItems = contract.lineItems ?? [];

  async function handleSetPrimary() {
    setWorking(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contract.id, tenantId, action: "setPrimary" }),
      });
      if (!res.ok) throw new Error("Failed");
      onSetPrimary();
    } catch { /* ignore */ }
    finally { setWorking(false); }
  }

  async function handleArchive() {
    setWorking(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contract.id, status: "Archived" }),
      });
      if (!res.ok) throw new Error("Failed");
      onArchive();
      setArchiveConfirm(false);
    } catch { /* ignore */ }
    finally { setWorking(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contracts?id=${contract.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      onDelete();
    } catch { /* ignore */ }
    finally { setDeleting(false); setDeleteConfirm(false); }
  }

  return (
    <div className={cn(
      "rounded-2xl border bg-white shadow-sm overflow-hidden transition-all",
      isEditing ? "border-forest-400 ring-2 ring-forest-200" : "border-gray-200",
      isSigned ? "border-green-300" : "",
      isArchived ? "opacity-60" : ""
    )}>
      <div className={cn("px-5 py-4", isArchived && "bg-gray-50/60")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.pill}`}>
                {style.label}
              </span>
              {isSigned && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                  ★ Primary Quote
                </span>
              )}
              {isEditing && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-forest-50 text-forest-700 border border-forest-200">
                  Editing
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">{date}</p>
            {lineItems.length > 0 && (
              <p className={cn("text-xs mt-1 truncate", isArchived ? "text-gray-400" : "text-gray-500")}>
                {lineItems.map(li => li.serviceName).join(" · ")}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className={cn("text-lg font-bold", isArchived ? "text-gray-400" : "text-gray-900")}>
              {fmt(contract.totalCost)}
            </p>
            {contract.signedAt && isSigned && (
              <p className="text-xs text-green-600">
                Signed {new Date(contract.signedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {/* Edit — always available */}
          {!isEditing && (
            <button
              onClick={onEdit}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
          )}

          {/* Set as Primary — Draft, Sent, Archived */}
          {!isSigned && (
            <button
              onClick={handleSetPrimary}
              disabled={working}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <span>★</span>
              <span>{working ? "Saving…" : isArchived ? "Restore as Primary" : "Set as Primary"}</span>
            </button>
          )}

          {/* Download Agreement PDF — Signed only */}
          {isSigned && (
            <a
              href={`/api/contracts/${contract.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-forest-200 text-forest-700 hover:bg-forest-50 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              Agreement PDF
            </a>
          )}

          {/* Unsign & Archive — Signed only */}
          {isSigned && (
            <button
              onClick={() => setArchiveConfirm(true)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-colors ml-auto"
            >
              Unsign & Archive
            </button>
          )}

          {/* Delete — Draft, Sent, Archived only */}
          {!isSigned && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors",
                !isArchived && "ml-auto"
              )}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Unsign & Archive confirm */}
      {archiveConfirm && (
        <div className="border-t border-amber-100 bg-amber-50 px-5 py-3">
          <p className="text-sm text-amber-800 font-medium mb-0.5">Unsign and archive this quote?</p>
          <p className="text-xs text-amber-600 mb-3">It will remain visible and editable but will no longer be the primary quote.</p>
          <div className="flex gap-2">
            <button
              onClick={handleArchive}
              disabled={working}
              className="text-sm font-medium px-4 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {working ? "Archiving…" : "Unsign & Archive"}
            </button>
            <button
              onClick={() => setArchiveConfirm(false)}
              className="text-sm font-medium px-4 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="border-t border-red-100 bg-red-50 px-5 py-3">
          <p className="text-sm text-red-700 mb-2">Delete this quote? This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm font-medium px-4 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              className="text-sm font-medium px-4 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Client ──────────────────────────────────────────────────────────────
export function QuotingClient({ tenant, rooms, settings, templates, existingContracts, recipients, services }: Props) {
  const [mode, setMode] = useState<Mode>("rooms");
  const [highSqFt, setHighSqFt] = useState(0);
  const [avgSqFt, setAvgSqFt] = useState(0);
  const [lowSqFt, setLowSqFt] = useState(0);
  const [quotes, setQuotes] = useState<Contract[]>(existingContracts);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [showEstimator, setShowEstimator] = useState(existingContracts.length === 0);

  const syntheticRooms: Room[] = [
    ...(highSqFt > 0 ? [makeSyntheticRoom("High", highSqFt, 0)] : []),
    ...(avgSqFt > 0 ? [makeSyntheticRoom("Medium", avgSqFt, 1)] : []),
    ...(lowSqFt > 0 ? [makeSyntheticRoom("Low", lowSqFt, 2)] : []),
  ];

  const estimatorRooms = mode === "rooms" ? rooms : syntheticRooms;
  const hasRooms = mode === "rooms" ? rooms.length > 0 : syntheticRooms.length > 0;

  function handleSaved(contract: Contract) {
    setQuotes((prev) => {
      const exists = prev.find((q) => q.id === contract.id);
      if (exists) return prev.map((q) => (q.id === contract.id ? contract : q));
      return [contract, ...prev];
    });
    setEditingContract(null);
    setShowEstimator(false);
  }

  function handleDeleted(id: string) {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  }

  function handleSetPrimary(id: string) {
    // Mark selected as Signed, archive all others that were Signed (UI mirrors API action)
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === id
          ? { ...q, status: "Signed" as const }
          : q.status === "Signed"
          ? { ...q, status: "Archived" as const }
          : q
      )
    );
  }

  function handleArchived(id: string) {
    setQuotes((prev) =>
      prev.map((q) => q.id === id ? { ...q, status: "Archived" as const } : q)
    );
  }

  function handleEdit(contract: Contract) {
    setEditingContract(contract);
    setShowEstimator(true);
    // Scroll to estimator
    setTimeout(() => document.getElementById("estimator-section")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function handleCancelEdit() {
    setEditingContract(null);
    if (quotes.length > 0) setShowEstimator(false);
  }

  function handleNewQuote() {
    setEditingContract(null);
    setShowEstimator(true);
    setTimeout(() => document.getElementById("estimator-section")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-1">{tenant.name}</p>
        <h1 className="text-2xl font-bold text-gray-900">Quoting</h1>
      </div>

      {/* ─── Saved Quotes ──────────────────────────────────────────────────── */}
      {quotes.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Saved Quotes</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {quotes.filter(q => q.status === "Signed").length > 0
                  ? "★ Signed quote is the primary quote used for invoicing"
                  : "Mark a quote as Signed to use it for invoicing"}
              </p>
            </div>
            {hasRooms && (
              <button
                onClick={handleNewQuote}
                className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl bg-forest-600 text-white hover:bg-forest-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Quote
              </button>
            )}
          </div>
          <div className="space-y-3">
            {quotes.map((q) => (
              <QuoteCard
                key={q.id}
                contract={q}
                tenantId={tenant.id}
                isEditing={editingContract?.id === q.id}
                onEdit={() => handleEdit(q)}
                onDelete={() => handleDeleted(q.id)}
                onSetPrimary={() => handleSetPrimary(q.id)}
                onArchive={() => handleArchived(q.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-8">
        {([
          { key: "rooms" as Mode, label: "By Rooms" },
          { key: "quick" as Mode, label: "Quick Quote" },
        ]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setMode(opt.key)}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-all",
              mode === opt.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Rooms section */}
      {mode === "rooms" && (
        <div className="mb-6">
          {rooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">No rooms yet</p>
              <p className="text-xs text-gray-400 mb-5">Add rooms to calculate hours from actual square footage and density.</p>
              <AddRoomButton tenantId={tenant.id} />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">Project Rooms</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {rooms.length} room{rooms.length !== 1 ? "s" : ""} · {rooms.reduce((s, r) => s + r.squareFeet, 0).toLocaleString()} SF total
                  </p>
                </div>
                <AddRoomButton tenantId={tenant.id} />
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                      <th className="px-4 py-2.5 text-left">Room</th>
                      <th className="px-4 py-2.5 text-left">Type</th>
                      <th className="px-4 py-2.5 text-right">Sq Ft</th>
                      <th className="px-4 py-2.5 text-left">Density</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{r.roomType}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{r.squareFeet.toLocaleString()}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            r.density === "High" ? "bg-orange-100 text-orange-700" :
                            r.density === "Medium" ? "bg-forest-100 text-forest-700" :
                            "bg-blue-100 text-blue-700"
                          )}>
                            {r.density === "Medium" ? "Average" : r.density}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Quote inputs */}
      {mode === "quick" && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Enter Square Footage by Density</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl">
            {([
              { label: "High Density", key: "high" as const, value: highSqFt, set: setHighSqFt, color: "border-orange-300 focus:ring-orange-400" },
              { label: "Average Density", key: "avg" as const, value: avgSqFt, set: setAvgSqFt, color: "border-forest-300 focus:ring-forest-400" },
              { label: "Low Density", key: "low" as const, value: lowSqFt, set: setLowSqFt, color: "border-blue-300 focus:ring-blue-400" },
            ]).map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                <div className="relative">
                  <input
                    type="number" min={0} value={field.value || ""}
                    onChange={(e) => field.set(Number(e.target.value))} placeholder="0"
                    className={cn("w-full h-10 px-3 pr-10 rounded-xl border text-sm focus:outline-none focus:ring-2", field.color)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">SF</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Estimator ─────────────────────────────────────────────────────── */}
      {hasRooms && (
        <div>
          {!showEstimator ? (
            <button
              onClick={handleNewQuote}
              className="flex items-center gap-2 w-full py-4 px-5 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-forest-300 hover:text-forest-600 hover:bg-forest-50 transition-all text-sm font-medium"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create a new quote
            </button>
          ) : (
            <div id="estimator-section">
              <EstimatorSection
                tenant={tenant}
                rooms={estimatorRooms}
                settings={settings}
                templates={templates}
                recipients={recipients}
                services={services}
                editingContract={editingContract}
                onSaved={handleSaved}
                onCancelEdit={handleCancelEdit}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
