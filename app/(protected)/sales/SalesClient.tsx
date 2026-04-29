"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Item, Vendor, ProjectFile, ItemStatus, Room, LocalVendor, ItemSaleEvent, Tenant, PayoutMethod, StaffMember, Estate } from "@/lib/types";
import { EditItemModal } from "@/components/catalog/ItemGrid";
import { PayoutModal } from "./PayoutModal";
import { ZellePayments } from "./ZellePayments";

// ─── Calc payout from local vendor take rate ──────────────────────────────────

interface CalcPayout { amount: number; vendorName: string; rate: number; }

function computeCalcPayout(item: Item, localVendors: LocalVendor[]): CalcPayout | null {
  if (!item.salePrice || item.salePrice <= 0) return null;

  // Estate Sale: client gets clientSharePercent of sale price (TTT manages the estate)
  if (item.primaryRoute === "Estate Sale") {
    const pct = item.clientSharePercent ?? 0;
    if (pct > 0) return { amount: item.salePrice * (pct / 100), vendorName: "Estate Sale", rate: 100 - pct };
    if (item.consignorPayout && item.consignorPayout > 0) return { amount: item.consignorPayout, vendorName: "Estate Sale", rate: 0 };
    return null;
  }

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  let match: LocalVendor | undefined;

  if (item.primaryRoute === "Other Consignment" && item.assignedVendorId) {
    // assignedVendorId is a LocalVendor ID — look up directly
    match = localVendors.find(lv => lv.id === item.assignedVendorId);
  } else {
    // First: exact route-name match (handles "Online Marketplace", "FB/Marketplace" vendors)
    const routeNorm = norm(item.primaryRoute);
    match = localVendors.find(lv => norm(lv.vendorName) === routeNorm);

    // Fallback: fuzzy name match
    if (!match) {
      const searchTerms: string[] =
        item.primaryRoute === "ProFoundFinds Consignment" ? ["profoundfind", "profound"] :
        item.primaryRoute === "FB/Marketplace"            ? ["fbmarketplace", "facebook marketplace", "fb marketplace"] :
        item.primaryRoute === "Online Marketplace"        ? ["onlinemarketplace", "online marketplace"] :
        [];
      if (searchTerms.length === 0) return null;
      const normTerms = searchTerms.map(norm);
      match = localVendors.find(lv => {
        const n = norm(lv.vendorName);
        return normTerms.some(t => n.includes(t) || t.includes(n));
      });
    }
  }

  if (!match || match.consignmentTake <= 0) {
    // Fallback: item has a stored clientSharePercent (e.g. non-TTT 50% share)
    if (item.clientSharePercent != null && item.clientSharePercent > 0) {
      return {
        amount: item.salePrice * (item.clientSharePercent / 100),
        vendorName: "",
        rate: 100 - item.clientSharePercent,
      };
    }
    return null;
  }
  return {
    amount: item.salePrice * (1 - match.consignmentTake / 100),
    vendorName: match.vendorName,
    rate: match.consignmentTake,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ItemStatus, string> = {
  "Pending Review": "bg-gray-100 text-gray-600",
  "Approved":       "bg-blue-100 text-blue-700",
  "Listed":         "bg-purple-100 text-purple-700",
  "In Cart":        "bg-orange-100 text-orange-700",
  "Sold":           "bg-green-100 text-green-700",
  "Donated":        "bg-teal-100 text-teal-700",
  "Discarded":      "bg-red-100 text-red-600",
  "Rejected / Revisit": "bg-amber-100 text-amber-700",
};

function fmtCurrency(n: number | undefined) {
  if (n == null || n === 0) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PaymentHandles {
  venmoHandle?: string;
  venmoQrUrl?: string;
  zelleHandle?: string;
  zelleQrUrl?: string;
}

interface SalesClientProps {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  items: Item[];
  vendors: Vendor[];
  rooms: Room[];
  localVendors: LocalVendor[];
  paymentProofFiles: ProjectFile[];
  pfSaleEvents: ItemSaleEvent[];
  canEdit: boolean;
  canEditPayout: boolean;
  canPayoutClient: boolean;
  canDeleteProof: boolean;
  canReassign?: boolean;
  allTenants?: Tenant[];
  paymentHandles?: PaymentHandles;
  initialPayoutMethod?: PayoutMethod;
  initialPayoutUsername?: string;
  initialPayoutCheckAddress?: string;
  projectAddress?: string;
  isTTT?: boolean;
  canEditExpense?: boolean;
  initialConsignmentExpense?: number;
  initialConsignmentExpenseNote?: string;
  staffMembers?: StaffMember[];
  isTTTUser?: boolean;
  estates?: Estate[];
}

// ─── Sales Table Row ──────────────────────────────────────────────────────────

function SalesTableRow({
  item,
  canEditPayout,
  canEdit,
  calcPayout,
  onPayoutSaved,
  onSalePriceSaved,
  onEdit,
  isNonTTT = false,
}: {
  item: Item;
  canEditPayout: boolean;
  canEdit: boolean;
  calcPayout: CalcPayout | null;
  onPayoutSaved: (itemId: string, amount: number, paidAt?: string) => void;
  onSalePriceSaved: (itemId: string, price: number) => void;
  onEdit: (item: Item) => void;
  isNonTTT?: boolean;
}) {
  const [editingPayout, setEditingPayout] = useState(false);
  const [payoutInput, setPayoutInput] = useState(String(item.payoutPaidAmount ?? 0));
  const [savingPayout, setSavingPayout] = useState(false);

  const [editingSalePrice, setEditingSalePrice] = useState(false);
  const [salePriceInput, setSalePriceInput] = useState(String(item.salePrice ?? ""));
  const [savingSalePrice, setSavingSalePrice] = useState(false);

  const isSold = item.status === "Sold";

  async function savePayout() {
    const amount = parseFloat(payoutInput) || 0;
    setSavingPayout(true);
    try {
      const paidAt = amount > 0 ? new Date().toISOString().slice(0, 10) : undefined;
      const res = await fetch("/api/sales/payout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, payoutPaidAmount: amount, payoutPaidAt: paidAt }),
      });
      if (res.ok) { onPayoutSaved(item.id, amount, paidAt); setEditingPayout(false); }
    } finally { setSavingPayout(false); }
  }

  async function saveSalePrice() {
    const price = parseFloat(salePriceInput) || 0;
    setSavingSalePrice(true);
    try {
      const res = await fetch("/api/sales/payout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, salePrice: price }),
      });
      if (res.ok) { onSalePriceSaved(item.id, price); setEditingSalePrice(false); }
    } finally { setSavingSalePrice(false); }
  }

  const previewSalePrice = editingSalePrice ? (parseFloat(salePriceInput) || 0) : (item.salePrice ?? 0);
  const previewCalcPayout: CalcPayout | null = calcPayout && previewSalePrice > 0
    ? { ...calcPayout, amount: previewSalePrice * (1 - calcPayout.rate / 100) }
    : calcPayout;
  const clientPayout = previewSalePrice > 0
    ? (previewCalcPayout ? previewCalcPayout.amount : (item.consignorPayout ?? 0))
    : null;

  const inlineInput = "w-20 border border-forest-400 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-forest-500";
  const confirmBtn = (onClick: () => void, saving: boolean) => (
    <button onClick={onClick} disabled={saving}
      className="text-[10px] bg-forest-600 text-white px-1.5 py-0.5 rounded hover:bg-forest-700 disabled:opacity-50">
      {saving ? "…" : "✓"}
    </button>
  );
  const cancelBtn = (onClick: () => void) => (
    <button onClick={onClick} className="text-[10px] text-gray-400 hover:text-gray-600">✕</button>
  );

  return (
    <tr className={cn("group border-b border-gray-50 last:border-0 transition-colors", isSold ? "bg-green-50/20 hover:bg-green-50/40" : "hover:bg-gray-50/60")}>
      {/* Thumbnail */}
      <td className="pl-3 py-2.5 w-10">
        <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
          {item.photoUrl ? (
            <Image src={item.photoUrl} alt={item.itemName} fill className="object-cover" sizes="36px" />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
      </td>
      {/* Name + category */}
      <td className="px-3 py-2.5 max-w-[220px]">
        <div className="font-medium text-gray-900 text-sm truncate">{item.itemName}</div>
        {item.category && <div className="text-[11px] text-gray-400 truncate">{item.category}</div>}
      </td>
      {/* Status */}
      <td className="px-2 py-2.5 whitespace-nowrap">
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", STATUS_COLORS[item.status])}>
          {item.status}
        </span>
      </td>
      {/* Value (appraisal estimate) */}
      <td className="px-2 py-2.5 text-right text-sm whitespace-nowrap tabular-nums">
        <span className="text-gray-600">{item.valueMid > 0 ? fmtCurrency(item.valueMid) : <span className="text-gray-300">—</span>}</span>
      </td>
      {/* Sale Price (editable) */}
      <td className="px-2 py-2.5 text-right whitespace-nowrap">
        {canEditPayout ? (
          editingSalePrice ? (
            <div className="flex items-center justify-end gap-1">
              <span className="text-xs text-gray-400">$</span>
              <input type="number" min="0" step="0.01" value={salePriceInput}
                onChange={e => setSalePriceInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveSalePrice(); if (e.key === "Escape") setEditingSalePrice(false); }}
                className={inlineInput} autoFocus />
              {confirmBtn(saveSalePrice, savingSalePrice)}
              {cancelBtn(() => setEditingSalePrice(false))}
            </div>
          ) : (
            <button onClick={() => { setEditingSalePrice(true); setSalePriceInput(String(item.salePrice ?? "")); }}
              className="text-sm font-medium text-gray-800 hover:underline tabular-nums">
              {item.salePrice ? fmtCurrency(item.salePrice) : <span className="text-gray-300 text-xs italic">Set</span>}
            </button>
          )
        ) : (
          <span className="text-sm text-gray-700 tabular-nums">{item.salePrice ? fmtCurrency(item.salePrice) : <span className="text-gray-300">—</span>}</span>
        )}
      </td>
      {/* Client Payout — hidden for NonTTT (sale price = full client earnings) */}
      {!isNonTTT && (
        <td className="px-2 py-2.5 text-right whitespace-nowrap">
          {clientPayout != null ? (
            <div>
              <span className="text-sm font-semibold text-green-700 tabular-nums">{fmtCurrency(clientPayout)}</span>
              {previewCalcPayout && previewCalcPayout.vendorName && <div className="text-[9px] text-gray-400">{previewCalcPayout.rate}% take</div>}
            </div>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
      )}
      {/* Paid to Client — hidden for NonTTT */}
      {!isNonTTT && (
        <td className="px-2 py-2.5 text-right whitespace-nowrap">
          {canEditPayout ? (
            editingPayout ? (
              <div className="flex items-center justify-end gap-1">
                <span className="text-xs text-gray-400">$</span>
                <input type="number" min="0" step="0.01" value={payoutInput}
                  onChange={e => setPayoutInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") savePayout(); if (e.key === "Escape") setEditingPayout(false); }}
                  className={inlineInput} autoFocus />
                {confirmBtn(savePayout, savingPayout)}
                {cancelBtn(() => setEditingPayout(false))}
              </div>
            ) : (
              <button onClick={() => { setEditingPayout(true); setPayoutInput(String(item.payoutPaidAmount ?? 0)); }}
                className="text-right hover:underline tabular-nums">
                <div className="text-sm font-semibold text-forest-700">
                  {item.payoutPaidAmount ? fmtCurrency(item.payoutPaidAmount) : "$0.00"}
                </div>
                {item.payoutPaidAt && (
                  <div className="text-[10px] text-green-600 font-normal">
                    Paid {new Date(item.payoutPaidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                )}
              </button>
            )
          ) : (
            <div className="text-right tabular-nums">
              <div className="text-sm font-semibold text-gray-700">
                {item.payoutPaidAmount ? fmtCurrency(item.payoutPaidAmount) : "$0.00"}
              </div>
              {item.payoutPaidAt && (
                <div className="text-[10px] text-green-600">
                  Paid {new Date(item.payoutPaidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              )}
            </div>
          )}
        </td>
      )}
      {/* Paid Date — hidden for NonTTT */}
      {!isNonTTT && (
        <td className="px-2 py-2.5 text-right hidden sm:table-cell whitespace-nowrap">
          {item.payoutPaidAt ? (
            <span className="text-xs text-green-700 font-medium">
              {new Date(item.payoutPaidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </td>
      )}
      {/* Edit */}
      <td className="pr-3 py-2.5 w-8">
        {canEdit && (
          <button onClick={() => onEdit(item)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
            title="Edit item">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── PF Table Row (table-based, with expandable Square sale events) ───────────

function PFTableRow({
  item,
  initialEvents,
  canEditPayout,
  canEdit,
  localVendors,
  onEdit,
  onEventUpdated,
}: {
  item: Item;
  initialEvents: ItemSaleEvent[];
  canEditPayout: boolean;
  canEdit: boolean;
  localVendors: LocalVendor[];
  onEdit: (item: Item) => void;
  onEventUpdated: (updated: ItemSaleEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<ItemSaleEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(initialEvents.length > 0);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isSold = item.status === "Sold";
  const qty = item.quantity ?? 0;
  const qtySold = (isSold && (item.quantitySold ?? 0) === 0 && qty > 0)
    ? qty
    : (item.quantitySold ?? 0);
  const qtyTotal = qty + (item.quantitySold ?? 0);

  async function loadEvents() {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/item-sale-events?itemId=${item.id}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
        setLoaded(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function togglePayout(event: ItemSaleEvent) {
    setTogglingId(event.id);
    try {
      const res = await fetch("/api/item-sale-events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, payoutPaid: !event.payoutPaid }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(prev => prev.map(e => e.id === event.id ? data.event : e));
        onEventUpdated(data.event);
      }
    } finally {
      setTogglingId(null);
    }
  }

  function handleToggle() {
    if (!expanded) loadEvents();
    setExpanded(v => !v);
  }

  const totalOwed = events.reduce((s, e) => s + (e.payoutPaid ? 0 : e.clientPayout), 0);
  const totalPaidAmt = events.reduce((s, e) => s + (e.payoutPaid ? e.clientPayout : 0), 0);

  return (
    <>
      <tr className={cn("group border-b border-gray-50 transition-colors", isSold ? "bg-green-50/20 hover:bg-green-50/40" : "hover:bg-gray-50/60", expanded && "border-b-0")}>
        {/* Thumbnail */}
        <td className="pl-3 py-2.5 w-10">
          <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
            {item.photoUrl ? (
              <Image src={item.photoUrl} alt={item.itemName} fill className="object-cover" sizes="36px" />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-200">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
        </td>
        {/* Name + category + barcode */}
        <td className="px-3 py-2.5 max-w-[200px]">
          <div className="font-medium text-gray-900 text-sm truncate">{item.itemName}</div>
          <div className="flex items-center gap-2">
            {item.category && <div className="text-[11px] text-gray-400 truncate">{item.category}</div>}
            {item.barcodeNumber && <span className="text-[10px] text-gray-300">#{item.barcodeNumber}</span>}
          </div>
        </td>
        {/* Status */}
        <td className="px-2 py-2.5 whitespace-nowrap">
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", STATUS_COLORS[item.status])}>
            {item.status}
          </span>
        </td>
        {/* Value */}
        <td className="px-2 py-2.5 text-right text-sm whitespace-nowrap tabular-nums">
          <span className="text-gray-600">{item.valueMid > 0 ? fmtCurrency(item.valueMid) : <span className="text-gray-300">—</span>}</span>
        </td>
        {/* Progress */}
        <td className="px-2 py-2.5 text-right whitespace-nowrap hidden sm:table-cell">
          {qtyTotal > 0 ? (
            <div>
              <div className="text-sm font-semibold text-gray-900 tabular-nums">{qtySold}/{qtyTotal}</div>
              <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden mt-1 ml-auto">
                <div
                  className={cn("h-full rounded-full", isSold ? "bg-green-400" : "bg-purple-400")}
                  style={{ width: `${Math.min(100, qtyTotal > 0 ? (qtySold / qtyTotal) * 100 : 0)}%` }}
                />
              </div>
            </div>
          ) : <span className="text-gray-300 text-sm">—</span>}
        </td>
        {/* Payout summary */}
        <td className="px-2 py-2.5 text-right whitespace-nowrap hidden sm:table-cell">
          {events.length > 0 ? (
            <div>
              {totalOwed > 0 && <div className="text-xs text-amber-600 font-semibold tabular-nums">{fmtCurrency(totalOwed)} owed</div>}
              {totalPaidAmt > 0 && <div className="text-xs text-green-700 font-semibold tabular-nums">{fmtCurrency(totalPaidAmt)} paid</div>}
            </div>
          ) : (() => {
            // No Square events — compute fallback payout for sold items
            if (!isSold) return item.clientSharePercent != null
              ? <span className="text-[10px] text-gray-400">{item.clientSharePercent}% share</span>
              : <span className="text-gray-300">—</span>;
            const calc = computeCalcPayout(item, localVendors);
            if (calc && calc.amount > 0) return (
              <div>
                <div className="text-xs text-amber-600 font-semibold tabular-nums">{fmtCurrency(calc.amount)} owed</div>
                <div className="text-[9px] text-gray-400">{calc.rate}% take</div>
              </div>
            );
            return <span className="text-gray-300">—</span>;
          })()}
        </td>
        {/* Actions */}
        <td className="pr-3 py-2.5 w-16">
          <div className="flex items-center gap-1 justify-end">
            {canEdit && (
              <button
                onClick={() => onEdit(item)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Edit item"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            <button
              onClick={handleToggle}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title={expanded ? "Hide sales" : "Show sales"}
            >
              <svg
                className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
      {/* Expanded sale events sub-row */}
      {expanded && (
        <tr className={cn(isSold ? "bg-green-50/10" : "bg-gray-50/30")}>
          <td colSpan={7} className="px-0 py-0 border-b border-gray-100">
            {loading ? (
              <div className="px-6 py-4 text-center text-xs text-gray-400">Loading sale events…</div>
            ) : events.length === 0 ? (
              <div className="px-6 py-4 text-center text-xs text-gray-400">No Square sales recorded yet</div>
            ) : (
              <>
                <div className="divide-y divide-gray-100">
                  {events.map(evt => (
                    <div key={evt.id} className="px-6 py-2.5 flex items-center gap-3">
                      <div className="text-[11px] text-gray-400 w-20 flex-shrink-0">
                        {new Date(evt.saleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-700">
                          <span className="font-medium">{evt.quantitySold} unit{evt.quantitySold !== 1 ? "s" : ""}</span>
                          {" @ "}
                          <span>{fmtCurrency(evt.unitPrice)}</span>
                          {" = "}
                          <span className="font-medium">{fmtCurrency(evt.totalAmount)}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Client payout: <span className="font-medium text-green-700">{fmtCurrency(evt.clientPayout)}</span>
                          {evt.payoutPaidAt && (
                            <span className="ml-2 text-gray-300">paid {new Date(evt.payoutPaidAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      {canEditPayout ? (
                        <button
                          onClick={() => togglePayout(evt)}
                          disabled={togglingId === evt.id}
                          className={cn(
                            "text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors",
                            evt.payoutPaid
                              ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                              : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100",
                            togglingId === evt.id && "opacity-50 cursor-wait"
                          )}
                        >
                          {togglingId === evt.id ? "\u2026" : evt.payoutPaid ? "Paid" : "Unpaid"}
                        </button>
                      ) : (
                        <span className={cn(
                          "text-[10px] font-semibold px-2 py-1 rounded-full border",
                          evt.payoutPaid
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "bg-amber-50 border-amber-200 text-amber-700"
                        )}>
                          {evt.payoutPaid ? "Paid" : "Unpaid"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-6 py-2.5 border-t border-gray-100 flex gap-6 text-xs bg-white/60">
                  <div>
                    <span className="text-gray-400">Total owed: </span>
                    <span className="font-semibold text-amber-700">{fmtCurrency(totalOwed)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Total paid: </span>
                    <span className="font-semibold text-green-700">{fmtCurrency(totalPaidAmt)}</span>
                  </div>
                </div>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function PFSalesSection({
  items,
  allEvents,
  canEditPayout,
  canEdit,
  localVendors,
  onEdit,
  onEventUpdated,
}: {
  items: Item[];
  allEvents: ItemSaleEvent[];
  canEditPayout: boolean;
  canEdit: boolean;
  localVendors: LocalVendor[];
  onEdit: (item: Item) => void;
  onEventUpdated: (updated: ItemSaleEvent) => void;
}) {
  type SortCol = "name" | "value" | "status" | "qty";
  const [open, setOpen] = useState(true);
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "name", dir: "asc" });
  const [filterStatus, setFilterStatus] = useState("");

  if (items.length === 0) return null;

  const totalQty = items.reduce((s, i) => s + ((i.quantity ?? 0) + (i.quantitySold ?? 0)), 0);
  const totalSold = items.reduce((s, i) => s + (i.quantitySold ?? 0), 0);
  const statuses = [...new Set(items.map(i => i.status))].sort();
  const hasPartial = items.some(i => (i.quantitySold ?? 0) > 0 && i.status !== "Sold");

  const filtered = !filterStatus ? items : items.filter(i => {
    if (filterStatus === "Sold") return i.status === "Sold" || (i.quantitySold ?? 0) > 0;
    if (filterStatus === "__partial__") return (i.quantitySold ?? 0) > 0 && i.status !== "Sold";
    return i.status === filterStatus;
  });

  const getQtySold = (i: Item) => {
    const qty = i.quantity ?? 0;
    const sold = i.quantitySold ?? 0;
    return (i.status === "Sold" && sold === 0 && qty > 0) ? qty : sold;
  };

  const sorted = [...filtered].sort((a, b) => {
    const d = sort.dir === "asc" ? 1 : -1;
    switch (sort.col) {
      case "name": return d * a.itemName.localeCompare(b.itemName);
      case "value": return d * ((a.valueMid ?? 0) - (b.valueMid ?? 0));
      case "status": return d * a.status.localeCompare(b.status);
      case "qty": return d * (getQtySold(a) - getQtySold(b));
      default: return 0;
    }
  });

  function toggleSort(col: SortCol) {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  }

  function ThBtn({ col, label, right }: { col: SortCol; label: string; right?: boolean }) {
    const active = sort.col === col;
    return (
      <button onClick={() => toggleSort(col)}
        className={cn("flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
          active ? "text-forest-700" : "text-gray-400 hover:text-gray-600",
          right && "ml-auto")}>
        {label}
        <span className="text-[9px]">{active ? (sort.dir === "asc" ? "\u25b2" : "\u25bc") : "\u21c5"}</span>
      </button>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 hover:opacity-75 transition-opacity"
        >
          <h2 className="text-base font-semibold text-gray-900">ProFoundFinds Consignment</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{items.length}</span>
          {totalQty > 0 && (
            <span className="text-xs text-gray-400">{totalSold} of {totalQty} sold</span>
          )}
          <svg
            className={cn("w-4 h-4 text-gray-400 transition-transform duration-200", !open && "-rotate-90")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (statuses.length > 1 || hasPartial) && (
          <div className="flex gap-1.5 ml-1 flex-wrap">
            <button onClick={() => setFilterStatus("")}
              className={cn("text-xs px-2.5 py-0.5 rounded-full border transition-colors",
                filterStatus === "" ? "border-forest-500 bg-forest-50 text-forest-700" : "border-gray-200 text-gray-500 hover:border-gray-300")}>
              All
            </button>
            {statuses.map(s => (
              <button key={s} onClick={() => setFilterStatus(s === filterStatus ? "" : s)}
                className={cn("text-xs px-2.5 py-0.5 rounded-full border transition-colors",
                  filterStatus === s ? "border-forest-500 bg-forest-50 text-forest-700" : "border-gray-200 text-gray-500 hover:border-gray-300")}>
                {s}
              </button>
            ))}
            {hasPartial && (
              <button onClick={() => setFilterStatus(filterStatus === "__partial__" ? "" : "__partial__")}
                className={cn("text-xs px-2.5 py-0.5 rounded-full border transition-colors",
                  filterStatus === "__partial__" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-500 hover:border-gray-300")}>
                Partially Sold
              </button>
            )}
          </div>
        )}
      </div>
      {open && (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="pl-3 py-2.5 w-10" />
                <th className="px-3 py-2.5 text-left"><ThBtn col="name" label="Item" /></th>
                <th className="px-2 py-2.5 text-left"><ThBtn col="status" label="Status" /></th>
                <th className="px-2 py-2.5 text-right"><ThBtn col="value" label="Value" right /></th>
                <th className="px-2 py-2.5 text-right hidden sm:table-cell"><ThBtn col="qty" label="Progress" right /></th>
                <th className="px-2 py-2.5 text-right hidden sm:table-cell">
                  <span className="flex items-center justify-end text-[11px] font-semibold uppercase tracking-wide text-gray-400">Payout</span>
                </th>
                <th className="pr-3 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(item => (
                <PFTableRow
                  key={item.id}
                  item={item}
                  initialEvents={allEvents.filter(e => e.itemId === item.id)}
                  canEditPayout={canEditPayout}
                  canEdit={canEdit}
                  localVendors={localVendors}
                  onEdit={onEdit}
                  onEventUpdated={onEventUpdated}
                />
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">No items match this filter</div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Sales Table (FB, Online, Other Consignment) ──────────────────────────────

function SalesTable({
  title,
  items,
  canEditPayout,
  canEdit,
  calcPayouts,
  onPayoutSaved,
  onSalePriceSaved,
  onEdit,
  isNonTTT = false,
}: {
  title: string;
  items: Item[];
  canEditPayout: boolean;
  canEdit: boolean;
  calcPayouts: Map<string, CalcPayout>;
  onPayoutSaved: (id: string, amount: number, paidAt?: string) => void;
  onSalePriceSaved: (id: string, price: number) => void;
  onEdit: (item: Item) => void;
  isNonTTT?: boolean;
}) {
  type SortCol = "name" | "category" | "status" | "value" | "salePrice" | "payout" | "paid" | "paidDate";
  const [open, setOpen] = useState(true);
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "name", dir: "asc" });
  const [filterStatus, setFilterStatus] = useState("");

  if (items.length === 0) return null;

  const statuses = [...new Set(items.map(i => i.status))].sort();
  const filtered = filterStatus ? items.filter(i => i.status === filterStatus) : items;

  const getClientPayout = (item: Item) => {
    const calc = calcPayouts.get(item.id);
    const sp = item.salePrice ?? 0;
    if (sp > 0 && calc) return sp * (1 - calc.rate / 100);
    if (sp > 0) return item.consignorPayout ?? 0;
    return 0;
  };

  const sorted = [...filtered].sort((a, b) => {
    const d = sort.dir === "asc" ? 1 : -1;
    switch (sort.col) {
      case "name": return d * a.itemName.localeCompare(b.itemName);
      case "category": return d * (a.category ?? "").localeCompare(b.category ?? "");
      case "status": return d * a.status.localeCompare(b.status);
      case "value": return d * ((a.valueMid ?? 0) - (b.valueMid ?? 0));
      case "salePrice": return d * ((a.salePrice ?? 0) - (b.salePrice ?? 0));
      case "payout": return d * (getClientPayout(a) - getClientPayout(b));
      case "paid": return d * ((a.payoutPaidAmount ?? 0) - (b.payoutPaidAmount ?? 0));
      case "paidDate": return d * (a.payoutPaidAt ?? "").localeCompare(b.payoutPaidAt ?? "");
      default: return 0;
    }
  });

  function toggleSort(col: SortCol) {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  }

  function ThBtn({ col, label, right }: { col: SortCol; label: string; right?: boolean }) {
    const active = sort.col === col;
    return (
      <button onClick={() => toggleSort(col)}
        className={cn("flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
          active ? "text-forest-700" : "text-gray-400 hover:text-gray-600",
          right && "ml-auto")}>
        {label}
        <span className="text-[9px]">{active ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
      </button>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {title && (
          <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 hover:opacity-75 transition-opacity">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{items.length}</span>
            <svg
              className={cn("w-4 h-4 text-gray-400 transition-transform duration-200", !open && "-rotate-90")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        {open && statuses.length > 1 && (
          <div className="flex gap-1.5 ml-1">
            <button onClick={() => setFilterStatus("")}
              className={cn("text-xs px-2.5 py-0.5 rounded-full border transition-colors",
                filterStatus === "" ? "border-forest-500 bg-forest-50 text-forest-700" : "border-gray-200 text-gray-500 hover:border-gray-300")}>
              All
            </button>
            {statuses.map(s => (
              <button key={s} onClick={() => setFilterStatus(s === filterStatus ? "" : s)}
                className={cn("text-xs px-2.5 py-0.5 rounded-full border transition-colors",
                  filterStatus === s ? "border-forest-500 bg-forest-50 text-forest-700" : "border-gray-200 text-gray-500 hover:border-gray-300")}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {open && (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="pl-3 py-2.5 w-10" />
                <th className="px-3 py-2.5 text-left"><ThBtn col="name" label="Item" /></th>
                <th className="px-2 py-2.5 text-left"><ThBtn col="status" label="Status" /></th>
                <th className="px-2 py-2.5 text-right"><ThBtn col="value" label="Value" right /></th>
                <th className="px-2 py-2.5 text-right"><ThBtn col="salePrice" label="Sale Price" right /></th>
                {!isNonTTT && <th className="px-2 py-2.5 text-right"><ThBtn col="payout" label="Client Payout" right /></th>}
                {!isNonTTT && <th className="px-2 py-2.5 text-right"><ThBtn col="paid" label="Paid" right /></th>}
                {!isNonTTT && <th className="px-2 py-2.5 text-right hidden sm:table-cell"><ThBtn col="paidDate" label="Paid Date" right /></th>}
                <th className="pr-3 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(item => (
                <SalesTableRow
                  key={item.id}
                  item={item}
                  canEditPayout={canEditPayout}
                  canEdit={canEdit}
                  calcPayout={calcPayouts.get(item.id) ?? null}
                  onPayoutSaved={onPayoutSaved}
                  onSalePriceSaved={onSalePriceSaved}
                  onEdit={onEdit}
                  isNonTTT={isNonTTT}
                />
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">No items match this filter</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Proof of Payment ─────────────────────────────────────────────────────────

function ProofOfPaymentSection({
  tenantId,
  tenantName,
  files,
  canDeleteProof,
  onFilesChange,
  items,
  pfSaleEvents,
  localVendors,
}: {
  tenantId: string;
  tenantName: string;
  files: ProjectFile[];
  canDeleteProof: boolean;
  onFilesChange: (files: ProjectFile[]) => void;
  items: Item[];
  pfSaleEvents: ItemSaleEvent[];
  localVendors: LocalVendor[];
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleViewPdf(e: React.MouseEvent) {
    e.preventDefault();
    const { buildPaidLineItems } = await import("./PayoutModal");
    const lineItems = buildPaidLineItems(items, pfSaleEvents);
    if (lineItems.length === 0) { alert("No paid items found."); return; }
    const res = await fetch("/api/sales/payout-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, clientName: tenantName, companyName: "Top Tier Transitions", items: lineItems, sendEmail: false, viewOnly: true }),
    });
    if (!res.ok) { alert("Failed to generate PDF."); return; }
    const data = await res.json();
    if (data.pdfBase64) {
      const bytes = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tenantId", tenantId);
      fd.append("tag", "Payment Proof");
      const res = await fetch("/api/files", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onFilesChange([...files, data.file]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(file: ProjectFile) {
    if (!confirm("Remove this proof of payment?")) return;
    const params = new URLSearchParams({
      id: file.id,
      publicId: file.cloudinaryPublicId,
      resourceType: file.resourceType,
      tenantId,
      tag: "Payment Proof",
    });
    const res = await fetch(`/api/files?${params}`, { method: "DELETE" });
    if (res.ok) onFilesChange(files.filter(f => f.id !== file.id));
    else setError("Delete failed — TTT Manager permission required");
  }

  return (
    <div className="mt-10 pt-8 border-t border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Proof of Payment</h2>
          <p className="text-xs text-gray-500 mt-0.5">Upload receipts or screenshots of payments made to the client.</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".heic,.heif,image/*,.pdf" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="h-9 px-4 bg-forest-600 text-white text-sm rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
          >
            {uploading ? "Uploading…" : "+ Add Proof"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {files.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-xl">
          No proof of payment uploaded yet
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {files.map(f => (
            <div key={f.id} className="group relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
              {f.resourceType === "image" ? (
                <a href={f.cloudinaryUrl} target="_blank" rel="noopener noreferrer">
                  <div className="relative h-28">
                    <Image src={f.cloudinaryUrl} alt={f.fileName} fill className="object-cover" sizes="150px" />
                  </div>
                </a>
              ) : (
                <a
                  href="#"
                  onClick={handleViewPdf}
                  className="flex flex-col items-center justify-center h-28 gap-1 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-[10px] truncate w-full text-center px-1">{f.fileName}</span>
                </a>
              )}
              <div className="px-2 py-1">
                <p className="text-[10px] text-gray-500 truncate">{f.fileName}</p>
              </div>
              {canDeleteProof && (
                <button
                  onClick={() => handleDelete(f)}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full text-[10px] hidden group-hover:flex items-center justify-center hover:bg-red-700"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SalesClient({
  tenantId,
  tenantName,
  ownerEmail,
  items: initialItems,
  vendors,
  rooms,
  localVendors,
  paymentProofFiles,
  pfSaleEvents: initialPfSaleEvents,
  canEdit,
  canEditPayout,
  canPayoutClient,
  canDeleteProof,
  canReassign,
  allTenants,
  paymentHandles,
  initialPayoutMethod,
  initialPayoutUsername,
  initialPayoutCheckAddress,
  projectAddress,
  isTTT = true,
  canEditExpense = false,
  initialConsignmentExpense = 0,
  initialConsignmentExpenseNote = "",
  staffMembers = [],
  isTTTUser = false,
  estates = [],
}: SalesClientProps) {
  const isNonTTT = !isTTT;

  const [items, setItems] = useState(initialItems);
  const [pfSaleEvents, setPfSaleEvents] = useState(initialPfSaleEvents);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [proofFiles, setProofFiles] = useState<ProjectFile[]>(paymentProofFiles);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [openOther, setOpenOther] = useState(true);
  const [openEstate, setOpenEstate] = useState(true);

  // Consignment expense state
  const [expense, setExpense] = useState(initialConsignmentExpense);
  const [expenseNote, setExpenseNote] = useState(initialConsignmentExpenseNote);
  const [editingExpense, setEditingExpense] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState(String(initialConsignmentExpense || ""));
  const [expenseNoteDraft, setExpenseNoteDraft] = useState(initialConsignmentExpenseNote);
  const [savingExpense, setSavingExpense] = useState(false);

  // Payout preference state
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod | "">(initialPayoutMethod ?? "");
  const [payoutUsername, setPayoutUsername] = useState(initialPayoutUsername ?? "");
  const [payoutCheckAddress, setPayoutCheckAddress] = useState(initialPayoutCheckAddress || projectAddress || "");
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutSaved, setPayoutSaved] = useState(false);

  async function savePayoutPreference() {
    setSavingPayout(true);
    setPayoutSaved(false);
    try {
      await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          payoutMethod: payoutMethod || null,
          payoutUsername: payoutUsername.trim() || null,
          payoutCheckAddress: payoutMethod === "Check" ? (payoutCheckAddress.trim() || null) : undefined,
        }),
      });
      setPayoutSaved(true);
      setTimeout(() => setPayoutSaved(false), 2000);
    } finally {
      setSavingPayout(false);
    }
  }

  function handlePayoutSaved(itemId: string, amount: number, paidAt?: string) {
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, payoutPaidAmount: amount, payoutPaidAt: amount > 0 ? (paidAt ?? i.payoutPaidAt) : undefined } : i
    ));
  }

  async function saveExpense() {
    const amount = parseFloat(expenseDraft) || 0;
    setSavingExpense(true);
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, consignmentExpense: amount, consignmentExpenseNote: expenseNoteDraft }),
      });
      if (res.ok) {
        setExpense(amount);
        setExpenseNote(expenseNoteDraft);
        setEditingExpense(false);
      }
    } finally {
      setSavingExpense(false);
    }
  }

  function handleSalePriceSaved(itemId: string, price: number) {
    // Also update valueMid so Target Value reflects the new sale price immediately
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, salePrice: price, valueMid: price } : i));
  }

  function handleItemSaved(updatedItem: Item) {
    setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
    setEditingItem(null);
  }

  function handleItemDeleted() {
    if (editingItem) {
      setItems(prev => prev.filter(i => i.id !== editingItem.id));
      setEditingItem(null);
    }
  }

  // LocalVendor lookup map (by ID)
  const localVendorMap = new Map(localVendors.map(v => [v.id, v]));

  // Pre-compute local vendor calc payouts for all items
  const calcPayouts = new Map<string, CalcPayout>();
  for (const item of items) {
    const calc = computeCalcPayout(item, localVendors);
    if (calc) calcPayouts.set(item.id, calc);
  }

  // Global search filter
  const allItemNames = [...new Set(items.map(i => i.itemName))].sort();
  const searchNorm = globalSearch.toLowerCase().trim();
  const matchesSearch = (i: Item) => !searchNorm || i.itemName.toLowerCase().includes(searchNorm);

  // Split by route (with search filter applied)
  const profound = items.filter(i => i.primaryRoute === "ProFoundFinds Consignment" && matchesSearch(i));
  const fb = items.filter(i => i.primaryRoute === "FB/Marketplace" && matchesSearch(i));
  const online = items.filter(i => i.primaryRoute === "Online Marketplace" && matchesSearch(i));
  const other = items.filter(i => i.primaryRoute === "Other Consignment" && matchesSearch(i));
  const estateSaleItems = items.filter(i => i.primaryRoute === "Estate Sale" && matchesSearch(i));

  // Estate lookup map: estateSaleId → estate name
  const estateNameMap = new Map(estates.map(e => [e.id, e.name]));

  // Group estate items by estate sale
  const estateItemsByEstate = new Map<string, { name: string; items: Item[] }>();
  for (const item of estateSaleItems) {
    const key = item.estateSaleId ?? "__unassigned__";
    const name = item.estateSaleId ? (estateNameMap.get(item.estateSaleId) ?? "Estate Sale") : "Unassigned";
    const entry = estateItemsByEstate.get(key) ?? { name, items: [] };
    entry.items.push(item);
    estateItemsByEstate.set(key, entry);
  }

  // Group "Other Consignment" by vendor — assignedVendorId is a LocalVendor ID
  const otherByVendor = new Map<string, Item[]>();
  for (const item of other) {
    const key = item.assignedVendorId
      ? (localVendorMap.get(item.assignedVendorId)?.vendorName ?? `Vendor ${item.assignedVendorId}`)
      : "Unassigned";
    const list = otherByVendor.get(key) ?? [];
    list.push(item);
    otherByVendor.set(key, list);
  }

  // Summary totals
  const pfItemIds = new Set(profound.map(i => i.id));

  // Only count PF events for items that actually exist in the ProFoundFinds route.
  // This excludes orphaned events (items deleted from catalog) and prevents double-counting
  // events for items whose route was later changed to FB/Marketplace etc.
  const validPfEvents = pfSaleEvents.filter(e => pfItemIds.has(e.itemId));

  // Items that have Square sale events
  const pfItemsWithEvents = new Set(validPfEvents.map(e => e.itemId));

  // PF: Square sales → use event clientPayout (most accurate)
  const pfEventTotalEarned = validPfEvents.reduce((s, e) => s + (e.clientPayout ?? 0), 0);
  const pfEventTotalPaid = validPfEvents.filter(e => e.payoutPaid).reduce((s, e) => s + (e.clientPayout ?? 0), 0);

  // PF: manually marked Sold (no Square events) → calculate from item price × share %
  const pfManualSoldItems = profound.filter(i => i.status === "Sold" && !pfItemsWithEvents.has(i.id));
  const pfManualTotalEarned = pfManualSoldItems.reduce((s, i) => {
    if (i.consignorPayout) return s + i.consignorPayout;
    if (i.valueMid && i.clientSharePercent) return s + (i.valueMid * (i.clientSharePercent / 100));
    return s;
  }, 0);
  const pfManualTotalPaid = pfManualSoldItems.reduce((s, i) => s + (i.payoutPaidAmount ?? 0), 0);

  const pfTotalEarned = pfEventTotalEarned + pfManualTotalEarned;
  const pfTotalPaid = pfEventTotalPaid + pfManualTotalPaid;

  // Non-PF: only count actual consignment routes — not Donate/Trash/Keep/Family/etc.
  const CONSIGNMENT_ROUTES = new Set(["FB/Marketplace", "Online Marketplace", "Other Consignment"]);
  const nonPfSoldItems = items.filter(i => i.status === "Sold" && CONSIGNMENT_ROUTES.has(i.primaryRoute));
  const nonPfTotalEarned = nonPfSoldItems.reduce((s, i) => {
    const calc = calcPayouts.get(i.id);
    return s + (calc ? calc.amount : (i.consignorPayout ?? 0));
  }, 0);
  const nonPfTotalPaid = items
    .filter(i => CONSIGNMENT_ROUTES.has(i.primaryRoute))
    .reduce((s, i) => s + (i.payoutPaidAmount ?? 0), 0);

  // Estate Sales totals
  const estateSoldItems = estateSaleItems.filter(i => i.status === "Sold");
  const estateTotalEarned = estateSoldItems.reduce((s, i) => {
    const calc = calcPayouts.get(i.id);
    return s + (calc ? calc.amount : (i.consignorPayout ?? 0));
  }, 0);
  const estateTotalPaid = estateSaleItems.reduce((s, i) => s + (i.payoutPaidAmount ?? 0), 0);

  const totalEarned = pfTotalEarned + nonPfTotalEarned + estateTotalEarned;
  const totalPaid = pfTotalPaid + nonPfTotalPaid + estateTotalPaid;
  const totalOwed = Math.max(0, totalEarned - totalPaid - expense);

  // ── Per-route breakdown for expandable cards ──────────────────────────────
  const fbEarned = fb.filter(i => i.status === "Sold").reduce((s, i) => {
    const calc = calcPayouts.get(i.id);
    return s + (calc ? calc.amount : (i.consignorPayout ?? 0));
  }, 0);
  const fbPaid = fb.reduce((s, i) => s + (i.payoutPaidAmount ?? 0), 0);

  const onlineEarned = online.filter(i => i.status === "Sold").reduce((s, i) => {
    const calc = calcPayouts.get(i.id);
    return s + (calc ? calc.amount : (i.consignorPayout ?? 0));
  }, 0);
  const onlinePaid = online.reduce((s, i) => s + (i.payoutPaidAmount ?? 0), 0);

  const otherVendorBreakdown = [...otherByVendor.entries()].map(([vendorName, vItems]) => ({
    label: `Other Consignment Store — ${vendorName}`,
    earned: vItems.filter(i => i.status === "Sold").reduce((s, i) => {
      const calc = calcPayouts.get(i.id);
      return s + (calc ? calc.amount : (i.consignorPayout ?? 0));
    }, 0),
    paid: vItems.reduce((s, i) => s + (i.payoutPaidAmount ?? 0), 0),
  }));

  const allBreakdownRows = [
    { label: "ProFoundFinds", earned: pfTotalEarned, paid: pfTotalPaid },
    { label: "FB/Marketplace", earned: fbEarned, paid: fbPaid },
    { label: "eBay", earned: onlineEarned, paid: onlinePaid },
    ...otherVendorBreakdown,
    ...(estateTotalEarned > 0 || estateTotalPaid > 0
      ? [{ label: "Estate Sales", earned: estateTotalEarned, paid: estateTotalPaid }]
      : []),
  ];

  // Total inventory value: valueMid × clientSharePercent for all consignment items
  const totalInventoryValue = items
    .filter(i => ["ProFoundFinds Consignment", "FB/Marketplace", "Online Marketplace", "Other Consignment", "Estate Sale"].includes(i.primaryRoute))
    .reduce((s, i) => (i.valueMid && i.clientSharePercent ? s + i.valueMid * i.clientSharePercent / 100 : s), 0);

  // NonTTT: no take rate — full valueMid and full salePrice go to client
  const nonTTTInventoryValue = items.reduce((s, i) => s + (i.valueMid ?? 0), 0);
  const nonTTTEarned = items.filter(i => i.status === "Sold").reduce((s, i) => s + (i.salePrice ?? 0), 0);

  const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const expandableCard = (
    idx: number,
    label: string,
    value: number,
    color: string,
    getAmount: (row: typeof allBreakdownRows[0]) => number
  ) => {
    const isOpen = expandedCard === idx;
    const rows = allBreakdownRows.filter(r => getAmount(r) > 0);
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cn("text-xl font-bold tabular-nums", color)}>{fmt(value)}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
          {rows.length > 0 && (
            <button
              onClick={() => setExpandedCard(isOpen ? null : idx)}
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all mt-0.5"
              title={isOpen ? "Hide breakdown" : "Show breakdown"}
            >
              <svg
                className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen && "rotate-180")}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
        {isOpen && rows.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500 truncate">{row.label}</span>
                <span className={cn("text-xs font-semibold tabular-nums flex-shrink-0", color)}>
                  {fmt(getAmount(row))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const hasPaymentHandles = paymentHandles && (
    paymentHandles.venmoHandle || paymentHandles.venmoQrUrl ||
    paymentHandles.zelleHandle || paymentHandles.zelleQrUrl
  );

  return (
    <div>
      {/* Payment handles — visible to TTT staff only */}
      {hasPaymentHandles && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          {(paymentHandles!.zelleHandle || paymentHandles!.zelleQrUrl) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex flex-col items-center gap-2">
              <span className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">Zelle</span>
              {paymentHandles!.zelleQrUrl && (
                <div className="relative w-28 h-28 rounded-lg overflow-hidden bg-white border border-yellow-100">
                  <Image src={paymentHandles!.zelleQrUrl} alt="Zelle QR" fill className="object-contain p-1" />
                </div>
              )}
              {paymentHandles!.zelleHandle && (
                <span className="text-sm font-medium text-yellow-800">{paymentHandles!.zelleHandle}</span>
              )}
            </div>
          )}
          {(paymentHandles!.venmoHandle || paymentHandles!.venmoQrUrl) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-col items-center gap-2">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Venmo</span>
              {paymentHandles!.venmoQrUrl && (
                <div className="relative w-28 h-28 rounded-lg overflow-hidden bg-white border border-blue-100">
                  <Image src={paymentHandles!.venmoQrUrl} alt="Venmo QR" fill className="object-contain p-1" />
                </div>
              )}
              {paymentHandles!.venmoHandle && (
                <span className="text-sm font-medium text-blue-800">{paymentHandles!.venmoHandle}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Item Sales</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tenantName} — consignment & marketplace tracking</p>
        </div>
        {canPayoutClient && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReprintModal(true)}
              className="h-9 px-4 border border-green-600 text-green-700 text-sm font-medium rounded-lg hover:bg-green-50 transition-colors"
            >
              Re-print Payout
            </button>
            <button
              onClick={() => setShowPayoutModal(true)}
              className="h-9 px-4 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              Payout Client
            </button>
          </div>
        )}
      </div>

      {/* Summary — NonTTT: 2 boxes only (no take rate, sale price = full earnings) */}
      {isNonTTT ? (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="text-xl font-bold tabular-nums text-gray-700">{fmt(nonTTTInventoryValue)}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total value of inventory</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <div className="text-xl font-bold tabular-nums text-green-700">{fmt(nonTTTEarned)}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total client earnings (sold)</div>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {/* Inventory value — static card, no caret */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xl font-bold tabular-nums text-gray-700">{fmt(totalInventoryValue)}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total value of inventory</div>
        </div>

        {expandableCard(0, "Total client earnings (sold)", totalEarned, "text-green-700", r => r.earned)}

        {/* Expenses from Consignment */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          {editingExpense ? (
            <div>
              <div className="mb-2">
                <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Amount ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={expenseDraft}
                  onChange={(e) => setExpenseDraft(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div className="mb-3">
                <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Note</label>
                <input
                  type="text"
                  value={expenseNoteDraft}
                  onChange={(e) => setExpenseNoteDraft(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
                  placeholder="e.g. Delivery fees"
                  onKeyDown={(e) => { if (e.key === "Enter") saveExpense(); if (e.key === "Escape") setEditingExpense(false); }}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={saveExpense} disabled={savingExpense}
                  className="flex-1 text-xs bg-forest-600 hover:bg-forest-700 text-white rounded px-2 py-1 disabled:opacity-50">
                  {savingExpense ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setEditingExpense(false); setExpenseDraft(String(expense || "")); setExpenseNoteDraft(expenseNote); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className={cn("text-xl font-bold tabular-nums", expense > 0 ? "text-red-600" : "text-gray-400")}>
                  {expense > 0 ? fmt(expense) : "—"}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Expenses from Consignment</div>
                {expenseNote && <div className="text-xs text-gray-400 mt-1 italic truncate">{expenseNote}</div>}
              </div>
              {canEditExpense && (
                <button
                  onClick={() => { setExpenseDraft(String(expense || "")); setExpenseNoteDraft(expenseNote); setEditingExpense(true); }}
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all mt-0.5"
                  title="Edit expense"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {expandableCard(1, "Total paid to client", totalPaid, "text-blue-700", r => r.paid)}
        {expandableCard(2, "Still owed to client", totalOwed, totalOwed > 0 ? "text-amber-600" : "text-gray-400", r => Math.max(0, r.earned - r.paid - expense))}
      </div>
      )} {/* end NonTTT conditional */}

      {/* Global item search */}
      {items.length > 0 && (
        <div className="mb-6">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              placeholder="Search items across all sections…"
              list="sales-item-names"
              className="w-full pl-9 pr-9 h-10 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-forest-500 placeholder:text-gray-400"
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <datalist id="sales-item-names">
            {allItemNames.map(name => <option key={name} value={name} />)}
          </datalist>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-10">
        {!isNonTTT && (
          <PFSalesSection
            items={profound}
            allEvents={pfSaleEvents}
            canEditPayout={canEditPayout}
            canEdit={canEdit}
            localVendors={localVendors}
            onEdit={setEditingItem}
            onEventUpdated={(updated) => setPfSaleEvents(prev => prev.map(e => e.id === updated.id ? updated : e))}
          />
        )}
        <SalesTable
          title="FB / Marketplace"
          items={fb}
          canEditPayout={canEditPayout}
          canEdit={canEdit}
          calcPayouts={calcPayouts}
          onPayoutSaved={handlePayoutSaved}
          onSalePriceSaved={handleSalePriceSaved}
          onEdit={setEditingItem}
          isNonTTT={isNonTTT}
        />
        <SalesTable
          title="eBay"
          items={online}
          canEditPayout={canEditPayout}
          canEdit={canEdit}
          calcPayouts={calcPayouts}
          onPayoutSaved={handlePayoutSaved}
          onSalePriceSaved={handleSalePriceSaved}
          onEdit={setEditingItem}
          isNonTTT={isNonTTT}
        />

        {/* Other Consignment — grouped by vendor, each as a table */}
        {other.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button onClick={() => setOpenOther(v => !v)} className="flex items-center gap-2 hover:opacity-75 transition-opacity">
                <h2 className="text-base font-semibold text-gray-900">Other Consignment Store</h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{other.length}</span>
                <svg
                  className={cn("w-4 h-4 text-gray-400 transition-transform duration-200", !openOther && "-rotate-90")}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {openOther && !isTTT && (
              <p className="text-xs text-gray-500 mb-4">
                Client share on Other Consignment Store is set to 50% for self-managed projects.
                This rate may be adjusted if your project transitions to a full TTT service agreement.
              </p>
            )}
            {openOther && (
              <div className="space-y-6 mt-3">
                {[...otherByVendor.entries()].map(([vendorName, vendorItems]) => (
                  <div key={vendorName}>
                    <div className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
                      {vendorName}
                    </div>
                    <SalesTable
                      title=""
                      items={vendorItems}
                      canEditPayout={canEditPayout}
                      canEdit={canEdit}
                      calcPayouts={calcPayouts}
                      onPayoutSaved={handlePayoutSaved}
                      onSalePriceSaved={handleSalePriceSaved}
                      onEdit={setEditingItem}
                      isNonTTT={isNonTTT}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Estate Sales — grouped by estate */}
        {estateSaleItems.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button onClick={() => setOpenEstate(v => !v)} className="flex items-center gap-2 hover:opacity-75 transition-opacity">
                <h2 className="text-base font-semibold text-gray-900">Estate Sales</h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{estateSaleItems.length}</span>
                <svg
                  className={cn("w-4 h-4 text-gray-400 transition-transform duration-200", !openEstate && "-rotate-90")}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {openEstate && (
              <div className="space-y-6 mt-3">
                {[...estateItemsByEstate.entries()].map(([estateId, { name, items: estateItems }]) => (
                  <div key={estateId}>
                    <div className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                      {name}
                    </div>
                    <SalesTable
                      title=""
                      items={estateItems}
                      canEditPayout={canEditPayout}
                      canEdit={canEdit}
                      calcPayouts={calcPayouts}
                      onPayoutSaved={handlePayoutSaved}
                      onSalePriceSaved={handleSalePriceSaved}
                      onEdit={setEditingItem}
                      isNonTTT={isNonTTT}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {items.length === 0 && (
          <p className="text-center text-gray-400 py-16">No consignment or marketplace items yet</p>
        )}
      </div>

      {/* Client Preferred Payout — hidden for NonTTT (replaced with CTA) */}
      {isNonTTT ? (
        <div className="mt-10 pt-8 border-t border-gray-200">
          <div className="rounded-2xl border border-forest-200 bg-forest-50 px-6 py-8 text-center">
            <p className="text-sm font-medium text-gray-700 mb-1">Ready to get paid?</p>
            <p className="text-sm text-gray-500 mb-4">Our team can help coordinate the sale, payout, and everything in between.</p>
            <a
              href={`mailto:info@toptiertransitions.com?subject=Professional Support Request${tenantName ? ` – ${tenantName}` : ""}&body=Hi Top Tier Transitions team,%0A%0AI'm interested in getting professional support for my project${tenantName ? ` (${tenantName})` : ""}.%0A%0APlease reach out to discuss how you can help!`}
              className="inline-flex items-center gap-2 rounded-xl bg-forest-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-forest-700 transition-colors"
            >
              Get Professional Support
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-10 pt-8 border-t border-gray-200">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-gray-900">Client Preferred Payout</h2>
            <p className="text-xs text-gray-500 mt-0.5">How would you like to receive your payout?</p>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Method</label>
              <select
                value={payoutMethod}
                onChange={e => setPayoutMethod(e.target.value as PayoutMethod | "")}
                className="h-10 px-3 rounded-xl border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-forest-500 min-w-[140px]"
              >
                <option value="">— Select —</option>
                <option value="Zelle">Zelle</option>
                <option value="Venmo">Venmo</option>
                <option value="Check">Check</option>
                <option value="Other">Other</option>
              </select>
            </div>
            {(payoutMethod === "Zelle" || payoutMethod === "Venmo") && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  {payoutMethod} Username / Phone
                </label>
                <input
                  type="text"
                  value={payoutUsername}
                  onChange={e => setPayoutUsername(e.target.value)}
                  placeholder={payoutMethod === "Venmo" ? "@username" : "Phone or email"}
                  className="h-10 px-3 rounded-xl border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500 w-52"
                />
              </div>
            )}
            <button
              onClick={savePayoutPreference}
              disabled={savingPayout || !payoutMethod}
              className="h-10 px-5 bg-forest-600 text-white text-sm font-medium rounded-xl hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {savingPayout ? "Saving…" : payoutSaved ? "Saved!" : "Save"}
            </button>
          </div>
          {payoutMethod === "Check" && (
            <div className="mt-4 max-w-md">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Check Mailing Address</label>
              <textarea
                value={payoutCheckAddress}
                onChange={e => setPayoutCheckAddress(e.target.value)}
                rows={3}
                placeholder="Enter mailing address for check delivery"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">This address is for payout only and will not change the project address on file.</p>
            </div>
          )}
        </div>
      )}

      {/* Proof of Payment */}
      <ProofOfPaymentSection
        tenantId={tenantId}
        tenantName={tenantName}
        files={proofFiles}
        canDeleteProof={canDeleteProof}
        onFilesChange={setProofFiles}
        items={items}
        pfSaleEvents={pfSaleEvents}
        localVendors={localVendors}
      />

      {/* Zelle Payment Feed (TTT staff only) */}
      {canEditPayout && <ZellePayments />}

      {/* Payout Modal */}
      {showPayoutModal && (
        <PayoutModal
          tenantId={tenantId}
          tenantName={tenantName}
          ownerEmail={ownerEmail}
          items={items}
          pfSaleEvents={validPfEvents}
          localVendors={localVendors}
          onClose={() => setShowPayoutModal(false)}
          onGenerated={(file, markData) => {
            setProofFiles(prev => [...prev, file]);
            if (markData) {
              const payoutDate = new Date().toISOString().slice(0, 10);
              if (markData.itemsToMark.length > 0) {
                const paidMap = new Map(markData.itemsToMark.map(p => [p.id, p.amount]));
                setItems(prev => prev.map(item =>
                  paidMap.has(item.id)
                    ? { ...item, payoutPaidAmount: paidMap.get(item.id)!, payoutPaidAt: payoutDate }
                    : item
                ));
              }
              if (markData.eventIdsToMark.length > 0) {
                const paidSet = new Set(markData.eventIdsToMark);
                setPfSaleEvents(prev => prev.map(e =>
                  paidSet.has(e.id) ? { ...e, payoutPaid: true } : e
                ));
              }
            }
            setShowPayoutModal(false);
          }}
        />
      )}

      {showReprintModal && (
        <PayoutModal
          tenantId={tenantId}
          tenantName={tenantName}
          ownerEmail={ownerEmail}
          items={items}
          pfSaleEvents={validPfEvents}
          localVendors={localVendors}
          reprint
          onClose={() => setShowReprintModal(false)}
          onGenerated={(file) => {
            setProofFiles(prev => [...prev, file]);
            setShowReprintModal(false);
          }}
        />
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          rooms={rooms}
          localVendors={localVendors}
          canReassign={canReassign}
          allTenants={allTenants}
          staffMembers={staffMembers}
          isTTTUser={isTTTUser}
          isTTT={isTTT}
          onClose={() => setEditingItem(null)}
          onSaved={handleItemSaved}
          onDeleted={handleItemDeleted}
        />
      )}
    </div>
  );
}
