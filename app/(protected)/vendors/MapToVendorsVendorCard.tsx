"use client";
import type { VendorAssignment } from "@/lib/vendorMapping";
import type { Item, LocalVendor } from "@/lib/types";
import { MapToVendorsItemRow } from "./MapToVendorsItemRow";

interface Props {
  vendor: LocalVendor;
  assignment: VendorAssignment;
  rank: number; // 1 = top, 2 = 2nd, 3 = 3rd
  items: Item[];
  onRemoveItem: (itemId: string, vendorId: string) => void;
}

export function MapToVendorsVendorCard({ vendor, assignment, rank, items, onRemoveItem }: Props) {
  const assignedItemIds = new Set(assignment.assignedItems.map(a => a.itemId));
  const assignedItems = items.filter(i => assignedItemIds.has(i.id));
  const categories = [...new Set(assignedItems.map(i => i.category))].join(", ");

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-lg font-semibold text-[#2d4a3e] uppercase tracking-wide">{vendor.vendorName}</p>
          <p className="text-sm text-gray-500">{vendor.vendorType} · {vendor.city}, {vendor.state}</p>
          <p className="text-sm text-gray-500">Contact: {vendor.pocName}{vendor.consignmentTake > 0 ? ` · ${vendor.consignmentTake}% split` : ""}</p>
        </div>
        {rank > 1 && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">
            {rank === 2 ? "2nd choice" : "3rd choice"}
          </span>
        )}
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
            onRemove={(id) => onRemoveItem(id, vendor.id)}
          />
        ))}
      </div>
    </div>
  );
}
