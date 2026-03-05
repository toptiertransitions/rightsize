"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { LocalVendor, Item, VendorDecision } from "@/lib/types";
import { ITEM_CATEGORIES } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface Props {
  vendor: LocalVendor;
  initialItems: Item[];
}

type Tab = "All" | VendorDecision | "Preferences";
const TABS: Tab[] = ["All", "Pending", "Approved", "Rejected", "Hold", "Preferences"];

const CONDITION_COLORS: Record<string, string> = {
  Excellent: "bg-green-100 text-green-800",
  Good: "bg-blue-100 text-blue-800",
  Fair: "bg-yellow-100 text-yellow-800",
  Poor: "bg-orange-100 text-orange-800",
  "For Parts": "bg-red-100 text-red-800",
};

const VENDOR_TYPE_COLORS: Record<string, string> = {
  "Donation Org": "bg-orange-100 text-orange-700",
  "Consignment Store": "bg-amber-100 text-amber-700",
  "Junk Hauler": "bg-gray-100 text-gray-700",
  "Move Manager": "bg-purple-100 text-purple-700",
  "Mover": "bg-blue-100 text-blue-700",
};

interface PrefSlot {
  category: string;
  minPrice: string;
  maxPrice: string;
}

function toPrefSlots(prefs: LocalVendor["prefCategories"]): PrefSlot[] {
  const slots: PrefSlot[] = prefs.map(p => ({
    category: p.category,
    minPrice: p.minPrice > 0 ? String(p.minPrice) : "",
    maxPrice: p.maxPrice > 0 ? String(p.maxPrice) : "",
  }));
  while (slots.length < 5) slots.push({ category: "", minPrice: "", maxPrice: "" });
  return slots;
}

