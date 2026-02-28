"use client";

import { useState, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/utils";
import type { Item, Room, Tenant, ItemCondition, SizeClass, FragilityLevel, ItemUseType, PrimaryRoute, ItemStatus } from "@/lib/types";

interface ItemGridProps {
  items: Item[];
  tenantId?: string;   // optional — if omitted, each item's own tenantId is used
  canEdit: boolean;
  rooms: Room[];
  tenants?: Tenant[];  // provided in all-items mode for project name display
}

const STATUS_BADGE: Record<string, { variant: "yellow" | "blue" | "purple" | "green" | "teal" | "gray"; label: string }> = {
  "Pending Review": { variant: "yellow", label: "Pending Review" },
  "Reviewed":       { variant: "blue",   label: "Reviewed" },
  "Listed":         { variant: "purple", label: "Listed" },
  "Sold":           { variant: "green",  label: "Sold" },
  "Donated":        { variant: "teal",   label: "Donated" },
  "Discarded":      { variant: "gray",   label: "Discarded" },
};

const ROUTE_BADGE: Record<string, { variant: "blue" | "orange" | "teal" | "gray" }> = {
  "Online Marketplace": { variant: "blue" },
  "Local Consignment":  { variant: "orange" },
  "Donate":             { variant: "teal" },
  "Discard":            { variant: "gray" },
};

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  item: Item;
  rooms: Room[];
  onClose: () => void;
  onSaved: () => void;
}

type EditableItem = Partial<Omit<Item, "id" | "airtableId" | "tenantId" | "createdAt" | "updatedAt" | "photoUrl" | "photoPublicId">>;

