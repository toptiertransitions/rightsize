"use client";

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { LocalVendor, Item, VendorDecision, ItemPhoto } from "@/lib/types";
import { ITEM_CATEGORIES } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bestDescription(item: Item): string {
  return (
    item.listingDescriptionEbay?.trim() ||
    item.listingFb?.trim() ||
    item.listingOfferup?.trim() ||
    item.conditionNotes?.trim() ||
    item.routeReasoning?.trim() ||
    ""
  );
}

function itemPhotos(item: Item): ItemPhoto[] {
  if (item.photos?.length) return item.photos;
  if (item.photoUrl) return [{ url: item.photoUrl, publicId: item.photoPublicId ?? "" }];
  return [];
}

// ─── Constants ────────────────────────────────────────────────────────────────

interface Props {
  vendor: LocalVendor;
  initialItems: Item[];
  tenantCityMap: Record<string, string>;
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

const DECISION_COLORS: Record<string, string> = {
  Approved: "bg-green-100 text-green-800",
  Rejected: "bg-red-100 text-red-800",
  Hold: "bg-amber-100 text-amber-800",
  Pending: "bg-gray-100 text-gray-700",
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

// ─── Photo Carousel ───────────────────────────────────────────────────────────

function PhotoCarousel({ photos, itemName }: { photos: ItemPhoto[]; itemName: string }) {
  const [idx, setIdx] = useState(0);
  if (!photos.length) {
    return (
      <div className="w-full aspect-square bg-gray-100 rounded-xl flex items-center justify-center">
        <svg className="w-14 h-14 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full aspect-square bg-gray-100 rounded-xl overflow-hidden">
        <Image src={photos[idx].url} alt={`${itemName} photo ${idx + 1}`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
        {photos.length > 1 && (
          <>
            <button
              onClick={() => setIdx(i => (i - 1 + photos.length) % photos.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => setIdx(i => (i + 1) % photos.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {photos.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/40"}`} />
              ))}
            </div>
          </>
        )}
        <div className="absolute top-2 right-2 bg-black/50 text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
          {idx + 1} / {photos.length}
        </div>
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${i === idx ? "border-forest-500" : "border-transparent"}`}
            >
              <Image src={p.url} alt={`thumb ${i + 1}`} fill className="object-cover" sizes="56px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Item Detail Modal ────────────────────────────────────────────────────────

interface DetailModalProps {
  item: Item;
  city: string;
  initialAction: "approve" | "reject" | null;
  isLoading: boolean;
  onClose: () => void;
  onDecision: (itemId: string, decision: VendorDecision, opts?: { notes?: string; vendorExpectedPrice?: number; vendorPriceNote?: string }) => Promise<void>;
}

function ItemDetailModal({ item, city, initialAction, isLoading, onClose, onDecision }: DetailModalProps) {
  const [action, setAction] = useState<"approve" | "reject" | null>(initialAction);
  const [rejectNotes, setRejectNotes] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [localError, setLocalError] = useState("");

  const photos = itemPhotos(item);
  const desc = bestDescription(item);
  const decision = item.vendorDecision ?? "Pending";

  const handleApproveAtMid = async () => {
    setLocalError("");
    await onDecision(item.id, "Approved", { vendorExpectedPrice: item.valueMid });
    onClose();
  };

  const handleApproveCustom = async () => {
    const price = parseFloat(customPrice);
    if (isNaN(price) || price < 0) { setLocalError("Enter a valid price"); return; }
    setLocalError("");
    await onDecision(item.id, "Approved", { vendorExpectedPrice: price, vendorPriceNote: priceNote || undefined });
    onClose();
  };

  const handleReject = async () => {
    setLocalError("");
    await onDecision(item.id, "Rejected", { notes: rejectNotes });
    onClose();
  };

  const handleHold = async () => {
    await onDecision(item.id, "Hold");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${DECISION_COLORS[decision]}`}>{decision}</span>
            <h2 className="font-semibold text-gray-900 truncate text-sm sm:text-base">{item.itemName}</h2>
          </div>
          <button onClick={onClose} className="ml-3 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5">
            {/* Left: photos */}
            <div>
              <PhotoCarousel photos={photos} itemName={item.itemName} />
            </div>

            {/* Right: details + actions */}
            <div className="flex flex-col gap-4">
              {/* Meta row */}
              <div className="flex flex-wrap gap-2 items-center">
                {item.category && (
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{item.category}</span>
                )}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONDITION_COLORS[item.condition] ?? "bg-gray-100 text-gray-700"}`}>
                  {item.condition}
                </span>
                {city && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {city}
                  </span>
                )}
              </div>

              {/* Price */}
              {item.valueMid > 0 && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Estimated Value</p>
                  <p className="text-2xl font-semibold text-forest-700">{formatCurrency(item.valueMid)}</p>
                  {decision === "Approved" && item.vendorExpectedPrice !== undefined && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      Your price: <span className="font-medium text-green-700">{formatCurrency(item.vendorExpectedPrice)}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Description */}
              {desc && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{desc}</p>
                </div>
              )}

              {/* Condition notes */}
              {item.conditionNotes && item.conditionNotes !== desc && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Condition Notes</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{item.conditionNotes}</p>
                </div>
              )}

              {/* Existing vendor notes */}
              {item.vendorNotes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700 font-medium mb-0.5">Your Note</p>
                  <p className="text-sm text-amber-800">{item.vendorNotes}</p>
                </div>
              )}

              {/* Action panels */}
              {localError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{localError}</p>}

              {action === "approve" && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs text-gray-500 italic">
                    Set an expected price — this is an estimate, not a binding commitment.
                  </p>
                  {item.valueMid > 0 && (
                    <button
                      onClick={handleApproveAtMid}
                      disabled={isLoading}
                      className="w-full h-9 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {isLoading ? "…" : `Approve at ${formatCurrency(item.valueMid)}`}
                    </button>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="number" min="0" step="0.01"
                      value={customPrice}
                      onChange={e => setCustomPrice(e.target.value)}
                      placeholder="Custom price"
                      className="flex-1 h-9 text-sm rounded-lg border border-gray-300 px-3 focus:outline-none focus:ring-2 focus:ring-forest-500"
                    />
                    <button
                      onClick={handleApproveCustom}
                      disabled={isLoading || !customPrice}
                      className="h-9 px-4 text-sm font-medium bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
                    >
                      Set
                    </button>
                  </div>
                  <input
                    type="text"
                    value={priceNote}
                    onChange={e => setPriceNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="w-full h-9 text-sm rounded-lg border border-gray-300 px-3 focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                  <button onClick={() => setAction(null)} className="text-xs text-gray-400 hover:text-gray-600 underline">Cancel</button>
                </div>
              )}

              {action === "reject" && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <textarea
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                    placeholder="Reason for rejection (optional)…"
                    rows={3}
                    className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleReject}
                      disabled={isLoading}
                      className="flex-1 h-9 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {isLoading ? "…" : "Confirm Rejection"}
                    </button>
                    <button onClick={() => setAction(null)} className="px-4 h-9 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Primary action buttons */}
              {action === null && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setAction("approve"); setCustomPrice(""); setPriceNote(""); setLocalError(""); }}
                    disabled={isLoading || decision === "Approved"}
                    className="flex-1 h-9 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { setAction("reject"); setRejectNotes(""); setLocalError(""); }}
                    disabled={isLoading}
                    className="flex-1 h-9 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleHold}
                    disabled={isLoading || decision === "Hold"}
                    className="h-9 px-4 text-sm font-medium bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-40 transition-colors"
                  >
                    Hold
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function VendorPortalClient({ vendor, initialItems, tenantCityMap }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [activeTab, setActiveTab] = useState<Tab>("Pending");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [rejectingItemId, setRejectingItemId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  // Price approval state (grid view)
  const [priceApprovalItemId, setPriceApprovalItemId] = useState<string | null>(null);
  const [customPrice, setCustomPrice] = useState("");
  const [priceNote, setPriceNote] = useState("");

  // Detail modal state
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [detailAction, setDetailAction] = useState<"approve" | "reject" | null>(null);

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

  const makeDecision = useCallback(async (
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
  }, [router]);

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
    if (isNaN(price) || price < 0) { setError("Please enter a valid price"); return; }
    makeDecision(item.id, "Approved", { vendorExpectedPrice: price, vendorPriceNote: priceNote || undefined });
  };

  const openDetail = (item: Item, action: "approve" | "reject" | null = null) => {
    setDetailItem(item);
    setDetailAction(action);
  };

  const closeDetail = () => {
    setDetailItem(null);
    setDetailAction(null);
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
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {items.length} item{items.length !== 1 ? "s" : ""} assigned to you
              </span>
              {/* View toggle */}
              {activeTab !== "Preferences" && (
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setViewMode("grid")}
                    title="Grid view"
                    className={`p-2 transition-colors ${viewMode === "grid" ? "bg-forest-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    title="Table view"
                    className={`p-2 transition-colors ${viewMode === "table" ? "bg-forest-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 overflow-x-auto pb-px">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab ? "bg-forest-600 text-white" : "text-gray-600 hover:bg-gray-100"
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
                      onChange={e => { const next = [...prefSlots]; next[i] = { ...next[i], category: e.target.value }; setPrefSlots(next); }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500"
                    >
                      <option value="">— Any category —</option>
                      {ITEM_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  {slot.category && (
                    <>
                      <div className="w-24">
                        <input
                          type="number" min="0" placeholder="Min $" value={slot.minPrice}
                          onChange={e => { const next = [...prefSlots]; next[i] = { ...next[i], minPrice: e.target.value }; setPrefSlots(next); }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                        />
                      </div>
                      <div className="w-24">
                        <input
                          type="number" min="0" placeholder="Max $" value={slot.maxPrice}
                          onChange={e => { const next = [...prefSlots]; next[i] = { ...next[i], maxPrice: e.target.value }; setPrefSlots(next); }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                        />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {prefError && <div className="mt-3 text-sm text-red-600">{prefError}</div>}
            {prefSuccess && <div className="mt-3 text-sm text-green-600">Preferences saved.</div>}
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
              <div className="mb-4 flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                <span className="text-sm font-medium text-gray-700">{selectedIds.size} selected</span>
                <div className="flex-1" />
                <button
                  onClick={() => makeBatchDecision("Approved")}
                  className="h-8 px-4 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  Approve All
                </button>
                <button
                  onClick={() => makeBatchDecision("Hold")}
                  className="h-8 px-4 bg-amber-100 text-amber-800 text-sm font-medium rounded-lg hover:bg-amber-200 transition-colors"
                >
                  Hold All
                </button>
                <button
                  onClick={() => makeBatchDecision("Rejected")}
                  className="h-8 px-4 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                >
                  Reject All
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="h-8 px-3 text-gray-500 text-sm hover:text-gray-700">
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
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  No {activeTab === "All" ? "" : activeTab.toLowerCase() + " "}items
                </h2>
                <p className="text-gray-500 text-sm">
                  {activeTab === "All" ? "No items have been routed to you yet." : `No items in the ${activeTab} queue.`}
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
                  <span className="text-xs text-gray-400 ml-1">({filtered.length} items)</span>
                </div>

                {/* ── Grid View ── */}
                {viewMode === "grid" && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filtered.map(item => {
                      const decision = item.vendorDecision ?? "Pending";
                      const isLoading = loadingIds.has(item.id);
                      const isRejecting = rejectingItemId === item.id;
                      const isPriceApproving = priceApprovalItemId === item.id;
                      const city = tenantCityMap[item.tenantId] ?? "";
                      const photo = item.photos?.[0] ?? (item.photoUrl ? { url: item.photoUrl } : null);

                      return (
                        <div key={item.id} className="relative bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                          {/* Checkbox */}
                          <div className="absolute top-2 left-2 z-10">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleSelect(item.id)}
                              className="rounded border-gray-300 text-forest-600 shadow-sm"
                            />
                          </div>

                          {/* Photo — clickable → detail modal */}
                          <button
                            onClick={() => openDetail(item)}
                            className="relative aspect-square bg-gray-100 flex-shrink-0 block w-full text-left hover:opacity-90 transition-opacity"
                          >
                            {photo ? (
                              <Image src={photo.url} alt={item.itemName} fill className="object-cover" sizes="(max-width: 640px) 50vw, 25vw" />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                            {/* Decision badge */}
                            <div className="absolute top-2 right-2">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${DECISION_COLORS[decision]}`}>
                                {decision}
                              </span>
                            </div>
                            {/* Photo count badge */}
                            {(item.photos?.length ?? 0) > 1 && (
                              <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                                {item.photos!.length} photos
                              </div>
                            )}
                          </button>

                          {/* Info */}
                          <div className="p-3 flex flex-col gap-1 flex-1">
                            <button onClick={() => openDetail(item)} className="text-left">
                              <h3 className="font-semibold text-sm text-gray-900 truncate hover:text-forest-700 transition-colors">
                                {item.itemName || "Untitled Item"}
                              </h3>
                            </button>
                            <p className="text-xs text-gray-400 truncate">{item.category}</p>
                            {city && (
                              <p className="flex items-center gap-1 text-xs text-gray-400">
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {city}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CONDITION_COLORS[item.condition] ?? "bg-gray-100 text-gray-700"}`}>
                                {item.condition}
                              </span>
                              <span className="text-xs font-semibold text-forest-700">
                                {item.valueMid > 0 ? formatCurrency(item.valueMid) : "—"}
                              </span>
                            </div>

                            {decision === "Approved" && item.vendorExpectedPrice !== undefined && (
                              <div className="text-xs text-gray-600">
                                <span className="font-medium text-green-700">Your price: {formatCurrency(item.vendorExpectedPrice)}</span>
                              </div>
                            )}

                            {/* Reject inline */}
                            {isRejecting && (
                              <div className="mt-1">
                                <textarea
                                  value={rejectNotes}
                                  onChange={e => setRejectNotes(e.target.value)}
                                  placeholder="Reason (optional)…"
                                  rows={2}
                                  className="w-full text-xs rounded-lg border border-gray-300 px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                                />
                              </div>
                            )}

                            {/* Price approval inline */}
                            {isPriceApproving && (
                              <div className="mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                                <p className="text-[10px] text-gray-500 italic leading-snug">
                                  Estimated expected value — not a guaranteed commitment.
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
                                    type="number" min="0" step="0.01"
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

                            <div className="flex-1" />

                            {/* Action row */}
                            {!isRejecting && !isPriceApproving && (
                              <div className="flex gap-1.5 mt-2">
                                <button
                                  onClick={() => { setPriceApprovalItemId(item.id); setCustomPrice(""); setPriceNote(""); setError(""); }}
                                  disabled={isLoading || decision === "Approved"}
                                  className="flex-1 h-7 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
                                >
                                  {isLoading ? "…" : "Approve"}
                                </button>
                                <button
                                  onClick={() => { setRejectingItemId(item.id); setRejectNotes(""); }}
                                  disabled={isLoading}
                                  className="flex-1 h-7 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => makeDecision(item.id, "Hold")}
                                  disabled={isLoading || decision === "Hold"}
                                  className="h-7 px-2 text-xs font-medium bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-40 transition-colors"
                                >
                                  Hold
                                </button>
                              </div>
                            )}

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
                )}

                {/* ── Table View ── */}
                {viewMode === "table" && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[640px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="w-10 px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedIds.size === filtered.length && filtered.length > 0}
                                onChange={selectAll}
                                className="rounded border-gray-300 text-forest-600"
                              />
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">City</th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Category</th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Condition</th>
                            <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filtered.map(item => {
                            const decision = item.vendorDecision ?? "Pending";
                            const isLoading = loadingIds.has(item.id);
                            const city = tenantCityMap[item.tenantId] ?? "";
                            const photo = item.photos?.[0] ?? (item.photoUrl ? { url: item.photoUrl } : null);
                            const photoCount = item.photos?.length ?? (item.photoUrl ? 1 : 0);

                            return (
                              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => toggleSelect(item.id)}
                                    className="rounded border-gray-300 text-forest-600"
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <button onClick={() => openDetail(item)} className="flex items-center gap-3 text-left group">
                                    <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                                      {photo ? (
                                        <Image src={photo.url} alt={item.itemName} fill className="object-cover" sizes="48px" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                        </div>
                                      )}
                                      {photoCount > 1 && (
                                        <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] font-medium px-1 leading-4 rounded-tl">
                                          {photoCount}
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium text-gray-900 truncate max-w-[180px] group-hover:text-forest-700 transition-colors">
                                        {item.itemName || "Untitled"}
                                      </p>
                                      {decision === "Approved" && item.vendorExpectedPrice !== undefined && (
                                        <p className="text-xs text-green-700 font-medium">Your price: {formatCurrency(item.vendorExpectedPrice)}</p>
                                      )}
                                    </div>
                                  </button>
                                </td>
                                <td className="px-3 py-3">
                                  {city ? (
                                    <span className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                                      <svg className="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                      </svg>
                                      {city}
                                    </span>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-3 hidden sm:table-cell">
                                  <span className="text-xs text-gray-500 truncate max-w-[120px] block">{item.category || "—"}</span>
                                </td>
                                <td className="px-3 py-3">
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${CONDITION_COLORS[item.condition] ?? "bg-gray-100 text-gray-700"}`}>
                                    {item.condition}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <span className="text-sm font-semibold text-forest-700 whitespace-nowrap">
                                    {item.valueMid > 0 ? formatCurrency(item.valueMid) : "—"}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${DECISION_COLORS[decision]}`}>
                                    {decision}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5 justify-end">
                                    <button
                                      onClick={() => openDetail(item, "approve")}
                                      disabled={isLoading || decision === "Approved"}
                                      title="Approve"
                                      className="h-7 px-3 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                                    >
                                      {isLoading ? "…" : "Approve"}
                                    </button>
                                    <button
                                      onClick={() => openDetail(item, "reject")}
                                      disabled={isLoading}
                                      title="Reject"
                                      className="h-7 px-3 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
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
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Item Detail Modal */}
      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          city={tenantCityMap[detailItem.tenantId] ?? ""}
          initialAction={detailAction}
          isLoading={loadingIds.has(detailItem.id)}
          onClose={closeDetail}
          onDecision={makeDecision}
        />
      )}
    </div>
  );
}
