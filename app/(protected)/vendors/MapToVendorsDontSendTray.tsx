"use client";
import Image from "next/image";

interface RemovedItem {
  itemId: string;
  itemName: string;
  category: string;
  valueMid: number;
  photoUrl?: string;
  originalVendorId: string;
}

interface Props {
  items: RemovedItem[];
  onUndo: (itemId: string) => void;
}

export function MapToVendorsDontSendTray({ items, onUndo }: Props) {
  const fmt = (n: number) => n > 0 ? `$${Math.round(n).toLocaleString()}` : "";
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
      <p className="text-sm font-medium text-amber-800">Don&apos;t send ({items.length} item{items.length !== 1 ? 's' : ''})</p>
      {items.length > 0 ? (
        <>
          <p className="text-xs text-amber-600 mt-0.5 mb-3">These items won&apos;t be included in this outreach.</p>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.itemId} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md overflow-hidden bg-amber-100 flex-shrink-0">
                  {item.photoUrl ? (
                    <Image src={item.photoUrl} alt={item.itemName} width={40} height={40} className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{item.itemName}</p>
                  <p className="text-xs text-gray-500">{item.category}{item.valueMid > 0 ? ` · ${fmt(item.valueMid)}` : ""}</p>
                </div>
                <button
                  onClick={() => onUndo(item.itemId)}
                  className="min-h-[44px] px-3 text-sm font-medium text-[#2d4a3e] hover:underline underline-offset-2">
                  Undo
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-amber-600 mt-0.5">No items removed.</p>
      )}
    </div>
  );
}
