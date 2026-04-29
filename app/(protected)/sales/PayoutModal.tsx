"use client";

import { useState } from "react";
import type { Item, ItemSaleEvent, LocalVendor, ProjectFile } from "@/lib/types";
import type { PayoutLineItem } from "@/lib/payout-pdf";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function channelLabel(route: string) {
  if (route === "ProFoundFinds Consignment") return "ProFoundFinds";
  if (route === "FB/Marketplace") return "FB/Marketplace";
  if (route === "Online Marketplace") return "Online Marketplace";
  return route;
}

// ─── Build unpaid line items ───────────────────────────────────────────────────

export function buildUnpaidLineItems(
  items: Item[],
  pfSaleEvents: ItemSaleEvent[],
  localVendors: LocalVendor[]
): PayoutLineItem[] {
  const result: PayoutLineItem[] = [];

  // PF: unpaid Square sale events
  const unpaidPfEvents = pfSaleEvents.filter(e => !e.payoutPaid && e.clientPayout > 0);
  for (const ev of unpaidPfEvents) {
    const item = items.find(i => i.id === ev.itemId);
    result.push({
      itemName: item?.itemName ?? ev.itemId,
      channel: "ProFoundFinds",
      saleDate: ev.saleDate,
      clientPayout: ev.clientPayout,
    });
  }

  // PF: manually-sold items (no Square events, status Sold, not yet paid)
  const pfEvItemIds = new Set(pfSaleEvents.map(e => e.itemId));
  const pfItems = items.filter(i => i.primaryRoute === "ProFoundFinds Consignment");
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pfVendorMatch = localVendors.find(lv => {
    const n = norm(lv.vendorName);
    return n.includes("profoundfind") || n.includes("profound");
  });
  for (const item of pfItems) {
    if (item.status !== "Sold") continue;
    if (pfEvItemIds.has(item.id)) continue; // covered by Square events above
    let payout = 0;
    if (pfVendorMatch && pfVendorMatch.consignmentTake > 0 && item.salePrice && item.salePrice > 0) {
      // Best: LocalVendor rate applied to the actual sale price
      payout = item.salePrice * (1 - pfVendorMatch.consignmentTake / 100);
    } else if (item.salePrice && item.salePrice > 0 && item.clientSharePercent) {
      // Fallback: clientSharePercent of actual sale price
      payout = item.salePrice * (item.clientSharePercent / 100);
    } else {
      // Last resort: stored consignorPayout (may be stale)
      payout = item.consignorPayout ?? 0;
    }
    if (payout <= 0) continue;
    const alreadyPaid = (item.payoutPaidAmount ?? 0) >= payout;
    if (alreadyPaid) continue;
    result.push({
      itemName: item.itemName,
      channel: "ProFoundFinds",
      saleDate: item.updatedAt ?? new Date().toISOString().slice(0, 10),
      clientPayout: payout,
    });
  }

  // FB / Online Marketplace: sold, unpaid
  const consignmentRoutes = ["FB/Marketplace", "Online Marketplace", "Other Consignment"];
  for (const item of items) {
    if (!consignmentRoutes.includes(item.primaryRoute)) continue;
    if (item.status !== "Sold") continue;
    // Calculate payout
    let payout = 0;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = localVendors.find(lv => norm(lv.vendorName) === norm(item.primaryRoute));
    if (match && item.salePrice && match.consignmentTake > 0) {
      payout = item.salePrice * (1 - match.consignmentTake / 100);
    } else {
      payout = item.consignorPayout ?? 0;
    }
    if (payout <= 0) continue;
    const alreadyPaid = (item.payoutPaidAmount ?? 0) >= payout;
    if (alreadyPaid) continue;
    result.push({
      itemName: item.itemName,
      channel: channelLabel(item.primaryRoute),
      saleDate: item.updatedAt ?? new Date().toISOString().slice(0, 10),
      clientPayout: payout,
    });
  }

  // Estate Sale: sold, unpaid — client gets clientSharePercent of salePrice
  for (const item of items) {
    if (item.primaryRoute !== "Estate Sale") continue;
    if (item.status !== "Sold") continue;
    let payout = 0;
    if (item.salePrice && item.salePrice > 0) {
      payout = item.clientSharePercent
        ? item.salePrice * (item.clientSharePercent / 100)
        : (item.consignorPayout ?? 0);
    } else {
      payout = item.consignorPayout ?? 0;
    }
    if (payout <= 0) continue;
    const alreadyPaid = (item.payoutPaidAmount ?? 0) >= payout;
    if (alreadyPaid) continue;
    result.push({
      itemName: item.itemName,
      channel: "Estate Sale",
      saleDate: item.updatedAt ?? new Date().toISOString().slice(0, 10),
      clientPayout: payout,
    });
  }

  return result;
}

