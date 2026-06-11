"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface CatalogHeaderProps {
  tenantId: string;
  canEdit: boolean;
  canSeeEstateMode: boolean;
  estateMode: boolean;
}

export function CatalogHeader({ tenantId, canEdit, canSeeEstateMode, estateMode }: CatalogHeaderProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/catalog/estate-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, isEstateSale: !estateMode }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const addItemHref = `/catalog/new?tenantId=${tenantId}${estateMode ? "&estateMode=1" : ""}`;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Item Catalog</h1>

        {canSeeEstateMode && (
          <button
            onClick={toggle}
            disabled={pending}
            title={estateMode ? "Estate Sale mode ON — click to turn off" : "Turn on Estate Sale mode"}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all select-none disabled:opacity-60 ${
              estateMode
                ? "bg-amber-100 text-amber-800 border-amber-300 shadow-sm"
                : "bg-gray-100 text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600"
            }`}
          >
            {/* house icon */}
            <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-3h2v3a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7z" />
            </svg>
            Estate Sale?
            {/* on/off dot */}
            <span className={`w-1.5 h-1.5 rounded-full ml-0.5 ${estateMode ? "bg-amber-500" : "bg-gray-300"}`} />
          </button>
        )}
      </div>

      {canEdit && (
        <Link href={addItemHref}>
          <Button>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Add Item
          </Button>
        </Link>
      )}
    </div>
  );
}
