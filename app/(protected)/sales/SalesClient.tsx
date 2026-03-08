"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Item, Vendor, ProjectFile, ItemStatus, Room, LocalVendor, ItemSaleEvent } from "@/lib/types";
import { EditItemModal } from "@/components/catalog/ItemGrid";

// ─── Calc payout from local vendor take rate ──────────────────────────────────

interface CalcPayout { amount: number; vendorName: string; rate: number; }

function computeCalcPayout(item: Item, localVendors: LocalVendor[]): CalcPayout | null {
  if (!item.salePrice || item.salePrice <= 0) return null;
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

  if (!match || match.consignmentTake <= 0) return null;
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

interface SalesClientProps {
  tenantId: string;
  tenantName: string;
  items: Item[];
  vendors: Vendor[];
  rooms: Room[];
  localVendors: LocalVendor[];
  paymentProofFiles: ProjectFile[];
  canEdit: boolean;
  canEditPayout: boolean;
  canDeleteProof: boolean;
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  canEditPayout,
  canEdit,
  calcPayout,
  onPayoutSaved,
  onSalePriceSaved,
  onEdit,
}: {
  item: Item;
  canEditPayout: boolean;
  canEdit: boolean;
  calcPayout: CalcPayout | null;
  onPayoutSaved: (itemId: string, amount: number) => void;
  onSalePriceSaved: (itemId: string, price: number) => void;
  onEdit: (item: Item) => void;
}) {
  const [editingPayout, setEditingPayout] = useState(false);
  const [payoutInput, setPayoutInput] = useState(String(item.payoutPaidAmount ?? 0));
  const [savingPayout, setSavingPayout] = useState(false);

  const [editingSalePrice, setEditingSalePrice] = useState(false);
  const [salePriceInput, setSalePriceInput] = useState(String(item.salePrice ?? ""));
  const [savingSalePrice, setSavingSalePrice] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const isSold = item.status === "Sold";

  async function savePayout() {
    const amount = parseFloat(payoutInput) || 0;
    setSavingPayout(true);
    try {
      const res = await fetch("/api/sales/payout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, payoutPaidAmount: amount }),
      });
      if (res.ok) { onPayoutSaved(item.id, amount); setEditingPayout(false); }
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

  // Live-preview client payout while editing sale price
  const previewSalePrice = editingSalePrice ? (parseFloat(salePriceInput) || 0) : (item.salePrice ?? 0);
  const previewCalcPayout: CalcPayout | null = calcPayout && previewSalePrice > 0
    ? { ...calcPayout, amount: previewSalePrice * (1 - calcPayout.rate / 100) }
    : calcPayout;

  // Target Value: sale price if set, else valueMid estimate
  const targetValue = item.salePrice && item.salePrice > 0 ? item.salePrice : item.valueMid;

  const inlineInputClass = "w-20 border border-forest-400 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-forest-500";
  const saveBtn = (onClick: () => void, saving: boolean) => (
    <button onClick={onClick} disabled={saving}
      className="text-[10px] bg-forest-600 text-white px-1.5 py-0.5 rounded hover:bg-forest-700 disabled:opacity-50">
      {saving ? "…" : "Save"}
    </button>
  );
  const cancelBtn = (onClick: () => void) => (
    <button onClick={onClick} className="text-[10px] text-gray-400 hover:text-gray-600">✕</button>
  );

  return (
    <div className={cn(
      "group bg-white rounded-xl border overflow-hidden flex flex-col",
      isSold ? "border-green-200" : "border-gray-200"
    )}>
      {/* Photo */}
      <div className="relative h-36 bg-gray-100 flex-shrink-0">
        {item.photoUrl ? (
          <Image src={item.photoUrl} alt={item.itemName} fill className="object-cover" sizes="200px" />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-300">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* Status badge */}
        <span className={cn(
          "absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full",
          STATUS_COLORS[item.status]
        )}>
          {item.status}
        </span>
        {/* Edit button */}
        {canEdit && (
          <button
            onClick={() => onEdit(item)}
            className="absolute top-1 right-1 w-6 h-6 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit item"
          >
            <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">{item.itemName}</div>
        <div className="text-xs text-gray-500">{item.category}</div>

        {/* Target Value — shows sale price if set, otherwise estimate */}
        <div className="flex justify-between text-xs mt-1">
          <span className="text-gray-400">Target Value</span>
          <span className="font-medium text-gray-700">
            {targetValue > 0 ? fmtCurrency(targetValue) : "—"}
          </span>
        </div>

        {/* Sale price — editable by TTT Staff/Manager */}
        {(isSold || canEditPayout) && (
          <div className="pt-1.5 border-t border-gray-100 space-y-1">
            <div className="flex justify-between text-xs items-center gap-1">
              <span className="text-gray-500">Sale price</span>
              {canEditPayout ? (
                editingSalePrice ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={salePriceInput}
                      onChange={e => setSalePriceInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveSalePrice(); if (e.key === "Escape") setEditingSalePrice(false); }}
                      className={inlineInputClass}
                      autoFocus
                    />
                    {saveBtn(saveSalePrice, savingSalePrice)}
                    {cancelBtn(() => setEditingSalePrice(false))}
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingSalePrice(true); setSalePriceInput(String(item.salePrice ?? "")); }}
                    className="text-xs font-medium text-gray-800 hover:underline"
                  >
                    {item.salePrice ? fmtCurrency(item.salePrice) : <span className="text-gray-400 italic text-[10px]">Set price</span>}
                  </button>
                )
              ) : (
                <span className="font-medium text-gray-800">{fmtCurrency(item.salePrice)}</span>
              )}
            </div>

            {/* Client payout — only shown when a sale price exists */}
            {previewSalePrice > 0 && (
              <div className="flex justify-between text-xs items-center gap-1">
                <span className="text-gray-500">Client payout</span>
                <span className="font-semibold text-green-700 text-right">
                  {previewCalcPayout
                    ? <>{fmtCurrency(previewCalcPayout.amount)} <span className="text-[9px] font-normal text-gray-400">({previewCalcPayout.rate}% take)</span></>
                    : fmtCurrency(item.consignorPayout)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Payout paid */}
        <div className="mt-auto pt-1.5 border-t border-gray-100">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] text-gray-500">Paid to client</span>
            {canEditPayout ? (
              editingPayout ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">$</span>
                  <input
                    ref={inputRef}
                    type="number" min="0" step="0.01"
                    value={payoutInput}
                    onChange={e => setPayoutInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") savePayout(); if (e.key === "Escape") setEditingPayout(false); }}
                    className={inlineInputClass}
                    autoFocus
                  />
                  {saveBtn(savePayout, savingPayout)}
                  {cancelBtn(() => setEditingPayout(false))}
                </div>
              ) : (
                <button
                  onClick={() => { setEditingPayout(true); setPayoutInput(String(item.payoutPaidAmount ?? 0)); }}
                  className="text-xs font-semibold text-forest-700 hover:underline"
                >
                  {fmtCurrency(item.payoutPaidAmount) === "—" ? "$0.00" : fmtCurrency(item.payoutPaidAmount)}
                </button>
              )
            ) : (
              <span className="text-xs font-semibold text-gray-700">
                {fmtCurrency(item.payoutPaidAmount) === "—" ? "$0.00" : fmtCurrency(item.payoutPaidAmount)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PF Sale Events Timeline ──────────────────────────────────────────────────

function PFItemCard({
  item,
  canEditPayout,
  canEdit,
  onEdit,
}: {
  item: Item;
  canEditPayout: boolean;
  canEdit: boolean;
  onEdit: (item: Item) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<ItemSaleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const qty = item.quantity ?? 0;
  const qtySold = item.quantitySold ?? 0;
  const qtyTotal = qty + qtySold; // original total = remaining + sold
  const hasQtyData = qtyTotal > 0;
  const isSold = item.status === "Sold";

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
  const totalPaidEvents = events.reduce((s, e) => s + (e.payoutPaid ? e.clientPayout : 0), 0);

  return (
    <div className={cn(
      "bg-white rounded-xl border overflow-hidden",
      isSold ? "border-green-200" : "border-gray-200"
    )}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-3">
        {/* Thumbnail */}
        <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
          {item.photoUrl ? (
            <Image src={item.photoUrl} alt={item.itemName} fill className="object-cover" sizes="48px" />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm truncate">{item.itemName}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
              STATUS_COLORS[item.status]
            )}>
              {item.status}
            </span>
            {item.barcodeNumber && (
              <span className="text-[10px] text-gray-400">#{item.barcodeNumber}</span>
            )}
          </div>
        </div>

        {/* Qty progress */}
        <div className="text-right flex-shrink-0">
          {hasQtyData ? (
            <div className="text-sm font-semibold text-gray-900">
              {qtySold} of {qtyTotal} sold
            </div>
          ) : (
            <div className="text-sm text-gray-400">—</div>
          )}
          {item.clientSharePercent != null && (
            <div className="text-[10px] text-gray-400">{item.clientSharePercent}% share</div>
          )}
        </div>

        {/* Edit + expand */}
        <div className="flex items-center gap-1">
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
      </div>

      {/* Progress bar */}
      {qtyTotal > 0 && (
        <div className="px-3 pb-2">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", isSold ? "bg-green-400" : "bg-purple-400")}
              style={{ width: `${Math.min(100, (qtySold / qtyTotal) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Sale events accordion */}
      {expanded && (
        <div className="border-t border-gray-100">
          {loading ? (
            <div className="px-4 py-5 text-center text-xs text-gray-400">Loading sale events…</div>
          ) : events.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-gray-400">No Square sales recorded yet</div>
          ) : (
            <>
              {/* Event rows */}
              <div className="divide-y divide-gray-50">
                {events.map(evt => (
                  <div key={evt.id} className="px-4 py-2.5 flex items-center gap-3">
                    {/* Date */}
                    <div className="text-[11px] text-gray-400 w-20 flex-shrink-0">
                      {new Date(evt.saleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>

                    {/* Details */}
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

                    {/* Payout toggle */}
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
                        {togglingId === evt.id ? "…" : evt.payoutPaid ? "Paid" : "Unpaid"}
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

              {/* Totals footer */}
              <div className="px-4 py-2.5 bg-gray-50 flex gap-6 text-xs">
                <div>
                  <span className="text-gray-400">Total owed: </span>
                  <span className="font-semibold text-amber-700">{fmtCurrency(totalOwed)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Total paid: </span>
                  <span className="font-semibold text-green-700">{fmtCurrency(totalPaidEvents)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PFSalesSection({
  items,
  canEditPayout,
  canEdit,
  onEdit,
}: {
  items: Item[];
  canEditPayout: boolean;
  canEdit: boolean;
  onEdit: (item: Item) => void;
}) {
  if (items.length === 0) return null;

  const totalQty = items.reduce((s, i) => s + ((i.quantity ?? 0) + (i.quantitySold ?? 0)), 0);
  const totalSold = items.reduce((s, i) => s + (i.quantitySold ?? 0), 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-base font-semibold text-gray-900">ProFoundFinds Consignment</h2>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {items.length} items
        </span>
        {totalQty > 0 && (
          <span className="text-xs text-gray-400">
            {totalSold} of {totalQty} units sold
          </span>
        )}
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <PFItemCard
            key={item.id}
            item={item}
            canEditPayout={canEditPayout}
            canEdit={canEdit}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function SectionGrid({
  title,
  items,
  canEditPayout,
  canEdit,
  calcPayouts,
  onPayoutSaved,
  onSalePriceSaved,
  onEdit,
}: {
  title: string;
  items: Item[];
  canEditPayout: boolean;
  canEdit: boolean;
  calcPayouts: Map<string, CalcPayout>;
  onPayoutSaved: (id: string, amount: number) => void;
  onSalePriceSaved: (id: string, price: number) => void;
  onEdit: (item: Item) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {items.map(item => (
          <ItemCard key={item.id} item={item} canEditPayout={canEditPayout} canEdit={canEdit} calcPayout={calcPayouts.get(item.id) ?? null} onPayoutSaved={onPayoutSaved} onSalePriceSaved={onSalePriceSaved} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}

// ─── Proof of Payment ─────────────────────────────────────────────────────────

function ProofOfPaymentSection({
  tenantId,
  initialFiles,
  canDeleteProof,
}: {
  tenantId: string;
  initialFiles: ProjectFile[];
  canDeleteProof: boolean;
}) {
  const [files, setFiles] = useState(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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
      setFiles(prev => [...prev, data.file]);
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
    if (res.ok) setFiles(prev => prev.filter(f => f.id !== file.id));
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
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
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
                  href={f.cloudinaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
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
  items: initialItems,
  vendors,
  rooms,
  localVendors,
  paymentProofFiles,
  canEdit,
  canEditPayout,
  canDeleteProof,
}: SalesClientProps) {
  const [items, setItems] = useState(initialItems);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  function handlePayoutSaved(itemId: string, amount: number) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, payoutPaidAmount: amount } : i));
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

  // Split by route
  const profound = items.filter(i => i.primaryRoute === "ProFoundFinds Consignment");
  const fb = items.filter(i => i.primaryRoute === "FB/Marketplace");
  const online = items.filter(i => i.primaryRoute === "Online Marketplace");
  const other = items.filter(i => i.primaryRoute === "Other Consignment");

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

  // Summary totals — prefer calculated payout from take rate, fall back to stored consignorPayout
  const soldItems = items.filter(i => i.status === "Sold");
  const totalEarned = soldItems.reduce((s, i) => {
    const calc = calcPayouts.get(i.id);
    return s + (calc ? calc.amount : (i.consignorPayout ?? 0));
  }, 0);
  const totalPaid = items.reduce((s, i) => s + (i.payoutPaidAmount ?? 0), 0);
  const totalOwed = Math.max(0, totalEarned - totalPaid);

  const statCard = (label: string, value: number, color: string) => (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className={cn("text-xl font-bold tabular-nums", color)}>
        ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Item Sales</h1>
        <p className="text-sm text-gray-500 mt-0.5">{tenantName} — consignment & marketplace tracking</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {statCard("Total client earnings (sold)", totalEarned, "text-green-700")}
        {statCard("Total paid to client", totalPaid, "text-blue-700")}
        {statCard("Still owed to client", totalOwed, totalOwed > 0 ? "text-amber-600" : "text-gray-400")}
      </div>

      {/* Sections */}
      <div className="space-y-10">
        <PFSalesSection
          items={profound}
          canEditPayout={canEditPayout}
          canEdit={canEdit}
          onEdit={setEditingItem}
        />
        <SectionGrid
          title="FB / Marketplace"
          items={fb}
          canEditPayout={canEditPayout}
          canEdit={canEdit}
          calcPayouts={calcPayouts}
          onPayoutSaved={handlePayoutSaved}
          onSalePriceSaved={handleSalePriceSaved}
          onEdit={setEditingItem}
        />
        <SectionGrid
          title="Online Marketplace"
          items={online}
          canEditPayout={canEditPayout}
          canEdit={canEdit}
          calcPayouts={calcPayouts}
          onPayoutSaved={handlePayoutSaved}
          onSalePriceSaved={handleSalePriceSaved}
          onEdit={setEditingItem}
        />

        {/* Other Consignment — grouped by vendor */}
        {other.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-semibold text-gray-900">Other Consignment</h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{other.length}</span>
            </div>
            <div className="space-y-6">
              {[...otherByVendor.entries()].map(([vendorName, vendorItems]) => (
                <div key={vendorName}>
                  <div className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
                    {vendorName}
                    <span className="text-xs text-gray-400">({vendorItems.length})</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {vendorItems.map(item => (
                      <ItemCard key={item.id} item={item} canEditPayout={canEditPayout} canEdit={canEdit} calcPayout={calcPayouts.get(item.id) ?? null} onPayoutSaved={handlePayoutSaved} onSalePriceSaved={handleSalePriceSaved} onEdit={setEditingItem} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && (
          <p className="text-center text-gray-400 py-16">No consignment or marketplace items yet</p>
        )}
      </div>

      {/* Proof of Payment */}
      <ProofOfPaymentSection
        tenantId={tenantId}
        initialFiles={paymentProofFiles}
        canDeleteProof={canDeleteProof}
      />

      {/* Edit Item Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          rooms={rooms}
          localVendors={localVendors}
          onClose={() => setEditingItem(null)}
          onSaved={handleItemSaved}
          onDeleted={handleItemDeleted}
        />
      )}
    </div>
  );
}