// ─── Build already-paid line items (for re-print) ────────────────────────────

export function buildPaidLineItems(
  items: Item[],
  pfSaleEvents: ItemSaleEvent[],
): PayoutLineItem[] {
  const result: PayoutLineItem[] = [];

  // PF: paid Square sale events
  const paidPfEvents = pfSaleEvents.filter(e => e.payoutPaid && e.clientPayout > 0);
  const pfEventItemIds = new Set(pfSaleEvents.map(e => e.itemId));
  for (const ev of paidPfEvents) {
    const item = items.find(i => i.id === ev.itemId);
    result.push({
      itemName: item?.itemName ?? ev.itemId,
      channel: "ProFoundFinds",
      saleDate: ev.saleDate,
      clientPayout: ev.clientPayout,
    });
  }

  // All other paid items (payoutPaidAmount > 0, not covered by Square events)
  for (const item of items) {
    if ((item.payoutPaidAmount ?? 0) <= 0) continue;
    if (item.primaryRoute === "ProFoundFinds Consignment" && pfEventItemIds.has(item.id)) continue;
    result.push({
      itemName: item.itemName,
      channel: channelLabel(item.primaryRoute),
      saleDate: item.payoutPaidAt ?? item.updatedAt ?? new Date().toISOString().slice(0, 10),
      clientPayout: item.payoutPaidAmount!,
    });
  }

  return result;
}

// ─── Mark-as-paid data ────────────────────────────────────────────────────────

export interface PayoutMarkData {
  itemsToMark: { id: string; amount: number }[];
  eventIdsToMark: string[];
}

/** Compute which item IDs and event IDs should be marked paid on payout. */
export function buildPayoutMarkData(
  items: Item[],
  pfSaleEvents: ItemSaleEvent[],
  localVendors: LocalVendor[]
): PayoutMarkData {
  const itemsToMark: { id: string; amount: number }[] = [];
  const eventIdsToMark: string[] = [];

  // PF Square events
  const unpaidPfEvents = pfSaleEvents.filter(e => !e.payoutPaid && e.clientPayout > 0);
  eventIdsToMark.push(...unpaidPfEvents.map(e => e.id));

  // PF manually sold items (no Square events)
  const pfEvItemIds = new Set(pfSaleEvents.map(e => e.itemId));
  const norm2 = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pfVendorMatch2 = localVendors.find(lv => {
    const n = norm2(lv.vendorName);
    return n.includes("profoundfind") || n.includes("profound");
  });
  for (const item of items.filter(i => i.primaryRoute === "ProFoundFinds Consignment")) {
    if (item.status !== "Sold" || pfEvItemIds.has(item.id)) continue;
    let payout = 0;
    if (pfVendorMatch2 && pfVendorMatch2.consignmentTake > 0 && item.salePrice && item.salePrice > 0) {
      payout = item.salePrice * (1 - pfVendorMatch2.consignmentTake / 100);
    } else if (item.salePrice && item.salePrice > 0 && item.clientSharePercent) {
      payout = item.salePrice * (item.clientSharePercent / 100);
    } else {
      payout = item.consignorPayout ?? 0;
    }
    if (payout > 0 && (item.payoutPaidAmount ?? 0) < payout) {
      itemsToMark.push({ id: item.id, amount: payout });
    }
  }

  // FB / Online Marketplace / Other Consignment sold items
  const consignmentRoutes = ["FB/Marketplace", "Online Marketplace", "Other Consignment"];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const item of items) {
    if (!consignmentRoutes.includes(item.primaryRoute) || item.status !== "Sold") continue;
    const match = localVendors.find(lv => norm(lv.vendorName) === norm(item.primaryRoute));
    const payout =
      match && item.salePrice && match.consignmentTake > 0
        ? item.salePrice * (1 - match.consignmentTake / 100)
        : (item.consignorPayout ?? 0);
    if (payout > 0 && (item.payoutPaidAmount ?? 0) < payout) {
      itemsToMark.push({ id: item.id, amount: payout });
    }
  }

  // Estate Sale sold items
  for (const item of items) {
    if (item.primaryRoute !== "Estate Sale" || item.status !== "Sold") continue;
    const payout =
      item.salePrice && item.salePrice > 0
        ? (item.clientSharePercent ? item.salePrice * (item.clientSharePercent / 100) : (item.consignorPayout ?? 0))
        : (item.consignorPayout ?? 0);
    if (payout > 0 && (item.payoutPaidAmount ?? 0) < payout) {
      itemsToMark.push({ id: item.id, amount: payout });
    }
  }

  return { itemsToMark, eventIdsToMark };
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface PayoutModalProps {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  items: Item[];
  pfSaleEvents: ItemSaleEvent[];
  localVendors: LocalVendor[];
  onClose: () => void;
  onGenerated: (file: ProjectFile, markData: PayoutMarkData | null) => void;
  reprint?: boolean;
}