function EditItemModal({ item, rooms, onClose, onSaved }: EditModalProps) {
  const [form, setForm] = useState<EditableItem>({
    itemName: item.itemName,
    category: item.category,
    condition: item.condition,
    conditionNotes: item.conditionNotes,
    sizeClass: item.sizeClass,
    fragility: item.fragility,
    itemType: item.itemType,
    valueLow: item.valueLow,
    valueMid: item.valueMid,
    valueHigh: item.valueHigh,
    primaryRoute: item.primaryRoute,
    routeReasoning: item.routeReasoning,
    consignmentCategory: item.consignmentCategory,
    listingTitleEbay: item.listingTitleEbay,
    listingDescriptionEbay: item.listingDescriptionEbay,
    listingFb: item.listingFb,
    listingOfferup: item.listingOfferup,
    staffTips: item.staffTips,
    status: item.status,
    roomId: item.roomId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Only show rooms belonging to this item's tenant
  const itemRooms = rooms.filter(r => r.tenantId === item.tenantId);

  const set = <K extends keyof EditableItem>(key: K, value: EditableItem[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          tenantId: item.tenantId,
          ...form,
          roomId: form.roomId || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";
  const textareaClass = "w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            {item.photoUrl && (
              <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                <Image src={item.photoUrl} alt={item.itemName} fill className="object-cover" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">Edit Item</h2>
              <p className="text-xs text-gray-400 truncate max-w-[300px]">{item.itemName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">

          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Item Info</h3>
            <Input label="Item Name" value={form.itemName ?? ""} onChange={e => set("itemName", e.target.value)} />
            <Input label="Category" value={form.category ?? ""} onChange={e => set("category", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Condition" value={form.condition ?? "Good"}
                onChange={e => set("condition", e.target.value as ItemCondition)}
                options={[
                  { value: "Excellent", label: "Excellent" },
                  { value: "Good",      label: "Good" },
                  { value: "Fair",      label: "Fair" },
                  { value: "Poor",      label: "Poor" },
                  { value: "For Parts", label: "For Parts" },
                ]}
              />
              <Select label="Status" value={form.status ?? "Pending Review"}
                onChange={e => set("status", e.target.value as ItemStatus)}
                options={[
                  { value: "Pending Review", label: "Pending Review" },
                  { value: "Reviewed",       label: "Reviewed" },
                  { value: "Listed",         label: "Listed" },
                  { value: "Sold",           label: "Sold" },
                  { value: "Donated",        label: "Donated" },
                  { value: "Discarded",      label: "Discarded" },
                ]}
              />
            </div>
            <div>
              <label className={labelClass}>Condition Notes</label>
              <textarea rows={2} value={form.conditionNotes ?? ""} onChange={e => set("conditionNotes", e.target.value)} className={textareaClass} />
            </div>
          </section>

          {/* Physical */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Physical Details</h3>
            <div className="grid grid-cols-3 gap-3">
              <Select label="Size" value={form.sizeClass ?? "Fits in Car-SUV"}
                onChange={e => set("sizeClass", e.target.value as SizeClass)}
                options={[
                  { value: "Small & Shippable", label: "Small & Shippable" },
                  { value: "Fits in Car-SUV",   label: "Fits in Car-SUV" },
                  { value: "Needs Movers",       label: "Needs Movers" },
                ]}
              />
              <Select label="Fragility" value={form.fragility ?? "Not Fragile"}
                onChange={e => set("fragility", e.target.value as FragilityLevel)}
                options={[
                  { value: "Not Fragile",       label: "Not Fragile" },
                  { value: "Somewhat Fragile",  label: "Somewhat Fragile" },
                  { value: "Very Fragile",      label: "Very Fragile" },
                ]}
              />
              <Select label="Item Type" value={form.itemType ?? "Daily Use"}
                onChange={e => set("itemType", e.target.value as ItemUseType)}
                options={[
                  { value: "Daily Use",      label: "Daily Use" },
                  { value: "Collector Item", label: "Collector Item" },
                ]}
              />
            </div>
            {itemRooms.length > 0 && (
              <Select label="Room" value={form.roomId ?? ""}
                onChange={e => set("roomId", e.target.value)}
                options={[
                  { value: "", label: "— No room —" },
                  ...itemRooms.map(r => ({ value: r.id, label: `${r.name} (${r.roomType})` })),
                ]}
              />
            )}
          </section>

          {/* Route & Value */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Route & Value</h3>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Primary Route" value={form.primaryRoute ?? "Donate"}
                onChange={e => set("primaryRoute", e.target.value as PrimaryRoute)}
                options={[
                  { value: "Online Marketplace", label: "Online Marketplace" },
                  { value: "Local Consignment",  label: "Local Consignment" },
                  { value: "Donate",             label: "Donate" },
                  { value: "Discard",            label: "Discard" },
                ]}
              />
              <Input label="Consignment Category" value={form.consignmentCategory ?? ""}
                onChange={e => set("consignmentCategory", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Route Reasoning</label>
              <textarea rows={2} value={form.routeReasoning ?? ""} onChange={e => set("routeReasoning", e.target.value)} className={textareaClass} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Value Low ($)" type="number" value={form.valueLow ?? 0}
                onChange={e => set("valueLow", Number(e.target.value))} />
              <Input label="Value Mid ($)" type="number" value={form.valueMid ?? 0}
                onChange={e => set("valueMid", Number(e.target.value))} />
              <Input label="Value High ($)" type="number" value={form.valueHigh ?? 0}
                onChange={e => set("valueHigh", Number(e.target.value))} />
            </div>
          </section>

          {/* Listings */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Marketplace Listings</h3>
            <Input label="eBay Title" value={form.listingTitleEbay ?? ""}
              onChange={e => set("listingTitleEbay", e.target.value)} />
            <div>
              <label className={labelClass}>eBay Description</label>
              <textarea rows={3} value={form.listingDescriptionEbay ?? ""} onChange={e => set("listingDescriptionEbay", e.target.value)} className={textareaClass} />
            </div>
            <div>
              <label className={labelClass}>Facebook Marketplace</label>
              <textarea rows={2} value={form.listingFb ?? ""} onChange={e => set("listingFb", e.target.value)} className={textareaClass} />
            </div>
            <div>
              <label className={labelClass}>OfferUp</label>
              <textarea rows={2} value={form.listingOfferup ?? ""} onChange={e => set("listingOfferup", e.target.value)} className={textareaClass} />
            </div>
          </section>

          {/* Staff Notes */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Staff Notes</h3>
            <textarea rows={3} value={form.staffTips ?? ""} onChange={e => set("staffTips", e.target.value)}
              placeholder="Internal notes for TTT staff…" className={textareaClass} />
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-cream-100 flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} loading={saving} className="flex-1">Save Changes</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Item Grid ────────────────────────────────────────────────────────────────

export function ItemGrid({ items, tenantId, canEdit, rooms, tenants }: ItemGridProps) {
  const router = useRouter();
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const handleSaved = useCallback(() => {
    setEditingItem(null);
    router.refresh();
  }, [router]);

  const tenantMap = useMemo(() => {
    const map = new Map<string, string>();
    tenants?.forEach(t => map.set(t.id, t.name));
    return map;
  }, [tenants]);

  const multiTenant = !!tenants && tenants.length > 1;

  const filtered = useMemo(() => {
    let result = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.itemName.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      result = result.filter(i => i.status === statusFilter);
    }
    return result;
  }, [items, search, statusFilter]);

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">📸</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">No items yet</h2>
        <p className="text-gray-500 max-w-sm mx-auto">
          Start by photographing an item. Claude AI will analyze it and suggest the best route — sell, donate, or discard.
        </p>
        {canEdit && tenantId && (
          <Link href={`/catalog/new?tenantId=${tenantId}`}
            className="mt-6 inline-flex items-center gap-2 bg-forest-600 text-white px-5 py-3 rounded-xl font-medium hover:bg-forest-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Your First Item
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      {editingItem && (
        <EditItemModal
          item={editingItem}
          rooms={rooms}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Search */}
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-gray-300 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest-500"
        >
          <option value="">All Statuses</option>
          <option value="Pending Review">Pending Review</option>
          <option value="Reviewed">Reviewed</option>
          <option value="Listed">Listed</option>
          <option value="Sold">Sold</option>
          <option value="Donated">Donated</option>
          <option value="Discarded">Discarded</option>
        </select>

        {/* View toggle */}
        <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden h-10">
          <button
            onClick={() => setView("grid")}
            className={`flex items-center justify-center w-10 h-full transition-colors ${view === "grid" ? "bg-forest-50 text-forest-700" : "text-gray-500 hover:bg-gray-50"}`}
            title="Grid view"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            onClick={() => setView("table")}
            className={`flex items-center justify-center w-10 h-full transition-colors border-l border-gray-300 ${view === "table" ? "bg-forest-50 text-forest-700" : "text-gray-500 hover:bg-gray-50"}`}
            title="Table view"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No items match your search.</div>
      )}

      {view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((item) => {
            const status = STATUS_BADGE[item.status] || STATUS_BADGE["Pending Review"];
            const route = ROUTE_BADGE[item.primaryRoute] || ROUTE_BADGE["Donate"];

            return (
              <div key={item.id}
                className="bg-white rounded-2xl border border-cream-200 shadow-sm overflow-hidden hover:shadow-md hover:border-forest-200 transition-all duration-200 group relative">
                {/* Photo */}
                <div className="relative aspect-square bg-gray-50">
                  {item.photoUrl ? (
                    <Image src={item.photoUrl} alt={item.itemName} fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <Badge variant={status.variant} className="text-[10px] px-1.5 py-0.5">{status.label}</Badge>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => setEditingItem(item)}
                      className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-lg shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                      title="Edit item"
                    >
                      <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <h3 className="font-semibold text-sm text-gray-900 truncate" title={item.itemName}>
                    {item.itemName || "Untitled Item"}
                  </h3>
                  {multiTenant && tenantMap.get(item.tenantId) && (
                    <p className="text-[10px] text-forest-600 font-medium truncate mt-0.5">
                      {tenantMap.get(item.tenantId)}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{item.category}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-forest-700">
                      {item.valueMid > 0 ? formatCurrency(item.valueMid) : "—"}
                    </span>
                    <Badge variant={route.variant} className="text-[10px] px-1.5 py-0.5">
                      {item.primaryRoute.split(" ")[0]}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {item.condition} · {item.sizeClass}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-cream-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-100 bg-cream-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-12"></th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Item</th>
                  {multiTenant && <th className="text-left px-4 py-3 font-semibold text-gray-600">Project</th>}
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Condition</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Value</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Route</th>
                  {canEdit && <th className="w-10 px-3 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {filtered.map((item) => {
                  const status = STATUS_BADGE[item.status] || STATUS_BADGE["Pending Review"];
                  const route = ROUTE_BADGE[item.primaryRoute] || ROUTE_BADGE["Donate"];
                  return (
                    <tr key={item.id} className="hover:bg-cream-50 transition-colors">
                      {/* Photo thumb */}
                      <td className="px-4 py-2.5">
                        <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          {item.photoUrl ? (
                            <Image src={item.photoUrl} alt={item.itemName} fill className="object-cover" sizes="36px" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Item name */}
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-gray-900">{item.itemName || "Untitled Item"}</span>
                      </td>
                      {/* Project (multi-tenant only) */}
                      {multiTenant && (
                        <td className="px-4 py-2.5 text-gray-500">{tenantMap.get(item.tenantId) ?? "—"}</td>
                      )}
                      {/* Category */}
                      <td className="px-4 py-2.5 text-gray-500">{item.category || "—"}</td>
                      {/* Condition */}
                      <td className="px-4 py-2.5 text-gray-500">{item.condition}</td>
                      {/* Status */}
                      <td className="px-4 py-2.5">
                        <Badge variant={status.variant} className="text-[10px] px-1.5 py-0.5">{status.label}</Badge>
                      </td>
                      {/* Value */}
                      <td className="px-4 py-2.5 text-right font-semibold text-forest-700">
                        {item.valueMid > 0 ? formatCurrency(item.valueMid) : "—"}
                      </td>
                      {/* Route */}
                      <td className="px-4 py-2.5">
                        <Badge variant={route.variant} className="text-[10px] px-1.5 py-0.5">
                          {item.primaryRoute}
                        </Badge>
                      </td>
                      {/* Edit */}
                      {canEdit && (
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => setEditingItem(item)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                            title="Edit item"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
