"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatCurrency } from "@/lib/utils";
import type { Item, ItemPhoto, Room, Tenant, ItemCondition, SizeClass, FragilityLevel, ItemUseType, PrimaryRoute, ItemStatus, LocalVendor } from "@/lib/types";
import { VendorFileModal } from "./VendorFileModal";

interface ItemGridProps {
  items: Item[];
  tenantId?: string;   // optional — if omitted, each item's own tenantId is used
  canEdit: boolean;
  rooms: Room[];
  tenants?: Tenant[];  // provided in all-items mode for project name display
  localVendors?: LocalVendor[];
  canAutoRoute?: boolean;
  canReassign?: boolean;
  allTenants?: Tenant[];
}

const STATUS_BADGE: Record<string, { variant: "yellow" | "blue" | "purple" | "green" | "teal" | "gray" | "red"; label: string }> = {
  "Pending Review":    { variant: "yellow", label: "Pending Review" },
  "Approved":          { variant: "blue",   label: "Approved" },
  "Listed":            { variant: "purple", label: "Listed" },
  "Sold":              { variant: "green",  label: "Sold" },
  "Donated":           { variant: "teal",   label: "Donated" },
  "Discarded":         { variant: "gray",   label: "Discarded" },
  "Rejected / Revisit":{ variant: "red",    label: "Rejected / Revisit" },
};

const ROUTE_BADGE: Record<string, { variant: "blue" | "orange" | "teal" | "gray" | "green" | "purple" | "yellow" | "red"; label: string }> = {
  "Keep":                         { variant: "green",  label: "Keep" },
  "Family Keeping":               { variant: "green",  label: "Family" },
  "ProFoundFinds Consignment":    { variant: "orange", label: "ProFoundFinds" },
  "FB/Marketplace":               { variant: "blue",   label: "FB/Marketplace" },
  "Online Marketplace":           { variant: "blue",   label: "Online" },
  "Other Consignment":            { variant: "purple", label: "Other Consign" },
  "Donate":                       { variant: "teal",   label: "Donate" },
  "Discard":                      { variant: "gray",   label: "Discard" },
};

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  item: Item;
  rooms: Room[];
  localVendors?: LocalVendor[];
  canReassign?: boolean;
  allTenants?: Tenant[];
  onClose: () => void;
  onSaved: (item: Item) => void;
  onDeleted?: () => void;
}

type EditableItem = Partial<Omit<Item, "id" | "airtableId" | "tenantId" | "createdAt" | "updatedAt" | "photoUrl" | "photoPublicId" | "photos">>;