export function PayoutModal({
  tenantId,
  tenantName,
  ownerEmail,
  items,
  pfSaleEvents,
  localVendors,
  onClose,
  onGenerated,
  reprint = false,
}: PayoutModalProps) {
  const unpaidItems = buildUnpaidLineItems(items, pfSaleEvents, localVendors);
  const paidItems = buildPaidLineItems(items, pfSaleEvents);
  const lineItems = reprint ? paidItems : unpaidItems;
  const total = lineItems.reduce((s, i) => s + i.clientPayout, 0);

  const [sendEmail, setSendEmail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(ownerEmail);
  const [ccEmail, setCcEmail] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (sendEmail && !recipientEmail.trim()) {
      setError("Enter a recipient email address.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/sales/payout-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          clientName: tenantName,
          companyName: "Top Tier Transitions",
          items: lineItems,
          sendEmail,
          recipientEmail: sendEmail ? recipientEmail.trim() : undefined,
          ccEmail: sendEmail && ccEmail.trim() ? ccEmail.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to generate payout");
      }
      const data = await res.json();

      // Open the PDF in a new tab using a blob URL (no proxy needed)
      if (data.pdfBase64) {
        const bytes = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      }

      if (!reprint) {
        // Mark items and events as paid (best-effort; fire in parallel)
        const markData = buildPayoutMarkData(items, pfSaleEvents, localVendors);
        const payoutDate = new Date().toISOString().slice(0, 10);
        await Promise.allSettled([
          ...markData.itemsToMark.map(({ id, amount }) =>
            fetch("/api/sales/payout", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemId: id, payoutPaidAmount: amount, payoutPaidAt: payoutDate }),
            })
          ),
          ...markData.eventIdsToMark.map(eventId =>
            fetch("/api/item-sale-events", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: eventId, payoutPaid: true }),
            })
          ),
        ]);
        onGenerated(data.file, markData);
      } else {
        onGenerated(data.file, null);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{reprint ? "Re-print Payout Statement" : "Payout Client"}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{tenantName}{reprint ? " — previously paid items" : ""}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {lineItems.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {reprint ? "No paid items found to reprint." : "No unpaid sold items found."}
            </p>
          ) : (
            <>
              {/* Item list */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide gap-3">
                  <span>Item</span>
                  <span className="text-right">Channel</span>
                  <span className="text-right">Payout</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {lineItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] px-4 py-2.5 gap-3 items-center">
                      <span className="text-sm text-gray-800 truncate">{item.itemName}</span>
                      <span className="text-xs text-gray-400 text-right whitespace-nowrap">{item.channel}</span>
                      <span className="text-sm font-medium text-gray-900 text-right tabular-nums">{fmtCurrency(item.clientPayout)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] px-4 py-3 bg-green-50 border-t-2 border-green-600 gap-3 items-center">
                  <span className="text-sm font-bold text-green-700 col-span-2">Total Payout</span>
                  <span className="text-base font-bold text-green-700 text-right tabular-nums">{fmtCurrency(total)}</span>
                </div>
              </div>

              {/* Email toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={e => setSendEmail(e.target.checked)}
                  className="w-4 h-4 accent-green-600"
                />
                <span className="text-sm text-gray-700">Send payout statement by email</span>
              </label>

              {sendEmail && (
                <div className="space-y-3 pl-7">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-600">To</label>
                      {ownerEmail && recipientEmail !== ownerEmail && (
                        <button
                          type="button"
                          onClick={() => setRecipientEmail(ownerEmail)}
                          className="text-[11px] text-green-600 hover:underline"
                        >
                          Reset to {ownerEmail}
                        </button>
                      )}
                    </div>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={e => setRecipientEmail(e.target.value)}
                      placeholder="client@example.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CC (optional)</label>
                    <input
                      type="email"
                      value={ccEmail}
                      onChange={e => setCcEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || lineItems.length === 0}
            className="h-9 px-5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {generating ? "Generating…" : sendEmail ? "Generate & Send" : reprint ? "Re-print PDF" : "Generate PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
