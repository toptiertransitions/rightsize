"use client";
import type { VendorAssignment } from "@/lib/vendorMapping";
import type { Item, LocalVendor } from "@/lib/types";
import { MapToVendorsItemRow } from "./MapToVendorsItemRow";

interface Props {
  vendor: LocalVendor;
  assignment: VendorAssignment;
  rank: number;
  items: Item[];
  otherVendors: LocalVendor[];
  onRemoveItem: (itemId: string, vendorId: string) => void;
  onMoveItem: (itemId: string, fromVendorId: string, toVendorId: string) => void;
  onRemoveVendor: (vendorId: string) => void;
}

export function MapToVendorsVendorCard({ vendor, assignment, rank, items, otherVendors, onRemoveItem, onMoveItem, onRemoveVendor }: Props) {
  const assignedItemIds = new Set(assignment.assignedItems.map(a => a.itemId));
  const assignedItems = items.filter(i => assignedItemIds.has(i.id));
  const categories = [...new Set(assignedItems.map(i => i.category))].join(", ");

  const moveTargets = otherVendors.map(v => ({ id: v.id, name: v.vendorName }));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-[#2d4a3e] uppercase tracking-wide">{vendor.vendorName}</p>
          <p className="text-sm text-gray-500">{vendor.vendorType} · {vendor.city}, {vendor.state}</p>
          <p className="text-sm text-gray-500">Contact: {vendor.pocName}{vendor.consignmentTake > 0 ? ` · ${vendor.consignmentTake}% split` : ""}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {rank > 1 && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              {rank === 2 ? "2nd" : "3rd"}
            </span>
          )}
          <button
            onClick={() => onRemoveVendor(vendor.id)}
            title="Remove this vendor and all its items"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-lg font-bold">
            ✕
          </button>
        </div>
      </div>
      {categories && (
        <p className="text-xs text-gray-400 mt-1 mb-3">Best match for: {categories}</p>
      )}
      <div className="border-t border-gray-100 pt-1">
        {assignedItems.map(item => (
          <MapToVendorsItemRow
            key={item.id}
            itemId={item.id}
            itemName={item.itemName}
            category={item.category}
            valueMid={item.valueMid}
            photoUrl={item.photoUrl}
            otherVendors={moveTargets}
            onRemove={(id) => onRemoveItem(id, vendor.id)}
            onMove={(id, toVendorId) => onMoveItem(id, vendor.id, toVendorId)}
          />
        ))}
      </div>
    </div>
  );
}
