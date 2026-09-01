"use client";
import Image from "next/image";

interface OtherVendor {
  id: string;
  name: string;
}

interface Props {
  itemId: string;
  itemName: string;
  category: string;
  valueMid: number;
  photoUrl?: string;
  otherVendors: OtherVendor[];
  onRemove: (itemId: string) => void;
  onMove: (itemId: string, toVendorId: string) => void;
}

export function MapToVendorsItemRow({ itemId, itemName, category, valueMid, photoUrl, otherVendors, onRemove, onMove }: Props) {
  const fmt = (n: number) => n > 0 ? `$${Math.round(n).toLocaleString()}` : "";
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-b-0">
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
        {photoUrl ? (
          <Image src={photoUrl} alt={itemName} width={48} height={48} className="object-cover w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-gray-900 truncate">{itemName}</p>
        <p className="text-sm text-gray-500">{category}{valueMid > 0 ? ` · ${fmt(valueMid)}` : ""}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {otherVendors.length > 0 && (
          <select
            defaultValue=""
            onChange={e => { if (e.target.value) { onMove(itemId, e.target.value); (e.target as HTMLSelectElement).value = ""; } }}
            className="h-8 text-xs rounded-lg border border-gray-200 text-gray-600 px-2 bg-white cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-[#2d4a3e]">
            <option value="" disabled>Move to…</option>
            {otherVendors.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => onRemove(itemId)}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-sm text-gray-400 hover:text-red-500 transition-colors"
          title="Remove">
          ✕
        </button>
      </div>
    </div>
  );
}