export function EditItemModal({ item, rooms, localVendors, canReassign, allTenants, onClose, onSaved, onDeleted }: EditModalProps) {
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
    assignedVendorId: item.assignedVendorId ?? "",
    quantity: item.quantity ?? 1,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [reassignTenantId, setReassignTenantId] = useState(item.tenantId);

  // Photo management
  const [photos, setPhotos] = useState<ItemPhoto[]>(
    item.photos?.length
      ? item.photos
      : item.photoUrl
      ? [{ url: item.photoUrl, publicId: item.photoPublicId ?? "" }]
      : []
  );
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoDragIdx, setPhotoDragIdx] = useState<number | null>(null);
  const [photoDropIdx, setPhotoDropIdx] = useState<number | null>(null);
  const addPhotoRef = useRef<HTMLInputElement>(null);

  // Only show rooms belonging to this item's tenant
  const itemRooms = rooms.filter(r => r.tenantId === item.tenantId);

  const set = <K extends keyof EditableItem>(key: K, value: EditableItem[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/items?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to delete");
      }
      if (onDeleted) onDeleted(); else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleAddPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 10 - photos.length;
    if (remaining <= 0) { setError("Maximum 10 photos reached."); return; }
    const toUpload = Array.from(files).slice(0, remaining);
    setUploadingPhotos(true);
    setError("");
    try {
      const uploaded: ItemPhoto[] = [];
      for (const file of toUpload) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tenantId", item.tenantId);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        uploaded.push({ url: data.photoUrl, publicId: data.photoPublicId });
      }
      setPhotos(prev => [...prev, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingPhotos(false);
      if (addPhotoRef.current) addPhotoRef.current.value = "";
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        id: item.id,
        tenantId: item.tenantId,
        photos,
        ...form,
        roomId: form.roomId || undefined,
      };
      const isReassign = reassignTenantId !== item.tenantId;
      if (isReassign) {
        body.reassignTenantId = reassignTenantId;
      }
      const res = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      const { item: savedItem } = await res.json();
      if (isReassign) {
        // Item moved to another project — remove from this view
        if (onDeleted) onDeleted(); else onClose();
      } else {
        onSaved(savedItem);
      }
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

          {/* Photos */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Photos</h3>
              {photos.length < 10 && (
                <button
                  type="button"
                  onClick={() => addPhotoRef.current?.click()}
                  disabled={uploadingPhotos}
                  className="text-xs text-forest-600 hover:text-forest-700 font-medium disabled:opacity-50"
                >
                  {uploadingPhotos ? "Uploading…" : "+ Add Photo"}
                </button>
              )}
            </div>
            <input
              ref={addPhotoRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => handleAddPhotos(e.target.files)}
            />
            {photos.length === 0 ? (
              <button
                type="button"
                onClick={() => addPhotoRef.current?.click()}
                disabled={uploadingPhotos}
                className="w-full flex flex-col items-center gap-1 py-6 rounded-xl border-2 border-dashed border-gray-200 hover:border-forest-300 hover:bg-forest-50 transition-colors text-gray-400 hover:text-forest-600 disabled:opacity-50"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-medium">Add photos (optional)</span>
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {photos.map((photo, i) => (
                  <div
                    key={photo.url}
                    draggable
                    onDragStart={() => setPhotoDragIdx(i)}
                    onDragOver={e => { e.preventDefault(); setPhotoDropIdx(i); }}
                    onDragLeave={() => setPhotoDropIdx(null)}
                    onDrop={e => {
                      e.preventDefault();
                      if (photoDragIdx === null || photoDragIdx === i) return;
                      const arr = [...photos];
                      const [moved] = arr.splice(photoDragIdx, 1);
                      arr.splice(i, 0, moved);
                      setPhotos(arr);
                      setPhotoDragIdx(null);
                      setPhotoDropIdx(null);
                    }}
                    onDragEnd={() => { setPhotoDragIdx(null); setPhotoDropIdx(null); }}
                    className={`relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 cursor-grab active:cursor-grabbing border-2 transition-all ${
                      photoDropIdx === i ? "border-forest-400 scale-105" : i === 0 ? "border-forest-300" : "border-transparent"
                    }`}
                  >
                    <Image src={photo.url} alt={`Photo ${i + 1}`} fill className="object-cover" />
                    {/* Primary star */}
                    <button
                      type="button"
                      title={i === 0 ? "Primary photo" : "Set as primary"}
                      onClick={() => {
                        if (i === 0) return;
                        const arr = [...photos];
                        const [moved] = arr.splice(i, 1);
                        arr.unshift(moved);
                        setPhotos(arr);
                      }}
                      className="absolute top-0.5 left-0.5 w-5 h-5 flex items-center justify-center rounded-md bg-black/40 hover:bg-black/60 transition-colors"
                    >
                      <svg className={`w-3 h-3 ${i === 0 ? "text-yellow-300 fill-yellow-300" : "text-white"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                    {/* Remove */}
                    <button
                      type="button"
                      title="Remove photo"
                      onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-md bg-black/40 hover:bg-red-500 transition-colors text-white"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {photos.length < 10 && (
                  <button
                    type="button"
                    onClick={() => addPhotoRef.current?.click()}
                    disabled={uploadingPhotos}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 hover:border-forest-300 hover:bg-forest-50 flex items-center justify-center text-gray-400 hover:text-forest-500 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {uploadingPhotos ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            )}
            {photos.length > 0 && (
              <p className="text-xs text-gray-400">Drag to reorder · ★ = primary · {photos.length}/10</p>
            )}
          </section>

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
                onChange={e => {
                  const newStatus = e.target.value as ItemStatus;
                  set("status", newStatus);
                  // Auto-fill Target Value = Sale Price when marking Sold
                  if (newStatus === "Sold" && item.salePrice && item.salePrice > 0) {
                    set("valueMid", item.salePrice);
                  }
                }}
                options={[
                  { value: "Pending Review",    label: "Pending Review" },
                  { value: "Approved",          label: "Approved" },
                  { value: "Listed",            label: "Listed" },
                  { value: "Sold",              label: "Sold" },
                  { value: "Donated",           label: "Donated" },
                  { value: "Discarded",         label: "Discarded" },
                  { value: "Rejected / Revisit",label: "Rejected / Revisit" },
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
            <div className="grid grid-cols-2 gap-3">
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
              <Select label="Recommended Route" value={form.primaryRoute ?? "Keep"}
                onChange={e => {
                  const newRoute = e.target.value as PrimaryRoute;
                  const vendorTypeForRoute: Partial<Record<string, string>> = {
                    "Other Consignment": "Consignment Store",
                    "Donate": "Donation Org",
                  };
                  const newRequiredType = vendorTypeForRoute[newRoute];
                  const currentVendor = localVendors?.find(v => v.id === form.assignedVendorId);
                  // Clear vendor if it doesn't match the new route's required type
                  if (!newRequiredType || currentVendor?.vendorType !== newRequiredType) {
                    set("assignedVendorId", undefined);
                  }
                  set("primaryRoute", newRoute);
                }}
                options={[
                  { value: "Keep",                         label: "Keep" },
                  { value: "Family Keeping",               label: "Family Keeping" },
                  { value: "ProFoundFinds Consignment",    label: "ProFoundFinds Consignment" },
                  { value: "FB/Marketplace",               label: "FB/Marketplace" },
                  { value: "Online Marketplace",           label: "Online Marketplace" },
                  { value: "Other Consignment",            label: "Other Consignment" },
                  { value: "Donate",                       label: "Donate" },
                  { value: "Discard",                      label: "Discard" },
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
              <Input label="Value Low ($)" type="number" inputMode="decimal"
                value={form.valueLow || ""}
                placeholder="0"
                onFocus={e => e.target.select()}
                onChange={e => set("valueLow", e.target.value === "" ? undefined : Number(e.target.value))} />
              <Input label="Target Value ($)" type="number" inputMode="decimal"
                value={form.valueMid || ""}
                placeholder="0"
                onFocus={e => e.target.select()}
                onChange={e => set("valueMid", e.target.value === "" ? undefined : Number(e.target.value))} />
              <Input label="Value High ($)" type="number" inputMode="decimal"
                value={form.valueHigh || ""}
                placeholder="0"
                onFocus={e => e.target.select()}
                onChange={e => set("valueHigh", e.target.value === "" ? undefined : Number(e.target.value))} />
            </div>
            <Input label="Quantity" type="number" inputMode="numeric"
              value={form.quantity || ""}
              placeholder="1"
              onFocus={e => e.target.select()}
              onChange={e => set("quantity", e.target.value === "" ? 1 : Math.max(1, Number(e.target.value)))} />
            {(() => {
              const vendorTypeForRoute: Partial<Record<string, string>> = {
                "Other Consignment": "Consignment Store",
                "ProFoundFinds Consignment": "Consignment Store",
                "Donate": "Donation Org",
                "Discard": "Junk Hauler",
              };
              const requiredType = vendorTypeForRoute[form.primaryRoute ?? ""];
              const filteredVendors = requiredType
                ? (localVendors ?? []).filter(v => v.vendorType === requiredType)
                : [];
              return requiredType && filteredVendors.length > 0 ? (
                <Select label="Assigned Vendor" value={form.assignedVendorId ?? ""}
                  onChange={e => set("assignedVendorId", e.target.value || undefined)}
                  options={[
                    { value: "", label: "— Unassigned —" },
                    ...filteredVendors.map(v => ({ value: v.id, label: v.vendorName })),
                  ]}
                />
              ) : null;
            })()}
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

          {/* Reassign Project */}
          {canReassign && allTenants && allTenants.length > 1 && (
            <section className="space-y-3 border-t border-dashed border-gray-200 pt-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Reassign Project</h3>
              <Select
                label="Move to Project"
                value={reassignTenantId}
                onChange={e => setReassignTenantId(e.target.value)}
                options={allTenants.filter(t => !t.isArchived).map(t => ({ value: t.id, label: t.name }))}
              />
              {reassignTenantId !== item.tenantId && (
                <p className="text-xs text-amber-600">This item will be moved to the selected project and removed from this view on save.</p>
              )}
            </section>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-cream-100">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 flex-1">Delete this item permanently?</span>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-1.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-2 text-sm font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors"
              >
                Delete
              </button>
              <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
              <Button onClick={handleSave} loading={saving} className="flex-1">Save Changes</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Item Grid ────────────────────────────────────────────────────────────────

export function ItemGrid({ items: initialItems, tenantId, canEdit, rooms, tenants, localVendors, canAutoRoute, canReassign, allTenants }: ItemGridProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [autoRouting, setAutoRouting] = useState(false);
  const [autoRouteMsg, setAutoRouteMsg] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [vendorFileOpen, setVendorFileOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleSaved = useCallback((savedItem: Item) => {
    setItems(prev => prev.map(i => i.id === savedItem.id ? savedItem : i));
    setEditingItem(null);
  }, []);

  const handleDeleted = useCallback(() => {
    setItems(prev => prev.filter(i => i.id !== editingItem?.id));
    setEditingItem(null);
  }, [editingItem]);

  const tenantMap = useMemo(() => {
    const map = new Map<string, string>();
    tenants?.forEach(t => map.set(t.id, t.name));
    return map;
  }, [tenants]);

  const vendorMap = useMemo(() => {
    const map = new Map<string, string>();
    localVendors?.forEach(v => map.set(v.id, v.vendorName));
    return map;
  }, [localVendors]);

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all([...selected].map(id =>
        fetch("/api/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, tenantId: items.find(i => i.id === id)?.tenantId, status: "Approved" }),
        })
      ));
      setItems(prev => prev.map(i => selected.has(i.id) ? { ...i, status: "Approved" as const } : i));
      setSelected(new Set());
    } finally {
      setBulkLoading(false);
    }
  };

  const handleMoversPDF = async () => {
    if (selected.size === 0) return;
    setPdfLoading(true);
    try {
      const firstItem = items.find((i) => selected.has(i.id));
      const tid = tenantId ?? firstItem?.tenantId;
      const res = await fetch("/api/items/movers-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: [...selected], tenantId: tid }),
      });
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `movers-list-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore — browser will show nothing downloaded
    } finally {
      setPdfLoading(false);
    }
  };

  const handleAutoRoute = async () => {
    setAutoRouting(true);
    setAutoRouteMsg("");
    try {
      const url = tenantId
        ? `/api/admin/routing-rules/apply?tenantId=${tenantId}`
        : "/api/admin/routing-rules/apply";
      const res = await fetch(url, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setAutoRouteMsg(`${d.assigned} item${d.assigned !== 1 ? "s" : ""} auto-routed`);
      router.refresh();
    } catch (e) {
      setAutoRouteMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setAutoRouting(false);
    }
  };

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
    if (routeFilter) {
      result = result.filter(i => i.primaryRoute === routeFilter);
    }
    return result;
  }, [items, search, statusFilter, routeFilter]);

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortCol) {
        case "itemName":  av = a.itemName.toLowerCase();  bv = b.itemName.toLowerCase();  break;
        case "project":   av = (tenantMap.get(a.tenantId) ?? "").toLowerCase(); bv = (tenantMap.get(b.tenantId) ?? "").toLowerCase(); break;
        case "category":  av = a.category.toLowerCase();  bv = b.category.toLowerCase();  break;
        case "condition": av = a.condition.toLowerCase();  bv = b.condition.toLowerCase();  break;
        case "value":     av = a.valueMid;                 bv = b.valueMid;                 break;
        case "route":     av = a.primaryRoute.toLowerCase(); bv = b.primaryRoute.toLowerCase(); break;
        case "status":    av = a.status.toLowerCase();     bv = b.status.toLowerCase();     break;
        case "createdAt": av = a.createdAt ?? "";           bv = b.createdAt ?? "";           break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir, tenantMap]);

  const sortTh = (col: string, label: string, extraClass = "", align?: "right") => (
    <th
      onClick={() => handleSort(col)}
      className={`${align === "right" ? "text-right" : "text-left"} px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-cream-100 transition-colors ${extraClass}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end w-full" : ""}`}>
        {label}
        <span className="text-[9px] text-gray-400">{sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </span>
    </th>
  );

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
          localVendors={localVendors}
          canReassign={canReassign}
          allTenants={allTenants}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      <VendorFileModal
        isOpen={vendorFileOpen}
        onClose={() => setVendorFileOpen(false)}
        selectedItems={items.filter((i) => selected.has(i.id))}
        localVendors={localVendors ?? []}
        tenantId={tenantId}
        onSent={(updatedItems) => {
          setItems((prev) =>
            prev.map((i) => updatedItems.find((u) => u.id === i.id) ?? i)
          );
          setSelected(new Set());
        }}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Search */}
        <div className="relative w-full sm:w-44">
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

        {/* Route filter */}
        <select
          value={routeFilter}
          onChange={e => setRouteFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-gray-300 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest-500"
        >
          <option value="">All Routes</option>
          <option value="Keep">Keep</option>
          <option value="Family Keeping">Family Keeping</option>
          <option value="ProFoundFinds Consignment">ProFoundFinds Consignment</option>
          <option value="FB/Marketplace">FB/Marketplace</option>
          <option value="Online Marketplace">Online Marketplace</option>
          <option value="Other Consignment">Other Consignment</option>
          <option value="Donate">Donate</option>
          <option value="Discard">Discard</option>
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-gray-300 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest-500"
        >
          <option value="">All Statuses</option>
          <option value="Pending Review">Pending Review</option>
          <option value="Approved">Approved</option>
          <option value="Listed">Listed</option>
          <option value="Sold">Sold</option>
          <option value="Donated">Donated</option>
          <option value="Discarded">Discarded</option>
          <option value="Rejected / Revisit">Rejected / Revisit</option>
        </select>

        {/* Sort */}
        <select
          value={sortCol ? `${sortCol}:${sortDir}` : ""}
          onChange={e => {
            const val = e.target.value;
            if (!val) { setSortCol(null); setSortDir("asc"); }
            else {
              const [col, dir] = val.split(":");
              setSortCol(col);
              setSortDir(dir as "asc" | "desc");
            }
          }}
          className="h-10 px-3 rounded-xl border border-gray-300 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest-500"
        >
          <option value="">Sort: Date Added</option>
          <option value="itemName:asc">Name A → Z</option>
          <option value="itemName:desc">Name Z → A</option>
          <option value="createdAt:desc">Newest First</option>
          <option value="createdAt:asc">Oldest First</option>
        </select>

        {/* Auto-route button */}
        {canAutoRoute && (
          <button
            onClick={handleAutoRoute}
            disabled={autoRouting}
            className="h-10 px-3 rounded-xl border border-forest-300 text-forest-700 text-sm font-medium hover:bg-forest-50 transition-colors disabled:opacity-50"
          >
            {autoRouting ? "Routing…" : "Auto-Route Unassigned"}
          </button>
        )}
        {autoRouteMsg && (
          <span className="text-xs text-forest-600 self-center">{autoRouteMsg}</span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

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
          {sorted.map((item) => {
            const status = STATUS_BADGE[item.status] || STATUS_BADGE["Pending Review"];
            const route = ROUTE_BADGE[item.primaryRoute] || { variant: "gray" as const, label: item.primaryRoute };

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
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-bold text-forest-700">
                        {item.salePrice && item.salePrice > 0 ? formatCurrency(item.salePrice) : item.valueMid > 0 ? formatCurrency(item.valueMid) : "—"}
                      </span>
                      {item.primaryRoute === "ProFoundFinds Consignment" && item.deliveryDate && (
                        <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-orange-100 text-orange-600 border border-orange-200 flex-shrink-0">
                          PF Active
                        </span>
                      )}
                    </div>
                    <Badge variant={route.variant} className="text-[10px] px-1.5 py-0.5">
                      {route.label}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 flex items-center gap-1.5">
                    <span>{item.condition} · {item.sizeClass}</span>
                    {(item.quantity ?? 0) > 1 && (
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                        Qty {item.quantity}
                      </span>
                    )}
                  </div>
                  {item.assignedVendorId && vendorMap.get(item.assignedVendorId) && (
                    <div className="mt-1.5">
                      <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full truncate block">
                        {vendorMap.get(item.assignedVendorId)}
                        {item.vendorDecision && item.vendorDecision !== "Pending" && (
                          <span className={`ml-1 ${item.vendorDecision === "Approved" ? "text-green-600" : item.vendorDecision === "Rejected" ? "text-red-600" : "text-amber-600"}`}>
                            · {item.vendorDecision}
                          </span>
                        )}
                      </span>
                      {item.vendorDecision === "Approved" && item.vendorExpectedPrice !== undefined && (
                        <span className="text-[10px] text-green-700 font-medium mt-0.5 block">
                          Vendor: {formatCurrency(item.vendorExpectedPrice)}
                          {item.valueMid > 0 && item.vendorExpectedPrice !== item.valueMid && (
                            <span className="text-gray-400 ml-1">(TTT: {formatCurrency(item.valueMid)})</span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="mb-3 flex items-center gap-3 px-4 py-2.5 bg-forest-50 border border-forest-200 rounded-xl">
            <span className="text-sm font-medium text-forest-800">{selected.size} item{selected.size !== 1 ? "s" : ""} selected</span>
            <button
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              className="h-8 px-3 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {bulkLoading ? "Approving…" : "Approve Recommended Route"}
            </button>
            {localVendors && localVendors.length > 0 && (
              <button
                onClick={() => setVendorFileOpen(true)}
                disabled={bulkLoading}
                className="h-8 px-3 rounded-lg bg-white border border-forest-300 text-forest-700 text-sm font-medium hover:bg-forest-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Send Items to Vendor
              </button>
            )}
            <button
              onClick={handleMoversPDF}
              disabled={pdfLoading}
              className="h-8 px-3 rounded-lg bg-white border border-forest-300 text-forest-700 text-sm font-medium hover:bg-forest-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {pdfLoading ? "Generating…" : "Create PDF for Movers"}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="h-8 px-3 rounded-lg border border-forest-300 text-forest-700 text-sm hover:bg-forest-100 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-cream-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-100 bg-cream-50">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox"
                      checked={sorted.length > 0 && sorted.every(i => selected.has(i.id))}
                      onChange={e => {
                        if (e.target.checked) setSelected(new Set(sorted.map(i => i.id)));
                        else setSelected(new Set());
                      }}
                      className="rounded border-gray-300 text-forest-600 focus:ring-forest-500"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-12"></th>
                  {sortTh("itemName", "Item")}
                  {multiTenant && sortTh("project", "Project")}
                  {sortTh("category", "Category")}
                  {sortTh("value", "Value", "", "right")}
                  {sortTh("route", "Recommended Route")}
                  {sortTh("status", "Status")}
                  {localVendors && <th className="text-left px-4 py-3 font-semibold text-gray-600">Vendor</th>}
                  {canEdit && <th className="w-10 px-3 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {sorted.map((item) => {
                  const status = STATUS_BADGE[item.status] || STATUS_BADGE["Pending Review"];
                  const route = ROUTE_BADGE[item.primaryRoute] || { variant: "gray" as const, label: item.primaryRoute };
                  return (
                    <tr key={item.id} className={`hover:bg-cream-50 transition-colors ${selected.has(item.id) ? "bg-forest-50" : ""}`}>
                      {/* Checkbox */}
                      <td className="px-4 py-2.5">
                        <input type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={e => {
                            setSelected(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              return next;
                            });
                          }}
                          className="rounded border-gray-300 text-forest-600 focus:ring-forest-500"
                        />
                      </td>
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
                      {/* Value */}
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-semibold text-forest-700">
                            {item.salePrice && item.salePrice > 0 ? formatCurrency(item.salePrice) : item.valueMid > 0 ? formatCurrency(item.valueMid) : "—"}
                          </span>
                          {item.primaryRoute === "ProFoundFinds Consignment" && item.deliveryDate && (
                            <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-orange-100 text-orange-600 border border-orange-200">
                              PF
                            </span>
                          )}
                          {(item.quantity ?? 0) > 1 && (
                            <span className="text-[10px] font-medium text-gray-400">×{item.quantity}</span>
                          )}
                        </div>
                      </td>
                      {/* Route */}
                      <td className="px-4 py-2.5">
                        <Badge variant={route.variant} className="text-[10px] px-1.5 py-0.5">
                          {item.primaryRoute}
                        </Badge>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-2.5">
                        <Badge variant={status.variant} className="text-[10px] px-1.5 py-0.5">{status.label}</Badge>
                      </td>
                      {/* Vendor */}
                      {localVendors && (
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          {item.assignedVendorId ? (
                            <span className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1.5 flex-wrap">
                                <span>{vendorMap.get(item.assignedVendorId) ?? "—"}</span>
                                {item.vendorDecision === "Approved" && (
                                  <span className="bg-green-100 text-green-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">Approved</span>
                                )}
                                {item.vendorDecision === "Rejected" && (
                                  <span className="bg-red-100 text-red-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">Rejected</span>
                                )}
                                {item.vendorDecision === "Hold" && (
                                  <span className="bg-amber-100 text-amber-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">Hold</span>
                                )}
                                {item.vendorDecision === "Pending" && (
                                  <span className="bg-gray-100 text-gray-500 text-[10px] font-medium px-1.5 py-0.5 rounded-full">Pending</span>
                                )}
                              </span>
                              {item.vendorDecision === "Approved" && item.vendorExpectedPrice !== undefined && (
                                <span className="text-green-700 font-medium">
                                  Vendor: {formatCurrency(item.vendorExpectedPrice)}
                                  {item.valueMid > 0 && item.vendorExpectedPrice !== item.valueMid && (
                                    <span className="text-gray-400 ml-1">(TTT: {formatCurrency(item.valueMid)})</span>
                                  )}
                                </span>
                              )}
                            </span>
                          ) : "—"}
                        </td>
                      )}
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
        </>
      )}
    </>
  );
}
