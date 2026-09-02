"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { EstimatorSection } from "@/app/(protected)/rooms/EstimatorSection";
import { AddRoomButton } from "@/app/(protected)/rooms/RoomsClient";
import type { Tenant, Room, ContractSettings, ContractTemplate, Contract, DensityLevel, RoomType, Service, InvoiceSettings, TimeEntry, Invoice, InvoiceStatus, ItemPhoto, Item, ProjectFile } from "@/lib/types";
import { ROOM_TYPES } from "@/lib/types";

interface Props {
  tenant: Tenant;
  rooms: Room[];
  settings: ContractSettings | null;
  templates: ContractTemplate[];
  existingContracts: Contract[];
  recipients: { name: string; email: string; role: string }[];
  services: Service[];
  invoiceSettings?: InvoiceSettings | null;
  signedContracts?: Contract[];
  timeEntries?: TimeEntry[];
  ownerEmail?: string;
  currentUserEmail?: string;
  invoices?: Invoice[];
  initialAssessedItems?: Item[];
  initialClientFiles?: ProjectFile[];
}

// ─── Deposit Invoice Panel ────────────────────────────────────────────────────
const STATUS_PILL: Record<InvoiceStatus, string> = {
  Unpaid: "bg-red-100 text-red-700",
  PartiallyPaid: "bg-amber-100 text-amber-700",
  Paid: "bg-green-100 text-green-700",
};

