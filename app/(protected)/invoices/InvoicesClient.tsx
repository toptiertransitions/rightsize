"use client";

import { useState } from "react";
import type { Tenant, Invoice, InvoiceSettings, Service, Contract, TimeEntry } from "@/lib/types";
import { InvoiceCreatorModal } from "./InvoiceCreatorModal";

interface Props {
  tenant: Tenant;
  initialInvoices: Invoice[];
  isManager: boolean;
  services: Service[];
  invoiceSettings: InvoiceSettings | null;
  contracts: Contract[];
  timeEntries: TimeEntry[];
  ownerEmail: string;
  currentUserEmail: string;
}

const STATUS_STYLES: Record<string, { pill: string; label: string }> = {
  Unpaid: { pill: "bg-red-100 text-red-700", label: "Unpaid" },
  PartiallyPaid: { pill: "bg-amber-100 text-amber-700", label: "Partially Paid" },
  Paid: { pill: "bg-green-100 text-green-700", label: "Paid" },
};

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string) {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function InvoiceCard({
  invoice,
  isManager,
  onUpdated,
  onDeleted,
}: {
  invoice: Invoice;
  isManager: boolean;
  onUpdated: (inv: Invoice) => void;
  onDeleted: (id: string) => void;
}) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusStyle = STATUS_STYLES[invoice.status] ?? STATUS_STYLES.Unpaid;

  async function patch(data: object) {
    setSaving(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoice.id, ...data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onUpdated(json.invoice);
      setPaymentOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices?id=${invoice.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      onDeleted(invoice.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-forest-50 text-forest-700 border border-forest-200">
                {invoice.type}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyle.pill}`}>
                {statusStyle.label}
              </span>
              {invoice.qboDocNumber && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                  QB #{invoice.qboDocNumber}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-0.5">
              {invoice.invoiceNumber} · {fmtDate(invoice.createdAt)}
            </p>
            <p className="text-sm text-gray-600 truncate">{invoice.serviceName}</p>
            {invoice.status === "Paid" && invoice.paidAt && (
              <p className="text-xs text-green-600 mt-1">Paid {fmtDate(invoice.paidAt)}</p>
            )}
            {invoice.status === "PartiallyPaid" && invoice.paidAmount != null && (
              <p className="text-xs text-amber-600 mt-1">Paid {fmt(invoice.paidAmount)} of {fmt(invoice.amount)}</p>
            )}
          </div>

          {/* Right: amount + actions */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <p className="text-2xl font-bold text-gray-900">{fmt(invoice.amount)}</p>
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-forest-600 hover:text-forest-800 border border-forest-200 rounded-lg px-3 py-1.5 hover:bg-forest-50 transition-colors"
            >
              Download PDF
            </a>
          </div>
        </div>

        {/* Manager actions */}
        {isManager && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setPaymentOpen((p) => !p)}
              className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              {paymentOpen ? "Cancel" : "Update Payment"}
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Payment panel */}
      {paymentOpen && isManager && (
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Update Payment Status</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => patch({ status: "Paid", paidAmount: invoice.amount, paidAt: new Date().toISOString() })}
              disabled={saving}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Mark Paid
            </button>
            <button
              onClick={() => patch({ status: "Unpaid", paidAmount: 0, paidAt: "" })}
              disabled={saving}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 transition-colors"
            >
              Mark Unpaid
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Partial:</span>
            <input
              type="number"
              placeholder="Amount paid"
              value={partialAmount}
              onChange={(e) => setPartialAmount(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-32 focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
            <button
              onClick={() => {
                const amt = parseFloat(partialAmount);
                if (isNaN(amt) || amt <= 0) return;
                patch({ status: "PartiallyPaid", paidAmount: amt, paidAt: new Date().toISOString() });
              }}
              disabled={saving || !partialAmount}
              className="text-sm font-medium px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="border-t border-red-100 bg-red-50 p-4">
          <p className="text-sm text-red-700 mb-3">Delete invoice <strong>{invoice.invoiceNumber}</strong>? This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm font-medium px-4 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              disabled={deleting}
              className="text-sm font-medium px-4 py-1.5 rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function InvoicesClient({
  tenant,
  initialInvoices,
  isManager,
  services,
  invoiceSettings,
  contracts,
  timeEntries,
  ownerEmail,
  currentUserEmail,
}: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [modalOpen, setModalOpen] = useState(false);

  function handleUpdated(updated: Invoice) {
    setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
  }

  function handleDeleted(id: string) {
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
  }

  function handleCreated(inv: Invoice) {
    setInvoices((prev) => [inv, ...prev]);
    setModalOpen(false);
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-gray-400 mb-1">{tenant.name}</p>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        </div>
        {isManager && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Invoice
          </button>
        )}
      </div>

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-12 text-center">
          <p className="text-sm font-medium text-gray-700 mb-1">No invoices yet</p>
          <p className="text-xs text-gray-400">
            {isManager ? "Click \"Create Invoice\" to generate a deposit or full invoice." : "No invoices have been created for this project."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              isManager={isManager}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {/* Create invoice modal */}
      {isManager && (
        <InvoiceCreatorModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
          tenant={tenant}
          services={services}
          contracts={contracts}
          timeEntries={timeEntries}
          ownerEmail={ownerEmail}
          currentUserEmail={currentUserEmail}
          invoiceSettings={invoiceSettings}
        />
      )}
    </div>
  );
}
