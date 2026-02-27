"use client";

import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils";
import type { Item } from "@/lib/types";

interface ItemGridProps {
  items: Item[];
  tenantId: string;
  canEdit: boolean;
}

const STATUS_BADGE: Record<string, { variant: "yellow" | "blue" | "purple" | "green" | "teal" | "gray"; label: string }> = {
  "Pending Review": { variant: "yellow", label: "Pending Review" },
  "Reviewed": { variant: "blue", label: "Reviewed" },
  "Listed": { variant: "purple", label: "Listed" },
  "Sold": { variant: "green", label: "Sold" },
  "Donated": { variant: "teal", label: "Donated" },
  "Discarded": { variant: "gray", label: "Discarded" },
};

const ROUTE_BADGE: Record<string, { variant: "blue" | "orange" | "teal" | "gray" }> = {
  "Online Marketplace": { variant: "blue" },
  "Local Consignment": { variant: "orange" },
  "Donate": { variant: "teal" },
  "Discard": { variant: "gray" },
};

export function ItemGrid({ items, tenantId, canEdit }: ItemGridProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">📸</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">No items yet</h2>
        <p className="text-gray-500 max-w-sm mx-auto">
          Start by photographing an item. Claude AI will analyze it and suggest the best route — sell, donate, or discard.
        </p>
        {canEdit && (
          <Link
            href={`/catalog/new?tenantId=${tenantId}`}
            className="mt-6 inline-flex items-center gap-2 bg-forest-600 text-white px-5 py-3 rounded-xl font-medium hover:bg-forest-700 transition-colors"
          >
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const status = STATUS_BADGE[item.status] || STATUS_BADGE["Pending Review"];
        const route = ROUTE_BADGE[item.primaryRoute] || ROUTE_BADGE["Donate"];

        return (
          <div
            key={item.id}
            className="bg-white rounded-2xl border border-cream-200 shadow-sm overflow-hidden hover:shadow-md hover:border-forest-200 transition-all duration-200 group"
          >
            {/* Photo */}
            <div className="relative aspect-square bg-gray-50">
              {item.photoUrl ? (
                <Image
                  src={item.photoUrl}
                  alt={item.itemName}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              {/* Status overlay */}
              <div className="absolute top-2 left-2">
                <Badge variant={status.variant} className="text-[10px] px-1.5 py-0.5">
                  {status.label}
                </Badge>
              </div>
            </div>

            {/* Info */}
            <div className="p-3">
              <h3 className="font-semibold text-sm text-gray-900 truncate" title={item.itemName}>
                {item.itemName || "Untitled Item"}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{item.category}</p>

              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold text-forest-700">
                  {item.valueMid > 0 ? formatCurrency(item.valueMid) : "—"}
                </span>
                <Badge variant={route.variant} className="text-[10px] px-1.5 py-0.5">
                  {item.primaryRoute.split(" ")[0]}
                </Badge>
              </div>

              {/* Condition */}
              <div className="mt-2 text-xs text-gray-500">
                {item.condition} · {item.sizeClass}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