function DepositInvoicePanel({
  invoice: initial,
  recipients,
}: {
  invoice: Invoice;
  recipients: { name: string; email: string; role: string }[];
}) {
  const [invoice, setInvoice] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [editEmail, setEditEmail] = useState(invoice.sentToEmail || "");
  const [selectedRecipient, setSelectedRecipient] = useState(
    recipients.find((r) => r.email === invoice.sentToEmail)?.email || "__custom__"
  );
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [msg, setMsg] = useState("");

  const useCustomEmail = selectedRecipient === "__custom__";
  const toEmail = useCustomEmail ? editEmail : selectedRecipient;
  const fmtD = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function sendInvoice() {
    if (!toEmail) return;
    setSending(true); setMsg("");
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoice.id, sendEmail: true, sentToEmail: toEmail }),
      });
      if (res.ok) {
        const updated = await res.json();
        setInvoice(updated.invoice ?? invoice);
        setMsg("Invoice sent!");
        setExpanded(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setMsg(err.error || "Failed to send. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }

  async function deleteInvoice() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices?id=${invoice.id}`, { method: "DELETE" });
      if (res.ok) {
        setInvoice({ ...invoice, status: "Paid", emailSent: true });
      } else {
        setMsg("Failed to delete invoice. Please try again.");
      }
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  if (invoice.status === "Paid" && invoice.emailSent) return null;

  return (
    <div className="mt-2 border border-amber-200 rounded-xl bg-amber-50 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-700">Deposit Invoice</span>
              <span className="text-xs text-amber-600 font-mono">{invoice.invoiceNumber}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_PILL[invoice.status]}`}>
                {invoice.status}
              </span>
            </div>
            <div className="text-sm font-bold text-gray-900 mt-0.5">{fmtD(invoice.amount)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-amber-700 hover:text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg transition-colors"
          >
            PDF
          </a>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-lg transition-colors font-medium"
          >
            {expanded ? "Close" : "Send / Edit"}
          </button>
          <button
            onClick={() => setDeleteConfirm(true)}
            className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-amber-200 bg-white px-4 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Send invoice to</label>
            <div className="flex gap-2">
              <select
                value={selectedRecipient}
                onChange={(e) => setSelectedRecipient(e.target.value)}
                className="flex-1 h-9 px-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {recipients.map((r) => (
                  <option key={r.email} value={r.email}>
                    {r.name} — {r.email}
                  </option>
                ))}
                <option value="__custom__">Other — enter email…</option>
              </select>
              {useCustomEmail && (
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="payer@example.com"
                  className="flex-1 h-9 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={sendInvoice}
              disabled={sending || !toEmail}
              className="text-sm bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-semibold transition-colors"
            >
              {sending ? "Sending…" : `Send Invoice to ${toEmail || "…"}`}
            </button>
            {msg && <span className={`text-xs ${msg.includes("sent") ? "text-green-600" : "text-red-500"}`}>{msg}</span>}
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700 mb-2">Cancel and delete this deposit invoice?</p>
          <div className="flex gap-2">
            <button
              onClick={deleteInvoice}
              disabled={deleting}
              className="text-sm bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete it"}
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              className="text-sm border border-gray-200 bg-white text-gray-600 px-4 py-1.5 rounded-lg"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Mode = "rooms" | "quick";

const STATUS_STYLES: Record<string, { pill: string; label: string }> = {
  Draft:      { pill: "bg-yellow-100 text-yellow-700", label: "Draft" },
  Sent:       { pill: "bg-blue-100 text-blue-700",     label: "Sent" },
  Signed:     { pill: "bg-green-100 text-green-700",   label: "Signed" },
  Archived:   { pill: "bg-gray-100 text-gray-400",     label: "Archived" },
  Superseded: { pill: "bg-gray-100 text-gray-400",     label: "Superseded" },
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

// ─── Inline Editor (expands inside QuoteCard) ─────────────────────────────────
type ServiceRowEdit = {
  serviceId: string;
  serviceName: string;
  hours: number;
  rate: number;
  included: boolean;
};

const DEST_SQFT_SERVICES = ["Unpacking", "Setting Up Your Space", "Managing Moving Day"];
const DELTA_SQFT_SERVICES = ["Packing for Donation/Dispersal", "Donating/Dispersal"];

function recalcRowsForSqFt(
  rows: ServiceRowEdit[],
  services: Service[],
  currentOriginSqFt: number,
  newOriginSqFt: number,
  newDestSqFt: number
): ServiceRowEdit[] {
  const originScale = currentOriginSqFt > 0 ? newOriginSqFt / currentOriginSqFt : 1;
  return rows.map((row) => {
    if (!row.included) return row;
    const svc = services.find((s) => s.name === row.serviceName);
    let newHours: number;
    if (DEST_SQFT_SERVICES.includes(row.serviceName)) {
      newHours = svc ? Math.round((newDestSqFt / 100) * svc.estimatorAvg * 10) / 10 : row.hours;
    } else if (DELTA_SQFT_SERVICES.includes(row.serviceName)) {
      const delta = Math.max(0, newOriginSqFt - newDestSqFt);
      newHours = svc ? Math.round((delta / 100) * svc.estimatorAvg * 10) / 10 : row.hours;
    } else {
      newHours = Math.round(row.hours * originScale * 10) / 10;
    }
    return { ...row, hours: newHours };
  });
}

function QuoteInlineEditor({
  contract,
  services,
  rooms,
  tenant,
  onSaved,
  onCancel,
}: {
  contract: Contract;
  services: Service[];
  rooms: Room[];
  tenant: Tenant;
  onSaved: (c: Contract) => void;
  onCancel: () => void;
}) {
  function initRows(): ServiceRowEdit[] {
    const lineMap = new Map((contract.lineItems ?? []).map((li) => [li.serviceId, li]));
    const rows: ServiceRowEdit[] = (contract.lineItems ?? []).map((li) => ({
      serviceId: li.serviceId,
      serviceName: li.serviceName,
      hours: li.hours,
      rate: li.rate,
      included: true,
    }));
    // Append active services not already in line items (unchecked)
    for (const svc of services.filter((s) => s.isActive)) {
      if (!lineMap.has(svc.id)) {
        rows.push({
          serviceId: svc.id,
          serviceName: svc.name,
          hours: 0,
          rate: svc.hourlyRate,
          included: false,
        });
      }
    }
    return rows;
  }

  const roomsOriginSqFt = rooms.reduce((s, r) => s + r.squareFeet, 0);

  // Refs hold the values at editor-open time so the recalc effect always scales
  // from the original baseline — never from a mid-edit intermediate value.
  const initialRowsRef = useRef<ServiceRowEdit[]>(initRows());
  const initialOriginSqFtRef = useRef(roomsOriginSqFt);

  const [rows, setRows] = useState<ServiceRowEdit[]>(() => initRows());
  const [contractBody, setContractBody] = useState(contract.contractBody ?? "");
  const [showBody, setShowBody] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originSqFt, setOriginSqFt] = useState(roomsOriginSqFt);
  const [destSqFt, setDestSqFt] = useState(tenant.destinationSqFt ?? 0);

  // Auto-recalc hours whenever sqft fields change, skipping the initial render.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setRows(recalcRowsForSqFt(initialRowsRef.current, services, initialOriginSqFtRef.current, originSqFt, destSqFt));
  }, [originSqFt, destSqFt, services]);

  const totalCost = rows
    .filter((r) => r.included && r.hours > 0)
    .reduce((sum, r) => sum + r.hours * r.rate, 0);

  const includedLineItems = rows
    .filter((r) => r.included && r.hours > 0)
    .map((r) => ({ serviceId: r.serviceId, serviceName: r.serviceName, hours: r.hours, rate: r.rate }));

  function setRow(serviceId: string, patch: Partial<ServiceRowEdit>) {
    setRows((prev) => prev.map((r) => (r.serviceId === serviceId ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const saves: Promise<unknown>[] = [
        fetch("/api/contracts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: contract.id,
            contractBody,
            totalCost,
            lineItems: includedLineItems,
            rightsizingHours: 0,
            packingHours: 0,
            unpackingHours: 0,
          }),
        }),
      ];
      if (destSqFt !== (tenant.destinationSqFt ?? 0)) {
        saves.push(
          fetch("/api/tenants", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: tenant.id, destinationSqFt: destSqFt }),
          })
        );
      }
      const [contractRes] = await Promise.all(saves);
      const res = contractRes as Response;
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Save failed");
      }
      const data = await res.json();
      onSaved(data.contract);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-5">

      {/* ── Square footage — hours recalculate live as you type ─────────────── */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Square Footage</p>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Origin</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step={10}
                value={originSqFt === 0 ? "" : originSqFt}
                placeholder="0"
                onFocus={(e) => e.target.select()}
                onChange={(e) => setOriginSqFt(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-28 h-8 px-2 text-right rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
              />
              <span className="text-xs text-gray-400">SF</span>
            </div>
            {roomsOriginSqFt > 0 && originSqFt !== roomsOriginSqFt && (
              <p className="text-[10px] text-amber-600 mt-0.5">{roomsOriginSqFt.toLocaleString()} SF from rooms</p>
            )}
            {roomsOriginSqFt > 0 && originSqFt === roomsOriginSqFt && (
              <p className="text-[10px] text-gray-400 mt-0.5">{roomsOriginSqFt.toLocaleString()} SF from rooms</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Destination</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step={10}
                value={destSqFt === 0 ? "" : destSqFt}
                placeholder="0"
                onFocus={(e) => e.target.select()}
                onChange={(e) => setDestSqFt(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-28 h-8 px-2 text-right rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
              />
              <span className="text-xs text-gray-400">SF</span>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 self-center pb-0.5">Hours update automatically</p>
        </div>
      </div>

      {/* Service rows */}
      <div className="mb-4 rounded-xl border border-gray-200 overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2.5 w-8" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Service</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Hours</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Rate</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.serviceId}
                className={cn(
                  "border-b border-gray-100 last:border-0 transition-opacity",
                  !row.included && "opacity-40"
                )}
              >
                <td className="px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.included}
                    onChange={() => setRow(row.serviceId, { included: !row.included })}
                    className="rounded border-gray-300 text-forest-600 focus:ring-forest-400 cursor-pointer"
                  />
                </td>
                <td className="px-3 py-2.5 font-medium text-gray-800">{row.serviceName}</td>
                <td className="px-3 py-2.5 text-right">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={row.hours === 0 ? "" : row.hours}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setRow(row.serviceId, { hours: e.target.value === "" ? 0 : Number(e.target.value) })}
                    className="w-20 h-8 px-2 text-right rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
                  />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="inline-flex items-center gap-0.5">
                    <span className="text-gray-400 text-xs">$</span>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={row.rate === 0 ? "" : row.rate}
                      placeholder="0"
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setRow(row.serviceId, { rate: e.target.value === "" ? 0 : Number(e.target.value) })}
                      className="w-16 h-8 px-1.5 text-right rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
                    />
                    <span className="text-gray-400 text-xs">/hr</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                  {row.included && row.hours > 0 ? fmt(row.hours * row.rate) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-forest-50/60 border-t border-gray-200">
              <td colSpan={4} className="px-3 py-3 text-right text-xs font-semibold text-forest-800 uppercase tracking-wide">
                Total
              </td>
              <td className="px-3 py-3 text-right font-bold text-forest-700 text-base tabular-nums">
                {fmt(totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Contract body (collapsible) */}
      <div className="mb-5">
        <button
          type="button"
          onClick={() => setShowBody((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors"
        >
          <svg
            className={cn("w-3.5 h-3.5 transition-transform", showBody && "rotate-90")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showBody ? "Hide contract text" : "Edit contract text"}
        </button>
        {showBody && (
          <textarea
            value={contractBody}
            onChange={(e) => setContractBody(e.target.value)}
            rows={10}
            className="mt-2 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400 resize-y font-mono"
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleSave()}
          disabled={saving}
          className="h-9 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="h-9 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        {error && (
          <span className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Quote Card ───────────────────────────────────────────────────────────────
function QuoteCard({
  contract: initialContract,
  tenantId,
  services,
  rooms,
  tenant,
  recipients,
  onSaved,
  onDelete,
  onSetPrimary,
  onArchive,
  onRevertToSent,
  onSendDraft,
}: {
  contract: Contract;
  tenantId: string;
  services: Service[];
  rooms: Room[];
  tenant: Tenant;
  recipients: { name: string; email: string; role: string }[];
  onSaved: (c: Contract) => void;
  onDelete: () => void;
  onSetPrimary: () => void;
  onArchive: () => void;
  onRevertToSent: () => void;
  onSendDraft?: (c?: Contract) => void;
}) {
  const [contract, setContract] = useState(initialContract);
  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [revertToSentConfirm, setRevertToSentConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isArchived = contract.status === "Archived";
  const isSigned = contract.status === "Signed";
  const isSent = contract.status === "Sent";
  const style = STATUS_STYLES[contract.status] ?? STATUS_STYLES.Draft;
  const date = new Date(contract.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const lineItems = contract.lineItems ?? [];

  function handleInlineSaved(updated: Contract) {
    setContract(updated);
    setEditing(false);
    onSaved(updated);
  }

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

  async function handleRevertToSent() {
    setWorking(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contract.id, status: "Sent" }),
      });
      if (!res.ok) throw new Error("Failed");
      onRevertToSent();
      setRevertToSentConfirm(false);
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
      editing ? "border-forest-400 ring-2 ring-forest-200" : "border-gray-200",
      isSigned && !editing ? "border-green-300" : "",
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
              {editing && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-forest-50 text-forest-700 border border-forest-200">
                  Editing
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">{date}</p>
            {lineItems.length > 0 && (
              <p className={cn("text-xs mt-1 truncate", isArchived ? "text-gray-400" : "text-gray-500")}>
                {lineItems.map((li) => li.serviceName).join(" · ")}
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
          {/* Edit toggle — Draft/Sent open EstimatorSection; Signed/Archived use inline editor */}
          {(contract.status === "Draft" || contract.status === "Sent") ? (
            <button
              onClick={() => { setDeleteConfirm(false); setArchiveConfirm(false); setRevertToSentConfirm(false); onSendDraft?.(); }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
          ) : !editing ? (
            <button
              onClick={() => { setEditing(true); setDeleteConfirm(false); setArchiveConfirm(false); setRevertToSentConfirm(false); }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
          ) : (
            <button
              onClick={() => setEditing(false)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-forest-200 text-forest-700 bg-forest-50 hover:bg-forest-100 transition-colors"
            >
              ✕ Close Editor
            </button>
          )}

          {/* Send to Client — Draft (opens full EstimatorSection) */}
          {contract.status === "Draft" && !editing && (
            <button
              onClick={() => {
                setDeleteConfirm(false);
                setArchiveConfirm(false);
                onSendDraft?.();
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send to Client
            </button>
          )}

          {/* Send to Client — Sent (same flow as Draft) */}
          {isSent && !editing && (
            <button
              onClick={() => {
                setDeleteConfirm(false);
                setArchiveConfirm(false);
                setRevertToSentConfirm(false);
                onSendDraft?.();
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send to Client
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
              <span>{working ? "Saving…" : isArchived ? "Restore as Signed & Primary" : "Mark Signed & Primary"}</span>
            </button>
          )}

          {/* Download Agreement PDF — always available */}
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

          {/* Change to Sent — Signed only (no client signature yet) */}
          {isSigned && !contract.signedAt && (
            <button
              onClick={() => { setRevertToSentConfirm(true); setArchiveConfirm(false); }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
            >
              Change to Sent
            </button>
          )}

          {/* Unsign & Archive — Signed only */}
          {isSigned && (
            <button
              onClick={() => { setArchiveConfirm(true); setRevertToSentConfirm(false); }}
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

      {/* ─── Inline Editor ─────────────────────────────────────────────────── */}
      {editing && (
        <QuoteInlineEditor
          contract={contract}
          services={services}
          rooms={rooms}
          tenant={tenant}
          onSaved={handleInlineSaved}
          onCancel={() => setEditing(false)}
        />
      )}

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

      {/* Change to Sent confirm */}
      {revertToSentConfirm && (
        <div className="border-t border-blue-100 bg-blue-50 px-5 py-3">
          <p className="text-sm text-blue-800 font-medium mb-0.5">Change this quote back to Sent?</p>
          <p className="text-xs text-blue-600 mb-3">The client will still be able to sign the quote using their original signing link. This removes its Primary Quote designation.</p>
          <div className="flex gap-2">
            <button
              onClick={handleRevertToSent}
              disabled={working}
              className="text-sm font-medium px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {working ? "Saving…" : "Change to Sent"}
            </button>
            <button
              onClick={() => setRevertToSentConfirm(false)}
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

// ─── Hours Comparison ─────────────────────────────────────────────────────────
function HoursComparison({ signedContracts, timeEntries }: { signedContracts: Contract[]; timeEntries: TimeEntry[] }) {
  const signed = signedContracts[0];
  if (!signed?.lineItems?.length) return null;

  const loggedByService = new Map<string, number>();
  for (const entry of timeEntries) {
    const key = entry.focusArea.toLowerCase();
    loggedByService.set(key, (loggedByService.get(key) ?? 0) + entry.durationMinutes / 60);
  }

  const rows = signed.lineItems.map((item) => {
    const logged = Math.round((loggedByService.get(item.serviceName.toLowerCase()) ?? 0) * 10) / 10;
    const overBudget = logged > item.hours;
    return {
      serviceName: item.serviceName,
      estimated: item.hours,
      logged,
      overBudget,
      diff: Math.round(Math.abs(item.hours - logged) * 10) / 10,
    };
  });

  const totalEst = Math.round(rows.reduce((s, r) => s + r.estimated, 0) * 10) / 10;
  const totalLogged = Math.round(rows.reduce((s, r) => s + r.logged, 0) * 10) / 10;
  const totalOver = totalLogged > totalEst;

  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold text-gray-900 mb-3">Hours Tracker</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
              <th className="text-left px-4 py-2.5">Service</th>
              <th className="text-right px-4 py-2.5">Contracted</th>
              <th className="text-right px-4 py-2.5">Logged</th>
              <th className="text-right px-4 py-2.5">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.serviceName} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-900">{row.serviceName}</td>
                <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{row.estimated}h</td>
                <td className={cn("px-4 py-3 text-right tabular-nums font-medium", row.overBudget ? "text-red-600" : "text-gray-900")}>
                  {row.logged}h
                </td>
                <td className={cn("px-4 py-3 text-right tabular-nums text-xs", row.overBudget ? "text-red-500" : "text-gray-400")}>
                  {row.overBudget ? `+${row.diff}h over` : `${row.diff}h left`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
              <td className="px-4 py-3 text-gray-900">Total</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-700">{totalEst}h</td>
              <td className={cn("px-4 py-3 text-right tabular-nums", totalOver ? "text-red-600" : "text-forest-600")}>
                {totalLogged}h
              </td>
              <td className={cn("px-4 py-3 text-right tabular-nums text-xs", totalOver ? "text-red-500" : "text-gray-400")}>
                {totalOver
                  ? `+${Math.round((totalLogged - totalEst) * 10) / 10}h over budget`
                  : `${Math.round((totalEst - totalLogged) * 10) / 10}h remaining`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Route badge colors ────────────────────────────────────────────────────────
const ROUTE_BADGE: Record<string, string> = {
  "Donate":                    "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Discard":                   "bg-gray-100 text-gray-600 border-gray-200",
  "FB/Marketplace":            "bg-amber-50 text-amber-700 border-amber-200",
  "Online Marketplace":        "bg-blue-50 text-blue-700 border-blue-200",
  "ProFoundFinds Consignment": "bg-purple-50 text-purple-700 border-purple-200",
  "Other Consignment":         "bg-indigo-50 text-indigo-700 border-indigo-200",
  "To Be Moved":               "bg-stone-100 text-stone-600 border-stone-200",
  "Local Vendor":              "bg-teal-50 text-teal-700 border-teal-200",
  "Estate Sale":               "bg-orange-50 text-orange-700 border-orange-200",
};

// ─── Quote Photos Section ─────────────────────────────────────────────────────
// ─── Client Files Section ─────────────────────────────────────────────────────

function FileIcon({ fileName }: { fileName: string }) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["doc", "docx"].includes(ext)) {
    return (
      <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9 13h6v1H9zm0 2h6v1H9zm0 2h4v1H9z"/>
      </svg>
    );
  }
  if (ext === "pdf") {
    return (
      <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 17.5c-.3 0-.5-.2-.5-.5s.2-.5.5-.5.5.2.5.5-.2.5-.5.5zm0-2c-.8 0-1.5.7-1.5 1.5S7.7 18.5 8.5 18.5 10 17.8 10 17s-.7-1.5-1.5-1.5zm3.5-1h-1v3h1v-3zm2 0h-1v3h1v-1.5H15v-1h-1v-.5zm-5 0H7v3h1v-1h1c.6 0 1-.4 1-1s-.4-1-1-1zm0 1H8v-.5h1v.5z"/>
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
    </svg>
  );
}

function ProjectDetailsSection({
  tenantId,
  initialTargetStartDate,
  initialTargetMoveDate,
  initialDatesFlexible,
  initialDeadlineNotes,
  initialDisposalNotes,
  initialSpecialItems,
  initialVendorNotes,
}: {
  tenantId: string;
  initialTargetStartDate?: string;
  initialTargetMoveDate?: string;
  initialDatesFlexible?: boolean;
  initialDeadlineNotes?: string;
  initialDisposalNotes?: string;
  initialSpecialItems?: string;
  initialVendorNotes?: string;
}) {
  const [targetStartDate, setTargetStartDate] = useState(initialTargetStartDate ?? "");
  const [targetMoveDate, setTargetMoveDate] = useState(initialTargetMoveDate ?? "");
  const [datesFlexible, setDatesFlexible] = useState(initialDatesFlexible ?? false);
  const [deadlineNotes, setDeadlineNotes] = useState(initialDeadlineNotes ?? "");
  const [disposalNotes, setDisposalNotes] = useState(initialDisposalNotes ?? "");
  const [specialItems, setSpecialItems] = useState(initialSpecialItems ?? "");
  const [vendorNotes, setVendorNotes] = useState(initialVendorNotes ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(overrides?: { datesFlexible?: boolean; targetStartDate?: string; targetMoveDate?: string }) {
    setSaveStatus("saving");
    try {
      await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          quoteTargetStartDate: (overrides?.targetStartDate ?? targetStartDate) || null,
          quoteTargetMoveDate: (overrides?.targetMoveDate ?? targetMoveDate) || null,
          quoteDatesFlexible: overrides?.datesFlexible ?? datesFlexible,
          quoteDeadlineNotes: deadlineNotes || null,
          quoteDisposalNotes: disposalNotes || null,
          quoteSpecialItems: specialItems || null,
          quoteVendorNotes: vendorNotes || null,
        }),
      });
      setSaveStatus("saved");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus("idle"), 2200);
    } catch {
      setSaveStatus("idle");
    }
  }

  function toggleFlexible(val: boolean) {
    setDatesFlexible(val);
    save({ datesFlexible: val });
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 focus:border-transparent bg-white placeholder-gray-400";
  const textareaCls = `${inputCls} resize-none`;

  return (
    <div className="border-t border-gray-100 mt-12 pt-8 pb-2">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">Project Details</h2>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full uppercase tracking-wide">
            Internal only
          </span>
        </div>
        <div className="ml-auto text-xs">
          {saveStatus === "saving" && <span className="text-gray-400">Saving…</span>}
          {saveStatus === "saved" && <span className="text-emerald-600 font-medium">Saved</span>}
        </div>
      </div>

      {/* Dates + Flexibility */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Target Start Date <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </label>
          <input
            type="date"
            value={targetStartDate}
            onChange={e => setTargetStartDate(e.target.value)}
            onBlur={() => save()}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Target Move Date <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </label>
          <input
            type="date"
            value={targetMoveDate}
            onChange={e => setTargetMoveDate(e.target.value)}
            onBlur={() => save()}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Are Dates Flexible? <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </label>
          <div className="flex gap-2 mt-0.5">
            <button
              type="button"
              onClick={() => toggleFlexible(true)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${datesFlexible ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => toggleFlexible(false)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${!datesFlexible ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
            >
              No
            </button>
          </div>
        </div>
      </div>

      {/* Text notes */}
      <div className="grid gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Notes on Deadlines / Dependencies <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </label>
          <textarea
            value={deadlineNotes}
            onChange={e => setDeadlineNotes(e.target.value)}
            onBlur={() => save()}
            rows={2}
            placeholder="e.g. Lease ends Nov 1, family flying in for move week…"
            className={textareaCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Disposal or Hauling Needs <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </label>
          <textarea
            value={disposalNotes}
            onChange={e => setDisposalNotes(e.target.value)}
            onBlur={() => save()}
            rows={2}
            placeholder="e.g. Full garage to haul, hazardous materials, large appliances for disposal…"
            className={textareaCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Special Items <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </label>
          <textarea
            value={specialItems}
            onChange={e => setSpecialItems(e.target.value)}
            onBlur={() => save()}
            rows={2}
            placeholder="e.g. Grand piano, safe, wall-mounted TV, antiques…"
            className={textareaCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Notes on Vendors Already Engaged <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </label>
          <textarea
            value={vendorNotes}
            onChange={e => setVendorNotes(e.target.value)}
            onBlur={() => save()}
            rows={2}
            placeholder="e.g. Movers booked with Allied, estate attorney involved…"
            className={textareaCls}
          />
        </div>
      </div>
    </div>
  );
}

function ClientFilesSection({
  tenantId,
  initialFiles,
}: {
  tenantId: string;
  initialFiles: ProjectFile[];
}) {
  const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tenantId", tenantId);
        fd.append("tag", "Client File");
        const res = await fetch("/api/files", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({})) as { file?: ProjectFile; error?: string };
        if (!res.ok) {
          if (res.status === 413) throw new Error("File is too large to upload.");
          throw new Error(data.error || "Upload failed. Please try again.");
        }
        setFiles(prev => [...prev, data.file as ProjectFile]);
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(file: ProjectFile) {
    setDeletingId(file.id);
    try {
      const params = new URLSearchParams({
        id: file.id,
        publicId: file.cloudinaryPublicId,
        resourceType: file.resourceType,
        tenantId,
        tag: "Client File",
      });
      const res = await fetch(`/api/files?${params}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setFiles(prev => prev.filter(f => f.id !== file.id));
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }

  return (
    <div className="mt-12 border-t border-gray-100 pt-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Client Files</h2>
          <p className="text-sm text-gray-500 mt-0.5">PDFs, Word docs, and other documents from this client. Files appear on the Plan page automatically.</p>
        </div>
        <label className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${uploading ? "bg-gray-100 text-gray-400 pointer-events-none" : "bg-forest-600 text-white hover:bg-forest-700"}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          {uploading ? "Uploading…" : "Upload File"}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
        </label>
      </div>

      {uploadError && <p className="text-sm text-red-600 mb-3">{uploadError}</p>}

      {files.length === 0 && !uploading ? (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl py-10 text-center">
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p className="text-sm text-gray-400">No client files yet. Upload a PDF, Word doc, or other document.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 overflow-hidden">
          {files.map(f => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
              <FileIcon fileName={f.fileName} />
              <a
                href={f.cloudinaryUrl.replace("/upload/", "/upload/fl_attachment/")}
                download={f.fileName}
                className="flex-1 text-sm text-gray-800 font-medium hover:text-forest-700 hover:underline truncate"
              >
                {f.fileName}
              </a>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <button
                onClick={() => handleDelete(f)}
                disabled={deletingId === f.id}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                title="Delete file"
              >
                {deletingId === f.id ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuotePhotosSection({
  tenantId,
  initialPhotos,
  initialAssessedItems = [],
}: {
  tenantId: string;
  initialPhotos: ItemPhoto[];
  initialAssessedItems?: Item[];
}) {
  const [photos, setPhotos] = useState<ItemPhoto[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Selection + assessment state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [assessedItems, setAssessedItems] = useState<Item[]>(initialAssessedItems);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("tenantId", tenantId);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          if (uploadRes.status === 413) throw new Error("Photo is too large to upload. Please use a smaller image.");
          throw new Error("Upload failed");
        }
        const { photoUrl, photoPublicId } = await uploadRes.json();
        const saveRes = await fetch(`/api/quoting/${tenantId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: photoUrl, publicId: photoPublicId }),
        });
        if (!saveRes.ok) throw new Error("Failed to save photo");
        const { photos: updated } = await saveRes.json();
        setPhotos(updated);
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(publicId: string) {
    setDeletingId(publicId);
    try {
      const res = await fetch(`/api/quoting/${tenantId}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId }),
      });
      if (!res.ok) throw new Error("Failed");
      const { photos: updated } = await res.json();
      setPhotos(updated);
      setSelectedIds(prev => { const next = new Set(prev); next.delete(publicId); return next; });
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }

  async function handleEmailInfo() {
    setEmailSending(true);
    setEmailMsg("");
    try {
      const res = await fetch(`/api/quoting/${tenantId}/email-info`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to send email");
      }
      setEmailMsg("Email sent to your inbox!");
    } catch (e) {
      setEmailMsg(e instanceof Error ? e.message : "Failed to send. Please try again.");
    } finally {
      setEmailSending(false);
    }
  }

  function toggleSelect(publicId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
  }

  async function handleAssessItems() {
    const selectedPhotos = photos.filter(p => selectedIds.has(p.publicId));
    if (!selectedPhotos.length) return;
    setAssessing(true);
    setAssessError(null);
    try {
      const res = await fetch(`/api/quoting/${tenantId}/assess-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: selectedPhotos }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Assessment failed");
      }
      const { items } = await res.json();
      setAssessedItems(prev => {
        const byId = new Map(prev.map((i: Item) => [i.id, i]));
        for (const item of items) byId.set(item.id, item);
        return Array.from(byId.values());
      });
      setSelectedIds(new Set());
    } catch (e) {
      setAssessError(e instanceof Error ? e.message : "Assessment failed. Please try again.");
    } finally {
      setAssessing(false);
    }
  }

  const routeSummary = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const item of assessedItems) {
      const route = (item.primaryRoute as string) || "Unknown";
      const existing = map.get(route) ?? { count: 0, total: 0 };
      map.set(route, { count: existing.count + 1, total: existing.total + (item.valueMid ?? 0) });
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [assessedItems]);

  const selectedCount = selectedIds.size;

  return (
    <div className="mt-12 pb-8">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Pictures from Quote</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {selectedCount > 0
              ? `${selectedCount} photo${selectedCount !== 1 ? "s" : ""} selected`
              : "Select photos to assess items, or tap a photo to view full size"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selectedCount > 0 && (
            <button
              onClick={handleAssessItems}
              disabled={assessing}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-forest-600 text-white hover:bg-forest-700 transition-colors disabled:opacity-60"
            >
              {assessing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                  Assessing {selectedCount} item{selectedCount !== 1 ? "s" : ""}…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Assess {selectedCount} Item{selectedCount !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}
          <button
            onClick={handleEmailInfo}
            disabled={emailSending}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {emailSending ? "Sending…" : "Email Me Images/Info"}
          </button>
        </div>
      </div>

      {emailMsg && (
        <div className={cn("mb-4 text-sm px-3 py-2 rounded-lg border", emailMsg.includes("sent") ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200")}>
          {emailMsg}
        </div>
      )}
      {uploadError && (
        <div className="mb-4 text-sm px-3 py-2 rounded-lg border bg-red-50 text-red-600 border-red-200">{uploadError}</div>
      )}
      {assessError && (
        <div className="mb-4 text-sm px-3 py-2 rounded-lg border bg-red-50 text-red-600 border-red-200">{assessError}</div>
      )}

      {/* ─── Photo grid ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((photo) => {
          const isSelected = selectedIds.has(photo.publicId);
          return (
            <div
              key={photo.publicId}
              className={cn(
                "relative group aspect-square rounded-2xl overflow-hidden bg-gray-100 border cursor-pointer shadow-sm transition-all",
                isSelected
                  ? "border-forest-500 ring-2 ring-forest-400 shadow-md"
                  : "border-gray-200 hover:shadow-md"
              )}
              onClick={() => setLightbox(photo.url)}
            >
              <img src={photo.url} alt="" className="w-full h-full object-cover" />
              <div className={cn("absolute inset-0 transition-colors", isSelected ? "bg-forest-900/10" : "bg-black/0 group-hover:bg-black/10")} />

              {/* Selection checkbox */}
              <button
                onClick={(e) => toggleSelect(photo.publicId, e)}
                className={cn(
                  "absolute top-2 left-2 w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center shadow-sm",
                  isSelected
                    ? "bg-forest-600 border-forest-600 opacity-100"
                    : "bg-white/85 border-gray-300 opacity-0 group-hover:opacity-100"
                )}
                title={isSelected ? "Deselect" : "Select for assessment"}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>

              {/* Delete button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(photo.publicId); }}
                disabled={deletingId === photo.publicId}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-sm font-bold disabled:opacity-40"
                title="Remove photo"
              >
                {deletingId === photo.publicId ? (
                  <span className="w-3 h-3 border border-white/60 border-t-transparent rounded-full animate-spin block" />
                ) : "×"}
              </button>
            </div>
          );
        })}

        {/* Upload tile */}
        <label
          className={cn(
            "aspect-square rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-2 shadow-sm",
            uploading
              ? "border-forest-300 bg-forest-50/50 cursor-wait"
              : "border-gray-200 bg-gray-50/50 hover:border-forest-300 hover:bg-forest-50 hover:shadow-md"
          )}
        >
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} disabled={uploading} />
          {uploading ? (
            <>
              <div className="w-6 h-6 border-2 border-forest-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-forest-600 font-medium">Uploading…</span>
            </>
          ) : (
            <>
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs text-gray-500 text-center px-3 leading-tight">Take photo or<br />upload image</span>
            </>
          )}
        </label>
      </div>

      {photos.length === 0 && !uploading && (
        <p className="mt-3 text-xs text-gray-400">No photos yet. Tap the tile above to add photos from your camera or library.</p>
      )}

      {/* ─── Catalog From Quote ─── */}
      {assessedItems.length > 0 && (
        <div className="mt-10 pt-8 border-t border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Catalog From Quote</h2>
          <p className="text-xs text-gray-400 mb-5">
            {assessedItems.length} item{assessedItems.length !== 1 ? "s" : ""} assessed — also visible in this project&apos;s Catalog
          </p>

          {/* Route summary cards */}
          <div className="flex flex-wrap gap-3 mb-4">
            {routeSummary.map(([route, { count, total }]) => (
              <div key={route} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white shadow-sm">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold border", ROUTE_BADGE[route] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
                  {route}
                </span>
                <span className="text-sm font-medium text-gray-800">{count} item{count !== 1 ? "s" : ""}</span>
                <span className="text-sm text-gray-500">${total.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-gray-400 italic mb-5 max-w-2xl">
            These are preliminary AI-generated estimates and do not constitute a guarantee of value.
            Final valuations are subject to market conditions, item condition verification, and team review.
          </p>

          {/* Item cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assessedItems.map((item) => (
              <div key={item.id} className="flex gap-3 p-3 rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                {item.photos?.[0]?.url ? (
                  <img
                    src={item.photos[0].url}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover shrink-0 bg-gray-100"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg shrink-0 bg-gray-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate leading-snug">{item.itemName}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={cn("px-1.5 py-0.5 rounded-full text-xs font-medium border", ROUTE_BADGE[(item.primaryRoute as string)] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
                      {item.primaryRoute}
                    </span>
                    {item.sizeClass && (
                      <span className="text-xs text-gray-400">{item.sizeClass}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mt-1.5">
                    {item.valueMid ? `$${item.valueMid.toLocaleString()}` : "—"}
                    {item.valueLow && item.valueHigh ? (
                      <span className="text-xs font-normal text-gray-400 ml-1">
                        (${item.valueLow}–${item.valueHigh})
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Lightbox ─── */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-xl font-bold">×</button>
        </div>
      )}
    </div>
  );
}

// ─── Main Client ──────────────────────────────────────────────────────────────
export function QuotingClient({ tenant, rooms, settings, templates, existingContracts, recipients, services, invoiceSettings, signedContracts, timeEntries, ownerEmail, currentUserEmail, invoices: initialInvoices, initialAssessedItems = [], initialClientFiles = [] }: Props) {
  const [mode, setMode] = useState<Mode>("quick");
  const [highSqFt, setHighSqFt] = useState(tenant.originHighSqFt ?? 0);
  const [avgSqFt, setAvgSqFt] = useState(tenant.originMedSqFt ?? tenant.originSqFt ?? 0);
  const [lowSqFt, setLowSqFt] = useState(tenant.originLowSqFt ?? 0);
  const [quotes, setQuotes] = useState<Contract[]>(existingContracts);
  const [invoices] = useState<Invoice[]>(initialInvoices ?? []);
  const [showEstimator, setShowEstimator] = useState(existingContracts.length === 0);
  const [draftToSend, setDraftToSend] = useState<Contract | null>(null);
  const [localRooms, setLocalRooms] = useState<Room[]>(rooms);
  useEffect(() => { setLocalRooms(rooms); }, [rooms]);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomFields, setEditRoomFields] = useState<{ name: string; roomType: RoomType; squareFeet: number; density: DensityLevel }>({ name: "", roomType: "Living Room", squareFeet: 0, density: "Medium" });
  const [roomSaving, setRoomSaving] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);

  const syntheticRooms: Room[] = [
    ...(highSqFt > 0 ? [makeSyntheticRoom("High", highSqFt, 0)] : []),
    ...(avgSqFt > 0 ? [makeSyntheticRoom("Medium", avgSqFt, 1)] : []),
    ...(lowSqFt > 0 ? [makeSyntheticRoom("Low", lowSqFt, 2)] : []),
  ];

  const estimatorRooms = mode === "rooms" ? localRooms : syntheticRooms;
  const hasRooms = mode === "rooms" ? localRooms.length > 0 : syntheticRooms.length > 0;

  // Called when EstimatorSection saves a NEW quote
  function handleNewQuoteSaved(contract: Contract) {
    setQuotes((prev) => {
      const exists = prev.find((q) => q.id === contract.id);
      if (exists) return prev.map((q) => (q.id === contract.id ? contract : q));
      return [contract, ...prev];
    });
    setShowEstimator(false);
  }

  // Called when QuoteCard inline editor saves an existing quote
  function handleExistingQuoteSaved(contract: Contract) {
    setQuotes((prev) => prev.map((q) => (q.id === contract.id ? contract : q)));
  }

  function handleDeleted(id: string) {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
  }

  function handleSetPrimary(id: string) {
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === id
          ? { ...q, status: q.status === "Sent" ? ("Sent" as const) : ("Signed" as const) }
          : q.status === "Signed"
          ? { ...q, status: "Archived" as const }
          : q
      )
    );
  }

  function handleRevertToSent(id: string) {
    setQuotes((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: "Sent" as const } : q))
    );
  }

  function handleArchived(id: string) {
    setQuotes((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: "Archived" as const } : q))
    );
  }

  function handleNewQuote() {
    setDraftToSend(null);
    setShowEstimator(true);
    setTimeout(() => document.getElementById("estimator-section")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function handleSendDraft(contract: Contract) {
    setShowEstimator(false);
    setDraftToSend(contract);
    setTimeout(() => document.getElementById("estimator-section")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function handleDraftSendSaved(contract: Contract) {
    setQuotes((prev) => prev.map((q) => (q.id === contract.id ? contract : q)));
    setDraftToSend(null);
    setShowEstimator(false);
  }

  function handleCancelDraftSend() {
    setDraftToSend(null);
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
                {quotes.filter((q) => q.status === "Signed").length > 0
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
            {quotes.map((q) => {
              const depositInvoice = invoices.find(
                (inv) => inv.contractId === q.id && inv.type === "Deposit" && inv.status !== "Paid"
              );
              return (
                <div key={q.id}>
                  <QuoteCard
                    contract={q}
                    tenantId={tenant.id}
                    services={services}
                    rooms={localRooms}
                    tenant={tenant}
                    recipients={recipients}
                    onSaved={handleExistingQuoteSaved}
                    onDelete={() => handleDeleted(q.id)}
                    onSetPrimary={() => handleSetPrimary(q.id)}
                    onArchive={() => handleArchived(q.id)}
                    onRevertToSent={() => handleRevertToSent(q.id)}
                    onSendDraft={(c) => handleSendDraft(c ?? q)}
                  />
                  {depositInvoice && q.status === "Signed" && !depositInvoice.emailSent && (
                    <DepositInvoicePanel invoice={depositInvoice} recipients={recipients} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hours Tracker */}
      {signedContracts && signedContracts.length > 0 && timeEntries && timeEntries.length > 0 && (
        <HoursComparison signedContracts={signedContracts} timeEntries={timeEntries} />
      )}

      {/* Mode tabs */}
      {quotes.length > 0 && !draftToSend && (
        <h2 className="text-base font-semibold text-gray-900 mb-3">Create New Quote</h2>
      )}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-8">
        {([
          { key: "quick" as Mode, label: "Quick Quote" },
          { key: "rooms" as Mode, label: "By Rooms" },
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
          {localRooms.length === 0 ? (
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
                    {localRooms.length} room{localRooms.length !== 1 ? "s" : ""} · {localRooms.reduce((s, r) => s + r.squareFeet, 0).toLocaleString()} SF total
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
                      <th className="px-4 py-2.5 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {localRooms.map((r) => {
                      const isEditing = editingRoomId === r.id;
                      const isDeleting = deletingRoomId === r.id;
                      return (
                        <tr key={r.id} className={cn("border-b border-gray-100 last:border-0", isEditing && "bg-forest-50/40")}>
                          {isEditing ? (
                            <>
                              <td className="px-2 py-1.5">
                                <input
                                  value={editRoomFields.name}
                                  onChange={(e) => setEditRoomFields((f) => ({ ...f, name: e.target.value }))}
                                  className="w-full h-7 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  value={editRoomFields.roomType}
                                  onChange={(e) => setEditRoomFields((f) => ({ ...f, roomType: e.target.value as RoomType }))}
                                  className="w-full h-7 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400"
                                >
                                  {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number" min={0}
                                  value={editRoomFields.squareFeet || ""}
                                  onChange={(e) => setEditRoomFields((f) => ({ ...f, squareFeet: Number(e.target.value) }))}
                                  className="w-20 h-7 px-2 text-right rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400 ml-auto block"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  value={editRoomFields.density}
                                  onChange={(e) => setEditRoomFields((f) => ({ ...f, density: e.target.value as DensityLevel }))}
                                  className="h-7 px-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-forest-400"
                                >
                                  <option value="High">High</option>
                                  <option value="Medium">Average</option>
                                  <option value="Low">Low</option>
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1 justify-end">
                                  <button
                                    disabled={roomSaving}
                                    onClick={async () => {
                                      setRoomSaving(true);
                                      try {
                                        const res = await fetch("/api/rooms", {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ id: r.id, tenantId: tenant.id, ...editRoomFields }),
                                        });
                                        if (!res.ok) throw new Error();
                                        const data = await res.json();
                                        setLocalRooms((prev) => prev.map((x) => x.id === r.id ? data.room : x));
                                        setEditingRoomId(null);
                                      } catch { /* ignore */ }
                                      finally { setRoomSaving(false); }
                                    }}
                                    className="text-xs font-medium px-2 py-1 rounded-lg bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-50"
                                  >
                                    {roomSaving ? "…" : "Save"}
                                  </button>
                                  <button
                                    onClick={() => setEditingRoomId(null)}
                                    className="text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
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
                              <td className="px-4 py-2.5">
                                {isDeleting ? (
                                  <div className="flex items-center gap-1 justify-end">
                                    <span className="text-xs text-gray-500">Delete?</span>
                                    <button
                                      onClick={async () => {
                                        try {
                                          await fetch(`/api/rooms?id=${r.id}&tenantId=${tenant.id}`, { method: "DELETE" });
                                          setLocalRooms((prev) => prev.filter((x) => x.id !== r.id));
                                        } catch { /* ignore */ }
                                        finally { setDeletingRoomId(null); }
                                      }}
                                      className="text-xs font-medium px-2 py-0.5 rounded-lg bg-red-600 text-white hover:bg-red-700"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      onClick={() => setDeletingRoomId(null)}
                                      className="text-xs font-medium px-2 py-0.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 justify-end">
                                    <button
                                      onClick={() => { setEditingRoomId(r.id); setEditRoomFields({ name: r.name, roomType: r.roomType, squareFeet: r.squareFeet, density: r.density }); setDeletingRoomId(null); }}
                                      className="text-xs font-medium px-2 py-0.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => { setDeletingRoomId(r.id); setEditingRoomId(null); }}
                                      className="text-xs font-medium px-2 py-0.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
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

      {/* ─── Create New Quote (only when rooms exist) ────────────────────────── */}
      {hasRooms && !draftToSend && (
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
                actualRooms={mode === "rooms" ? localRooms : undefined}
                settings={settings}
                templates={templates}
                recipients={recipients}
                services={services}
                editingContract={null}
                onSaved={handleNewQuoteSaved}
                onCancelEdit={quotes.length > 0 ? () => setShowEstimator(false) : undefined}
                invoiceSettings={invoiceSettings}
                signedContracts={signedContracts}
                timeEntries={timeEntries}
                ownerEmail={ownerEmail}
                currentUserEmail={currentUserEmail}
              />
            </div>
          )}
        </div>
      )}

      {/* ─── Edit existing Draft/Sent quote (always rendered when active) ────── */}
      {draftToSend && (
        <div id="estimator-section">
          <EstimatorSection
            tenant={tenant}
            rooms={estimatorRooms}
            actualRooms={mode === "rooms" ? localRooms : undefined}
            settings={settings}
            templates={templates}
            recipients={recipients}
            services={services}
            editingContract={draftToSend}
            onSaved={handleDraftSendSaved}
            onCancelEdit={handleCancelDraftSend}
            invoiceSettings={invoiceSettings}
            signedContracts={signedContracts}
            timeEntries={timeEntries}
            ownerEmail={ownerEmail}
            currentUserEmail={currentUserEmail}
          />
        </div>
      )}

      {/* ─── Pictures from Quote ──────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 mt-12">
        <QuotePhotosSection
          tenantId={tenant.id}
          initialPhotos={tenant.quotePhotos ?? []}
          initialAssessedItems={initialAssessedItems}
        />
      </div>

      {/* ─── Project Details ──────────────────────────────────────────────────── */}
      <ProjectDetailsSection
        tenantId={tenant.id}
        initialTargetStartDate={tenant.quoteTargetStartDate}
        initialTargetMoveDate={tenant.quoteTargetMoveDate}
        initialDatesFlexible={tenant.quoteDatesFlexible}
        initialDeadlineNotes={tenant.quoteDeadlineNotes}
        initialDisposalNotes={tenant.quoteDisposalNotes}
        initialSpecialItems={tenant.quoteSpecialItems}
        initialVendorNotes={tenant.quoteVendorNotes}
      />

      {/* ─── Client Files ─────────────────────────────────────────────────────── */}
      <ClientFilesSection tenantId={tenant.id} initialFiles={initialClientFiles} />
    </div>
  );
}
