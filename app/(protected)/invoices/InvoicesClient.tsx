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
  agreements: Contract[];
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

// ─── Agreement Card ───────────────────────────────────────────────────────────
function AgreementCard({ contract }: { contract: Contract }) {
  const [expanded, setExpanded] = useState(false);
  const isSigned = contract.status === "Signed";
  const isPending = contract.status === "Sent";

  const date = new Date(contract.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  const signedDate = contract.signedAt
    ? new Date(contract.signedAt).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${isSigned ? "border-green-200" : "border-amber-200"}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {isSigned ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  ★ Signed Agreement
                </span>
              ) : (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  Pending Your Signature
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">{date}</p>
            {contract.lineItems && contract.lineItems.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {contract.lineItems.map((li) => li.serviceName).join(" · ")}
              </p>
            )}
            {signedDate && contract.signedByName && (
              <p className="text-xs text-green-600 mt-1">
                Signed by {contract.signedByName} on {signedDate}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <p className="text-xl font-bold text-gray-900">{fmt(contract.totalCost)}</p>
            <div className="flex items-center gap-2">
              {isSigned && (
                <a
                  href={`/api/contracts/${contract.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-forest-600 hover:text-forest-800 border border-forest-200 rounded-lg px-3 py-1.5 hover:bg-forest-50 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                  Download PDF
                </a>
              )}
              {isPending && (
                <a
                  href={`/sign/${contract.signToken}`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                >
                  Sign Agreement
                </a>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => setExpanded((p) => !p)}
          className="mt-4 text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? "Hide agreement" : "View full agreement"}
        </button>
      </div>

      {/* Expanded agreement body */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-5">
          {/* Signature block (if signed) */}
          {isSigned && (contract.signatureData || contract.signedByName) && (
            <div className="mb-5 p-4 bg-green-50 border border-green-100 rounded-xl">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Client Signature</p>
              {contract.signatureMethod === "draw" && contract.signatureData?.startsWith("data:image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={contract.signatureData}
                  alt="Client signature"
                  className="max-h-16 max-w-xs object-contain mb-2"
                />
              ) : contract.signatureData ? (
                <p
                  className="text-3xl text-gray-900 mb-2"
                  style={{ fontFamily: "'Dancing Script', cursive" }}
                >
                  {contract.signatureData}
                </p>
              ) : null}
              <div className="border-t border-green-200 pt-2 mt-1">
                {contract.signedByName && (
                  <p className="text-sm font-semibold text-gray-800">{contract.signedByName}</p>
                )}
                {signedDate && (
                  <p className="text-xs text-gray-500">Signed on {signedDate}</p>
                )}
              </div>
            </div>
          )}

          {/* Contract body HTML */}
          <div
            className="prose prose-sm max-w-none text-gray-700 [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:pl-5 [&_li]:mb-1 [&_p]:mb-3"
            dangerouslySetInnerHTML={{ __html: contract.contractBody || "<p>No agreement text.</p>" }}
          />
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
  agreements,
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

      {/* ── Agreements section ── */}
      {agreements.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Agreements</h2>
          <p className="text-xs text-gray-400 mb-4">
            {agreements.some((c) => c.status === "Sent")
              ? "You have an agreement awaiting your signature."
              : "Your signed service agreement is available below."}
          </p>
          <div className="space-y-4">
            {agreements.map((c) => (
              <AgreementCard key={c.id} contract={c} />
            ))}
          </div>
        </div>
      )}

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
          invoices={invoices}
          ownerEmail={ownerEmail}
          currentUserEmail={currentUserEmail}
          invoiceSettings={invoiceSettings}
        />
      )}
    </div>
  );
}