export function VendorPortalClient({ vendor, initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [activeTab, setActiveTab] = useState<Tab>("Pending");
  const [rejectingItemId, setRejectingItemId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  // Price approval state
  const [priceApprovalItemId, setPriceApprovalItemId] = useState<string | null>(null);
  const [customPrice, setCustomPrice] = useState("");
  const [priceNote, setPriceNote] = useState("");

  // Preferences state
  const [prefSlots, setPrefSlots] = useState<PrefSlot[]>(() => toPrefSlots(vendor.prefCategories));
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefError, setPrefError] = useState("");
  const [prefSuccess, setPrefSuccess] = useState(false);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { All: items.length, Pending: 0, Approved: 0, Rejected: 0, Hold: 0 };
    for (const item of items) {
      const dec = item.vendorDecision ?? "Pending";
      if (dec in counts) counts[dec]++;
    }
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    if (activeTab === "All" || activeTab === "Preferences") return items;
    return items.filter(i => (i.vendorDecision ?? "Pending") === activeTab);
  }, [items, activeTab]);

  const makeDecision = async (
    itemId: string,
    decision: VendorDecision,
    opts?: { notes?: string; vendorExpectedPrice?: number; vendorPriceNote?: string }
  ) => {
    setLoadingIds(prev => new Set(prev).add(itemId));
    setError("");
    try {
      const res = await fetch("/api/vendor/decisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, decision, ...opts }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update decision");
      }
      setItems(prev => prev.map(i =>
        i.id === itemId
          ? {
              ...i,
              vendorDecision: decision,
              vendorNotes: opts?.vendorPriceNote ?? opts?.notes ?? i.vendorNotes,
              vendorExpectedPrice: opts?.vendorExpectedPrice ?? i.vendorExpectedPrice,
              vendorPriceApproved: decision === "Approved" ? true : i.vendorPriceApproved,
            }
          : i
      ));
      setRejectingItemId(null);
      setRejectNotes("");
      setPriceApprovalItemId(null);
      setCustomPrice("");
      setPriceNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  };

  const makeBatchDecision = async (decision: VendorDecision) => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const item = items.find(i => i.id === id);
      await makeDecision(id, decision, decision === "Approved" && item ? { vendorExpectedPrice: item.valueMid } : undefined);
    }
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(i => i.id)));
  };

  const handleApproveAtMid = (item: Item) => {
    makeDecision(item.id, "Approved", { vendorExpectedPrice: item.valueMid });
  };

  const handleApproveCustom = (item: Item) => {
    const price = parseFloat(customPrice);
    if (isNaN(price) || price < 0) {
      setError("Please enter a valid price");
      return;
    }
    makeDecision(item.id, "Approved", { vendorExpectedPrice: price, vendorPriceNote: priceNote || undefined });
  };

  const savePrefernces = async () => {
    setPrefSaving(true);
    setPrefError("");
    setPrefSuccess(false);
    try {
      const prefCategories = prefSlots
        .filter(s => s.category.trim())
        .map(s => ({
          category: s.category,
          minPrice: s.minPrice ? parseFloat(s.minPrice) || 0 : 0,
          maxPrice: s.maxPrice ? parseFloat(s.maxPrice) || 0 : 0,
        }));
      const res = await fetch("/api/vendor/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefCategories }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save preferences");
      }
      setPrefSuccess(true);
      router.refresh();
    } catch (e) {
      setPrefError(e instanceof Error ? e.message : "Error saving preferences");
    } finally {
      setPrefSaving(false);
    }
  };

  const typeColor = VENDOR_TYPE_COLORS[vendor.vendorType] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{vendor.vendorName}</h1>
              <span className={`inline-block mt-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${typeColor}`}>
                {vendor.vendorType}
              </span>
            </div>
            <div className="text-sm text-gray-500">
              {items.length} item{items.length !== 1 ? "s" : ""} assigned to you
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 overflow-x-auto pb-px">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? "bg-forest-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab}
                {tab !== "Preferences" && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>
                    {tabCounts[tab] ?? 0}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        {/* ── Preferences Tab ── */}
        {activeTab === "Preferences" ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-lg">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Item Category Preferences</h2>
            <p className="text-sm text-gray-500 mb-5">
              Items will only be routed to you if they match at least one of your preferences (or you have no preferences set).
              Set a price of 0 or leave blank to apply no price limit.
            </p>

            <div className="space-y-4">
              {prefSlots.map((slot, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <select
                      value={slot.category}
                      onChange={e => {
                        const next = [...prefSlots];
                        next[i] = { ...next[i], category: e.target.value };
                        setPrefSlots(next);
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500"
                    >
                      <option value="">— Any category —</option>
                      {ITEM_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  {slot.category && (
                    <>
                      <div className="w-24">
                        <input
                          type="number"
                          min="0"
                          placeholder="Min $"
                          value={slot.minPrice}
                          onChange={e => {
                            const next = [...prefSlots];
                            next[i] = { ...next[i], minPrice: e.target.value };
                            setPrefSlots(next);
                          }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                        />
                      </div>
                      <div className="w-24">
                        <input
                          type="number"
                          min="0"
                          placeholder="Max $"
                          value={slot.maxPrice}
                          onChange={e => {
                            const next = [...prefSlots];
                            next[i] = { ...next[i], maxPrice: e.target.value };
                            setPrefSlots(next);
                          }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                        />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {prefError && (
              <div className="mt-3 text-sm text-red-600">{prefError}</div>
            )}
            {prefSuccess && (
              <div className="mt-3 text-sm text-green-600">Preferences saved.</div>
            )}

            <button
              onClick={savePrefernces}
              disabled={prefSaving}
              className="mt-5 h-9 px-5 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {prefSaving ? "Saving…" : "Save Preferences"}
            </button>
          </div>
        ) : (
          <>
            {/* Batch action bar */}
            {selectedIds.size > 0 && (
              <div className="mb-4 flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                <span className="text-sm font-medium text-gray-700">{selectedIds.size} selected</span>
                <div className="flex-1" />
                <button
                  onClick={() => makeBatchDecision("Approved")}
                  className="h-8 px-4 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  Approve All
                </button>
                <button
                  onClick={() => makeBatchDecision("Rejected")}
                  className="h-8 px-4 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                >
                  Reject All
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="h-8 px-3 text-gray-500 text-sm hover:text-gray-700"
                >
                  Clear
                </button>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">No {activeTab === "All" ? "" : activeTab.toLowerCase() + " "}items</h2>
                <p className="text-gray-500 text-sm">
                  {activeTab === "All"
                    ? "No items have been routed to you yet."
                    : `No items in the ${activeTab} queue.`}
                </p>
              </div>
            ) : (
              <>
                {/* Select all */}
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={selectAll}
                    className="rounded border-gray-300 text-forest-600"
                  />
                  <span className="text-xs text-gray-500">Select all</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filtered.map(item => {
                    const decision = item.vendorDecision ?? "Pending";
                    const isLoading = loadingIds.has(item.id);
                    const isRejecting = rejectingItemId === item.id;
                    const isPriceApproving = priceApprovalItemId === item.id;

                    return (
                      <div key={item.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        {/* Checkbox */}
                        <div className="absolute m-2 z-10">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            className="rounded border-gray-300 text-forest-600"
                          />
                        </div>

                        {/* Photo */}
                        <div className="relative aspect-square bg-gray-100">
                          {item.photoUrl ? (
                            <Image src={item.photoUrl} alt={item.itemName} fill className="object-cover" sizes="(max-width: 640px) 50vw, 25vw" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          {/* Decision badge */}
                          <div className="absolute top-2 right-2">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              decision === "Approved" ? "bg-green-100 text-green-800" :
                              decision === "Rejected" ? "bg-red-100 text-red-800" :
                              decision === "Hold" ? "bg-amber-100 text-amber-800" :
                              "bg-gray-100 text-gray-700"
                            }`}>
                              {decision}
                            </span>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="p-3">
                          <h3 className="font-semibold text-sm text-gray-900 truncate">{item.itemName || "Untitled Item"}</h3>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{item.category}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CONDITION_COLORS[item.condition] ?? "bg-gray-100 text-gray-700"}`}>
                              {item.condition}
                            </span>
                            <span className="text-xs font-semibold text-forest-700">
                              {item.valueMid > 0 ? formatCurrency(item.valueMid) : "—"}
                            </span>
                          </div>

                          {/* Approved price info */}
                          {decision === "Approved" && item.vendorExpectedPrice !== undefined && (
                            <div className="mt-1.5 text-xs text-gray-600">
                              <span className="font-medium text-green-700">Vendor: {formatCurrency(item.vendorExpectedPrice)}</span>
                              {item.valueMid > 0 && item.vendorExpectedPrice !== item.valueMid && (
                                <span className="text-gray-400 ml-1">(TTT: {formatCurrency(item.valueMid)})</span>
                              )}
                            </div>
                          )}

                          {/* Reject inline textarea */}
                          {isRejecting && (
                            <div className="mt-2">
                              <textarea
                                value={rejectNotes}
                                onChange={e => setRejectNotes(e.target.value)}
                                placeholder="Reason for rejection (optional)…"
                                rows={2}
                                className="w-full text-xs rounded-lg border border-gray-300 px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                              />
                            </div>
                          )}

                          {/* Price approval panel */}
                          {isPriceApproving && (
                            <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                              <p className="text-[10px] text-gray-500 italic leading-snug">
                                This is an estimated expected value — not a guaranteed sale price or commitment by any party.
                              </p>
                              {item.valueMid > 0 && (
                                <button
                                  onClick={() => handleApproveAtMid(item)}
                                  disabled={isLoading}
                                  className="w-full h-7 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                                >
                                  {isLoading ? "…" : `Approve at ${formatCurrency(item.valueMid)}`}
                                </button>
                              )}
                              <div className="flex gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={customPrice}
                                  onChange={e => setCustomPrice(e.target.value)}
                                  placeholder="Custom price"
                                  className="flex-1 h-7 text-xs rounded-lg border border-gray-300 px-2 focus:outline-none focus:ring-1 focus:ring-forest-500"
                                />
                                <button
                                  onClick={() => handleApproveCustom(item)}
                                  disabled={isLoading || !customPrice}
                                  className="h-7 px-2.5 text-xs font-medium bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
                                >
                                  Set
                                </button>
                              </div>
                              <textarea
                                value={priceNote}
                                onChange={e => setPriceNote(e.target.value)}
                                placeholder="Note (optional)…"
                                rows={1}
                                className="w-full text-xs rounded-lg border border-gray-300 px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-forest-500"
                              />
                              <button
                                onClick={() => { setPriceApprovalItemId(null); setCustomPrice(""); setPriceNote(""); }}
                                className="text-xs text-gray-400 hover:text-gray-600 underline"
                              >
                                Cancel
                              </button>
                            </div>
                          )}

                          {/* Action row */}
                          {!isRejecting && !isPriceApproving && (
                            <div className="flex gap-1.5 mt-2">
                              <button
                                onClick={() => { setPriceApprovalItemId(item.id); setCustomPrice(""); setPriceNote(""); setError(""); }}
                                disabled={isLoading || decision === "Approved"}
                                title="Approve"
                                className="flex-1 h-7 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
                              >
                                {isLoading ? "…" : "Approve"}
                              </button>
                              <button
                                onClick={() => { setRejectingItemId(item.id); setRejectNotes(""); }}
                                disabled={isLoading}
                                title="Reject"
                                className="flex-1 h-7 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => makeDecision(item.id, "Hold")}
                                disabled={isLoading || decision === "Hold"}
                                title="Hold"
                                className="h-7 px-2 text-xs font-medium bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-40 transition-colors"
                              >
                                Hold
                              </button>
                            </div>
                          )}

                          {/* Rejecting action row */}
                          {isRejecting && (
                            <div className="flex gap-1.5 mt-2">
                              <button
                                onClick={() => makeDecision(item.id, "Rejected", { notes: rejectNotes })}
                                disabled={isLoading}
                                className="flex-1 h-7 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => { setRejectingItemId(null); setRejectNotes(""); }}
                                className="flex-1 h-7 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
