"use client";

import { Search, X } from "lucide-react";

export function TipsSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search tips, like floor plan or movers"
        aria-label="Search tips"
        className="w-full h-12 pl-11 pr-12 rounded-full border border-cream-300 bg-white text-base text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
